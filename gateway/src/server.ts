import express, { Request, Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  isInitializeRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initDatabase, getAllServers } from "./db.js";
import { UpstreamClientManager } from "./upstream-manager.js";
import { ToolAggregator } from "./tool-aggregator.js";
import { HealthMonitor } from "./health-monitor.js";
import { createAuthRouter, createUsersRouter } from "./auth.js";
import { createApiKeysRouter, mcpAuthMiddleware } from "./api-keys.js";
import { createServersRouter } from "./servers-api.js";
import { createAuditRouter, logToolInvocation } from "./audit.js";
import { createChatRouter } from "./chat-agent.js";
import { createStoresRouter } from "./stores-api.js";
import { register, recordToolCall, getMetricsSummary, hydrateMetricsFromDb } from "./metrics.js";
import { getDiagnostics, getLatestDiagnosticForServer, classifyFailure } from "./failure-diagnostics.js";
import { getDbPool } from "./db.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CallerContext {
  userId?: string | null;
  username?: string | null;
  apiKeyId?: string | null;
}

export function createGatewayServer(
  toolAggregator: ToolAggregator,
  caller?: CallerContext
): Server {
  const server = new Server(
    {
      name: "mcpilot-gateway",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    }
  );

  // Dynamic tool aggregation handler (GATE-04, GATE-05)
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = await toolAggregator.getAllNamespacedTools();
    return { tools };
  });

  // Dynamic namespaced tool call routing handler (GATE-01, GATE-02, GATE-06) + Granular Audit Logging (AUTH-05) + Metrics (OBS-01)
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const startTime = Date.now();
    const toolName = request.params.name;
    const args = request.params.arguments;
    const separatorIdx = toolName.indexOf("__");
    const serverId = separatorIdx !== -1 ? toolName.slice(0, separatorIdx) : "gateway";

    try {
      const result = await toolAggregator.dispatchCall(toolName, args);
      const durationMs = Date.now() - startTime;
      const isError = Boolean(result.isError);

      recordToolCall(serverId, toolName, durationMs, isError, isError ? "TOOL_ERROR" : "NONE");

      logToolInvocation({
        userId: caller?.userId,
        username: caller?.username,
        apiKeyId: caller?.apiKeyId,
        serverId,
        toolName,
        args,
        status: isError ? "error" : "success",
        durationMs,
        errorMessage: isError ? JSON.stringify(result.content) : null,
      }).catch((err) => console.error("[mcpilot-gateway] Audit log write failed:", err));

      return result;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const diag = classifyFailure(err, { serverId, toolName });
      recordToolCall(serverId, toolName, durationMs, true, diag.category);

      logToolInvocation({
        userId: caller?.userId,
        username: caller?.username,
        apiKeyId: caller?.apiKeyId,
        serverId,
        toolName,
        args,
        status: "error",
        durationMs,
        errorMessage: err.message || String(err),
      }).catch((auditErr) => console.error("[mcpilot-gateway] Audit log error write failed:", auditErr));
      throw err;
    }
  });

  return server;
}

export function startGatewayApp(
  toolAggregator: ToolAggregator,
  upstreamManager: UpstreamClientManager,
  port: number = 8000
) {
  const app = express();

  app.use(express.json());

  // Static files for Dashboard SPA when present in public/
  const publicDir = path.resolve(__dirname, "../public");
  app.use(express.static(publicDir));

  // REST APIs for Dashboard & Authentication
  app.use("/api/auth", createAuthRouter());
  app.use("/api/users", createUsersRouter());
  app.use("/api/keys", createApiKeysRouter());
  app.use("/api/servers", createServersRouter(upstreamManager, toolAggregator));
  app.use("/api/audit", createAuditRouter());
  app.use("/api/chat", createChatRouter(toolAggregator));
  app.use("/api/stores", createStoresRouter(toolAggregator));

  // Health check endpoint displaying Gateway status and upstream server states (GATE-07)
  app.get("/healthz", async (_req: Request, res: Response) => {
    try {
      const servers = await getAllServers();
      const connectedCount = servers.filter((s) => s.status === "Connected").length;
      const totalCount = servers.length;

      res.status(200).json({
        status: "ok",
        service: "mcpilot-gateway",
        timestamp: new Date().toISOString(),
        upstreams: {
          total: totalCount,
          connected: connectedCount,
          servers: servers.map((s) => ({
            id: s.id,
            name: s.name,
            status: s.status,
            enabled: s.enabled,
            last_check: s.last_health_check,
            error: s.error_message,
          })),
        },
      });
    } catch (err: any) {
      res.status(500).json({
        status: "error",
        error: err.message || String(err),
      });
    }
  });

  // Prometheus Scrape Endpoint (OBS-01)
  app.get("/metrics", async (_req: Request, res: Response) => {
    try {
      res.setHeader("Content-Type", register.contentType);
      res.send(await register.metrics());
    } catch (err: any) {
      res.status(500).send(err.message || String(err));
    }
  });

  // Aggregated Observability Metrics API (OBS-02)
  app.get("/api/metrics/summary", async (_req: Request, res: Response) => {
    try {
      const servers = await getAllServers();
      const summary = getMetricsSummary(
        servers.map((s) => ({ id: s.id, name: s.name, status: s.status }))
      );
      res.status(200).json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // Failure Diagnostics History & Inspection (OBS-03)
  app.get("/api/diagnostics", (req: Request, res: Response) => {
    const serverId = req.query.serverId ? String(req.query.serverId) : undefined;
    const category = req.query.category as any;
    const reports = getDiagnostics({ serverId, category });
    res.status(200).json({ diagnostics: reports });
  });

  app.get("/api/diagnostics/:serverId", (req: Request, res: Response) => {
    const serverId = String(req.params.serverId);
    const report = getLatestDiagnosticForServer(serverId);
    if (!report) {
      res.status(404).json({ error: `No recent diagnostic reports for server '${serverId}'` });
      return;
    }
    res.status(200).json({ diagnostic: report });
  });

  // Session store for stateful Streamable HTTP clients
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

  // Single downstream Streamable HTTP endpoint on /mcp (GATE-01) with Authentication (AUTH-01, AUTH-02, AUTH-03)
  app.post("/mcp", mcpAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const caller: CallerContext = {
        userId: req.user?.userId,
        username: req.user?.username,
        apiKeyId: req.apiKey?.id,
      };

      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSid) => {
            sessions.set(newSid, { transport });
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && sessions.has(sid)) {
            sessions.delete(sid);
          }
        };

        const server = createGatewayServer(toolAggregator, caller);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (sessionId && !sessions.has(sessionId)) {
        res.status(404).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Session not found or expired" },
          id: null,
        });
        return;
      }

      // Stateless single-shot fallback
      const statelessTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      const server = createGatewayServer(toolAggregator, caller);
      await server.connect(statelessTransport);
      await statelessTransport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error in Gateway /mcp handler:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error in Gateway MCP transport" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", mcpAuthMiddleware, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
      return;
    }
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
  });

  // SPA fallback for HTML5 client-side navigation
  app.get("*", (req: Request, res: Response, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/mcp") || req.path.startsWith("/healthz")) {
      return next();
    }
    res.sendFile(path.join(publicDir, "index.html"), (err) => {
      if (err) {
        // If public/index.html doesn't exist yet, return a simple JSON status
        res.status(200).json({
          message: "MCPilot Gateway is operational. Dashboard UI is deploying.",
          version: "1.0.0",
        });
      }
    });
  });

  const httpServer = app.listen(port, () => {
    console.log(`[mcpilot-gateway] Listening on http://0.0.0.0:${port}`);
    console.log(`[mcpilot-gateway] Streamable HTTP endpoint: http://0.0.0.0:${port}/mcp`);
    console.log(`[mcpilot-gateway] Health endpoint: http://0.0.0.0:${port}/healthz`);
  });

  return { app, httpServer, sessions };
}

async function main() {
  const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("server.js") || 
                 process.argv[1]?.replace(/\\/g, "/").endsWith("server.ts");

  if (!isMain) return;

  try {
    console.log("[mcpilot-gateway] Connecting to MariaDB and initializing tables...");
    await initDatabase();
    await hydrateMetricsFromDb(getDbPool());

    const upstreamManager = new UpstreamClientManager();
    const toolAggregator = new ToolAggregator(upstreamManager);
    const healthMonitor = new HealthMonitor(upstreamManager);

    healthMonitor.start();

    const port = parseInt(process.env.PORT || "8000", 10);
    startGatewayApp(toolAggregator, upstreamManager, port);
  } catch (err: any) {
    console.error("[mcpilot-gateway] Fatal error during startup:", err);
    process.exit(1);
  }
}

main().catch(console.error);
