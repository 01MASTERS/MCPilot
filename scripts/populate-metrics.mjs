/**
 * Script to generate diverse live tool calls across all upstream servers
 * to populate Prometheus metrics, latency quantiles (p50, p95), and audit trails.
 */

const BASE_URL = process.env.GATEWAY_URL || "http://gateway.local.test:8080";

async function main() {
  console.log(`Connecting to ${BASE_URL} as admin...`);
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${await loginRes.text()}`);
  }

  const { token } = await loginRes.json();
  console.log("Logged in. Initializing MCP Streamable HTTP session...");

  // Initialize MCP session
  const initRes = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "metrics-populator", version: "1.0.0" },
      },
    }),
  });

  const sessionId = initRes.headers.get("mcp-session-id");
  console.log(`MCP Session initialized (Session ID: ${sessionId || "stateless"}).`);

  // Send initialized notification
  if (sessionId) {
    await fetch(`${BASE_URL}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    });
  }

  const toolCalls = [
    // 1. Operational Time calls
    { name: "time__get_current_time", args: { timezone: "America/New_York" } },
    { name: "time__calculate_delivery_window", args: { orderDate: "2026-10-23", handlingDays: 1, shippingDays: 3 } },
    { name: "time__check_business_hours", args: { dayOfWeek: "Friday", timeString: "14:30" } },
    { name: "time__get_current_time", args: { timezone: "UTC" } },
    { name: "time__calculate_delivery_window", args: { orderDate: "2026-10-24", handlingDays: 2, shippingDays: 4 } },

    // 2. Store Analytics calls
    { name: "analytics__get_store_metrics", args: { period: "month" } },
    { name: "analytics__get_revenue_summary", args: { startDate: "2026-10-01", endDate: "2026-10-23" } },
    { name: "analytics__get_inventory_status", args: { lowStockThreshold: 10 } },
    { name: "analytics__get_store_metrics", args: { period: "week" } },
    { name: "analytics__get_revenue_summary", args: { startDate: "2026-09-01", endDate: "2026-10-01" } },

    // 3. WooCommerce Catalog calls
    { name: "woocommerce__list_products", args: { per_page: 5 } },
    { name: "woocommerce__list_orders", args: { status: "any" } },
    { name: "woocommerce__create_product", args: { name: `Live Telemetry Demo Item #${Date.now().toString().slice(-4)}`, regular_price: "49.99" } },
    { name: "woocommerce__list_products", args: { per_page: 10 } },

    // 4. Mock Upstream Servers calls
    { name: "mock-stripe-payments__get_store_metrics", args: { period: "month" } },
    { name: "mock-stripe-payments__get_revenue_summary", args: { startDate: "2026-10-01", endDate: "2026-10-23" } },
    { name: "mock-fedex-logistics__get_current_time", args: { timezone: "Europe/London" } },
    { name: "mock-fedex-logistics__calculate_delivery_window", args: { orderDate: "2026-10-23", handlingDays: 1, shippingDays: 2 } },

    // 5. Multi-Store isolated call
    { name: "store_gadget-express__list_products", args: { per_page: 5 } },
  ];

  console.log(`\nExecuting ${toolCalls.length} federated tool calls across upstreams...`);

  let callId = 10;
  for (const tc of toolCalls) {
    callId++;
    const start = Date.now();
    try {
      const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": `Bearer ${token}`,
      };
      if (sessionId) headers["mcp-session-id"] = sessionId;

      const res = await fetch(`${BASE_URL}/mcp`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: callId,
          method: "tools/call",
          params: {
            name: tc.name,
            arguments: tc.args,
          },
        }),
      });

      const elapsed = Date.now() - start;
      const json = await res.json().catch(() => null);
      const isErr = json?.error || json?.result?.isError;
      const statusIcon = isErr ? "✗" : "✓";
      console.log(`  ${statusIcon} [${elapsed}ms] ${tc.name}`);
    } catch (err) {
      console.log(`  ✗ [FAIL] ${tc.name}: ${err.message}`);
    }
  }

  console.log("\nFetching updated metrics summary from /api/metrics/summary...");
  const summaryRes = await fetch(`${BASE_URL}/api/metrics/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const summary = await summaryRes.json();
  console.log("\n=== Real-time Metrics Summary ===");
  console.log(`Total Requests: ${summary.overview?.totalRequests}`);
  console.log(`Success Rate: ${summary.overview?.successRate}%`);
  console.log(`Average Latency: ${summary.overview?.avgLatencyMs}ms`);
  console.log(`p50 Latency: ${summary.overview?.p50LatencyMs}ms`);
  console.log(`p95 Latency: ${summary.overview?.p95LatencyMs}ms`);
  console.log("Upstream Servers Monitored:", summary.servers?.map((s) => `${s.name}: ${s.totalCalls} calls (${s.status})`));
}

main().catch(console.error);
