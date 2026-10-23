/**
 * MCPilot Comprehensive Per-Role Tool Calling Verification Matrix
 * 
 * Tests tool execution across:
 * - Role: admin (Full access to all read & mutating tools across servers)
 * - Role: member (Access to read tools; strictly forbidden from mutating tools)
 * - Unauthenticated (401 Unauthorized)
 */

const BASE_URL = process.env.GATEWAY_URL || "http://gateway.local.test:8080";

async function login(username, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${username}: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function callTool(token, toolName, args = {}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  const text = await res.text();
  let json;
  if (text.startsWith("event:") || text.includes("data:")) {
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("data:")) {
        json = JSON.parse(line.slice(5).trim());
        break;
      }
    }
  } else {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  return { status: res.status, body: json };
}

async function main() {
  console.log("\n==================================================================");
  console.log("   MCPilot — Per-Role Tool Calling Comprehensive Verification");
  console.log(`   Gateway Target: ${BASE_URL}`);
  console.log("==================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(name, condition, details = "") {
    totalTests++;
    if (condition) {
      console.log(`   ✓ [PASS] ${name}`);
      passedTests++;
    } else {
      console.error(`   ✗ [FAIL] ${name} — ${details}`);
    }
  }

  // 1. Authenticate users
  console.log("▶ [1/4] Authenticating test personas...");
  const adminAuth = await login("admin", "admin123");
  console.log(`   • Admin authenticated: ${adminAuth.user.username} (${adminAuth.user.role})`);
  const memberAuth = await login("alex", "alex123");
  console.log(`   • Member authenticated: ${memberAuth.user.username} (${memberAuth.user.role})`);

  // 2. Test Admin Access (All tools allowed)
  console.log("\n▶ [2/4] Verifying ADMIN role tool executions (Full Access)...");

  // Analytics: get_revenue_summary (the primary issue reported)
  const adminRevenue = await callTool(adminAuth.token, "analytics__get_revenue_summary", {});
  const revContent = adminRevenue.body?.result?.content?.[0]?.text || "";
  assert(
    "Admin: analytics__get_revenue_summary succeeds without 401",
    adminRevenue.status === 200 && !adminRevenue.body?.result?.isError && revContent.includes("recognized_revenue"),
    `Status: ${adminRevenue.status}, Body: ${JSON.stringify(adminRevenue.body)}`
  );

  // Analytics: get_store_metrics
  const adminMetrics = await callTool(adminAuth.token, "analytics__get_store_metrics", {});
  const metContent = adminMetrics.body?.result?.content?.[0]?.text || "";
  assert(
    "Admin: analytics__get_store_metrics succeeds",
    adminMetrics.status === 200 && !adminMetrics.body?.result?.isError && metContent.includes("total_orders"),
    `Body: ${JSON.stringify(adminMetrics.body)}`
  );

  // Analytics: get_inventory_status
  const adminInventory = await callTool(adminAuth.token, "analytics__get_inventory_status", {});
  const invContent = adminInventory.body?.result?.content?.[0]?.text || "";
  assert(
    "Admin: analytics__get_inventory_status succeeds",
    adminInventory.status === 200 && !adminInventory.body?.result?.isError && invContent.includes("total_catalog_items"),
    `Body: ${JSON.stringify(adminInventory.body)}`
  );

  // Time: get_current_time
  const adminTime = await callTool(adminAuth.token, "time__get_current_time", {});
  assert(
    "Admin: time__get_current_time succeeds",
    adminTime.status === 200 && !adminTime.body?.result?.isError,
    `Body: ${JSON.stringify(adminTime.body)}`
  );

  // WooCommerce: list_products
  const adminProducts = await callTool(adminAuth.token, "woocommerce__list_products", { per_page: 5 });
  assert(
    "Admin: woocommerce__list_products succeeds",
    adminProducts.status === 200 && !adminProducts.body?.result?.isError,
    `Body: ${JSON.stringify(adminProducts.body)}`
  );

  // WooCommerce: create_product (Mutating tool - Admin allowed)
  const uniqueName = `Admin Audit Product ${Date.now().toString(36)}`;
  const adminCreate = await callTool(adminAuth.token, "woocommerce__create_product", {
    name: uniqueName,
    regular_price: "49.99",
    description: "Audit test product created by admin",
  });
  assert(
    "Admin: woocommerce__create_product succeeds (Mutating allowed)",
    adminCreate.status === 200 && !adminCreate.body?.result?.isError,
    `Body: ${JSON.stringify(adminCreate.body)}`
  );

  // Provisioned Store Teardown Cleanliness (BONUS-04): Verify deleted store tools are cleanly inaccessible
  const adminStoreProd = await callTool(adminAuth.token, "store_gadget-express__list_products", {});
  assert(
    "Admin: deleted store tools cleanly rejected (not registered/unavailable)",
    adminStoreProd.body?.result?.isError === true,
    `Body: ${JSON.stringify(adminStoreProd.body)}`
  );

  // 3. Test Member Access (RBAC: Read allowed, Mutating forbidden)
  console.log("\n▶ [3/4] Verifying MEMBER role tool executions (Read Allowed, Mutating Forbidden)...");

  // Analytics: get_revenue_summary (Read tool - Member allowed)
  const memberRevenue = await callTool(memberAuth.token, "analytics__get_revenue_summary", {});
  assert(
    "Member: analytics__get_revenue_summary succeeds (Read tool allowed)",
    memberRevenue.status === 200 && !memberRevenue.body?.result?.isError,
    `Body: ${JSON.stringify(memberRevenue.body)}`
  );

  // Time: get_current_time (Read tool - Member allowed)
  const memberTime = await callTool(memberAuth.token, "time__get_current_time", {});
  assert(
    "Member: time__get_current_time succeeds (Read tool allowed)",
    memberTime.status === 200 && !memberTime.body?.result?.isError,
    `Body: ${JSON.stringify(memberTime.body)}`
  );

  // WooCommerce: list_products (Read tool - Member allowed)
  const memberProducts = await callTool(memberAuth.token, "woocommerce__list_products", { per_page: 3 });
  assert(
    "Member: woocommerce__list_products succeeds (Read tool allowed)",
    memberProducts.status === 200 && !memberProducts.body?.result?.isError,
    `Body: ${JSON.stringify(memberProducts.body)}`
  );

  // Provisioned Store Teardown Cleanliness for Member:
  const memberStoreProd = await callTool(memberAuth.token, "store_gadget-express__list_products", {});
  assert(
    "Member: deleted store tools cleanly rejected (not registered/unavailable)",
    memberStoreProd.body?.result?.isError === true,
    `Body: ${JSON.stringify(memberStoreProd.body)}`
  );

  // WooCommerce: create_product (Mutating tool - Member strictly FORBIDDEN)
  const memberCreate = await callTool(memberAuth.token, "woocommerce__create_product", {
    name: "Unauthorized Member Product",
    regular_price: "99.99",
  });
  const memberCreateText = memberCreate.body?.result?.content?.[0]?.text || "";
  assert(
    "Member: woocommerce__create_product strictly FORBIDDEN (RBAC Enforced)",
    memberCreate.body?.result?.isError === true && memberCreateText.includes("is not authorized"),
    `Expected authorization denial, got: ${JSON.stringify(memberCreate.body)}`
  );

  // WooCommerce: update_order_status (Mutating tool - Member strictly FORBIDDEN)
  const memberUpdateOrder = await callTool(memberAuth.token, "woocommerce__update_order_status", {
    order_id: 1,
    status: "completed",
  });
  const memberUpdateText = memberUpdateOrder.body?.result?.content?.[0]?.text || "";
  assert(
    "Member: woocommerce__update_order_status strictly FORBIDDEN (RBAC Enforced)",
    memberUpdateOrder.body?.result?.isError === true && memberUpdateText.includes("is not authorized"),
    `Expected authorization denial, got: ${JSON.stringify(memberUpdateOrder.body)}`
  );

  // Provisioned Store: store_gadget-express__create_product (Mutating tool - Member strictly FORBIDDEN)
  const memberStoreCreate = await callTool(memberAuth.token, "store_gadget-express__create_product", {
    name: "Unauthorized Store Product",
    regular_price: "99.99",
  });
  const memberStoreCreateText = memberStoreCreate.body?.result?.content?.[0]?.text || "";
  assert(
    "Member: store_gadget-express__create_product strictly FORBIDDEN (RBAC Enforced)",
    memberStoreCreate.body?.result?.isError === true && memberStoreCreateText.includes("is not authorized"),
    `Expected authorization denial, got: ${JSON.stringify(memberStoreCreate.body)}`
  );

  // 4. Test Unauthenticated Access
  console.log("\n▶ [4/4] Verifying UNAUTHENTICATED access rejection...");
  const unauthCall = await callTool(null, "time__get_current_time", {});
  assert(
    "Unauthenticated: tools/call strictly rejected with 401 Unauthorized",
    unauthCall.status === 401,
    `Status: ${unauthCall.status}`
  );

  // Summary
  console.log("\n==================================================================");
  console.log(`   Verification Summary: ${passedTests}/${totalTests} tests PASSED`);
  console.log("==================================================================\n");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error during role verification:", err);
  process.exit(1);
});
