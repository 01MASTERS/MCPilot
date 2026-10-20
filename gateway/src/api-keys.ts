import { Router, Request, Response, NextFunction } from "express";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { getDbPool } from "./db.js";
import { requireAuth, verifyToken, AuthUser } from "./auth.js";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateRawApiKey(): { rawKey: string; prefix: string; hash: string } {
  const randomChars = randomBytes(16).toString("hex"); // 32 hex chars
  const rawKey = `mcp_live_${randomChars}`;
  const prefix = `mcp_live_${randomChars.slice(0, 4)}••••${randomChars.slice(-4)}`;
  const hash = hashApiKey(rawKey);
  return { rawKey, prefix, hash };
}

export async function validateApiKey(rawKey: string): Promise<{
  valid: boolean;
  status: "active" | "revoked" | "not_found";
  keyRecord?: {
    id: string;
    userId: string;
    username: string;
    role: "admin" | "member";
    name: string;
    keyPrefix: string;
  };
}> {
  const hash = hashApiKey(rawKey);
  const db = getDbPool();
  const [rows] = await db.query<any[]>(
    `SELECT k.id, k.name, k.key_prefix, k.status, k.user_id, u.username, u.role
     FROM api_keys k
     LEFT JOIN users u ON k.user_id = u.id
     WHERE k.key_hash = ? LIMIT 1`,
    [hash]
  );

  if (rows.length === 0) {
    return { valid: false, status: "not_found" };
  }

  const row = rows[0];
  if (row.status === "revoked") {
    return { valid: false, status: "revoked" };
  }

  // Update last_used_at asynchronously
  db.query("UPDATE api_keys SET last_used_at = NOW() WHERE id = ?", [row.id]).catch((err) =>
    console.error("[mcpilot-gateway] Failed to update key last_used_at:", err)
  );

  return {
    valid: true,
    status: "active",
    keyRecord: {
      id: row.id,
      userId: row.user_id,
      username: row.username || "api_user",
      role: row.role || "member",
      name: row.name,
      keyPrefix: row.key_prefix,
    },
  };
}

// Middleware protecting /mcp endpoint
export async function mcpAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized: Missing or invalid Authorization Bearer header" },
      id: null,
    });
    return;
  }

  const token = authHeader.substring(7).trim();

  // If Stripe-style live API key
  if (token.startsWith("mcp_live_")) {
    const result = await validateApiKey(token);
    if (!result.valid || !result.keyRecord) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message:
            result.status === "revoked"
              ? "Unauthorized: API key has been revoked"
              : "Unauthorized: Invalid API key",
        },
        id: null,
      });
      return;
    }

    req.apiKey = {
      id: result.keyRecord.id,
      name: result.keyRecord.name,
      key_prefix: result.keyRecord.keyPrefix,
      user_id: result.keyRecord.userId,
    };
    req.user = {
      userId: result.keyRecord.userId,
      username: result.keyRecord.username,
      role: result.keyRecord.role,
    };
    return next();
  }

  // Otherwise check JWT session token
  const jwtUser = verifyToken(token);
  if (jwtUser) {
    req.user = jwtUser;
    return next();
  }

  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Unauthorized: Invalid API key or expired JWT session" },
    id: null,
  });
}

export function createApiKeysRouter(): Router {
  const router = Router();

  // GET /api/keys - List team API keys
  router.get("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const db = getDbPool();
      const [rows] = await db.query<any[]>(
        `SELECT k.id, k.user_id, k.name, k.key_prefix, k.status, k.created_at, k.revoked_at, k.last_used_at, u.username
         FROM api_keys k
         LEFT JOIN users u ON k.user_id = u.id
         ORDER BY k.created_at DESC`
      );

      res.status(200).json({
        keys: rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          username: r.username,
          name: r.name,
          keyPrefix: r.key_prefix,
          status: r.status,
          createdAt: r.created_at,
          revokedAt: r.revoked_at,
          lastUsedAt: r.last_used_at,
        })),
      });
    } catch (err: any) {
      console.error("[mcpilot-gateway] List API keys error:", err);
      res.status(500).json({ error: "Failed to retrieve API keys" });
    }
  });

  // POST /api/keys - Generate a new team API key
  router.post("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { name, userId: targetUserId } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "API key name is required" });
        return;
      }

      const user = req.user!;
      let assignedUserId = user.userId;
      let assignedUsername = user.username;

      const db = getDbPool();

      // If targetUserId is provided, check admin permissions and target existence
      if (targetUserId && typeof targetUserId === "string" && targetUserId !== user.userId) {
        if (user.role !== "admin") {
          res.status(403).json({ error: "Only admins can issue API keys on behalf of other team members" });
          return;
        }

        const [targetRows] = await db.query<any[]>(
          "SELECT id, username FROM users WHERE id = ?",
          [targetUserId]
        );
        if (targetRows.length === 0) {
          res.status(404).json({ error: "Target team member not found" });
          return;
        }
        assignedUserId = targetRows[0].id;
        assignedUsername = targetRows[0].username;
      }

      const { rawKey, prefix, hash } = generateRawApiKey();
      const id = randomUUID();

      await db.query(
        `INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [id, assignedUserId, name.trim(), prefix, hash]
      );

      console.log(`[mcpilot-gateway] User ${user.username} generated API key '${name}' (${prefix}) for user '${assignedUsername}'`);

      res.status(201).json({
        id,
        userId: assignedUserId,
        username: assignedUsername,
        name: name.trim(),
        keyPrefix: prefix,
        apiKey: rawKey, // Displayed ONLY once upon creation!
        status: "active",
        createdAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Create API key error:", err);
      res.status(500).json({ error: "Failed to create API key" });
    }
  });

  // POST /api/keys/:id/revoke or DELETE /api/keys/:id - Instant revocation (AUTH-03)
  const revokeHandler = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const db = getDbPool();

      const [checkRows] = await db.query<any[]>("SELECT id, name, user_id, status FROM api_keys WHERE id = ?", [id]);
      if (checkRows.length === 0) {
        res.status(404).json({ error: "API key not found" });
        return;
      }

      const keyRecord = checkRows[0];
      // Members can only revoke their own keys; Admins can revoke any key
      if (req.user?.role !== "admin" && keyRecord.user_id !== req.user?.userId) {
        res.status(403).json({ error: "Forbidden: You do not have permission to revoke this key" });
        return;
      }

      await db.query("UPDATE api_keys SET status = 'revoked', revoked_at = NOW() WHERE id = ?", [id]);
      console.log(`[mcpilot-gateway] API key ${id} ('${keyRecord.name}') instantly revoked by ${req.user?.username}`);

      res.status(200).json({
        message: "API key successfully revoked",
        id,
        status: "revoked",
        revokedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Revoke API key error:", err);
      res.status(500).json({ error: "Failed to revoke API key" });
    }
  };

  router.post("/:id/revoke", requireAuth, revokeHandler);
  router.delete("/:id", requireAuth, revokeHandler);

  return router;
}
