import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";

import { registerAnalyticsTools } from "./tools.js";

dotenv.config();

export function createAnalyticsMcpServer(): McpServer {
  const server = new McpServer({
    name: "mcpilot-analytics-mcp",
    version: "1.0.0",
  });

  const config = {
    wordpressUrl: process.env.WORDPRESS_URL || "http://mcpilot-wordpress:80",
    consumerKey: process.env.WC_CONSUMER_KEY || "",
    consumerSecret: process.env.WC_CONSUMER_SECRET || "",
  };

  registerAnalyticsTools(server, config);

  return server;
}

export function startHttpServer(serverFactory: () => McpServer, port: number = 3001) {
  const app = express();

  app.use(express.json());

  // Health check endpoint for Kubernetes probes and Gateway health monitor
  app.get("/healthz", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok", service: "mcpilot-analytics-mcp", timestamp: new Date().toISOString() });
  });

  const sessions = new Map<string, { transport: StreamableHTTPServerTransport }>();

  app.post("/mcp", async (req: Request, res: Response) => {
    try {
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

        const server = serverFactory();
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

      const server = serverFactory();
      await server.connect(statelessTransport);
      await statelessTransport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error in /mcp handler:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error in MCP transport" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      await session.transport.handleRequest(req, res);
      return;
    }
    res.status(405).set("Allow", "POST").send("Method Not Allowed");
  });

  const httpServer = app.listen(port, () => {
    console.log(`[mcpilot-analytics-mcp] Listening on http://0.0.0.0:${port}`);
    console.log(`[mcpilot-analytics-mcp] Streamable HTTP endpoint: http://0.0.0.0:${port}/mcp`);
    console.log(`[mcpilot-analytics-mcp] Health endpoint: http://0.0.0.0:${port}/healthz`);
  });

  return { app, httpServer, sessions };
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("server.js") || 
               process.argv[1]?.replace(/\\/g, "/").endsWith("server.ts");

if (isMain) {
  const port = parseInt(process.env.PORT || "3001", 10);
  startHttpServer(() => createAnalyticsMcpServer(), port);
}
