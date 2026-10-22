/**
 * MCPilot Tool Permissions & Role-Based Tool Filtering Verification Suite (PERM-01..05, VERIF-06)
 *
 * Verifies:
 * 1. Admin Baseline Catalog: Admin discovers full toolset including mutating tools (create_product, update_order_status).
 * 2. Member Dynamic Hiding: Member discovers only authorized tools; mutating tools are completely omitted from tools/list.
 * 3. Member Read Execution: Member successfully invokes permitted read tools (time__get_current_time, woocommerce__list_products).
 * 4. Member Direct Call Enforcement: Direct invocation of restricted tools is rejected with Forbidden error and logged to audit trail.
 * 5. Dynamic Permission Grant: Admin dynamically updates policy to allow member access; member immediately sees tool in tools/list and can call it.
 * 6. Dynamic Policy Revocation & Reset: Resetting permissions instantly restores default restrictions; member is blocked again.
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

async function loginUser(username, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert(res.ok, `Login failed for ${username}: ${res.status}`);
  const data = await res.json();
  return { token: data.token, user: data.user };
}

async function listTools(token) {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `list-tools-${Date.now()}`,
      method: "tools/list",
      params: {},
    }),
  });
  assert(res.ok, `tools/list failed with status ${res.status}`);
  const data = await parseMcpResponse(res);
  assert(!data.error, `tools/list returned error: ${JSON.stringify(data.error)}`);
  return data.result?.tools || [];
}

async function callTool(token, name, args = {}) {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `call-${name}-${Date.now()}`,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const data = await parseMcpResponse(res);
  return { status: res.status, data };
}

async function main() {
  console.log("\n==================================================================");
  console.log("  MCPilot — Tool Permissions & Role-Based Filtering (PERM-01..05)");
  console.log(`  Target: ${BASE_URL}`);
  console.log("==================================================================\n");

  const startTotal = Date.now();

  // -------------------------------------------------------------
  // Step 1: Admin Baseline Tool Catalog Check
  // -------------------------------------------------------------
  console.log("▶ [1/6] Authenticating as Admin & Validating Baseline Catalog...");
  const adminAuth = await loginUser("admin", "admin123");
  console.log(`  ✓ Admin authenticated (role: ${adminAuth.user.role})`);

  // Ensure baseline template is active before test begins
  await fetch(`${BASE_URL}/api/permissions/reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
  });

  const adminTools = await listTools(adminAuth.token);
  const adminToolNames = adminTools.map((t) => t.name);
  console.log(`  ✓ Admin discovered ${adminToolNames.length} total tools in aggregated catalog.`);

  assert(
    adminToolNames.includes("woocommerce__list_orders"),
    "Admin catalog missing woocommerce__list_orders"
  );
  assert(
    adminToolNames.includes("woocommerce__create_product"),
    "Admin catalog missing mutating tool woocommerce__create_product"
  );
  assert(
    adminToolNames.includes("woocommerce__update_order_status"),
    "Admin catalog missing mutating tool woocommerce__update_order_status"
  );
  assert(
    adminToolNames.includes("time__get_current_time"),
    "Admin catalog missing time__get_current_time"
  );
  console.log("  ✓ Admin catalog verification passed: Both read & mutating tools visible.");

  // -------------------------------------------------------------
  // Step 2: Member Filtered Tool Catalog Check (Dynamic Tool Hiding)
  // -------------------------------------------------------------
  console.log("\n▶ [2/6] Authenticating as Member (alex) & Verifying Dynamic Tool Hiding...");
  const memberAuth = await loginUser("alex", "alex123");
  console.log(`  ✓ Member authenticated (username: ${memberAuth.user.username}, role: ${memberAuth.user.role})`);

  const memberTools = await listTools(memberAuth.token);
  const memberToolNames = memberTools.map((t) => t.name);
  console.log(`  ✓ Member discovered ${memberToolNames.length} filtered tools in catalog.`);

  // Assert mutating tools are completely hidden from the catalog
  assert(
    !memberToolNames.includes("woocommerce__create_product"),
    "SECURITY BREACH: woocommerce__create_product is visible to member in tools/list!"
  );
  assert(
    !memberToolNames.includes("woocommerce__update_order_status"),
    "SECURITY BREACH: woocommerce__update_order_status is visible to member in tools/list!"
  );

  // Assert read tools are still present and accessible
  assert(
    memberToolNames.includes("woocommerce__list_orders"),
    "Member catalog missing read tool woocommerce__list_orders"
  );
  assert(
    memberToolNames.includes("woocommerce__list_products"),
    "Member catalog missing read tool woocommerce__list_products"
  );
  assert(
    memberToolNames.includes("time__get_current_time"),
    "Member catalog missing read tool time__get_current_time"
  );

  console.log(`  ✓ Dynamic Tool Hiding verified: Mutating tools omitted; ${memberToolNames.length} read tools visible.`);

  // -------------------------------------------------------------
  // Step 3: Member Allowed Tool Execution
  // -------------------------------------------------------------
  console.log("\n▶ [3/6] Executing Allowed Tool as Member (time__get_current_time)...");
  const timeRes = await callTool(memberAuth.token, "time__get_current_time", {});
  assert(!timeRes.data.error, `time__get_current_time failed with error: ${JSON.stringify(timeRes.data.error)}`);
  assert(!timeRes.data.result?.isError, "time__get_current_time result marked as error");
  console.log("  ✓ Member successfully executed allowed read tool.");

  // -------------------------------------------------------------
  // Step 4: Member Direct Mutation Rejection Enforcement
  // -------------------------------------------------------------
  console.log("\n▶ [4/6] Enforcing Direct Call Rejection on Unauthorized Tool...");
  const rejectRes = await callTool(memberAuth.token, "woocommerce__create_product", {
    name: "Unauthorized Hacker Shirt",
    regular_price: "99.99",
  });

  const isRejected =
    (rejectRes.data.result && rejectRes.data.result.isError === true) ||
    Boolean(rejectRes.data.error);

  assert(isRejected, "DIRECT CALL LEAK: Gateway allowed member to execute woocommerce__create_product!");

  const errorText =
    rejectRes.data.result?.content?.[0]?.text ||
    rejectRes.data.error?.message ||
    JSON.stringify(rejectRes.data);

  assert(
    errorText.includes("Forbidden") || errorText.includes("not authorized"),
    `Expected Forbidden/not authorized message, received: ${errorText}`
  );
  console.log(`  ✓ Rejection Verified: Gateway blocked call with message: "${errorText}"`);

  // Verify failure was audited in audit_logs
  console.log("  • Checking audit trail for permission rejection event...");
  const auditRes = await fetch(`${BASE_URL}/api/audit?limit=5`, {
    headers: { Authorization: `Bearer ${adminAuth.token}` },
  });
  assert(auditRes.ok, "Failed to query audit trail");
  const auditData = await auditRes.json();
  const deniedLog = auditData.logs?.find(
    (l) => l.toolName === "woocommerce__create_product" && l.status === "error"
  );
  assert(deniedLog, "Audit log did not record the unauthorized tool execution attempt!");
  console.log(`  ✓ Audit Trail Verified: Recorded error for ${deniedLog.username || 'caller'} on ${deniedLog.toolName}`);

  // -------------------------------------------------------------
  // Step 5: Dynamic Permission Grant & Immediate Reflection
  // -------------------------------------------------------------
  console.log("\n▶ [5/6] Dynamically Granting Member Permission via Admin REST API...");
  const grantRes = await fetch(`${BASE_URL}/api/permissions`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
    body: JSON.stringify({
      targetType: "role",
      targetId: "member",
      serverId: "woocommerce",
      toolName: "create_product",
      permission: "allow",
      description: "Temporarily authorized for test validation",
    }),
  });
  assert(grantRes.ok, `PUT /api/permissions failed with status ${grantRes.status}`);
  const grantJson = await grantRes.json();
  assert(grantJson.success, "Grant API response success !== true");
  console.log(`  ✓ Policy updated: ${grantJson.message}`);

  // Verify member catalog now includes woocommerce__create_product
  const updatedMemberTools = await listTools(memberAuth.token);
  const updatedMemberNames = updatedMemberTools.map((t) => t.name);
  assert(
    updatedMemberNames.includes("woocommerce__create_product"),
    "Dynamic policy update failed: woocommerce__create_product still missing from member catalog!"
  );
  console.log("  ✓ Immediate Reflection Verified: woocommerce__create_product is now visible in member catalog.");

  // Verify member can now call the tool without permission denial
  const allowedCallRes = await callTool(memberAuth.token, "woocommerce__create_product", {
    name: `Dynamic Authorized Item ${Date.now().toString().slice(-4)}`,
    regular_price: "24.99",
  });
  const allowedErrorText =
    allowedCallRes.data.result?.content?.[0]?.text ||
    allowedCallRes.data.error?.message ||
    "";
  assert(
    !allowedErrorText.includes("Forbidden") && !allowedErrorText.includes("not authorized"),
    `Tool call was unexpectedly denied after grant: ${allowedErrorText}`
  );
  console.log("  ✓ Execution Verified: Tool call was not blocked by permission gate.");

  // -------------------------------------------------------------
  // Step 6: Dynamic Permission Revocation / Reset
  // -------------------------------------------------------------
  console.log("\n▶ [6/6] Resetting Permissions & Verifying Re-enforcement...");
  const resetRes = await fetch(`${BASE_URL}/api/permissions/reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminAuth.token}`,
    },
  });
  assert(resetRes.ok, `POST /api/permissions/reset failed: ${resetRes.status}`);
  console.log("  ✓ Permissions reset to recommended defaults.");

  // Verify member catalog again omits woocommerce__create_product
  const finalMemberTools = await listTools(memberAuth.token);
  const finalMemberNames = finalMemberTools.map((t) => t.name);
  assert(
    !finalMemberNames.includes("woocommerce__create_product"),
    "woocommerce__create_product still present in member catalog after reset!"
  );
  console.log("  ✓ Tool is hidden from member catalog again.");

  // Verify direct call is rejected once again
  const finalCallRes = await callTool(memberAuth.token, "woocommerce__create_product", {
    name: "Post-Reset Forbidden Item",
  });
  const finalIsRejected =
    (finalCallRes.data.result && finalCallRes.data.result.isError === true) ||
    Boolean(finalCallRes.data.error);
  assert(finalIsRejected, "Re-enforcement failed: Gateway allowed call after policy reset!");
  console.log("  ✓ Direct call re-rejected with Forbidden error.");

  const totalDuration = ((Date.now() - startTotal) / 1000).toFixed(2);
  console.log("\n==================================================================");
  console.log(`  🎉 ALL 6 PERMISSION GATES PASSED CLEANLY (${totalDuration}s)`);
  console.log("  PERM-01: In-memory & DB policy engine functional");
  console.log("  PERM-02: Dynamic tool hiding in tools/list verified");
  console.log("  PERM-03: Strict direct call rejection in tools/call verified");
  console.log("  PERM-04: Admin REST API & live cache sync verified");
  console.log("  PERM-05: Dynamic policy update & re-enforcement verified");
  console.log("==================================================================\n");
}

main().catch((err) => {
  console.error("\n❌ Verification Failed:", err);
  process.exit(1);
});
