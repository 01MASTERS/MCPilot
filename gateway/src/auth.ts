import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getDbPool, UserRecord } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "mcpilot_super_secret_jwt_key_2026";

export interface AuthUser {
  id?: string;
  userId: string;
  username: string;
  role: "admin" | "member";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      apiKey?: { id: string; name: string; key_prefix: string; user_id: string };
    }
  }
}

export function generateToken(user: AuthUser): string {
  return jwt.sign(
    {
      userId: user.userId,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    if (decoded && decoded.userId && decoded.username && decoded.role) {
      return {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.substring(7).trim();
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized: Invalid or expired token" });
    return;
  }

  req.user = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Forbidden: Admin privileges required" });
      return;
    }
    next();
  });
}

export function createAuthRouter(): Router {
  const router = Router();

  // POST /api/auth/login
  router.post("/login", async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required" });
        return;
      }

      const db = getDbPool();
      const [rows] = await db.query<any[]>(
        "SELECT id, username, password_hash, role FROM users WHERE username = ?",
        [username]
      );

      if (rows.length === 0) {
        res.status(401).json({ error: "Invalid username or password" });
        return;
      }

      const userRecord = rows[0];
      const match = await bcrypt.compare(password, userRecord.password_hash);
      if (!match) {
        res.status(401).json({ error: "Invalid username or password" });
        return;
      }

      const authUser: AuthUser = {
        id: userRecord.id,
        userId: userRecord.id,
        username: userRecord.username,
        role: userRecord.role,
      };

      const token = generateToken(authUser);
      res.status(200).json({
        token,
        user: authUser,
      });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Login error:", err);
      res.status(500).json({ error: "Internal server error during authentication" });
    }
  });

  // GET /api/auth/me
  router.get("/me", requireAuth, (req: Request, res: Response): void => {
    res.status(200).json({
      user: {
        ...req.user,
        id: req.user?.userId,
      },
    });
  });

  return router;
}

export function createUsersRouter(): Router {
  const router = Router();

  // GET /api/users - List team members with active key counts (Admin only)
  router.get("/", requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      const db = getDbPool();
      const [rows] = await db.query<any[]>(
        `SELECT 
          u.id, 
          u.username, 
          u.role, 
          u.created_at AS createdAt,
          COUNT(CASE WHEN k.status = 'active' THEN 1 END) AS activeKeyCount
         FROM users u
         LEFT JOIN api_keys k ON u.id = k.user_id
         GROUP BY u.id, u.username, u.role, u.created_at
         ORDER BY u.created_at ASC`
      );

      res.status(200).json({
        users: rows.map((r) => ({
          id: r.id,
          username: r.username,
          role: r.role,
          createdAt: r.createdAt,
          activeKeyCount: Number(r.activeKeyCount) || 0,
        })),
      });
    } catch (err: any) {
      console.error("[mcpilot-gateway] List users error:", err);
      res.status(500).json({ error: "Failed to retrieve team members" });
    }
  });

  // POST /api/users - Invite/create team member (Admin only)
  router.post("/", requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, password, role } = req.body;
      if (!username || typeof username !== "string" || !username.trim()) {
        res.status(400).json({ error: "Username is required" });
        return;
      }
      if (!password || typeof password !== "string" || password.length < 6) {
        res.status(400).json({ error: "Password must be at least 6 characters" });
        return;
      }
      const cleanRole = role === "admin" ? "admin" : "member";
      const cleanUsername = username.trim().toLowerCase();

      const db = getDbPool();
      const [existing] = await db.query<any[]>(
        "SELECT id FROM users WHERE username = ?",
        [cleanUsername]
      );
      if (existing.length > 0) {
        res.status(409).json({ error: `Username '${cleanUsername}' already exists` });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const newUserId = randomUUID();

      await db.query(
        "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, NOW())",
        [newUserId, cleanUsername, passwordHash, cleanRole]
      );

      console.log(`[mcpilot-gateway] Admin ${req.user?.username} invited new ${cleanRole} '${cleanUsername}'`);

      res.status(201).json({
        message: "Team member invited successfully",
        user: {
          id: newUserId,
          username: cleanUsername,
          role: cleanRole,
          createdAt: new Date().toISOString(),
          activeKeyCount: 0,
        },
      });
    } catch (err: any) {
      console.error("[mcpilot-gateway] Invite user error:", err);
      res.status(500).json({ error: "Failed to invite team member" });
    }
  });

  return router;
}

