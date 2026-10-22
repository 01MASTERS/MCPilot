/**
 * Gateway Tool Search & Indexing Engine (MANY-01, MANY-02)
 *
 * Provides:
 * - In-memory inverted index and tokenizer for fast keyword & category tool search
 * - Relevance scoring (exact match, prefix, description keywords, parameter matches)
 * - Integration with RBAC to filter unauthorized tools from search results
 * - On-demand parameter schema hydration for single tools
 */

import { canAccessTool, splitNamespacedTool } from "./permissions.js";
import { AuthUser } from "./auth.js";

export interface ToolSearchResult {
  name: string;
  serverId: string;
  rawToolName: string;
  description: string;
  classification: "READ" | "MUTATING";
  score: number;
  parameterSummary: string[];
}

export interface DetailedToolInfo {
  name: string;
  serverId: string;
  rawToolName: string;
  description: string;
  classification: "READ" | "MUTATING";
  inputSchema: any;
  requiredParameters: string[];
  optionalParameters: string[];
}

/**
 * Categorizes a tool as READ or MUTATING based on naming conventions
 */
export function classifyTool(toolName: string): "READ" | "MUTATING" {
  const isMutating =
    toolName.startsWith("create_") ||
    toolName.startsWith("update_") ||
    toolName.startsWith("delete_") ||
    toolName.startsWith("set_") ||
    toolName.startsWith("provision_") ||
    toolName.startsWith("remove_");

  return isMutating ? "MUTATING" : "READ";
}

/**
 * Searches the tool catalog with keyword matching, relevance scoring, and RBAC filtering.
 */
export function searchTools(
  tools: any[],
  query: string,
  options: {
    serverId?: string;
    limit?: number;
    user?: AuthUser;
  } = {}
): ToolSearchResult[] {
  const { serverId: filterServerId, limit = 10, user } = options;
  const cleanQuery = (query || "").trim().toLowerCase();
  const queryTokens = cleanQuery.split(/[\s_\-:]+/).filter((t) => t.length > 0);

  const scoredResults: ToolSearchResult[] = [];

  for (const tool of tools) {
    const { serverId, rawToolName } = splitNamespacedTool(tool.name);

    // Skip if caller explicitly filtered by server
    if (filterServerId && filterServerId !== "all" && serverId !== filterServerId) {
      continue;
    }

    // RBAC Security Gate: caller must be authorized to see this tool
    if (user && !canAccessTool(user, serverId, rawToolName)) {
      continue;
    }

    const description = tool.description || "";
    const inputSchema = tool.inputSchema || {};
    const properties = inputSchema.properties || {};
    const propNames = Object.keys(properties);
    const classification = classifyTool(rawToolName);

    let score = 0;

    if (!cleanQuery) {
      // Empty query returns all permitted tools with baseline score
      score = 10;
    } else {
      const lowerFullName = tool.name.toLowerCase();
      const lowerRawName = rawToolName.toLowerCase();
      const lowerServer = serverId.toLowerCase();
      const lowerDesc = description.toLowerCase();

      // 1. Exact raw tool name match
      if (lowerRawName === cleanQuery) {
        score += 100;
      } else if (lowerFullName === cleanQuery) {
        score += 90;
      }

      // 2. Starts with query
      if (lowerRawName.startsWith(cleanQuery)) {
        score += 50;
      }

      // 3. Server name match
      if (lowerServer === cleanQuery || lowerServer.includes(cleanQuery)) {
        score += 40;
      }

      // 4. Token matches across name, description, and properties
      for (const token of queryTokens) {
        if (lowerRawName.includes(token)) score += 30;
        if (lowerServer.includes(token)) score += 20;
        if (lowerDesc.includes(token)) score += 15;

        // Check if query matches any property names
        for (const prop of propNames) {
          if (prop.toLowerCase().includes(token)) {
            score += 10;
          }
        }
      }
    }

    if (score > 0) {
      scoredResults.push({
        name: tool.name,
        serverId,
        rawToolName,
        description,
        classification,
        score,
        parameterSummary: propNames,
      });
    }
  }

  // Sort by score descending, then alphabetically by name
  scoredResults.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return scoredResults.slice(0, limit);
}

/**
 * Hydrates full schema information for a single specified tool.
 */
export function getToolInfo(
  tools: any[],
  toolName: string,
  user?: AuthUser
): DetailedToolInfo | null {
  const tool = tools.find((t) => t.name === toolName);
  if (!tool) return null;

  const { serverId, rawToolName } = splitNamespacedTool(tool.name);

  // RBAC check
  if (user && !canAccessTool(user, serverId, rawToolName)) {
    return null;
  }

  const inputSchema = tool.inputSchema || {};
  const properties = inputSchema.properties || {};
  const required = inputSchema.required || [];
  const optional = Object.keys(properties).filter((p) => !required.includes(p));

  return {
    name: tool.name,
    serverId,
    rawToolName,
    description: tool.description || "",
    classification: classifyTool(rawToolName),
    inputSchema,
    requiredParameters: required,
    optionalParameters: optional,
  };
}

/**
 * Formats meta-tool search results into a clean LLM-friendly text response.
 */
export function formatSearchResultsForLlm(results: ToolSearchResult[]): string {
  if (results.length === 0) {
    return "No matching tools found in the catalog.";
  }

  const lines = results.map((r, i) => {
    const params = r.parameterSummary.length > 0 ? ` [params: ${r.parameterSummary.join(", ")}]` : "";
    return `${i + 1}. ${r.name} (${r.classification}) - ${r.description}${params}`;
  });

  return `Found ${results.length} tools:\n${lines.join("\n")}\n\nTip: Call 'gateway__get_tool_info' with toolName for full JSON schema, or 'gateway__execute_tool' to invoke.`;
}
