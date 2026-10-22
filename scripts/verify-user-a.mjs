/**
 * User A End-to-End Verification Flow (VERIF-01, STORE-03, UI-06)
 * 
 * Verifies:
 * 1. Admin login on Gateway (/api/auth/login).
 * 2. Store orders retrieval via woocommerce__list_orders.
 * 3. Product creation via woocommerce__create_product.
 * 4. Audit trail attribution confirming User A identity and execution timing.
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

async function main() {
  console.log("\n=======================================================");
  console.log("  MCPilot — User A End-to-End Verification (VERIF-01)");
  console.log(`  Target: ${BASE_URL}`);
  console.log("=======================================================\n");

  const startTotal = Date.now();

  // Step 1: User A Login
  console.log("▶ [1/4] Authenticating as User A (admin)...");
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" })
  });

  if (!loginRes.ok) {
    throw new Error(`Admin login failed: ${loginRes.status} ${await loginRes.text()}`);
  }

  const { token, user } = await loginRes.json();
  console.log(`   ✓ Logged in as ${user.username} (Role: ${user.role}, ID: ${user.id || user.userId})`);

  const authHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`
  };

  // Step 2: Query Store Orders via woocommerce__list_orders
  console.log("\n▶ [2/4] Executing tool: woocommerce__list_orders...");
  const t0 = Date.now();
  const listOrdersRes = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "verify-orders-1",
      method: "tools/call",
      params: {
        name: "woocommerce__list_orders",
        arguments: {}
      }
    })
  });

  const ordersJson = await parseMcpResponse(listOrdersRes);
  const listOrdersDuration = Date.now() - t0;

  if (ordersJson.error) {
    throw new Error(`list_orders failed: ${JSON.stringify(ordersJson.error)}`);
  }

  console.log(`   ✓ Orders retrieved in ${listOrdersDuration}ms`);
  const ordersText = ordersJson.result?.content?.[0]?.text || "[]";
  let ordersList = [];
  try {
    ordersList = JSON.parse(ordersText);
    console.log(`   ✓ Store order count: ${Array.isArray(ordersList) ? ordersList.length : 1}`);
  } catch {
    console.log(`   ✓ Orders response summary: ${ordersText.slice(0, 100)}...`);
  }

  // Step 3: Create Product via woocommerce__create_product
  const testProductName = `End-to-End Test T-Shirt ${Date.now().toString().slice(-4)}`;
  console.log(`\n▶ [3/4] Executing tool: woocommerce__create_product ('${testProductName}')...`);
  const t1 = Date.now();
  const createProdRes = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "verify-create-prod-1",
      method: "tools/call",
      params: {
        name: "woocommerce__create_product",
        arguments: {
          name: testProductName,
          regular_price: "29.99",
          description: "Created during User A automated verification loop"
        }
      }
    })
  });

  const createProdJson = await parseMcpResponse(createProdRes);
  const createProdDuration = Date.now() - t1;

  if (createProdJson.error) {
    throw new Error(`create_product failed: ${JSON.stringify(createProdJson.error)}`);
  }

  console.log(`   ✓ Product created in ${createProdDuration}ms`);
  console.log(`   ✓ Result: ${createProdJson.result?.content?.[0]?.text?.slice(0, 120)}...`);

  // Step 4: Audit Log Verification
  console.log("\n▶ [4/4] Verifying Audit Trail attribution (AUTH-05, UI-06)...");
  const auditRes = await fetch(`${BASE_URL}/api/audit?limit=10`, {
    headers: authHeaders
  });

  if (!auditRes.ok) {
    throw new Error(`Audit log fetch failed: ${auditRes.status}`);
  }

  const { logs } = await auditRes.json();
  const recentUserALogs = logs.filter(
    (l) => l.username === "admin" && (l.toolName === "woocommerce__create_product" || l.toolName === "woocommerce__list_orders")
  );

  if (recentUserALogs.length === 0) {
    throw new Error("Audit log verification failed: No matching logs found for User A tool calls");
  }

  console.log(`   ✓ Found ${recentUserALogs.length} recent audit log entries for User A:`);
  for (const log of recentUserALogs.slice(0, 2)) {
    console.log(`     • [${log.status.toUpperCase()}] ${log.toolName} by ${log.username} (${log.durationMs}ms)`);
  }

  const totalDuration = Date.now() - startTotal;
  console.log("\n=======================================================");
  console.log(`  ✓ VERIF-01 User A Flow PASSED in ${totalDuration}ms`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("\n❌ User A Verification FAILED:", err.message);
  process.exit(1);
});
