import { Router, Request, Response } from "express";
import { ToolAggregator } from "./tool-aggregator.js";
import { logToolInvocation } from "./audit.js";
import { requireAuth } from "./auth.js";
import { GATEWAY_META_TOOLS } from "./server.js";
import { searchTools, getToolInfo, formatSearchResultsForLlm } from "./tool-search.js";
import { canAccessTool, filterToolsForCaller, splitNamespacedTool } from "./permissions.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export interface ToolExecutionRecord {
  toolName: string;
  durationMs: number;
  status: "success" | "error";
  args: any;
  result: any;
}

export interface LlmConfig {
  provider: "ollama" | "openai" | "openrouter" | "custom";
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

/**
 * Cleans an Ollama base URL by removing subpaths (/v1, /chat/completions, /models, /api/tags).
 */
function cleanOllamaBaseUrl(rawUrl?: string): string {
  let url = (rawUrl || "").trim().replace(/\/+$/, "");
  url = url
    .replace(/\/v1\/chat\/completions\/?$/, "")
    .replace(/\/chat\/completions\/?$/, "")
    .replace(/\/v1\/models\/?$/, "")
    .replace(/\/models\/?$/, "")
    .replace(/\/api\/tags\/?$/, "")
    .replace(/\/v1\/?$/, "")
    .replace(/\/+$/, "");
  return url || "http://localhost:11434";
}

/**
 * Resolves local endpoint addressing so containers can reach the Windows host.
 */
async function resolveEndpointUrl(provider: string, baseUrl?: string, apiKey?: string): Promise<string> {
  let url = (baseUrl || "").trim();

  if (provider === "ollama") {
    const rootUrl = cleanOllamaBaseUrl(url);

    // If localhost or 127.0.0.1, check if accessible directly or via host.docker.internal
    if (rootUrl.includes("localhost") || rootUrl.includes("127.0.0.1")) {
      const headers: Record<string, string> = {};
      if (apiKey?.trim()) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }
      try {
        const testRes = await fetch(`${rootUrl}/api/tags`, {
          headers,
          signal: AbortSignal.timeout(800),
        });
        if (testRes.ok || testRes.status === 401 || testRes.status === 403) return rootUrl;
      } catch {
        // Fallback to Docker host alias
        const dockerHostUrl = rootUrl
          .replace("localhost", "host.docker.internal")
          .replace("127.0.0.1", "host.docker.internal");
        try {
          const testRes = await fetch(`${dockerHostUrl}/api/tags`, {
            headers,
            signal: AbortSignal.timeout(1500),
          });
          if (testRes.ok || testRes.status === 401 || testRes.status === 403) return dockerHostUrl;
        } catch {
          // If still failing, return dockerHostUrl anyway as it is standard in k3d
          return dockerHostUrl;
        }
      }
    }
    return rootUrl;
  }

  if (provider === "openai") {
    let clean = (url || "https://api.openai.com/v1").replace(/\/+$/, "");
    clean = clean.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "");
    return clean;
  }

  if (provider === "openrouter") {
    let clean = (url || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    clean = clean.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "");
    return clean;
  }

  // Custom provider
  let clean = (url || "http://localhost:11434").replace(/\/+$/, "");
  clean = clean.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "");
  if (clean.includes("localhost") || clean.includes("127.0.0.1")) {
    const headers: Record<string, string> = {};
    if (apiKey?.trim()) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }
    try {
      const testRes = await fetch(clean.endsWith("/models") ? clean : `${clean}/models`, {
        headers,
        signal: AbortSignal.timeout(800),
      });
      if (testRes.ok || testRes.status === 401 || testRes.status === 403) return clean;
    } catch {
      const dockerHostUrl = clean
        .replace("localhost", "host.docker.internal")
        .replace("127.0.0.1", "host.docker.internal");
      return dockerHostUrl;
    }
  }
  return clean;
}

export class ChatAgentRunner {
  constructor(private toolAggregator: ToolAggregator) {}

  /**
   * Fetches available models from Ollama or OpenAI-compatible provider
   */
  async fetchModels(
    provider: "ollama" | "openai" | "openrouter" | "custom",
    rawBaseUrl?: string,
    apiKey?: string
  ): Promise<{ models: string[]; resolvedBaseUrl: string }> {
    const resolvedUrl = await resolveEndpointUrl(provider, rawBaseUrl, apiKey);

    if (provider === "ollama") {
      const headers: Record<string, string> = {};
      if (apiKey?.trim()) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      } else {
        headers["Authorization"] = "Bearer ollama";
      }

      // First try native Ollama /api/tags
      try {
        const targetUrl = `${resolvedUrl}/api/tags`;
        const res = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}));
          const models = Array.isArray(data?.models)
            ? data.models.map((m: any) => m.name || m.model).filter(Boolean)
            : [];
          return { models, resolvedBaseUrl: resolvedUrl };
        }
      } catch {
        // Fall through to /v1/models attempt
      }

      // Fallback: try OpenAI-compatible /v1/models (supported by Ollama and proxies)
      try {
        const targetUrl = `${resolvedUrl}/v1/models`;
        const res = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}));
          const models = Array.isArray(data?.data)
            ? data.data.map((m: any) => m.id).filter(Boolean)
            : [];
          return { models, resolvedBaseUrl: resolvedUrl };
        }
      } catch {
        // Fall through
      }

      throw new Error(`Failed to reach Ollama at ${resolvedUrl} (tried /api/tags and /v1/models). Ensure Ollama is running and accessible.`);
    }

    // OpenAI / OpenRouter / Custom /models endpoint
    const cleanBase = resolvedUrl.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "");
    const targetUrl = cleanBase.endsWith("/models") ? cleanBase : `${cleanBase}/models`;

    const headers: Record<string, string> = {};
    if (apiKey?.trim()) {
      headers["Authorization"] = `Bearer ${apiKey.trim()}`;
    }
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "http://localhost:8000";
      headers["X-Title"] = "MCPilot Gateway";
    }

    const res = await fetch(targetUrl, {
      headers,
      signal: AbortSignal.timeout(7000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Provider returned status ${res.status}: ${errText.slice(0, 150)}`);
    }

    const data: any = await res.json();
    const models = Array.isArray(data?.data)
      ? data.data.map((m: any) => m.id).filter(Boolean)
      : [];

    return { models, resolvedBaseUrl: cleanBase };
  }

  /**
   * Real LLM Chat Loop (Strictly zero mock LLM)
   */
  async runChat(
    messages: ChatMessage[],
    caller: { userId: string; username: string; role: string },
    config: LlmConfig
  ): Promise<{
    role: "assistant";
    content: string;
    toolCallsExecuted: ToolExecutionRecord[];
  }> {
    const { provider = "ollama", model, baseUrl, apiKey } = config;

    if (!model || !model.trim()) {
      throw new Error("No model selected. Please select or auto-fetch a model from the topbar.");
    }

    const resolvedBase = await resolveEndpointUrl(provider, baseUrl, apiKey);

    // Compute completions URL cleanly without duplicate /v1 or /chat/completions
    let completionsUrl: string;
    const cleanBase = resolvedBase.replace(/\/+$/, "");
    if (cleanBase.endsWith("/chat/completions")) {
      completionsUrl = cleanBase;
    } else if (cleanBase.endsWith("/v1")) {
      completionsUrl = `${cleanBase}/chat/completions`;
    } else {
      completionsUrl = `${cleanBase}/v1/chat/completions`;
    }

    const allTools = await this.toolAggregator.getAllNamespacedTools();
    // Strictly filter tools based on caller's RBAC role and active policies (UI-06, PERM-01)
    const authorizedTools = filterToolsForCaller(allTools, caller as any);
    const formattedTools = [...authorizedTools, ...GATEWAY_META_TOOLS].map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description || `Tool ${t.name}`,
        parameters: t.inputSchema || { type: "object", properties: {} },
      },
    }));

    const systemPrompt: ChatMessage = {
      role: "system",
      content:
        `You are MCPilot, an autonomous AI gateway assistant managing connected MCP servers and multi-store WooCommerce environments.\n` +
        `Current user: ${caller.username} (Role: ${caller.role}).\n` +
        (caller.role === "member"
          ? `ROLE CONSTRAINT: You are operating under role 'member'. You only have permission to execute read-only queries (e.g. list products, list orders, revenue summaries, store metrics). You are strictly prohibited from mutating data (such as creating products, updating order statuses, or modifying store data). If the user asks to modify or create resources, politely explain that role 'member' does not have permission to execute mutating actions.\n`
          : `ROLE PRIVILEGE: You are operating under role 'admin' with full administrative authority to execute both read and mutating operations across all connected servers.\n`) +
        `Available tools include:\n` +
        `- Core WooCommerce tools ('woocommerce__list_products', 'woocommerce__create_product', 'woocommerce__list_orders', 'woocommerce__get_order', 'woocommerce__update_order_status')\n` +
        `- Analytics tools ('analytics__get_revenue_summary', 'analytics__get_store_metrics', 'analytics__get_inventory_status')\n` +
        `- System & Time tools ('time__get_current_time')\n` +
        `- Dynamically provisioned store environments ('store_<slug>__*')\n` +
        `- Discovery meta-tools ('gateway__search_tools', 'gateway__get_tool_info', 'gateway__execute_tool')\n\n` +
        `CRITICAL TOOL CALLING INSTRUCTIONS:\n` +
        `1. DIRECT INVOCATION: When the user asks to list products, create products, list orders, or check revenue, ALWAYS DIRECTLY CALL the corresponding tool ('woocommerce__list_products', 'analytics__get_revenue_summary', etc.) from your tool list. NEVER call 'gateway__search_tools' when the exact tool is already present in your tool catalog.\n` +
        `2. MULTI-STORE COMPARISON: When asked to compare orders, products, or metrics across stores, execute the corresponding tools for each store (e.g. 'woocommerce__list_orders' and 'store_<slug>__*') and provide a structured side-by-side comparative summary.\n` +
        `3. PROGRESSIVE DISCOVERY: Only call 'gateway__search_tools' if you do not know which tool can handle the user's request. If you search and find a matching tool, you MUST immediately call that tool to fulfill the user's request.\n` +
        `Provide concise, professional responses in markdown format.`,
    };

    const conversation: any[] = [systemPrompt, ...messages];
    const executedTools: ToolExecutionRecord[] = [];

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey && apiKey.trim()) {
      requestHeaders["Authorization"] = `Bearer ${apiKey.trim()}`;
    } else if (provider === "ollama") {
      requestHeaders["Authorization"] = "Bearer ollama";
    }

    if (provider === "openrouter") {
      requestHeaders["HTTP-Referer"] = "http://localhost:8000";
      requestHeaders["X-Title"] = "MCPilot Gateway";
    }

    // Autonomous multi-turn agentic loop (supports follow-up tool calls, e.g. search -> execute tool)
    let iterations = 0;
    const maxIterations = 4;
    let finalContent = "";

    while (iterations < maxIterations) {
      iterations++;

      let res: globalThis.Response;
      try {
        res = await fetch(completionsUrl, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify({
            model: model.trim(),
            messages: conversation,
            tools: formattedTools.length > 0 ? formattedTools : undefined,
            tool_choice: formattedTools.length > 0 ? "auto" : undefined,
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(60000),
        });
      } catch (err: any) {
        throw new Error(
          `Failed to reach LLM at ${completionsUrl} (${err.message}). Verify your endpoint is online and accessible.`
        );
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`LLM API returned HTTP ${res.status}: ${errorText.slice(0, 200)}`);
      }

      const data: any = await res.json();
      const choice = data.choices?.[0];
      const assistantMessage = choice?.message;

      if (!assistantMessage) {
        throw new Error("LLM returned an empty response. Verify model configuration.");
      }

      // Check if the assistant requested tool calls
      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        conversation.push(assistantMessage);

        // Execute tool calls concurrently in parallel (reduces latency when LLM invokes multiple tools)
        const executionPromises = assistantMessage.tool_calls.map(async (tc: any) => {
          const toolName = tc.function.name;
          let toolArgs: any = {};
          try {
            toolArgs =
              typeof tc.function.arguments === "string"
                ? JSON.parse(tc.function.arguments || "{}")
                : tc.function.arguments || {};
          } catch {
            toolArgs = {};
          }

          const execRecord = await this.executeAndLogTool(toolName, toolArgs, caller);
          return { tc, execRecord };
        });

        const executedResults = await Promise.all(executionPromises);

        for (const { tc, execRecord } of executedResults) {
          executedTools.push(execRecord);

          // Tool result message back to LLM
          let resultContent = "";
          try {
            resultContent = JSON.stringify(execRecord.result);
          } catch {
            resultContent = String(execRecord.result);
          }

          conversation.push({
            role: "tool",
            tool_call_id: tc.id,
            name: tc.function.name,
            content: resultContent,
          });
        }

        // Loop continues: LLM evaluates tool results and can call the actual target tool or write final response
        continue;
      }

      // No more tool calls: final response generated
      finalContent = assistantMessage.content || "Executed tools successfully.";
      break;
    }

    return {
      role: "assistant",
      content: finalContent || "Executed tools successfully.",
      toolCallsExecuted: executedTools,
    };
  }

  /**
   * Executes a tool and records audit trace in MariaDB
   */
  private async executeAndLogTool(
    toolName: string,
    args: any,
    caller: { userId: string; username: string; role: string }
  ): Promise<ToolExecutionRecord> {
    const startTime = Date.now();
    const separatorIdx = toolName.indexOf("__");
    const serverId = separatorIdx !== -1 ? toolName.slice(0, separatorIdx) : null;

    try {
      let result: any;
      if (toolName === "gateway__search_tools") {
        const allTools = await this.toolAggregator.getAllNamespacedTools().catch(() => []);
        const results = searchTools(allTools, args?.query || "", {
          serverId: args?.serverId,
          limit: args?.limit || 10,
          user: caller as any,
        });
        result = { content: [{ type: "text", text: formatSearchResultsForLlm(results) }] };
      } else if (toolName === "gateway__get_tool_info") {
        const allTools = await this.toolAggregator.getAllNamespacedTools().catch(() => []);
        const info = getToolInfo(allTools, args?.toolName || "", caller as any);
        result = info
          ? { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] }
          : { content: [{ type: "text", text: `Tool '${args?.toolName}' not found.` }], isError: true };
      } else if (toolName === "gateway__execute_tool") {
        const targetTool = String(args?.toolName || "");
        const targetArgs = (args?.arguments as Record<string, any>) || {};
        return this.executeAndLogTool(targetTool, targetArgs, caller);
      } else {
        // Enforce strict RBAC permission checks on all direct tool executions (UI-06, PERM-03)
        const { serverId: targetServerId, rawToolName } = splitNamespacedTool(toolName);
        const allowed = canAccessTool(caller as any, targetServerId, rawToolName);
        if (!allowed) {
          const errorMsg = `Forbidden: User '${caller.username}' with role '${caller.role}' is not authorized to execute tool '${toolName}'.`;
          result = {
            isError: true,
            content: [{ type: "text", text: errorMsg }],
          };
        } else {
          result = await this.toolAggregator.dispatchCall(toolName, args);
        }
      }
      const durationMs = Date.now() - startTime;
      const isError = Boolean(result?.isError);

      await logToolInvocation({
        userId: caller.userId,
        username: caller.username,
        apiKeyId: null,
        serverId,
        toolName,
        args,
        status: isError ? "error" : "success",
        durationMs,
        errorMessage: isError ? JSON.stringify(result.content) : null,
      });

      return {
        toolName,
        durationMs,
        status: isError ? "error" : "success",
        args,
        result,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      await logToolInvocation({
        userId: caller.userId,
        username: caller.username,
        apiKeyId: null,
        serverId,
        toolName,
        args,
        status: "error",
        durationMs,
        errorMessage: err.message || String(err),
      });

      return {
        toolName,
        durationMs,
        status: "error",
        args,
        result: { isError: true, content: [{ type: "text", text: err.message }] },
      };
    }
  }
}

export function createChatRouter(toolAggregator: ToolAggregator): Router {
  const router = Router();
  const runner = new ChatAgentRunner(toolAggregator);

  // POST /api/chat/models - Auto-fetch models from Ollama, OpenAI, or OpenRouter
  router.post("/models", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { provider = "ollama", baseUrl, apiKey } = req.body;
      const result = await runner.fetchModels(provider, baseUrl, apiKey);
      res.status(200).json(result);
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error fetching models:", err.message);
      res.status(502).json({ error: err.message || "Failed to auto-fetch models from provider" });
    }
  });

  // POST /api/chat - Authenticated chat invocation with real LLM and tool calling
  router.post("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const { messages, provider, model, baseUrl, apiKey } = req.body;
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: "Messages array is required" });
        return;
      }

      const caller = {
        userId: req.user!.userId,
        username: req.user!.username,
        role: req.user!.role,
      };

      const result = await runner.runChat(messages, caller, {
        provider: provider || "ollama",
        model: model || "",
        baseUrl,
        apiKey,
      });

      res.status(200).json(result);
    } catch (err: any) {
      console.error("[mcpilot-gateway] Error in chat endpoint:", err.message);
      res.status(500).json({ error: err.message || "Chat processing failed" });
    }
  });

  return router;
}
