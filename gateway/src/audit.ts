import { Router, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { getDbPool } from "./db.js";
import { requireAuth } from "./auth.js";

export interface LogToolInvocationParams {
  userId?: string | null;
  username?: string | null;
  apiKeyId?: string | null;
  serverId?: string | null;
  toolName: string;
  args?: any;
  status: "success" | "error";
  durationMs: number;
  errorMessage?: string | null;
}

export async function logToolInvocation(params: LogToolInvocationParams): Promise<void> {
  try {
    const db = getDbPool();
    const id = randomUUID();

    const argsJson = params.args !== undefined ? JSON.stringify(params.args) : null;

    await db.query(
      `INSERT INTO audit_logs 
       (id, user_id, username, api_key_id, server_id, tool_name, arguments, status, duration_ms, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id,
        params.userId || null,
        params.username || null,
        params.apiKeyId || null,
        params.serverId || null,
        params.toolName,
        argsJson,
        params.status,
        params.durationMs,
        params.errorMessage || null,
      ]
    );
  } catch (err) {
    console.error("[mcpilot-gateway] Failed to write audit log entry:", err);
  }
}

export function createAuditRouter(): Router {
  const router = Router();

  // GET /api/audit - Query audit logs with pagination and filters (UI-04)
  router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const db = getDbPool();

      const limit = Math.min(Math.max(parseInt((req.query.limit as string) || "50", 10), 1), 200);
      const offset = Math.max(parseInt((req.query.offset as string) || "0", 10), 0);
      const statusFilter = req.query.status as string | undefined;
      const search = (req.query.search as string | undefined)?.trim();

      const whereClauses: string[] = [];
      const queryParams: any[] = [];

      if (statusFilter && statusFilter !== "all") {
        whereClauses.push("status = ?");
        queryParams.push(statusFilter);
      }

      if (search) {
        whereClauses.push("(tool_name LIKE ? OR username LIKE ?)");
        queryParams.push(`%${search}%`, `%${search}%`);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

      // Total count
      const [countRows] = await db.query<any[]>(
        `SELECT COUNT(*) as total FROM audit_logs ${whereSql}`,
        queryParams
      );
      const total = countRows[0]?.total || 0;

      // Paginated logs
      const [rows] = await db.query<any[]>(
        `SELECT id, user_id, username, api_key_id, server_id, tool_name, arguments, status, duration_ms, error_message, created_at
         FROM audit_logs
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`,
        [...queryParams, limit, offset]
      );

      const logs = rows.map((r) => {
        let parsedArgs = r.arguments;
        if (typeof parsedArgs === "string") {
          try {
            parsedArgs = JSON.parse(parsedArgs);
          } catch {}
        }
        return {
          id: r.id,
          userId: r.user_id,
          username: r.username,
          apiKeyId: r.api_key_id,
          serverId: r.server_id,
          toolName: r.tool_name,
          arguments: parsedArgs,
          status: r.status,
          durationMs: r.duration_ms,
          errorMessage: r.error_message,
          createdAt: r.created_at,
        };
      });

      res.status(200).json({ logs, total, limit, offset });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error querying audit logs:", err);
      res.status(500).json({ error: "Failed to retrieve audit logs" });
    }
  });

  // GET /api/audit/:id - Retrieve specific trace details
  router.get("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const db = getDbPool();

      const [rows] = await db.query<any[]>(
        `SELECT id, user_id, username, api_key_id, server_id, tool_name, arguments, status, duration_ms, error_message, created_at
         FROM audit_logs
         WHERE id = ?`,
        [id]
      );

      if (rows.length === 0) {
        res.status(404).json({ error: "Audit record not found" });
        return;
      }

      const r = rows[0];
      let parsedArgs = r.arguments;
      if (typeof parsedArgs === "string") {
        try {
          parsedArgs = JSON.parse(parsedArgs);
        } catch {}
      }

      res.status(200).json({
        id: r.id,
        userId: r.user_id,
        username: r.username,
        apiKeyId: r.api_key_id,
        serverId: r.server_id,
        toolName: r.tool_name,
        arguments: parsedArgs,
        status: r.status,
        durationMs: r.duration_ms,
        errorMessage: r.error_message,
        createdAt: r.created_at,
      });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error fetching audit entry:", err);
      res.status(500).json({ error: "Failed to retrieve audit entry" });
    }
  });

  return router;
}
