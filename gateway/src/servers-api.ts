import { Router, Request, Response } from "express";
import { getDbPool, getAllServers, McpServerRecord } from "./db.js";
import { requireAuth, requireAdmin } from "./auth.js";
import { UpstreamClientManager } from "./upstream-manager.js";
import { ToolAggregator } from "./tool-aggregator.js";
import { validateUpstreamUrl } from "./ssrf-validator.js";
import { encryptCredential } from "./crypto-vault.js";

export function createServersRouter(
  upstreamManager: UpstreamClientManager,
  toolAggregator: ToolAggregator
): Router {
  const router = Router();

  // GET /api/servers - List all servers with health status, tool counts, and sanitized tokens (UI-01)
  router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const shouldRefresh = req.query.refresh === "true";
      const servers = await getAllServers();

      // If manual refresh requested, live ping all enabled upstreams
      if (shouldRefresh) {
        await Promise.allSettled(
          servers.filter((s) => s.enabled).map((s) => upstreamManager.pingServer(s))
        );
      }

      const allTools = await toolAggregator.getAllNamespacedTools().catch(() => []);

      // Group tool count per server
      const toolCountByServer: Record<string, number> = {};
      for (const t of allTools) {
        const prefix = t.name.split("__")[0];
        toolCountByServer[prefix] = (toolCountByServer[prefix] || 0) + 1;
      }

      const sanitized = servers.map((s) => ({
        id: s.id,
        name: s.name,
        baseUrl: s.base_url,
        status: s.status,
        enabled: s.enabled,
        hasAuthToken: Boolean(s.auth_token),
        toolCount: toolCountByServer[s.id] || 0,
        lastHealthCheck: s.last_health_check,
        errorMessage: s.error_message,
      }));

      res.status(200).json({ servers: sanitized, tools: allTools });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error listing servers:", err);
      res.status(500).json({ error: "Failed to list upstream servers" });
    }
  });

  // POST /api/servers - Register new upstream server (AUTH-04, Admin only)
  router.post("/", requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      let { id, name, baseUrl, authToken } = req.body;
      if (!name || !baseUrl) {
        res.status(400).json({ error: "Server 'name' and 'baseUrl' are required" });
        return;
      }

      // SSRF Validation against cloud metadata, loopback & internal k8s targets (SEC-01)
      const urlCheck = validateUpstreamUrl(baseUrl);
      if (!urlCheck.valid) {
        res.status(400).json({ error: "SSRF_VIOLATION", message: urlCheck.reason });
        return;
      }

      // Encrypt sensitive auth_token at rest in MariaDB (SEC-04)
      const encryptedToken = authToken?.trim() ? encryptCredential(authToken.trim()) : null;

      // Generate id slug if not provided
      if (!id || typeof id !== "string" || !id.trim()) {
        id = name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      } else {
        id = id
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "")
          .trim();
      }

      const db = getDbPool();
      const [existing] = await db.query<any[]>("SELECT id FROM mcp_servers WHERE id = ?", [id]);
      if (existing.length > 0) {
        res.status(409).json({ error: `A server with ID '${id}' already exists` });
        return;
      }

      await db.query(
        `INSERT INTO mcp_servers (id, name, base_url, status, enabled, auth_token)
         VALUES (?, ?, ?, 'Connected', TRUE, ?)`,
        [id, name.trim(), baseUrl.trim(), encryptedToken]
      );

      const serverRecord: McpServerRecord = {
        id,
        name: name.trim(),
        base_url: baseUrl.trim(),
        status: "Connected",
        enabled: true,
        auth_token: authToken?.trim() || null,
      };

      // Test ping in background to update status immediately
      upstreamManager.pingServer(serverRecord).catch(() => {});

      console.log(`[mcpilot-gateway] Admin ${req.user?.username} registered upstream server '${id}' (${baseUrl})`);
      toolAggregator.invalidateCache();

      res.status(201).json({
        id,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        status: "Connected",
        enabled: true,
        hasAuthToken: Boolean(authToken),
      });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error registering server:", err);
      res.status(500).json({ error: "Failed to register upstream server" });
    }
  });

  // PUT /api/servers/:id - Edit upstream server (AUTH-04, Admin only)
  router.put("/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { name, baseUrl, authToken } = req.body;

      const db = getDbPool();
      const [existing] = await db.query<any[]>("SELECT id, auth_token FROM mcp_servers WHERE id = ?", [id]);
      if (existing.length === 0) {
        res.status(404).json({ error: `Server '${id}' not found` });
        return;
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (name) {
        updates.push("name = ?");
        values.push(name.trim());
      }
      if (baseUrl) {
        // SSRF Validation on URL modification (SEC-01)
        const urlCheck = validateUpstreamUrl(baseUrl);
        if (!urlCheck.valid) {
          res.status(400).json({ error: "SSRF_VIOLATION", message: urlCheck.reason });
          return;
        }
        updates.push("base_url = ?");
        values.push(baseUrl.trim());
      }
      if (authToken !== undefined) {
        updates.push("auth_token = ?");
        values.push(authToken?.trim() ? encryptCredential(authToken.trim()) : null);
      }

      if (updates.length > 0) {
        values.push(id);
        await db.query(`UPDATE mcp_servers SET ${updates.join(", ")} WHERE id = ?`, values);
      }

      // Close cached client so next invocation picks up new credentials/URL
      await upstreamManager.closeClient(id);

      console.log(`[mcpilot-gateway] Admin ${req.user?.username} updated upstream server '${id}'`);

      res.status(200).json({ message: "Server updated successfully", id });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error updating server:", err);
      res.status(500).json({ error: "Failed to update upstream server" });
    }
  });

  // DELETE /api/servers/:id - Remove upstream server (AUTH-04, Admin only)
  router.delete("/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const db = getDbPool();

      const [existing] = await db.query<any[]>("SELECT id FROM mcp_servers WHERE id = ?", [id]);
      if (existing.length === 0) {
        res.status(404).json({ error: `Server '${id}' not found` });
        return;
      }

      await db.query("DELETE FROM mcp_servers WHERE id = ?", [id]);
      await upstreamManager.closeClient(id);
      toolAggregator.invalidateCache();

      console.log(`[mcpilot-gateway] Admin ${req.user?.username} removed upstream server '${id}'`);

      res.status(200).json({ message: "Server removed successfully", id });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error deleting server:", err);
      res.status(500).json({ error: "Failed to delete upstream server" });
    }
  });

  // POST /api/servers/:id/toggle - Enable/Disable upstream server (Admin only)
  router.post("/:id/toggle", requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const db = getDbPool();

      const [rows] = await db.query<any[]>("SELECT id, enabled, name, base_url FROM mcp_servers WHERE id = ?", [id]);
      if (rows.length === 0) {
        res.status(404).json({ error: `Server '${id}' not found` });
        return;
      }

      const current = rows[0];
      const newEnabled = !Boolean(current.enabled);
      const newStatus = newEnabled ? "Connected" : "Disabled";

      await db.query("UPDATE mcp_servers SET enabled = ?, status = ? WHERE id = ?", [newEnabled, newStatus, id]);
      await upstreamManager.closeClient(id);
      toolAggregator.invalidateCache();

      if (newEnabled) {
        // Ping in background to check real connectivity
        upstreamManager.pingServer({
          id,
          name: current.name,
          base_url: current.base_url,
          status: "Connected",
          enabled: true,
        }).catch(() => {});
      }

      console.log(`[mcpilot-gateway] Admin ${req.user?.username} toggled server '${id}' enabled=${newEnabled}`);

      res.status(200).json({
        id,
        enabled: newEnabled,
        status: newStatus,
      });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error toggling server:", err);
      res.status(500).json({ error: "Failed to toggle upstream server" });
    }
  });

  return router;
}
