import { Router, Request, Response } from "express";
import { ToolAggregator } from "./tool-aggregator.js";
import { logToolInvocation } from "./audit.js";
import { requireAuth } from "./auth.js";

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
 * Resolves local endpoint addressing so containers can reach the Windows host.
 */
async function resolveEndpointUrl(provider: string, baseUrl?: string): Promise<string> {
  let url = (baseUrl || "").trim();

  if (provider === "ollama") {
    if (!url) {
      url = "http://localhost:11434";
    }
    // If localhost or 127.0.0.1, check if accessible directly or via host.docker.internal
    if (url.includes("localhost") || url.includes("127.0.0.1")) {
      try {
        const testRes = await fetch(`${url.replace(/\/+$/, "")}/api/tags`, {
          signal: AbortSignal.timeout(800),
        });
        if (testRes.ok) return url.replace(/\/+$/, "");
      } catch {
        // Fallback to Docker host alias
        const dockerHostUrl = url
          .replace("localhost", "host.docker.internal")
          .replace("127.0.0.1", "host.docker.internal")
          .replace(/\/+$/, "");
        try {
          const testRes = await fetch(`${dockerHostUrl}/api/tags`, {
            signal: AbortSignal.timeout(1500),
          });
          if (testRes.ok) return dockerHostUrl;
        } catch {
          // If still failing, return dockerHostUrl anyway as it is standard in k3d
          return dockerHostUrl;
        }
      }
    }
    return url.replace(/\/+$/, "");
  }

  if (provider === "openai") {
    return (url || "https://api.openai.com/v1").replace(/\/+$/, "");
  }

  if (provider === "openrouter") {
    return (url || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  }

  // Custom provider
  return (url || "http://localhost:11434").replace(/\/+$/, "");
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
    const resolvedUrl = await resolveEndpointUrl(provider, rawBaseUrl);

    if (provider === "ollama") {
      const targetUrl = `${resolvedUrl}/api/tags`;
      const res = await fetch(targetUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        throw new Error(`Ollama returned status ${res.status} from ${targetUrl}`);
      }
      const data: any = await res.json();
      const models = Array.isArray(data?.models)
        ? data.models.map((m: any) => m.name || m.model).filter(Boolean)
        : [];
      return { models, resolvedBaseUrl: resolvedUrl };
    }

    // OpenAI / OpenRouter / Custom /models endpoint
    const cleanBase = resolvedUrl.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, "");
    const targetUrl = cleanBase.endsWith("/models") ? cleanBase : `${cleanBase}/models`;

    const headers: Record<string, string> = {};
    if (apiKey) {
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

    const resolvedBase = await resolveEndpointUrl(provider, baseUrl);

    // Compute completions URL
    let completionsUrl: string;
    if (provider === "ollama") {
      // Ollama OpenAI-compatible chat endpoint is at /v1/chat/completions
      completionsUrl = resolvedBase.endsWith("/v1")
        ? `${resolvedBase}/chat/completions`
        : `${resolvedBase}/v1/chat/completions`;
    } else {
      const cleanBase = resolvedBase.replace(/\/+$/, "");
      completionsUrl = cleanBase.endsWith("/chat/completions")
        ? cleanBase
        : `${cleanBase}/chat/completions`;
    }

    const tools = await this.toolAggregator.getAllNamespacedTools();
    const formattedTools = tools.map((t) => ({
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
        `You are MCPilot, an autonomous AI gateway assistant managing connected MCP servers and WooCommerce tools.\n` +
        `Current user: ${caller.username} (Role: ${caller.role}).\n` +
        `Always invoke relevant federated tools to query live data, product details, or operational metrics before responding to user queries.\n` +
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

    // Step 1: Request initial response or tool calls
    let res1: globalThis.Response;
    try {
      res1 = await fetch(completionsUrl, {
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

    if (!res1.ok) {
      const errorText = await res1.text().catch(() => "");
      throw new Error(`LLM API returned HTTP ${res1.status}: ${errorText.slice(0, 200)}`);
    }

    const data1: any = await res1.json();
    const choice1 = data1.choices?.[0];
    const assistantMessage = choice1?.message;

    if (!assistantMessage) {
      throw new Error("LLM returned an empty response. Verify model configuration.");
    }

    // Check if the assistant requested tool calls
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      conversation.push(assistantMessage);

      for (const tc of assistantMessage.tool_calls) {
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
          name: toolName,
          content: resultContent,
        });
      }

      // Step 2: Final response from LLM incorporating tool results
      let res2: globalThis.Response;
      try {
        res2 = await fetch(completionsUrl, {
          method: "POST",
          headers: requestHeaders,
          body: JSON.stringify({
            model: model.trim(),
            messages: conversation,
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(60000),
        });
      } catch (err: any) {
        throw new Error(`Failed to get final LLM completion after tool execution: ${err.message}`);
      }

      if (!res2.ok) {
        const errorText = await res2.text().catch(() => "");
        throw new Error(`LLM final response returned HTTP ${res2.status}: ${errorText.slice(0, 200)}`);
      }

      const data2: any = await res2.json();
      const choice2 = data2.choices?.[0];

      return {
        role: "assistant",
        content: choice2?.message?.content || "Executed tools successfully.",
        toolCallsExecuted: executedTools,
      };
    }

    return {
      role: "assistant",
      content: assistantMessage.content || "Ready.",
      toolCallsExecuted: [],
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
      const result = await this.toolAggregator.dispatchCall(toolName, args);
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
