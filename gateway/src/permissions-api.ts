import { Router, Request, Response } from "express";
import {
  getAllToolPermissions,
  upsertToolPermission,
  deleteToolPermission,
  resetToolPermissionsToDefaults,
} from "./db.js";
import { requireAuth, requireAdmin } from "./auth.js";
import { ToolAggregator } from "./tool-aggregator.js";
import {
  loadPermissionsFromDb,
  canAccessTool,
  splitNamespacedTool,
  getCachedPermissions,
} from "./permissions.js";

export function createPermissionsRouter(toolAggregator: ToolAggregator): Router {
  const router = Router();

  // GET /api/permissions - Fetch all policies, active tools, and effective permission matrix (PERM-04)
  router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const policies = await getAllToolPermissions();
      const tools = await toolAggregator.getAllNamespacedTools().catch(() => []);

      // Calculate effective permissions matrix for standard roles
      const matrix = tools.map((tool) => {
        const { serverId, rawToolName } = splitNamespacedTool(tool.name);
        const isMutating =
          rawToolName.startsWith("create_") ||
          rawToolName.startsWith("update_") ||
          rawToolName.startsWith("delete_") ||
          rawToolName.startsWith("set_");

        const adminAllowed = canAccessTool(
          { userId: "sim-admin", username: "admin", role: "admin" },
          serverId,
          rawToolName
        );

        const memberAllowed = canAccessTool(
          { userId: "sim-member", username: "member", role: "member" },
          serverId,
          rawToolName
        );

        return {
          name: tool.name,
          serverId,
          rawToolName,
          description: tool.description || "",
          isMutating,
          adminAllowed,
          memberAllowed,
        };
      });

      res.status(200).json({ policies, matrix, tools });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error fetching tool permissions:", err);
      res.status(500).json({ error: "Failed to fetch tool permissions" });
    }
  });

  // PUT /api/permissions - Upsert a role or user permission policy (PERM-04, Admin only)
  router.put("/", requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      const { targetType, targetId, serverId, toolName, permission, description } = req.body;

      if (!targetType || !["role", "user"].includes(targetType)) {
        res.status(400).json({ error: "Invalid targetType: must be 'role' or 'user'" });
        return;
      }
      if (!targetId || typeof targetId !== "string") {
        res.status(400).json({ error: "targetId is required" });
        return;
      }
      if (!serverId || typeof serverId !== "string") {
        res.status(400).json({ error: "serverId is required" });
        return;
      }
      if (!toolName || typeof toolName !== "string") {
        res.status(400).json({ error: "toolName is required" });
        return;
      }
      if (!permission || !["allow", "deny"].includes(permission)) {
        res.status(400).json({ error: "Invalid permission: must be 'allow' or 'deny'" });
        return;
      }

      const id = await upsertToolPermission({
        targetType,
        targetId,
        serverId,
        toolName,
        permission,
        description,
      });

      // Synchronize in-memory cache immediately
      await loadPermissionsFromDb();

      console.log(
        `[mcpilot-gateway] Updated tool permission: ${targetType}:${targetId} -> ${serverId}:${toolName} = ${permission}`
      );

      res.status(200).json({
        success: true,
        id,
        message: `Permission updated: ${targetType}:${targetId} -> ${serverId}:${toolName} = ${permission}`,
      });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error updating tool permission:", err);
      res.status(500).json({ error: "Failed to update tool permission" });
    }
  });

  // POST /api/permissions/reset - Reset policies to default role template (PERM-04, Admin only)
  router.post("/reset", requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try {
      await resetToolPermissionsToDefaults();
      await loadPermissionsFromDb();

      console.log("[mcpilot-gateway] Reset tool permissions to default template");
      res.status(200).json({
        success: true,
        message: "Tool permissions successfully reset to recommended defaults",
      });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error resetting tool permissions:", err);
      res.status(500).json({ error: "Failed to reset tool permissions" });
    }
  });

  // DELETE /api/permissions/:id - Delete an override policy rule (Admin only)
  router.delete("/:id", requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      await deleteToolPermission(String(req.params.id));
      await loadPermissionsFromDb();

      res.status(200).json({ success: true, message: "Permission deleted" });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error deleting tool permission:", err);
      res.status(500).json({ error: "Failed to delete tool permission" });
    }
  });

  return router;
}
