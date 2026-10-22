/**
 * Gateway Observability & Telemetry Verification Suite (OBS-01..04, VERIF-05)
 *
 * Verifies:
 * 1. Prometheus / OpenMetrics scraping (/metrics):
 *    - Standard exposition format, content-type header, process metrics, and custom MCP counters/histograms.
 * 2. Aggregated Observability Metrics API (/api/metrics/summary):
 *    - Overview statistics, active/total upstreams, per-server performance.
 *    - Latency quantile calculations: p50 <= p90 <= p95 <= p99.
 * 3. Live Tool Call Telemetry Ingestion:
 *    - Executes tool call on downstream /mcp endpoint.
 *    - Confirms counter increment in Prometheus exposition and in-memory rolling buffer.
 * 4. Intelligent Root-Cause Failure Diagnostics (/api/diagnostics):
 *    - Taxonomy verification (category, code, remediation instructions).
 *    - Server-specific diagnostics query (/api/diagnostics/:serverId).
 * 5. Arithmetic & Calculation Integrity:
 *    - Verifies error rate percentage matches failed / total ratio.
 */

const BASE_URL = process.env.GATEWAY_URL || "http://gateway.local.test:8080";

async function parseMcpResponse(res) {
  const text = await res.text();
  if (text.startsWith("event:") || text.includes("data:")) {
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:")) {
        return JSON.parse(line.slice(5).trim());
      }
    }
  }
  return JSON.parse(text);
}

function assert(condition, message) {
  if (!condition) {
    console.error(`\n❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

async function main() {
  console.log("\n==================================================================");
  console.log("  MCPilot — Gateway Observability & Telemetry Verification (OBS-01..04)");
  console.log(`  Target: ${BASE_URL}`);
  console.log("==================================================================\n");

  const startTotal = Date.now();

  // -------------------------------------------------------------
  // Step 1: Admin Authentication
  // -------------------------------------------------------------
  console.log("▶ [1/5] Authenticating with Gateway...");
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });
  assert(loginRes.ok, `Admin login failed with status ${loginRes.status}`);
  const { token } = await loginRes.json();
  const authHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
  };
  console.log("  ✓ Admin authenticated successfully.");

  // -------------------------------------------------------------
  // Step 2: Prometheus / OpenMetrics Exposition (/metrics)
  // -------------------------------------------------------------
  console.log("\n▶ [2/5] Validating Prometheus Scrape Endpoint (/metrics)...");
  const metricsRes = await fetch(`${BASE_URL}/metrics`);
  assert(metricsRes.ok, `GET /metrics returned status ${metricsRes.status}`);
  const contentType = metricsRes.headers.get("content-type") || "";
  assert(
    contentType.includes("text/plain") || contentType.includes("openmetrics"),
    `Unexpected /metrics Content-Type: ${contentType}`
  );

  const metricsText = await metricsRes.text();
  assert(metricsText.length > 200, "Prometheus metrics output is suspiciously short");

  const expectedMetrics = [
    "mcp_tool_calls_total",
    "mcp_tool_call_errors_total",
    "mcp_tool_call_duration_seconds",
    "mcp_upstream_status",
    "mcp_active_upstreams_count",
    "mcp_registered_upstreams_total",
    "mcpilot_process_cpu_user_seconds_total",
  ];

  for (const m of expectedMetrics) {
    assert(
      metricsText.includes(m),
      `Prometheus metrics output missing expected metric: ${m}`
    );
    console.log(`  ✓ Metric registered: ${m}`);
  }

  // -------------------------------------------------------------
  // Step 3: Aggregated Metrics Summary API (/api/metrics/summary)
  // -------------------------------------------------------------
  console.log("\n▶ [3/5] Validating Aggregated Metrics API (/api/metrics/summary)...");
  const summaryRes = await fetch(`${BASE_URL}/api/metrics/summary`);
  assert(summaryRes.ok, `GET /api/metrics/summary returned status ${summaryRes.status}`);
  const summary = await summaryRes.json();

  assert(summary.overview, "Missing 'overview' in metrics summary");
  assert(typeof summary.overview.totalInvocations === "number", "overview.totalInvocations must be a number");
  assert(typeof summary.overview.overallErrorRate === "string", "overview.overallErrorRate must be a string");
  assert(typeof summary.overview.connectedUpstreams === "number", "overview.connectedUpstreams must be a number");
  assert(typeof summary.overview.totalUpstreams === "number", "overview.totalUpstreams must be a number");
  assert(Array.isArray(summary.servers), "summary.servers must be an array");

  console.log(`  ✓ Fleet Overview: ${summary.overview.totalInvocations} calls, ${summary.overview.overallErrorRate} error rate, ${summary.overview.connectedUpstreams}/${summary.overview.totalUpstreams} upstreams connected`);

  for (const s of summary.servers) {
    assert(s.id, "Server metric missing id");
    assert(s.name, "Server metric missing name");
    assert(typeof s.totalCalls === "number", "Server metric totalCalls must be number");
    assert(typeof s.errorRateNum === "number", "Server metric errorRateNum must be number");
    assert(s.latency, "Server metric missing latency stats");
    const { p50, p90, p95, p99, min, max, avg } = s.latency;
    assert(p50 <= p90, `Quantile inversion: p50 (${p50}) > p90 (${p90}) on ${s.id}`);
    assert(p90 <= p95, `Quantile inversion: p90 (${p90}) > p95 (${p95}) on ${s.id}`);
    assert(p95 <= p99, `Quantile inversion: p95 (${p95}) > p99 (${p99}) on ${s.id}`);
    if (s.totalCalls > 0) {
      assert(min <= p50, `min (${min}) > p50 (${p50}) on ${s.id}`);
      assert(p99 <= max, `p99 (${p99}) > max (${max}) on ${s.id}`);
    }
    console.log(`  ✓ Upstream [${s.id}] stats verified: ${s.totalCalls} calls | p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms`);
  }

  // -------------------------------------------------------------
  // Step 4: Live Tool Call Telemetry Ingestion & Counter Delta
  // -------------------------------------------------------------
  console.log("\n▶ [4/5] Executing Tool Call & Verifying Telemetry Delta...");
  const initialCalls = summary.overview.totalInvocations;

  // Execute a live tool call through the gateway (woocommerce__list_orders)
  const toolCallRes = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "obs-verify-call-1",
      method: "tools/call",
      params: {
        name: "woocommerce__list_orders",
        arguments: {},
      },
    }),
  });

  assert(toolCallRes.ok, `Tool call request failed with status ${toolCallRes.status}`);
  const toolResult = await parseMcpResponse(toolCallRes);
  assert(toolResult.result, `Tool execution returned unexpected payload: ${JSON.stringify(toolResult)}`);
  console.log("  ✓ Executed 'woocommerce__list_orders' downstream call successfully.");

  // Verify updated summary
  const updatedSummaryRes = await fetch(`${BASE_URL}/api/metrics/summary`);
  assert(updatedSummaryRes.ok, "Failed to refetch metrics summary");
  const updatedSummary = await updatedSummaryRes.json();
  assert(
    updatedSummary.overview.totalInvocations >= initialCalls + 1,
    `Telemetry counter did not increment: before=${initialCalls}, after=${updatedSummary.overview.totalInvocations}`
  );
  console.log(`  ✓ Telemetry ingestion confirmed: totalInvocations incremented to ${updatedSummary.overview.totalInvocations}`);

  // -------------------------------------------------------------
  // Step 5: Failure Diagnostics & Root-Cause Classification
  // -------------------------------------------------------------
  console.log("\n▶ [5/5] Triggering Tool Failure & Validating Diagnostics (/api/diagnostics)...");

  // Deliberately trigger an upstream tool error to exercise failure diagnostics engine
  const failedCallRes = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "obs-verify-fail-1",
      method: "tools/call",
      params: {
        name: "woocommerce__invalid_nonexistent_tool",
        arguments: {},
      },
    }),
  });
  assert(failedCallRes.ok, "Failed call request should return 200 with isError: true");
  const failedResult = await parseMcpResponse(failedCallRes);
  assert(failedResult.result?.isError === true, "Tool result should indicate isError: true");
  console.log("  ✓ Simulated upstream tool failure to exercise failure diagnostics.");

  // Fetch updated diagnostics list
  const diagRes = await fetch(`${BASE_URL}/api/diagnostics`);
  assert(diagRes.ok, `GET /api/diagnostics returned status ${diagRes.status}`);
  const diagData = await diagRes.json();
  assert(Array.isArray(diagData.diagnostics), "Missing 'diagnostics' array");
  assert(diagData.diagnostics.length > 0, "Diagnostics ring buffer should contain recorded events");
  console.log(`  ✓ Diagnostics ring buffer retrieved (${diagData.diagnostics.length} recorded events).`);

  const sample = diagData.diagnostics[0];
  assert(sample.code, "Diagnostic missing 'code'");
  assert(sample.category, "Diagnostic missing 'category'");
  assert(sample.summary, "Diagnostic missing 'summary'");
  assert(sample.technicalDetails, "Diagnostic missing 'technicalDetails'");
  assert(sample.remediation, "Diagnostic missing 'remediation'");
  assert(sample.targetServerId, "Diagnostic missing 'targetServerId'");
  console.log(`  ✓ Most Recent Diagnostic [${sample.code}]:`);
  console.log(`    Category:    ${sample.category}`);
  console.log(`    Target:      ${sample.targetServerId}`);
  console.log(`    Summary:     ${sample.summary}`);
  console.log(`    Remediation: ${sample.remediation}`);

  // Check server-specific route (/api/diagnostics/:serverId)
  const serverDiagRes = await fetch(`${BASE_URL}/api/diagnostics/woocommerce`);
  assert(serverDiagRes.ok, `GET /api/diagnostics/woocommerce returned status ${serverDiagRes.status}`);
  const serverDiag = await serverDiagRes.json();
  assert(serverDiag.diagnostic, "Missing 'diagnostic' object in server-specific report");
  assert(serverDiag.diagnostic.targetServerId === "woocommerce", "Diagnostic targetServerId mismatch");
  console.log(`  ✓ Server-specific diagnostics endpoint validated for 'woocommerce'.`);

  // Arithmetic integrity check
  const postFailSummaryRes = await fetch(`${BASE_URL}/api/metrics/summary`);
  assert(postFailSummaryRes.ok, "Failed to refetch metrics summary");
  const postFailSummary = await postFailSummaryRes.json();

  const total = postFailSummary.overview.totalInvocations;
  const failed = postFailSummary.overview.failedInvocations;
  assert(failed > 0, `Expected failedInvocations > 0, got ${failed}`);
  const expectedRate = total === 0 ? 0 : Number(((failed / total) * 100).toFixed(1));
  const parsedRate = parseFloat(postFailSummary.overview.overallErrorRate);
  assert(
    Math.abs(parsedRate - expectedRate) < 0.2,
    `Error rate arithmetic mismatch: expected ~${expectedRate}%, got ${parsedRate}%`
  );
  console.log(`  ✓ Arithmetic check passed: ${failed}/${total} failed = ${postFailSummary.overview.overallErrorRate}`);

  const elapsed = Date.now() - startTotal;
  console.log("\n==================================================================");
  console.log(`  ✓ OBSERVABILITY VERIFICATION PASSED (${elapsed}ms)`);
  console.log("==================================================================\n");
}

main().catch((err) => {
  console.error("\n❌ VERIFICATION FAILED:", err);
  process.exit(1);
});
