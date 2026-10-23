import { UpstreamClientManager, UpstreamTool } from "./upstream-manager.js";
import { getEnabledServers, McpServerRecord } from "./db.js";

export class ToolAggregator {
  private toolCache: { tools: any[]; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 15000; // 15 seconds cache

  constructor(private upstreamManager: UpstreamClientManager) {}

  public invalidateCache(): void {
    this.toolCache = null;
  }

  /**
   * Aggregate tools across all enabled upstreams with fault isolation (GATE-04, GATE-06)
   */
  async getAllNamespacedTools(forceRefresh = false): Promise<any[]> {
    const now = Date.now();
    if (!forceRefresh && this.toolCache && now - this.toolCache.timestamp < this.CACHE_TTL_MS) {
      return this.toolCache.tools;
    }

    const servers = await getEnabledServers();

    // Query all upstreams concurrently using allSettled to ensure 1 dead upstream doesn't block others
    const results = await Promise.allSettled(
      servers.map((s) => this.upstreamManager.fetchToolsForServer(s))
    );

    const aggregatedTools: any[] = [];

    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === "fulfilled") {
        for (const t of res.value) {
          aggregatedTools.push({
            name: t.namespacedName, // Deterministic namespacing (GATE-05)
            description: t.description,
            inputSchema: t.inputSchema,
          });
        }
      }
    }

    this.toolCache = { tools: aggregatedTools, timestamp: now };
    return aggregatedTools;
  }

  /**
   * Route downstream call to target upstream by parsing '{server_id}__{tool_name}'
   */
  async dispatchCall(
    namespacedToolName: string,
    args: any
  ): Promise<{ content: any[]; isError?: boolean }> {
    const separatorIdx = namespacedToolName.indexOf("__");
    if (separatorIdx === -1) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid namespaced tool name '${namespacedToolName}'. Expected format '{server_id}__{tool_name}'.`,
          },
        ],
      };
    }

    const serverId = namespacedToolName.slice(0, separatorIdx);
    const originalName = namespacedToolName.slice(separatorIdx + 2);

    const servers = await getEnabledServers();
    const server = servers.find((s) => s.id === serverId);

    if (!server) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Target upstream server '${serverId}' is not registered, disabled, or unavailable.`,
          },
        ],
      };
    }

    return this.upstreamManager.executeTool(server, originalName, args || {});
  }
}
