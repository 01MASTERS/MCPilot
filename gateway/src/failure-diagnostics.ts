/**
 * MCPilot Failure Diagnostics Engine (OBS-03)
 * 
 * Analyzes raw network, timeout, HTTP, and protocol exceptions to determine root cause,
 * classifying them into structured diagnostic categories and generating actionable
 * remediation advice for operators and developers.
 */

export type DiagnosticCategory =
  | "NETWORK"
  | "TIMEOUT"
  | "HTTP"
  | "PROTOCOL"
  | "VALIDATION"
  | "KUBERNETES";

export interface DiagnosticReport {
  code: string;
  category: DiagnosticCategory;
  summary: string;
  technicalDetails: string;
  remediation: string;
  targetServerId: string;
  targetUrl?: string;
  toolName?: string;
  timestamp: string;
  rawError: string;
  httpStatus?: number;
}

const MAX_DIAGNOSTIC_HISTORY = 50;
const diagnosticHistory: DiagnosticReport[] = [];
const latestByServer = new Map<string, DiagnosticReport>();

/**
 * Classifies an error into a structured DiagnosticReport
 */
export function classifyFailure(
  err: any,
  context: { serverId: string; url?: string; toolName?: string }
): DiagnosticReport {
  const rawMsg = err?.message || String(err || "");
  const errCode = String(err?.code ?? "").toUpperCase();
  const timestamp = new Date().toISOString();

  let code = "ERR_INTERNAL_EXCEPTION";
  let category: DiagnosticCategory = "KUBERNETES";
  let summary = "Unexpected error encountered while communicating with upstream server";
  let technicalDetails = rawMsg;
  let remediation = "Inspect gateway pod logs and upstream container logs using `kubectl logs`.";
  let httpStatus: number | undefined = undefined;

  // 1. DNS Resolution Failure
  if (
    errCode === "ENOTFOUND" ||
    rawMsg.includes("ENOTFOUND") ||
    errCode === "EAI_AGAIN" ||
    rawMsg.includes("getaddrinfo")
  ) {
    code = "ERR_DNS_RESOLUTION";
    category = "NETWORK";
    summary = `DNS resolution failed for upstream server '${context.serverId}'`;
    technicalDetails = `The cluster DNS system (CoreDNS) could not resolve the host specified in base URL: ${context.url || "unknown"}`;
    remediation = `Verify the Kubernetes Service name exists in the namespace. For example: 'kubectl get svc -n <namespace>' and verify CoreDNS pods are running healthy.`;
  }
  // 2. Connection Refused (port listening failure)
  else if (errCode === "ECONNREFUSED" || rawMsg.includes("ECONNREFUSED")) {
    code = "ERR_CONN_REFUSED";
    category = "NETWORK";
    summary = `TCP connection refused by upstream '${context.serverId}'`;
    technicalDetails = `The host was reached, but no process is actively listening on target port. (${rawMsg})`;
    remediation = `Check if the upstream container crashed or if the Service targetPort is misconfigured. Inspect pod status: 'kubectl get pods -l app.kubernetes.io/component=${context.serverId}' and check container restart logs.`;
  }
  // 3. Network / Execution Timeout
  else if (
    errCode === "ETIMEDOUT" ||
    errCode === "ABORT_ERR" ||
    rawMsg.toLowerCase().includes("timeout") ||
    rawMsg.toLowerCase().includes("aborted")
  ) {
    code = "ERR_CONN_TIMEOUT";
    category = "TIMEOUT";
    summary = `Upstream '${context.serverId}' failed to respond before the timeout threshold`;
    technicalDetails = `Operation exceeded deadline (health check 3s, tool execution 10s). (${rawMsg})`;
    remediation = `Check upstream CPU/memory pressure and database query execution times. Consider increasing pod resource limits in Helm values if upstream is throttled.`;
  }
  // 4. HTTP Status Error Codes
  else if (rawMsg.includes("HTTP ") || rawMsg.match(/status (\d{3})/i) || err?.status) {
    const match = rawMsg.match(/HTTP\s*(\d{3})/i) || rawMsg.match(/status\s*(\d{3})/i);
    const status = match ? parseInt(match[1], 10) : err?.status || 500;
    httpStatus = status;

    code = `ERR_HTTP_${status}`;
    category = "HTTP";

    if (status === 401 || status === 403) {
      summary = `Authentication rejected (HTTP ${status}) by upstream '${context.serverId}'`;
      technicalDetails = `Upstream rejected the credentials injected by the Gateway. (${rawMsg})`;
      remediation = `Verify upstream auth token in Server Settings or regenerate WooCommerce Consumer Key/Secret. Ensure 'X-Forwarded-Proto: https' is accepted by upstream.`;
    } else if (status === 404) {
      summary = `Endpoint not found (HTTP 404) on upstream '${context.serverId}'`;
      technicalDetails = `The requested route does not exist at ${context.url || "upstream URL"}.`;
      remediation = `Verify base URL path points to the correct MCP endpoint (e.g. '/mcp' or '/wp-json/wc/v3').`;
    } else if (status === 502 || status === 503 || status === 504) {
      summary = `Upstream unavailable or gateway timeout (HTTP ${status}) on '${context.serverId}'`;
      technicalDetails = `Reverse proxy or ingress controller reported upstream unavailable. (${rawMsg})`;
      remediation = `Verify upstream backend pods are in 'Running' and 'Ready' state in Kubernetes.`;
    } else {
      summary = `Upstream server returned error status HTTP ${status}`;
      technicalDetails = rawMsg;
      remediation = `Inspect upstream container stdout/stderr logs for internal application exceptions.`;
    }
  }
  // 5. Input Schema / Zod Validation Error
  else if (
    rawMsg.includes("Input validation error") ||
    rawMsg.includes("Expected string") ||
    rawMsg.includes("Expected number") ||
    rawMsg.includes("validation error")
  ) {
    code = "ERR_SCHEMA_VALIDATION";
    category = "VALIDATION";
    summary = `Input arguments failed tool schema validation for '${context.toolName || "tool"}'`;
    technicalDetails = rawMsg;
    remediation = `Review required tool parameters against tool definition. Ensure numbers are numbers and strings are non-empty.`;
  }
  // 6. Protocol / Parsing Violation
  else if (
    rawMsg.includes("JSON") ||
    rawMsg.includes("Unexpected token") ||
    rawMsg.includes("Streamable HTTP")
  ) {
    code = "ERR_PROTOCOL_VIOLATION";
    category = "PROTOCOL";
    summary = `Protocol violation: response from '${context.serverId}' was not valid MCP JSON-RPC`;
    technicalDetails = rawMsg;
    remediation = `Ensure the upstream server supports MCP Streamable HTTP specification over POST /mcp.`;
  }

  const report: DiagnosticReport = {
    code,
    category,
    summary,
    technicalDetails,
    remediation,
    targetServerId: context.serverId,
    targetUrl: context.url,
    toolName: context.toolName,
    timestamp,
    rawError: rawMsg,
    httpStatus,
  };

  recordDiagnostic(report);
  return report;
}

/**
 * Push a diagnostic report into the ring buffer
 */
export function recordDiagnostic(report: DiagnosticReport): void {
  diagnosticHistory.unshift(report);
  if (diagnosticHistory.length > MAX_DIAGNOSTIC_HISTORY) {
    diagnosticHistory.pop();
  }
  latestByServer.set(report.targetServerId, report);
}

/**
 * Retrieve recent diagnostics with optional filtering
 */
export function getDiagnostics(filter?: {
  serverId?: string;
  category?: DiagnosticCategory;
}): DiagnosticReport[] {
  let results = diagnosticHistory;
  if (filter?.serverId) {
    results = results.filter((d) => d.targetServerId === filter.serverId);
  }
  if (filter?.category) {
    results = results.filter((d) => d.category === filter.category);
  }
  return results;
}

/**
 * Get the latest diagnostic report for a specific server
 */
export function getLatestDiagnosticForServer(serverId: string): DiagnosticReport | null {
  return latestByServer.get(serverId) || null;
}
