/**
 * MCPilot Helper Script: Invoke an MCP Tool on any Store (Default or Dynamic Provisioned Store)
 * 
 * Usage:
 *   node scripts/call-store-tool.mjs [store_slug] [tool_name] [args_json]
 * 
 * Examples:
 *   node scripts/call-store-tool.mjs apple-store list_products '{"per_page": 5}'
 *   node scripts/call-store-tool.mjs apple-store create_product '{"name": "iPad Pro M4", "regular_price": "999.00"}'
 *   node scripts/call-store-tool.mjs apple-store list_orders '{"per_page": 3}'
 */

const BASE_URL = process.env.GATEWAY_URL || "http://gateway.local.test:8080";
const slug = process.argv[2] || "apple-store";
const rawTool = process.argv[3] || "list_products";
const rawArgs = process.argv.slice(4).join(" ") || "{}";

let toolArgs = {};
const extraArgs = process.argv.slice(4);

if (extraArgs.length > 0) {
  const combined = extraArgs.join(" ").trim();
  if (combined.startsWith("{") && combined.endsWith("}")) {
    try {
      toolArgs = JSON.parse(combined);
    } catch {
      try {
        // Handle unquoted or single quoted keys/values: e.g. {per_page: 2}
        const cleaned = combined
          .replace(/\\"/g, '"')
          .replace(/\\/g, "")
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:\s*([^,}]+)/g, (match, prefix, key, val) => {
            const trimmedVal = val.trim().replace(/^['"]|['"]$/g, '');
            const num = Number(trimmedVal);
            const formattedVal = !isNaN(num) && trimmedVal !== "" ? num : `"${trimmedVal}"`;
            return `${prefix}"${key}": ${formattedVal}`;
          });
        toolArgs = JSON.parse(cleaned);
      } catch (e) {
        console.warn(`Could not parse JSON body (${e.message}), trying key=value syntax...`);
      }
    }
  }

  // If still empty or not JSON, parse as key=value pairs (e.g. per_page=5 name="iPad Pro")
  if (Object.keys(toolArgs).length === 0) {
    for (const arg of extraArgs) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const k = arg.slice(0, eqIdx).trim();
        let v = arg.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
        // Only convert pagination/id to numbers; keep prices/codes as strings for WooCommerce Zod schema
        if (["per_page", "page", "id", "customer_id"].includes(k) && !isNaN(Number(v))) {
          toolArgs[k] = Number(v);
        } else {
          toolArgs[k] = v;
        }
      }
    }
  }
}

// Support both unprefixed ("list_products") and full prefixed ("store_apple-store__list_products")
const toolName = rawTool.startsWith("store_") ? rawTool : `store_${slug}__${rawTool}`;

async function main() {
  console.log(`\n▶ [1/3] Authenticating with Gateway (${BASE_URL})...`);
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "admin123" }),
  });

  if (!loginRes.ok) {
    throw new Error(`Authentication failed: ${loginRes.status} ${await loginRes.text()}`);
  }

  const { token } = await loginRes.json();
  console.log(`   ✓ Authenticated successfully.`);

  console.log(`\n▶ [2/3] Calling MCP Tool: '${toolName}'...`);
  console.log(`   Arguments:`, JSON.stringify(toolArgs, null, 2));

  const mcpRes = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "store-tool-call-1",
      method: "tools/call",
      params: {
        name: toolName,
        arguments: toolArgs,
      },
    }),
  });

  const text = await mcpRes.text();
  console.log(`\n▶ [3/3] Gateway MCP Response:`);
  
  let parsed;
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  try {
    parsed = JSON.parse(line ? line.slice(5).trim() : text);
  } catch {
    console.log(text);
    return;
  }

  console.log(JSON.stringify(parsed, null, 2));

  if (parsed.result?.content?.[0]?.text) {
    try {
      const nested = JSON.parse(parsed.result.content[0].text);
      console.log("\n--- Parsed Tool Content ---");
      console.log(JSON.stringify(nested, null, 2));
    } catch {
      // not JSON formatted string
    }
  }

  if (parsed.result?.isError) {
    console.error("\n❌ Tool returned isError: true");
    process.exit(1);
  } else {
    console.log("\n✓ Tool call succeeded with isError: false");
  }
}

main().catch((err) => {
  console.error("Execution failed:", err.message);
  process.exit(1);
});
