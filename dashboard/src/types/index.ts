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

export interface StoreEnvironment {
  id: string;
  name: string;
  slug: string;
  namespace: string;
  ingressHost: string;
  url: string;
  status: "provisioning" | "ready" | "failed" | "deleting";
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  errorMessage?: string | null;
  toolCount: number;
}

export interface DiagnosticReport {
  code: string;
  category: "NETWORK" | "TIMEOUT" | "HTTP" | "PROTOCOL" | "VALIDATION" | "KUBERNETES";
  summary: string;
  technicalDetails: string;
  remediation: string;
  targetServerId: string;
  targetUrl?: string;
  toolName?: string;
  timestamp: string;
  rawError: string;
  httpStatus?: number;
}

export interface ServerMetric {
  id: string;
  name: string;
  status: "Connected" | "Unreachable" | "Disabled";
  totalCalls: number;
  successfulCalls: number;
  errorCalls: number;
  errorRate: string;
  errorRateNum: number;
  latency: {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  lastInvocation?: string | null;
}

export interface MetricsSummary {
  timestamp: string;
  overview: {
    totalInvocations: number;
    successfulInvocations: number;
    failedInvocations: number;
    overallErrorRate: string;
    avgLatencyMs: number;
    p95LatencyMs: number;
    connectedUpstreams: number;
    totalUpstreams: number;
    uptimeSeconds: number;
  };
  servers: ServerMetric[];
}

export interface ToolPermission {
  id: string;
  target_type: "role" | "user";
  target_id: string;
  server_id: string;
  tool_name: string;
  permission: "allow" | "deny";
  description?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface EffectiveToolPermission {
  name: string;
  serverId: string;
  rawToolName: string;
  description: string;
  isMutating: boolean;
  adminAllowed: boolean;
  memberAllowed: boolean;
}

export interface PermissionsResponse {
  policies: ToolPermission[];
  matrix: EffectiveToolPermission[];
  tools: McpTool[];
}

export interface ToolPermissionUpdatePayload {
  targetType: "role" | "user";
  targetId: string;
  serverId: string;
  toolName: string;
  permission: "allow" | "deny";
  description?: string;
}

