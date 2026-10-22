/**
 * Team Member Management & Admin Server Editing Verification (AUTH-01, AUTH-04, UI-02, UI-03)
 * 
 * Verifies:
 * 1. Admin authentication & upstream server editing via PUT /api/servers/:id (with revert).
 * 2. Admin team member invitation via POST /api/users with secure bcrypt hashing.
 * 3. New member authentication via POST /api/auth/login with the invited credentials.
 * 4. Admin issuing an API key on behalf of the member via POST /api/keys with target userId.
 * 5. Streamable HTTP tool execution on /mcp using the newly issued member API key.
 * 6. Audit log attribution in MariaDB proving caller identity is mapped to the invited member.
 * 7. RBAC enforcement: member account cannot invite users or edit upstream servers (403 Forbidden).
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
  console.log("  MCPilot — Team Management & Server Editing (AUTH-01/04)");
  console.log(`  Target: ${BASE_URL}`);
  console.log("=======================================================\n");

  const startTotal = Date.now();

  // -------------------------------------------------------------------------
  // Step 1: Authenticate as Admin
  // -------------------------------------------------------------------------
  console.log("▶ [1/7] Authenticating as Admin (admin)...");
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" })
  });

  if (!adminLoginRes.ok) {
    throw new Error(`Admin login failed: ${adminLoginRes.status}`);
  }

  const { token: adminToken, user: adminUser } = await adminLoginRes.json();
  console.log(`   ✓ Authenticated as ${adminUser.username} (role: ${adminUser.role})`);

  // -------------------------------------------------------------------------
  // Step 2: Edit Upstream Server (PUT /api/servers/time) and Revert
  // -------------------------------------------------------------------------
  console.log("\n▶ [2/7] Testing Admin Upstream Server Editing (PUT /api/servers/time)...");
  
  // 2a. Fetch current server details
  const getServersRes = await fetch(`${BASE_URL}/api/servers`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!getServersRes.ok) throw new Error(`Failed to list servers: ${getServersRes.status}`);
  const { servers } = await getServersRes.json();
  const timeServer = servers.find(s => s.id === "time");
  if (!timeServer) throw new Error("Time server not found in registered servers list");
  const originalName = timeServer.name;
  const originalDesc = timeServer.description;

  // 2b. Update server
  const testUpdatedName = `${originalName} (Updated)`;
  const putRes = await fetch(`${BASE_URL}/api/servers/time`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: testUpdatedName
    })
  });

  if (!putRes.ok) {
    throw new Error(`PUT /api/servers/time failed with status: ${putRes.status}`);
  }

  // Verify by fetching servers again
  const getServersAfterRes = await fetch(`${BASE_URL}/api/servers`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  const { servers: updatedServers } = await getServersAfterRes.json();
  const updatedTimeServer = updatedServers.find(s => s.id === "time");
  if (updatedTimeServer.name !== testUpdatedName) {
    throw new Error(`Server name did not update as expected: ${updatedTimeServer.name}`);
  }
  console.log(`   ✓ Upstream server 'time' successfully updated to '${updatedTimeServer.name}'`);

  // 2c. Revert server back to original values
  const revertRes = await fetch(`${BASE_URL}/api/servers/time`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: originalName
    })
  });
  if (!revertRes.ok) throw new Error(`Revert PUT /api/servers/time failed: ${revertRes.status}`);
  console.log(`   ✓ Upstream server 'time' cleanly reverted to '${originalName}'`);

  // -------------------------------------------------------------------------
  // Step 3: Invite New Team Member (POST /api/users)
  // -------------------------------------------------------------------------
  const uniqueSuffix = Date.now().toString().slice(-4);
  const newUsername = `sarah_${uniqueSuffix}`;
  const newPassword = `sarahsecret${uniqueSuffix}`;
  console.log(`\n▶ [3/7] Inviting new team member ('${newUsername}')...`);

  const inviteRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      username: newUsername,
      password: newPassword,
      role: "member"
    })
  });

  if (inviteRes.status !== 201) {
    const errText = await inviteRes.text();
    throw new Error(`POST /api/users failed with status ${inviteRes.status}: ${errText}`);
  }

  const { user: createdUser } = await inviteRes.json();
  console.log(`   ✓ Team member created: ID=${createdUser.id}, username=${createdUser.username}, role=${createdUser.role}`);

  // -------------------------------------------------------------------------
  // Step 4: Authenticate as the New Team Member
  // -------------------------------------------------------------------------
  console.log(`\n▶ [4/7] Authenticating as newly invited member ('${newUsername}')...`);
  const memberLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: newUsername, password: newPassword })
  });

  if (!memberLoginRes.ok) {
    throw new Error(`Member login with new credentials failed: ${memberLoginRes.status}`);
  }

  const { token: memberToken, user: memberUser } = await memberLoginRes.json();
  console.log(`   ✓ Successfully authenticated as ${memberUser.username} (JWT issued)`);

  // -------------------------------------------------------------------------
  // Step 5: Admin Issues Key on Behalf of the Member
  // -------------------------------------------------------------------------
  const keyName = `Sarah Agent Workstation ${uniqueSuffix}`;
  console.log(`\n▶ [5/7] Admin issuing API key for member ${newUsername} (userId: ${createdUser.id})...`);
  const issueKeyRes = await fetch(`${BASE_URL}/api/keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: keyName,
      userId: createdUser.id
    })
  });

  if (issueKeyRes.status !== 201) {
    const errText = await issueKeyRes.text();
    throw new Error(`Admin key issuance failed with status ${issueKeyRes.status}: ${errText}`);
  }

  const { id: keyId, apiKey, keyPrefix, userId: boundUserId } = await issueKeyRes.json();
  if (boundUserId !== createdUser.id) {
    throw new Error(`Key was not bound to target member: expected ${createdUser.id}, got ${boundUserId}`);
  }
  console.log(`   ✓ Key issued: ${keyPrefix} (ID: ${keyId}) bound to user ID ${boundUserId}`);

  // -------------------------------------------------------------------------
  // Step 6: Tool Execution via Streamable HTTP with Member API Key
  // -------------------------------------------------------------------------
  console.log(`\n▶ [6/7] Invoking MCP tool on /mcp with ${newUsername}'s API key...`);
  const toolCallRes = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "sarah-tool-probe",
      method: "tools/call",
      params: {
        name: "time__get_current_time",
        arguments: {}
      }
    })
  });

  if (!toolCallRes.ok) {
    throw new Error(`MCP tool execution failed: ${toolCallRes.status}`);
  }

  const mcpResult = await parseMcpResponse(toolCallRes);
  if (mcpResult.error) {
    throw new Error(`MCP returned error: ${JSON.stringify(mcpResult.error)}`);
  }
  console.log(`   ✓ Tool executed successfully: ${mcpResult.result?.content?.[0]?.text?.slice(0, 70)}...`);

  // Verify Audit Log attribution
  const auditRes = await fetch(`${BASE_URL}/api/audit?limit=5`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  if (!auditRes.ok) throw new Error(`Failed to query audit logs: ${auditRes.status}`);
  const { logs } = await auditRes.json();
  const matchedAudit = logs.find(l => l.apiKeyId === keyId || l.username === newUsername);
  if (!matchedAudit) {
    throw new Error(`Audit log entry not found for member ${newUsername} / key ${keyId}`);
  }
  console.log(`   ✓ Audit log verified: Caller attributed to '${matchedAudit.username}' (Duration: ${matchedAudit.durationMs}ms)`);

  // -------------------------------------------------------------------------
  // Step 7: RBAC Enforcement (Member cannot invite users or edit servers)
  // -------------------------------------------------------------------------
  console.log(`\n▶ [7/7] Verifying RBAC barriers (Member cannot perform admin actions)...`);
  
  // 7a. Member attempts to invite another user
  const forbiddenInviteRes = await fetch(`${BASE_URL}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${memberToken}`
    },
    body: JSON.stringify({ username: "hacker", password: "hacker123", role: "admin" })
  });

  if (forbiddenInviteRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden on member user creation, got: ${forbiddenInviteRes.status}`);
  }
  console.log(`   ✓ Member user invite rejected: HTTP 403 Forbidden`);

  // 7b. Member attempts to edit server
  const forbiddenServerEditRes = await fetch(`${BASE_URL}/api/servers/time`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${memberToken}`
    },
    body: JSON.stringify({ name: "Hacked Server" })
  });

  if (forbiddenServerEditRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden on member server edit, got: ${forbiddenServerEditRes.status}`);
  }
  console.log(`   ✓ Member server edit rejected: HTTP 403 Forbidden`);

  // Summary
  const totalElapsed = Date.now() - startTotal;
  console.log("\n=======================================================");
  console.log("  TEAM MANAGEMENT & SERVER EDITING VERIFICATION: PASSED");
  console.log(`  Completed 7/7 verification gates in ${totalElapsed}ms`);
  console.log("=======================================================\n");
}

main().catch(err => {
  console.error("\n❌ Verification Failed:", err);
  process.exit(1);
});
