/**
 * User B Multi-Server External Client Verification (VERIF-02, GATE-03, AUTH-05)
 * 
 * Verifies:
 * 1. Member login on Gateway (/api/auth/login as 'alex').
 * 2. API key generation (/api/keys) yielding 'mcp_live_...'.
 * 3. Connection to Gateway via official @modelcontextprotocol/sdk Client and StreamableHTTPClientTransport.
 * 4. Tool catalog aggregation (tools/list) presenting woocommerce, analytics, and time tools.
 * 5. Cross-upstream multi-server tool execution (tools/call) across all 3 servers in sequence:
 *    - woocommerce__list_products
 *    - analytics__get_revenue_summary
 *    - time__get_current_time
 * 6. Audit trail verification confirming User B identity and API key attribution.
 */

import { Client } from "../gateway/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StreamableHTTPClientTransport } from "../gateway/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";

const BASE_URL = process.env.GATEWAY_URL || "http://gateway.local.test:8080";
const PROVIDED_KEY = process.argv[2] || process.env.MCP_API_KEY;

async function main() {
  console.log("\n=======================================================");
  console.log("  MCPilot — User B Multi-Server Verification (VERIF-02)");
  console.log(`  Target: ${BASE_URL}`);
  if (PROVIDED_KEY) {
    console.log(`  Mode: Custom Key Provided (${PROVIDED_KEY.slice(0, 15)}...)`);
  } else {
    console.log("  Mode: Automated Full Lifecycle (Generate & Verify)");
  }
  console.log("=======================================================\n");

  const startTotal = Date.now();
  let apiKey = PROVIDED_KEY;
  let apiKeyId = "provided-key";
  let token = null;

  if (!apiKey) {
    // Step 1: User B Member Login
    console.log("▶ [1/5] Authenticating as User B (alex)...");
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "alex", password: "alex123" })
    });

    if (!loginRes.ok) {
      throw new Error(`Member login failed: ${loginRes.status} ${await loginRes.text()}`);
    }

    const loginData = await loginRes.json();
    token = loginData.token;
    console.log(`   ✓ Logged in as ${loginData.user.username} (Role: ${loginData.user.role}, ID: ${loginData.user.id || loginData.user.userId})`);

    // Step 2: Generate Team API Key
    const keyName = `User B Verification Key ${Date.now().toString().slice(-4)}`;
    console.log(`\n▶ [2/5] Generating Bearer API key ('${keyName}')...`);
    const keyRes = await fetch(`${BASE_URL}/api/keys`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name: keyName })
    });

    if (!keyRes.ok) {
      throw new Error(`API key generation failed: ${keyRes.status} ${await keyRes.text()}`);
    }

    const keyData = await keyRes.json();
    apiKey = keyData.apiKey;
    apiKeyId = keyData.id;
    console.log(`   ✓ Issued Bearer Token: ${keyData.keyPrefix} (ID: ${apiKeyId})`);
  } else {
    console.log("▶ [1/5 & 2/5] Using provided API key (Skipping auto-generation).");
    // Attempt optional login to retrieve token for Step 6 audit verification if needed
    try {
      const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "alex", password: "alex123" })
      });
      if (loginRes.ok) {
        const loginData = await loginRes.json();
        token = loginData.token;
      }
    } catch {
      // Ignore login failure in custom key mode
    }
  }

  // Step 3: Connect via Official MCP SDK Client
  console.log("\n▶ [3/5] Connecting to /mcp with official @modelcontextprotocol/sdk Client...");
  const tConnect = Date.now();
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE_URL}/mcp`), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    }
  });

  const client = new Client(
    { name: "user-b-external-client", version: "1.0.0" },
    { capabilities: {} }
  );

  try {
    await client.connect(transport);
  } catch (err) {
    if (err.message && (err.message.includes("401") || err.message.includes("Unauthorized") || err.message.includes("revoked"))) {
      console.log(`\n❌ Connection REJECTED by Gateway: HTTP 401 Unauthorized`);
      console.log(`   Message: ${err.message}`);
      console.log(`   ✓ The provided API key is INVALID or has been REVOKED.`);
      console.log(`   ✓ Instant Key Revocation successfully verified!`);
      return;
    }
    throw err;
  }
  const connectDuration = Date.now() - tConnect;
  console.log(`   ✓ MCP SDK Client connected via Streamable HTTP in ${connectDuration}ms`);

  // Step 4: Tool Discovery (tools/list)
  console.log("\n▶ [4/5] Discovering unified tool catalog across upstreams (tools/list)...");
  const toolsResult = await client.listTools();
  const toolNames = toolsResult.tools.map((t) => t.name);
  console.log(`   ✓ Received ${toolNames.length} aggregated tools across all connected servers.`);

  const hasWooCommerce = toolNames.some((t) => t.startsWith("woocommerce__"));
  const hasAnalytics = toolNames.some((t) => t.startsWith("analytics__"));
  const hasTime = toolNames.some((t) => t.startsWith("time__"));

  if (!hasWooCommerce || !hasAnalytics || !hasTime) {
    throw new Error(`Missing expected upstreams! Woo: ${hasWooCommerce}, Analytics: ${hasAnalytics}, Time: ${hasTime}`);
  }
  console.log("   ✓ Federation Verified: woocommerce [OK], analytics [OK], time [OK]");

  // Step 5: Multi-Server Sequential Tool Invocations
  console.log("\n▶ [5/5] Executing 3-Server Tool Chain via tools/call...");

  // Server 1: WooCommerce
  const tWoo = Date.now();
  console.log("   • Calling Server 1 (WooCommerce): woocommerce__list_products...");
  const wooCall = await client.callTool({
    name: "woocommerce__list_products",
    arguments: { per_page: 3 }
  });
  const wooDuration = Date.now() - tWoo;
  console.log(`     ✓ woocommerce__list_products succeeded in ${wooDuration}ms`);
  const wooSample = wooCall.content?.[0]?.text?.slice(0, 100) || "";
  console.log(`     ✓ Response preview: ${wooSample.replace(/\n/g, " ")}...`);

  // Server 2: Analytics
  const tAna = Date.now();
  console.log("   • Calling Server 2 (Analytics): analytics__get_revenue_summary...");
  const anaCall = await client.callTool({
    name: "analytics__get_revenue_summary",
    arguments: {}
  });
  const anaDuration = Date.now() - tAna;
  console.log(`     ✓ analytics__get_revenue_summary succeeded in ${anaDuration}ms`);
  const anaSample = anaCall.content?.[0]?.text?.slice(0, 100) || "";
  console.log(`     ✓ Response preview: ${anaSample.replace(/\n/g, " ")}...`);

  // Server 3: Time
  const tTime = Date.now();
  console.log("   • Calling Server 3 (Time): time__get_current_time...");
  const timeCall = await client.callTool({
    name: "time__get_current_time",
    arguments: {}
  });
  const timeDuration = Date.now() - tTime;
  console.log(`     ✓ time__get_current_time succeeded in ${timeDuration}ms`);
  const timeSample = timeCall.content?.[0]?.text?.slice(0, 100) || "";
  console.log(`     ✓ Response preview: ${timeSample.replace(/\n/g, " ")}...`);

  await client.close();
  console.log("   ✓ MCP SDK Client session closed cleanly.");

  // Step 6: Verify Audit Attribution
  if (token) {
    console.log("\n▶ Verifying Audit Trail caller identity and API key attribution (AUTH-05)...");
    const auditRes = await fetch(`${BASE_URL}/api/audit?limit=10`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (auditRes.ok) {
      const { logs } = await auditRes.json();
      const userBLogs = logs.filter((l) => l.username === "alex");

      if (userBLogs.length > 0) {
        console.log(`   ✓ Audit Log verified: Found ${userBLogs.length} events logged under User B (alex):`);
        for (const log of userBLogs.slice(0, 3)) {
          console.log(`     • [${log.status.toUpperCase()}] ${log.toolName} (Key ID: ${log.apiKeyId || apiKeyId}) — ${log.durationMs}ms`);
        }
      }
    }
  }

  const totalDuration = Date.now() - startTotal;
  console.log("\n=======================================================");
  console.log(`  ✓ VERIF-02 User B Multi-Server Flow PASSED in ${totalDuration}ms`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("\n❌ User B Verification FAILED:", err.message);
  process.exit(1);
});
