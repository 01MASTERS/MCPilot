/**
 * MCPilot Master End-to-End Verification Runner (VERIF-01 through VERIF-05)
 * 
 * Sequentially executes:
 * 1. User A Store Order & Chat Loop (scripts/verify-user-a.mjs)
 * 2. User B Multi-Server MCP SDK Client Flow (scripts/verify-user-b.mjs)
 * 3. Instant API Key Revocation Lifecycle (scripts/verify-revocation.mjs)
 * 4. Fault Isolation & Upstream Pod Kill (scripts/verify-fault-isolation.mjs)
 * 5. Container Security & Non-Root Contexts (scripts/verify-security.mjs)
 */

import { execSync } from "node:child_process";

const SUITES = [
  { name: "VERIF-01: User A Store Checkout & Tool Loop", script: "scripts/verify-user-a.mjs" },
  { name: "VERIF-02: User B Multi-Server MCP SDK Client", script: "scripts/verify-user-b.mjs" },
  { name: "VERIF-03: Instant API Key Revocation Lifecycle", script: "scripts/verify-revocation.mjs" },
  { name: "VERIF-04: Fault Isolation & Pod Kill Resilience", script: "scripts/verify-fault-isolation.mjs" },
  { name: "INFRA-06: Container Security & Non-Root Contexts", script: "scripts/verify-security.mjs" },
  { name: "AUTH-01/04: Team Member Management & Server Editing", script: "scripts/verify-team-mgmt.mjs" },
  { name: "BONUS-01..07: Multi-Store Provisioning Platform", script: "scripts/verify-multi-store.mjs" }
];

async function main() {
  console.log("\n==================================================================");
  console.log("       MCPilot — MASTER END-TO-END VERIFICATION SUITE");
  console.log("==================================================================\n");

  const startAll = Date.now();
  const results = [];

  for (let i = 0; i < SUITES.length; i++) {
    const suite = SUITES[i];
    console.log(`\n------------------------------------------------------------------`);
    console.log(`[${i + 1}/${SUITES.length}] Executing ${suite.name}...`);
    console.log(`------------------------------------------------------------------`);

    const t0 = Date.now();
    try {
      execSync(`node ${suite.script}`, { stdio: "inherit" });
      const duration = Date.now() - t0;
      results.push({ name: suite.name, status: "PASSED", duration });
    } catch (err) {
      const duration = Date.now() - t0;
      results.push({ name: suite.name, status: "FAILED", duration, error: err.message });
      console.error(`\n❌ Suite FAILED: ${suite.name}`);
      break;
    }
  }

  const totalDuration = Date.now() - startAll;

  console.log("\n==================================================================");
  console.log("             FINAL VERIFICATION EXECUTION SUMMARY");
  console.log("==================================================================");
  let allPassed = true;
  for (const r of results) {
    const symbol = r.status === "PASSED" ? "✓" : "❌";
    console.log(`  ${symbol}  ${r.name.padEnd(52)} [${r.status}] (${r.duration}ms)`);
    if (r.status !== "PASSED") allPassed = false;
  }
  console.log("==================================================================");
  console.log(`  Total Suite Duration: ${totalDuration}ms`);
  console.log(`  Overall Status:       ${allPassed ? "ALL TESTS PASSED (100% COMPLIANT)" : "FAILED"}`);
  console.log("==================================================================\n");

  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Master runner failed:", err);
  process.exit(1);
});
