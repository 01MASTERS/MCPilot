export interface User {
  id: string;
  userId?: string;
  username: string;
  role: "admin" | "member";
}

export interface TeamMember {
  id: string;
  username: string;
  role: "admin" | "member";
  createdAt: string;
  activeKeyCount: number;
}

export interface McpServer {
  id: string;
  name: string;
  baseUrl: string;
  status: "Connected" | "Unreachable" | "Disabled";
  enabled: boolean;
  hasAuthToken: boolean;
  toolCount: number;
  lastHealthCheck?: string | null;
  errorMessage?: string | null;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface ApiKey {
  id: string;
  userId: string;
  username: string;
  name: string;
  keyPrefix: string;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  username?: string | null;
  apiKeyId?: string | null;
  serverId?: string | null;
  toolName: string;
  arguments?: any;
  status: "success" | "error";
  durationMs: number;
  errorMessage?: string | null;
  createdAt: string;
}
