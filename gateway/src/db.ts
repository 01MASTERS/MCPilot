import mysql from "mysql2/promise";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

dotenv.config();

export interface McpServerRecord {
  id: string;
  name: string;
  base_url: string;
  status: "Connected" | "Unreachable" | "Disabled";
  enabled: boolean;
  auth_token?: string | null;
  last_health_check?: Date | null;
  error_message?: string | null;
}

export interface UserRecord {
  id: string;
  username: string;
  password_hash: string;
  role: "admin" | "member";
  created_at?: Date;
}

export interface ApiKeyRecord {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  status: "active" | "revoked";
  created_at?: Date;
  revoked_at?: Date | null;
  last_used_at?: Date | null;
}

export interface AuditLogRecord {
  id: string;
  user_id?: string | null;
  username?: string | null;
  api_key_id?: string | null;
  server_id?: string | null;
  tool_name: string;
  arguments?: any;
  status: "success" | "error";
  duration_ms: number;
  error_message?: string | null;
  created_at?: Date;
}

let pool: mysql.Pool | null = null;

export function getDbPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || "mcpilot-mariadb",
      port: parseInt(process.env.DB_PORT || "3306", 10),
      user: process.env.DB_USER || "wordpress",
      password: process.env.DB_PASSWORD || "wc_db_password",
      database: process.env.DB_NAME || "mcpilot_gateway",
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function initDatabase(): Promise<void> {
  const db = getDbPool();

  // 1. Upstream Servers table
  await db.query(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      base_url VARCHAR(255) NOT NULL,
      status ENUM('Connected', 'Unreachable', 'Disabled') DEFAULT 'Connected',
      enabled BOOLEAN DEFAULT TRUE,
      auth_token VARCHAR(255) NULL,
      last_health_check DATETIME NULL,
      error_message TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 2. Users table (AUTH-01)
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(64) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 3. API Keys table (AUTH-02, AUTH-03)
  await db.query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      key_prefix VARCHAR(32) NOT NULL,
      key_hash VARCHAR(64) UNIQUE NOT NULL,
      status ENUM('active', 'revoked') NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at DATETIME NULL,
      last_used_at DATETIME NULL,
      INDEX idx_key_hash (key_hash),
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 4. Audit Logs table (AUTH-05)
  await db.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NULL,
      username VARCHAR(64) NULL,
      api_key_id VARCHAR(64) NULL,
      server_id VARCHAR(64) NULL,
      tool_name VARCHAR(255) NOT NULL,
      arguments JSON NULL,
      status ENUM('success', 'error') NOT NULL,
      duration_ms INT NOT NULL DEFAULT 0,
      error_message TEXT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_tool_name (tool_name),
      INDEX idx_status (status),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Pre-seed default upstream servers if table is empty
  const [serverRows] = await db.query<any[]>("SELECT COUNT(*) as cnt FROM mcp_servers");
  if (serverRows[0].cnt === 0) {
    const defaultServers = [
      {
        id: "woocommerce",
        name: "WooCommerce Store Catalog",
        base_url: process.env.WC_MCP_URL || "http://mcpilot-woocommerce-mcp:3000/mcp",
      },
      {
        id: "analytics",
        name: "Store Analytics & Metrics",
        base_url: process.env.ANALYTICS_MCP_URL || "http://mcpilot-analytics-mcp:3001/mcp",
      },
      {
        id: "time",
        name: "Operational Time & Delivery Calculator",
        base_url: process.env.TIME_MCP_URL || "http://mcpilot-time-mcp:3002/mcp",
      },
    ];

    for (const s of defaultServers) {
      await db.query(
        "INSERT INTO mcp_servers (id, name, base_url, status, enabled) VALUES (?, ?, ?, 'Connected', TRUE)",
        [s.id, s.name, s.base_url]
      );
    }
    console.log("[mcpilot-gateway] Seeded 3 default upstream MCP servers into database.");
  }

  // Pre-seed users (admin & alex) if not existing
  const [adminRows] = await db.query<any[]>("SELECT id FROM users WHERE username = 'admin'");
  if (adminRows.length === 0) {
    const adminHash = bcrypt.hashSync("admin123", 10);
    await db.query(
      "INSERT INTO users (id, username, password_hash, role) VALUES (?, 'admin', ?, 'admin')",
      [randomUUID(), adminHash]
    );
    console.log("[mcpilot-gateway] Seeded default user: admin (role: admin)");
  }

  const [alexRows] = await db.query<any[]>("SELECT id FROM users WHERE username = 'alex'");
  if (alexRows.length === 0) {
    const alexHash = bcrypt.hashSync("alex123", 10);
    await db.query(
      "INSERT INTO users (id, username, password_hash, role) VALUES (?, 'alex', ?, 'member')",
      [randomUUID(), alexHash]
    );
    console.log("[mcpilot-gateway] Seeded default user: alex (role: member)");
  }
}

export async function getEnabledServers(): Promise<McpServerRecord[]> {
  const db = getDbPool();
  const [rows] = await db.query<any[]>("SELECT * FROM mcp_servers WHERE enabled = TRUE");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    base_url: r.base_url,
    status: r.status,
    enabled: Boolean(r.enabled),
    auth_token: r.auth_token,
    last_health_check: r.last_health_check ? new Date(r.last_health_check) : null,
    error_message: r.error_message,
  }));
}

export async function getAllServers(): Promise<McpServerRecord[]> {
  const db = getDbPool();
  const [rows] = await db.query<any[]>("SELECT * FROM mcp_servers ORDER BY created_at ASC");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    base_url: r.base_url,
    status: r.status,
    enabled: Boolean(r.enabled),
    auth_token: r.auth_token,
    last_health_check: r.last_health_check ? new Date(r.last_health_check) : null,
    error_message: r.error_message,
  }));
}

export async function updateServerStatus(
  id: string,
  status: "Connected" | "Unreachable" | "Disabled",
  errorMessage?: string | null
): Promise<void> {
  const db = getDbPool();
  await db.query(
    "UPDATE mcp_servers SET status = ?, error_message = ?, last_health_check = NOW() WHERE id = ?",
    [status, errorMessage || null, id]
  );
}
