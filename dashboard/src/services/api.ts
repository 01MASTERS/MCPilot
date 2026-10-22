import type { User, TeamMember, McpServer, McpTool, ApiKey, AuditLog, StoreEnvironment } from "../types";

const TOKEN_KEY = "mcpilot_jwt_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function getAuthHeaders(): HeadersInit {
  const token = getStoredToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function login(username: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Login failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  setStoredToken(data.token);
  const u = data.user || {};
  const normalizedUser: User = {
    id: u.id || u.userId || "",
    userId: u.userId || u.id || "",
    username: u.username || "",
    role: u.role || "member",
  };
  return { token: data.token, user: normalizedUser };
}

export async function getMe(): Promise<User> {
  const res = await fetch("/api/auth/me", {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Unauthorized");
  }
  const data = await res.json();
  const u = data.user || {};
  return {
    id: u.id || u.userId || "",
    userId: u.userId || u.id || "",
    username: u.username || "",
    role: u.role || "member",
  };
}

export async function getServers(): Promise<{ servers: McpServer[]; tools: McpTool[] }> {
  const res = await fetch("/api/servers", {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Failed to load servers");
  }
  return res.json();
}

export async function registerServer(payload: { name: string; baseUrl: string; authToken?: string }): Promise<McpServer> {
  const res = await fetch("/api/servers", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to register server" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function updateServer(
  id: string,
  payload: { name?: string; baseUrl?: string; authToken?: string }
): Promise<{ message: string; id: string }> {
  const res = await fetch(`/api/servers/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to update server" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteServer(id: string): Promise<void> {
  const res = await fetch(`/api/servers/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Failed to delete server");
  }
}

export async function toggleServer(id: string): Promise<{ id: string; enabled: boolean; status: string }> {
  const res = await fetch(`/api/servers/${encodeURIComponent(id)}/toggle`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Failed to toggle server");
  }
  return res.json();
}

export async function getUsers(): Promise<TeamMember[]> {
  const res = await fetch("/api/users", {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to load team members" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.users || [];
}

export async function inviteUser(payload: {
  username: string;
  password: string;
  role: "admin" | "member";
}): Promise<{ message: string; user: TeamMember }> {
  const res = await fetch("/api/users", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to invite team member" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getKeys(): Promise<ApiKey[]> {
  const res = await fetch("/api/keys", {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Failed to load API keys");
  }
  const data = await res.json();
  return data.keys || [];
}

export async function createKey(name: string, userId?: string): Promise<ApiKey & { apiKey: string }> {
  const res = await fetch("/api/keys", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ name, userId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to create API key" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function revokeKey(id: string): Promise<void> {
  const res = await fetch(`/api/keys/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to revoke key" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
}

export async function getAuditLogs(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  search?: string;
}): Promise<{ logs: AuditLog[]; total: number }> {
  const url = new URL("/api/audit", window.location.origin);
  if (params?.limit) url.searchParams.set("limit", String(params.limit));
  if (params?.offset) url.searchParams.set("offset", String(params.offset));
  if (params?.status && params.status !== "all") url.searchParams.set("status", params.status);
  if (params?.search) url.searchParams.set("search", params.search);

  const res = await fetch(url.toString(), {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error("Failed to fetch audit logs");
  }
  return res.json();
}

export async function fetchLlmModels(options: {
  provider: "ollama" | "openai" | "openrouter" | "custom";
  baseUrl?: string;
  apiKey?: string;
}): Promise<{ models: string[]; resolvedBaseUrl: string }> {
  const res = await fetch("/api/chat/models", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch models" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function sendChatMessage(
  messages: Array<{ role: string; content: string }>,
  options: {
    provider: string;
    model: string;
    baseUrl?: string;
    apiKey?: string;
  }
): Promise<{
  role: string;
  content: string;
  toolCallsExecuted?: Array<{ toolName: string; durationMs: number; status: string; args: any; result: any }>;
}> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({
      messages,
      provider: options.provider,
      model: options.model,
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Chat request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Multi-Store API methods (BONUS-01)

export async function getStores(): Promise<{ stores: StoreEnvironment[]; quota: { maxStoresPerUser: number } }> {
  const res = await fetch("/api/stores", {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch stores" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function provisionStore(payload: { name: string; slug?: string }): Promise<{ message: string; store: StoreEnvironment }> {
  const res = await fetch("/api/stores", {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to provision store" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteStore(id: string): Promise<{ message: string }> {
  const res = await fetch(`/api/stores/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to delete store" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Observability & Diagnostics API methods (OBS-01, OBS-02, OBS-03)

export async function fetchMetricsSummary(): Promise<any> {
  const res = await fetch("/api/metrics/summary", {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch metrics summary" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchDiagnostics(serverId?: string): Promise<{ diagnostics: any[] }> {
  const query = serverId ? `?serverId=${encodeURIComponent(serverId)}` : "";
  const res = await fetch(`/api/diagnostics${query}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to fetch diagnostics" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}
