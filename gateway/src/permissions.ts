/**
 * MCPilot Tool Permissions & Role-Based Access Control Engine (PERM-01, PERM-02, PERM-03)
 * 
 * Provides:
 * - In-memory policy caching for sub-millisecond evaluation
 * - Dynamic filtering of tools in MCP `tools/list`
 * - Strict authorization checks on MCP `tools/call`
 * - Pattern matching for wildcard servers (e.g. `store_*`) and wildcard tools (`*`)
 */

import { getAllToolPermissions, ToolPermissionRecord } from "./db.js";
import { AuthUser } from "./auth.js";

let cachedPermissions: ToolPermissionRecord[] = [];

/**
 * Loads all permissions from MariaDB into in-memory cache
 */
export async function loadPermissionsFromDb(): Promise<void> {
  try {
    cachedPermissions = await getAllToolPermissions();
    console.log(`[mcpilot-gateway] Loaded ${cachedPermissions.length} tool permission policies into memory`);
  } catch (err) {
    console.error("[mcpilot-gateway] Failed to load tool permissions:", err);
  }
}

/**
 * Splits a namespaced tool (e.g., 'woocommerce__list_orders' or 'store_apple-store__create_product')
 * into upstream server ID and raw tool name.
 */
export function splitNamespacedTool(fullName: string): { serverId: string; rawToolName: string } {
  const separatorIdx = fullName.indexOf("__");
  if (separatorIdx === -1) {
    return { serverId: "gateway", rawToolName: fullName };
  }
  return {
    serverId: fullName.slice(0, separatorIdx),
    rawToolName: fullName.slice(separatorIdx + 2),
  };
}

/**
 * Checks if a rule's server pattern matches the actual server ID
 */
function matchesServerPattern(ruleServer: string, actualServer: string): boolean {
  if (ruleServer === "*" || ruleServer === actualServer) return true;
  if (ruleServer.endsWith("*")) {
    const prefix = ruleServer.slice(0, -1);
    return actualServer.startsWith(prefix);
  }
  return false;
}

/**
 * Checks if a rule's tool pattern matches the actual tool name
 */
function matchesToolPattern(ruleTool: string, actualTool: string): boolean {
  if (ruleTool === "*" || ruleTool === actualTool) return true;
  return false;
}

/**
 * Determines whether a user has permission to execute or view a specific tool.
 */
export function canAccessTool(
  user: AuthUser | undefined,
  serverId: string,
  rawToolName: string
): boolean {
  if (!user) return false;

  // 1. User-specific explicit overrides
  const userRules = cachedPermissions.filter(
    (p) => p.target_type === "user" && p.target_id === user.userId
  );

  // Exact server & tool match for user
  const exactUserRule = userRules.find(
    (p) => matchesServerPattern(p.server_id, serverId) && matchesToolPattern(p.tool_name, rawToolName)
  );
  if (exactUserRule) {
    return exactUserRule.permission === "allow";
  }

  // 2. Role-specific explicit policies
  const roleRules = cachedPermissions.filter(
    (p) => p.target_type === "role" && p.target_id === user.role
  );

  // Check specific server & specific tool first
  const specificRoleRule = roleRules.find(
    (p) => matchesServerPattern(p.server_id, serverId) && p.tool_name === rawToolName
  );
  if (specificRoleRule) {
    return specificRoleRule.permission === "allow";
  }

  // Check wildcard server / wildcard tool
  const wildcardRoleRule = roleRules.find(
    (p) => matchesServerPattern(p.server_id, serverId) && matchesToolPattern(p.tool_name, rawToolName)
  );
  if (wildcardRoleRule) {
    return wildcardRoleRule.permission === "allow";
  }

  // 3. Fallback Heuristics
  if (user.role === "admin") {
    return true; // Admins default to allow
  }

  // Members: Mutating tools default to deny; read tools default to allow
  const isMutating =
    rawToolName.startsWith("create_") ||
    rawToolName.startsWith("update_") ||
    rawToolName.startsWith("delete_") ||
    rawToolName.startsWith("set_");

  return !isMutating;
}

/**
 * Filters a list of MCP tools, returning only the tools the caller is permitted to see/access.
 */
export function filterToolsForCaller(tools: any[], user: AuthUser | undefined): any[] {
  if (!user) return [];
  return tools.filter((tool) => {
    const { serverId, rawToolName } = splitNamespacedTool(tool.name);
    return canAccessTool(user, serverId, rawToolName);
  });
}

/**
 * Returns in-memory permissions cache snapshot
 */
export function getCachedPermissions(): ToolPermissionRecord[] {
  return [...cachedPermissions];
}
