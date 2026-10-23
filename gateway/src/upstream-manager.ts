import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServerRecord, updateServerStatus } from "./db.js";
import { recordUpstreamStatus } from "./metrics.js";
import { classifyFailure } from "./failure-diagnostics.js";

export interface UpstreamTool {
  serverId: string;
  originalName: string;
  namespacedName: string;
  description?: string;
  inputSchema: any;
}

export class UpstreamClientManager {
  private activeClients = new Map<string, { client: Client; transport: StreamableHTTPClientTransport }>();

  async getConnectedClient(server: McpServerRecord): Promise<Client> {
    const existing = this.activeClients.get(server.id);
    if (existing) {
      return existing.client;
    }

    const headers: Record<string, string> = {
      Accept: "application/json, text/event-stream",
    };

    // Upstream static credential injection: tokens injected server-side and never exposed downstream (GATE-08)
    if (server.auth_token) {
      headers["Authorization"] = `Bearer ${server.auth_token}`;
    }

    const transport = new StreamableHTTPClientTransport(new URL(server.base_url), {
      requestInit: {
        headers: headers,
      },
    });

    const client = new Client({
      name: `mcpilot-gateway-to-${server.id}`,
      version: "1.0.0",
    });

    try {
      await client.connect(transport);
      this.activeClients.set(server.id, { client, transport });
      return client;
    } catch (err: any) {
      this.activeClients.delete(server.id);
      throw new Error(`Failed to connect to upstream '${server.id}' at ${server.base_url}: ${err.message || String(err)}`);
    }
  }

  async closeClient(serverId: string): Promise<void> {
    const existing = this.activeClients.get(serverId);
    if (existing) {
      try {
        await existing.transport.close();
      } catch {}
      this.activeClients.delete(serverId);
    }
  }

  /**
   * Ping upstream server's /healthz or test connection with diagnostic classification (OBS-01, OBS-03)
   */
  async pingServer(server: McpServerRecord): Promise<boolean> {
    const url = new URL(server.base_url);
    const healthUrl = `${url.protocol}//${url.host}/healthz`;

    try {
      const res = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });

      const isHealthy = res.ok;
      recordUpstreamStatus(server.id, server.name, isHealthy);

      if (isHealthy) {
        await updateServerStatus(server.id, "Connected", null);
      } else {
        const diag = classifyFailure(new Error(`HTTP ${res.status}`), {
          serverId: server.id,
          url: healthUrl,
        });
        await updateServerStatus(server.id, "Unreachable", diag.summary);
      }

      return isHealthy;
    } catch (err: any) {
      const diag = classifyFailure(err, { serverId: server.id, url: healthUrl });
      recordUpstreamStatus(server.id, server.name, false);
      await updateServerStatus(server.id, "Unreachable", diag.summary);
      await this.closeClient(server.id);
      return false;
    }
  }

  /**
   * Fetch tools from a specific upstream with timeout protection
   */
  async fetchToolsForServer(server: McpServerRecord): Promise<UpstreamTool[]> {
    try {
      const client = await this.getConnectedClient(server);

      // Enforce 4-second timeout on tool listing
      const result: any = await Promise.race([
        client.listTools(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout fetching tools from upstream '${server.id}'`)), 4000)
        ),
      ]);

      await updateServerStatus(server.id, "Connected");
      recordUpstreamStatus(server.id, server.name, true);

      const toolList: any[] = Array.isArray(result?.tools) ? result.tools : [];

      return toolList.map((t) => ({
        serverId: server.id,
        originalName: t.name,
        // Deterministic collision handling and namespacing (GATE-05)
        namespacedName: `${server.id}__${t.name}`,
        description: t.description ? `[${server.name}] ${t.description}` : `[${server.name}] Tool ${t.name}`,
        inputSchema: t.inputSchema,
      }));
    } catch (err: any) {
      console.warn(`[upstream-manager] Could not fetch tools from '${server.id}':`, err.message || err);
      const diag = classifyFailure(err, { serverId: server.id, url: server.base_url });
      recordUpstreamStatus(server.id, server.name, false);
      await updateServerStatus(server.id, "Unreachable", diag.summary);
      await this.closeClient(server.id);
      return [];
    }
  }

  /**
   * Execute tool on upstream server with 5-second timeout, diagnostics, and fault isolation (GATE-06, OBS-03)
   */
  async executeTool(
    server: McpServerRecord,
    originalToolName: string,
    args: any
  ): Promise<{ content: any[]; isError?: boolean }> {
    try {
      const client = await this.getConnectedClient(server);

      const result: any = await Promise.race([
        client.callTool({
          name: originalToolName,
          arguments: args,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Upstream '${server.id}' call timed out after 10000ms`)), 10000)
        ),
      ]);

      const isError = Boolean(result?.isError);
      if (isError) {
        const errorText = Array.isArray(result?.content)
          ? result.content.map((c: any) => c.text || JSON.stringify(c)).join(" ")
          : JSON.stringify(result);
        classifyFailure(new Error(errorText), {
          serverId: server.id,
          url: server.base_url,
          toolName: originalToolName,
        });
      }

      return {
        content: Array.isArray(result?.content) ? result.content : [{ type: "text", text: JSON.stringify(result) }],
        isError,
      };
    } catch (err: any) {
      console.error(`[upstream-manager] Error calling tool '${originalToolName}' on '${server.id}':`, err.message || err);
      const diag = classifyFailure(err, {
        serverId: server.id,
        url: server.base_url,
        toolName: originalToolName,
      });

      recordUpstreamStatus(server.id, server.name, false);
      await updateServerStatus(server.id, "Unreachable", diag.summary);
      await this.closeClient(server.id);

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Upstream error [${diag.code}] on '${server.id}': ${err.message || String(err)}\nRemediation: ${diag.remediation}`,
          },
        ],
      };
    }
  }
}

