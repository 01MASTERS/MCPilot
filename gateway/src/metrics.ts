import client from "prom-client";
import { Pool } from "mysql2/promise";

// Dedicated Prometheus Registry (OBS-01)
export const register = new client.Registry();

// Standard Node.js & Process Metrics with prefix
client.collectDefaultMetrics({
  register,
  prefix: "mcpilot_",
});

// Tool Call Metrics
export const mcpToolCallsTotal = new client.Counter({
  name: "mcp_tool_calls_total",
  help: "Total number of MCP tool invocations routed through the gateway",
  labelNames: ["server_id", "tool_name", "status"] as const,
  registers: [register],
});

export const mcpToolCallErrorsTotal = new client.Counter({
  name: "mcp_tool_call_errors_total",
  help: "Total number of failed MCP tool invocations categorized by error type",
  labelNames: ["server_id", "tool_name", "error_category"] as const,
  registers: [register],
});

export const mcpToolCallDuration = new client.Histogram({
  name: "mcp_tool_call_duration_seconds",
  help: "Latency distribution of MCP tool calls in seconds",
  labelNames: ["server_id", "tool_name"] as const,
  buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// Upstream Health Metrics
export const mcpUpstreamStatus = new client.Gauge({
  name: "mcp_upstream_status",
  help: "Health status of upstream MCP server (1 = Connected, 0 = Unreachable)",
  labelNames: ["server_id", "server_name"] as const,
  registers: [register],
});

export const mcpActiveUpstreamsCount = new client.Gauge({
  name: "mcp_active_upstreams_count",
  help: "Current count of healthy/connected upstream MCP servers",
  registers: [register],
});

export const mcpRegisteredUpstreamsTotal = new client.Gauge({
  name: "mcp_registered_upstreams_total",
  help: "Total count of registered upstream MCP servers",
  registers: [register],
});

// -----------------------------------------------------------------------------
// In-Memory Rolling Window & Quantile Calculator (OBS-02)
// -----------------------------------------------------------------------------

interface LatencySample {
  durationMs: number;
  isError: boolean;
  timestamp: number;
}

const MAX_SAMPLES_PER_SERVER = 500;
const serverSamples = new Map<string, LatencySample[]>();
const serverNames = new Map<string, string>();
const serverStatuses = new Map<string, "Connected" | "Unreachable">();
const serverLastInvocation = new Map<string, string>();

/**
 * Calculate percentile from an array of numbers
 */
function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];

  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.max(0, Math.min(rank, sorted.length - 1));
  return sorted[index];
}

/**
 * Record a tool execution into both Prometheus metrics and in-memory rolling window
 */
export function recordToolCall(
  serverId: string,
  toolName: string,
  durationMs: number,
  isError: boolean,
  errorCategory: string = "INTERNAL"
): void {
  const statusStr = isError ? "error" : "success";

  // 1. Prometheus Metrics
  mcpToolCallsTotal.inc({ server_id: serverId, tool_name: toolName, status: statusStr });
  mcpToolCallDuration.observe({ server_id: serverId, tool_name: toolName }, durationMs / 1000);

  if (isError) {
    mcpToolCallErrorsTotal.inc({
      server_id: serverId,
      tool_name: toolName,
      error_category: errorCategory,
    });
  }

  // 2. In-Memory Rolling Window
  let samples = serverSamples.get(serverId);
  if (!samples) {
    samples = [];
    serverSamples.set(serverId, samples);
  }

  samples.push({
    durationMs,
    isError,
    timestamp: Date.now(),
  });

  if (samples.length > MAX_SAMPLES_PER_SERVER) {
    samples.shift();
  }

  serverLastInvocation.set(serverId, new Date().toISOString());
}

/**
 * Update upstream server status in Prometheus metrics
 */
export function recordUpstreamStatus(
  serverId: string,
  serverName: string,
  isConnected: boolean
): void {
  serverNames.set(serverId, serverName);
  serverStatuses.set(serverId, isConnected ? "Connected" : "Unreachable");

  mcpUpstreamStatus.set({ server_id: serverId, server_name: serverName }, isConnected ? 1 : 0);

  // Recalculate totals
  let connectedCount = 0;
  for (const status of serverStatuses.values()) {
    if (status === "Connected") connectedCount++;
  }
  mcpActiveUpstreamsCount.set(connectedCount);
  mcpRegisteredUpstreamsTotal.set(serverStatuses.size);
}

/**
 * Compute aggregated real-time metrics summary for Dashboard API
 */
export function getMetricsSummary(knownServers?: { id: string; name: string; status: string }[]) {
  const now = new Date().toISOString();
  let totalInvocations = 0;
  let totalErrors = 0;
  const allDurations: number[] = [];

  // Register known servers if passed
  if (knownServers) {
    for (const s of knownServers) {
      if (!serverNames.has(s.id)) serverNames.set(s.id, s.name);
      if (!serverStatuses.has(s.id)) serverStatuses.set(s.id, s.status as any);
    }
  }

  const serverMetricsList: any[] = [];
  const allServerIds = new Set([
    ...Array.from(serverNames.keys()),
    ...Array.from(serverSamples.keys()),
  ]);

  for (const serverId of allServerIds) {
    const name = serverNames.get(serverId) || serverId;
    const status = serverStatuses.get(serverId) || "Connected";
    const samples = serverSamples.get(serverId) || [];

    const serverCalls = samples.length;
    const serverErrors = samples.filter((s) => s.isError).length;
    const serverSuccess = serverCalls - serverErrors;
    const errorRateNum = serverCalls > 0 ? (serverErrors / serverCalls) * 100 : 0;
    const errorRateStr = `${errorRateNum.toFixed(1)}%`;

    totalInvocations += serverCalls;
    totalErrors += serverErrors;

    const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
    allDurations.push(...durations);

    const min = durations.length > 0 ? durations[0] : 0;
    const max = durations.length > 0 ? durations[durations.length - 1] : 0;
    const avg =
      durations.length > 0
        ? Math.round((durations.reduce((acc, d) => acc + d, 0) / durations.length) * 10) / 10
        : 0;

    const p50 = calculatePercentile(durations, 50);
    const p90 = calculatePercentile(durations, 90);
    const p95 = calculatePercentile(durations, 95);
    const p99 = calculatePercentile(durations, 99);

    serverMetricsList.push({
      id: serverId,
      name,
      status,
      totalCalls: serverCalls,
      successfulCalls: serverSuccess,
      errorCalls: serverErrors,
      errorRate: errorRateStr,
      errorRateNum,
      latency: {
        min,
        max,
        avg,
        p50,
        p90,
        p95,
        p99,
      },
      lastInvocation: serverLastInvocation.get(serverId) || null,
    });
  }

  // Sort all durations for global percentiles
  allDurations.sort((a, b) => a - b);
  const globalAvg =
    allDurations.length > 0
      ? Math.round((allDurations.reduce((acc, d) => acc + d, 0) / allDurations.length) * 10) / 10
      : 0;
  const globalP95 = calculatePercentile(allDurations, 95);
  const globalErrorRate =
    totalInvocations > 0 ? ((totalErrors / totalInvocations) * 100).toFixed(1) + "%" : "0.0%";

  let connectedCount = 0;
  for (const s of serverStatuses.values()) {
    if (s === "Connected") connectedCount++;
  }

  return {
    timestamp: now,
    overview: {
      totalInvocations,
      successfulInvocations: totalInvocations - totalErrors,
      failedInvocations: totalErrors,
      overallErrorRate: globalErrorRate,
      avgLatencyMs: globalAvg,
      p95LatencyMs: globalP95,
      connectedUpstreams: connectedCount,
      totalUpstreams: serverStatuses.size,
      uptimeSeconds: Math.floor(process.uptime()),
    },
    servers: serverMetricsList,
  };
}

/**
 * Hydrate in-memory metrics on Gateway boot from MariaDB audit_logs (last 24h)
 */
export async function hydrateMetricsFromDb(pool: Pool): Promise<void> {
  try {
    const [rows] = await pool.query<any[]>(
      `SELECT server_id, duration_ms, status, created_at 
       FROM audit_logs 
       WHERE created_at >= NOW() - INTERVAL 24 HOUR AND server_id IS NOT NULL 
       ORDER BY created_at ASC 
       LIMIT 2000`
    );

    for (const r of rows) {
      const serverId = r.server_id;
      if (!serverId) continue;

      let samples = serverSamples.get(serverId);
      if (!samples) {
        samples = [];
        serverSamples.set(serverId, samples);
      }

      samples.push({
        durationMs: Number(r.duration_ms) || 0,
        isError: r.status === "error",
        timestamp: new Date(r.created_at).getTime(),
      });

      if (samples.length > MAX_SAMPLES_PER_SERVER) {
        samples.shift();
      }
    }

    console.log(`[mcpilot-metrics] Hydrated metrics with ${rows.length} historical audit entries.`);
  } catch (err: any) {
    console.warn(`[mcpilot-metrics] Warning hydrating metrics from DB:`, err.message);
  }
}
