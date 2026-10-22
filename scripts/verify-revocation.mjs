/**
 * Instant API Key Revocation Lifecycle Verification (AUTH-03, VERIF-03)
 * 
 * Verifies:
 * 1. Issuance of a live Bearer token (mcp_live_...).
 * 2. Successful execution of tool calls while key is 'active'.
 * 3. Instant revocation via POST /api/keys/:id/revoke without gateway restart.
 * 4. Immediate rejection of subsequent requests using the revoked token with HTTP 401 Unauthorized.
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
  console.log("  MCPilot — Instant API Key Revocation (AUTH-03/VERIF-03)");
  console.log(`  Target: ${BASE_URL}`);
  console.log("=======================================================\n");

  const startTotal = Date.now();

  // Step 1: Login as member alex
  console.log("▶ [1/4] Authenticating as member (alex)...");
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "alex", password: "alex123" })
  });

  if (!loginRes.ok) {
    throw new Error(`Member login failed: ${loginRes.status}`);
  }

  const { token, user } = await loginRes.json();
  console.log(`   ✓ Authenticated as ${user.username}`);

  // Step 2: Generate test key
  const keyName = `Ephemeral Revocation Probe ${Date.now().toString().slice(-4)}`;
  console.log(`\n▶ [2/4] Generating temporary API key ('${keyName}')...`);
  const keyRes = await fetch(`${BASE_URL}/api/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ name: keyName })
  });

  const { id: keyId, apiKey, keyPrefix } = await keyRes.json();
  console.log(`   ✓ Issued key ${keyPrefix} (ID: ${keyId})`);

  // Step 3: Verify Tool Execution While Key is Active
  console.log("\n▶ [3/4] Probing Gateway with ACTIVE key...");
  const activeHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${apiKey}`
  };

  const t0 = Date.now();
  const probeActiveRes = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: activeHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "active-key-probe",
      method: "tools/call",
      params: {
        name: "time__get_current_time",
        arguments: {}
      }
    })
  });

  if (!probeActiveRes.ok) {
    throw new Error(`Active key probe unexpectedly failed: ${probeActiveRes.status}`);
  }

  const activeJson = await parseMcpResponse(probeActiveRes);
  if (activeJson.error) {
    throw new Error(`Tool call with active key returned error: ${JSON.stringify(activeJson.error)}`);
  }
  console.log(`   ✓ Active key accepted (HTTP ${probeActiveRes.status}) in ${Date.now() - t0}ms`);
  console.log(`   ✓ Tool response: ${activeJson.result?.content?.[0]?.text?.slice(0, 80)}...`);

  // Step 4: Revoke Key Instantly
  console.log("\n▶ [4/4] Executing INSTANT REVOCATION via POST /api/keys/:id/revoke...");
  const tRevoke = Date.now();
  const revokeRes = await fetch(`${BASE_URL}/api/keys/${keyId}/revoke`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!revokeRes.ok) {
    throw new Error(`Revocation request failed: ${revokeRes.status}`);
  }

  const revokeJson = await revokeRes.json();
  const revokeDuration = Date.now() - tRevoke;
  console.log(`   ✓ API Key revoked in ${revokeDuration}ms (Status: ${revokeJson.status})`);

  // Step 5: Immediate Re-attempt (Must Reject with HTTP 401)
  console.log("\n▶ Probing Gateway immediately with REVOKED key...");
  const tReattempt = Date.now();
  const probeRevokedRes = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: activeHeaders, // Same headers with revoked apiKey
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "revoked-key-probe",
      method: "tools/call",
      params: {
        name: "time__get_current_time",
        arguments: {}
      }
    })
  });

  const reattemptDuration = Date.now() - tReattempt;
  console.log(`   ✓ Re-attempt response received in ${reattemptDuration}ms: HTTP ${probeRevokedRes.status}`);

  if (probeRevokedRes.status !== 401) {
    throw new Error(`Security Violation: Expected HTTP 401 Unauthorized for revoked key, but got HTTP ${probeRevokedRes.status}!`);
  }

  const errBody = await probeRevokedRes.json().catch(() => ({}));
  console.log(`   ✓ Gateway rejection payload: ${JSON.stringify(errBody)}`);
  console.log("   ✓ Instantaneous rejection verified: Zero server restart required.");

  const totalDuration = Date.now() - startTotal;
  console.log("\n=======================================================");
  console.log(`  ✓ VERIF-03 Instant Key Revocation PASSED in ${totalDuration}ms`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("\n❌ Revocation Verification FAILED:", err.message);
  process.exit(1);
});
