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

export interface StoreRecord {
  id: string;
  name: string;
  slug: string;
  namespace: string;
  ingress_host: string;
  status: "provisioning" | "ready" | "failed" | "deleting";
  created_by: string;
  created_at?: Date;
  updated_at?: Date;
  error_message?: string | null;
}

export interface ToolPermissionRecord {
  id: string;
  target_type: "role" | "user";
  target_id: string;
  server_id: string;
  tool_name: string;
  permission: "allow" | "deny";
  description?: string | null;
  created_at?: Date;
  updated_at?: Date;
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

  // 5. Multi-Store Environments table (BONUS-01, BONUS-02)
  await db.query(`
    CREATE TABLE IF NOT EXISTS stores (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(64) UNIQUE NOT NULL,
      namespace VARCHAR(64) UNIQUE NOT NULL,
      ingress_host VARCHAR(255) NOT NULL,
      status ENUM('provisioning', 'ready', 'failed', 'deleting') DEFAULT 'provisioning',
      created_by VARCHAR(64) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      error_message TEXT NULL,
      INDEX idx_status (status),
      INDEX idx_created_by (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 6. Tool Permissions table (PERM-01)
  await db.query(`
    CREATE TABLE IF NOT EXISTS tool_permissions (
      id VARCHAR(64) PRIMARY KEY,
      target_type ENUM('role', 'user') NOT NULL,
      target_id VARCHAR(64) NOT NULL,
      server_id VARCHAR(64) NOT NULL,
      tool_name VARCHAR(128) NOT NULL,
      permission ENUM('allow', 'deny') NOT NULL DEFAULT 'allow',
      description VARCHAR(255) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_target_server_tool (target_type, target_id, server_id, tool_name),
      INDEX idx_target (target_type, target_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Seed default tool permissions if empty
  const [permRows] = await db.query<any[]>("SELECT COUNT(*) as cnt FROM tool_permissions");
  if (permRows[0].cnt === 0) {
    const defaultPerms = [
      {
        id: randomUUID(),
        target_type: "role",
        target_id: "admin",
        server_id: "*",
        tool_name: "*",
        permission: "allow",
        description: "Administrators have full access to all servers and tools",
      },
      {
        id: randomUUID(),
        target_type: "role",
        target_id: "member",
        server_id: "woocommerce",
        tool_name: "create_product",
        permission: "deny",
        description: "Members cannot create catalog products",
      },
      {
        id: randomUUID(),
        target_type: "role",
        target_id: "member",
        server_id: "woocommerce",
        tool_name: "update_order_status",
        permission: "deny",
        description: "Members cannot alter order statuses",
      },
      {
        id: randomUUID(),
        target_type: "role",
        target_id: "member",
        server_id: "store_*",
        tool_name: "create_product",
        permission: "deny",
        description: "Members cannot create tenant store products",
      },
      {
        id: randomUUID(),
        target_type: "role",
        target_id: "member",
        server_id: "store_*",
        tool_name: "update_order_status",
        permission: "deny",
        description: "Members cannot alter tenant store order statuses",
      },
    ];

    for (const p of defaultPerms) {
      await db.query(
        `INSERT INTO tool_permissions (id, target_type, target_id, server_id, tool_name, permission, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.target_type, p.target_id, p.server_id, p.tool_name, p.permission, p.description]
      );
    }
    console.log("[mcpilot-gateway] Seeded default tool permissions matrix");
  }

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

// Multi-Store CRUD operations (BONUS-01, BONUS-02)

export async function createStoreRecord(store: Omit<StoreRecord, 'created_at' | 'updated_at'>): Promise<void> {
  const db = getDbPool();
  await db.query(
    `INSERT INTO stores (id, name, slug, namespace, ingress_host, status, created_by, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      store.id,
      store.name,
      store.slug,
      store.namespace,
      store.ingress_host,
      store.status,
      store.created_by,
      store.error_message || null
    ]
  );
}

export async function getStoreRecord(id: string): Promise<StoreRecord | null> {
  const db = getDbPool();
  const [rows] = await db.query<any[]>("SELECT * FROM stores WHERE id = ?", [id]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    namespace: r.namespace,
    ingress_host: r.ingress_host,
    status: r.status,
    created_by: r.created_by,
    created_at: r.created_at ? new Date(r.created_at) : undefined,
    updated_at: r.updated_at ? new Date(r.updated_at) : undefined,
    error_message: r.error_message
  };
}

export async function getStoreRecordBySlug(slug: string): Promise<StoreRecord | null> {
  const db = getDbPool();
  const [rows] = await db.query<any[]>("SELECT * FROM stores WHERE slug = ?", [slug]);
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    namespace: r.namespace,
    ingress_host: r.ingress_host,
    status: r.status,
    created_by: r.created_by,
    created_at: r.created_at ? new Date(r.created_at) : undefined,
    updated_at: r.updated_at ? new Date(r.updated_at) : undefined,
    error_message: r.error_message
  };
}

export async function listStoreRecords(): Promise<StoreRecord[]> {
  const db = getDbPool();
  const [rows] = await db.query<any[]>("SELECT * FROM stores ORDER BY created_at DESC");
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    namespace: r.namespace,
    ingress_host: r.ingress_host,
    status: r.status,
    created_by: r.created_by,
    created_at: r.created_at ? new Date(r.created_at) : undefined,
    updated_at: r.updated_at ? new Date(r.updated_at) : undefined,
    error_message: r.error_message
  }));
}

export async function updateStoreStatus(
  id: string,
  status: StoreRecord['status'],
  errorMessage?: string | null
): Promise<void> {
  const db = getDbPool();
  await db.query(
    "UPDATE stores SET status = ?, error_message = ? WHERE id = ?",
    [status, errorMessage || null, id]
  );
}

export async function deleteStoreRecord(id: string): Promise<void> {
  const db = getDbPool();
  await db.query("DELETE FROM stores WHERE id = ?", [id]);
}

export async function countActiveStoresByUser(userId: string): Promise<number> {
  const db = getDbPool();
  const [rows] = await db.query<any[]>(
    "SELECT COUNT(*) as cnt FROM stores WHERE created_by = ? AND status != 'failed'",
    [userId]
  );
  return rows[0]?.cnt || 0;
}

// Tool Permissions Data Access (PERM-01, PERM-04)

export async function getAllToolPermissions(): Promise<ToolPermissionRecord[]> {
  const db = getDbPool();
  const [rows] = await db.query<any[]>(
    "SELECT * FROM tool_permissions ORDER BY target_type ASC, target_id ASC, server_id ASC"
  );
  return rows.map((r) => ({
    id: r.id,
    target_type: r.target_type,
    target_id: r.target_id,
    server_id: r.server_id,
    tool_name: r.tool_name,
    permission: r.permission,
    description: r.description,
    created_at: r.created_at ? new Date(r.created_at) : undefined,
    updated_at: r.updated_at ? new Date(r.updated_at) : undefined,
  }));
}

export async function upsertToolPermission(perm: {
  targetType: "role" | "user";
  targetId: string;
  serverId: string;
  toolName: string;
  permission: "allow" | "deny";
  description?: string;
}): Promise<string> {
  const db = getDbPool();
  const id = randomUUID();
  await db.query(
    `INSERT INTO tool_permissions (id, target_type, target_id, server_id, tool_name, permission, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE permission = VALUES(permission), description = VALUES(description), updated_at = NOW()`,
    [id, perm.targetType, perm.targetId, perm.serverId, perm.toolName, perm.permission, perm.description || null]
  );
  return id;
}

export async function deleteToolPermission(id: string): Promise<void> {
  const db = getDbPool();
  await db.query("DELETE FROM tool_permissions WHERE id = ?", [id]);
}

export async function resetToolPermissionsToDefaults(): Promise<void> {
  const db = getDbPool();
  await db.query("DELETE FROM tool_permissions");

  const defaultPerms = [
    {
      id: randomUUID(),
      target_type: "role",
      target_id: "admin",
      server_id: "*",
      tool_name: "*",
      permission: "allow",
      description: "Administrators have full access to all servers and tools",
    },
    {
      id: randomUUID(),
      target_type: "role",
      target_id: "member",
      server_id: "woocommerce",
      tool_name: "create_product",
      permission: "deny",
      description: "Members cannot create catalog products",
    },
    {
      id: randomUUID(),
      target_type: "role",
      target_id: "member",
      server_id: "woocommerce",
      tool_name: "update_order_status",
      permission: "deny",
      description: "Members cannot alter order statuses",
    },
    {
      id: randomUUID(),
      target_type: "role",
      target_id: "member",
      server_id: "store_*",
      tool_name: "create_product",
      permission: "deny",
      description: "Members cannot create tenant store products",
    },
    {
      id: randomUUID(),
      target_type: "role",
      target_id: "member",
      server_id: "store_*",
      tool_name: "update_order_status",
      permission: "deny",
      description: "Members cannot alter tenant store order statuses",
    },
  ];

  for (const p of defaultPerms) {
    await db.query(
      `INSERT INTO tool_permissions (id, target_type, target_id, server_id, tool_name, permission, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.target_type, p.target_id, p.server_id, p.tool_name, p.permission, p.description]
    );
  }
}
