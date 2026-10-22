/**
 * SSRF (Server-Side Request Forgery) Validation Engine (SEC-01)
 *
 * Protects the gateway from SSRF attacks when administrators add or edit upstream MCP servers.
 * Blocks:
 * - Loopback addresses (127.0.0.1, localhost, 0.0.0.0, ::1)
 * - Cloud metadata endpoints (169.254.169.254, metadata.google.internal, instance-data)
 * - Internal Kubernetes control-plane endpoints (kubernetes.default.svc, 10.43.0.1)
 * - Non-HTTP schemes (file:, gopher:, ftp:, tftp:, etc.)
 *
 * Allows:
 * - In-cluster MCP services (mcpilot-*, mcpilot-woocommerce-mcp.store-*.svc*)
 * - Local ingress domains (*.local.test)
 * - Public HTTP/HTTPS domains
 */

import { URL } from "node:url";

export interface SsrValidationResult {
  valid: boolean;
  reason?: string;
}

// Prohibited IP ranges and hostnames
const PROHIBITED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "[::]",
  "169.254.169.254",
  "metadata.google.internal",
  "metadata.internal",
  "instance-data",
  "kubernetes.default",
  "kubernetes.default.svc",
  "kubernetes.default.svc.cluster.local",
  "10.43.0.1",
]);

// IP regex for link-local and loopback ranges
const LOOPBACK_V4_REGEX = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const LINK_LOCAL_V4_REGEX = /^169\.254\.\d{1,3}\.\d{1,3}$/;
const NUMERIC_IP_INTEGER_REGEX = /^\d+$/;

export function validateUpstreamUrl(urlStr: string): SsrValidationResult {
  if (!urlStr || typeof urlStr !== "string" || !urlStr.trim()) {
    return { valid: false, reason: "Upstream URL cannot be empty" };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlStr.trim());
  } catch (err: any) {
    return { valid: false, reason: `Invalid URL format: ${err.message}` };
  }

  // 1. Strict protocol check
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return {
      valid: false,
      reason: `Prohibited protocol '${protocol}'. Only 'http:' and 'https:' are permitted.`,
    };
  }

  // 2. Reject credentials in URL authority
  if (parsed.username || parsed.password) {
    return {
      valid: false,
      reason: "URLs containing embedded userinfo credentials are not permitted.",
    };
  }

  const hostname = parsed.hostname.toLowerCase().trim();

  // 3. Exact prohibited hostname match
  if (PROHIBITED_HOSTNAMES.has(hostname)) {
    return {
      valid: false,
      reason: `Destination host '${hostname}' is restricted (internal control plane, loopback, or metadata service).`,
    };
  }

  // 4. Loopback and link-local range check (127.0.0.0/8 and 169.254.0.0/16)
  if (LOOPBACK_V4_REGEX.test(hostname)) {
    return {
      valid: false,
      reason: `Loopback IP '${hostname}' is prohibited to prevent local port scanning.`,
    };
  }

  if (LINK_LOCAL_V4_REGEX.test(hostname)) {
    return {
      valid: false,
      reason: `Cloud metadata endpoint '${hostname}' is prohibited to prevent credential exfiltration.`,
    };
  }

  // 5. Integer-encoded IP evasion (e.g., http://2130706433 = 127.0.0.1)
  if (NUMERIC_IP_INTEGER_REGEX.test(hostname)) {
    return {
      valid: false,
      reason: `Integer-encoded numeric IP '${hostname}' is prohibited.`,
    };
  }

  // 6. Direct Kubernetes internal API hostnames
  if (
    hostname.startsWith("kubernetes.") ||
    hostname.endsWith(".kubernetes.default") ||
    hostname.endsWith(".kubernetes.default.svc")
  ) {
    return {
      valid: false,
      reason: `Direct access to Kubernetes control plane '${hostname}' is prohibited.`,
    };
  }

  // 7. Legitimate In-Cluster MCP Services and Ingress check
  const isWhitelistedClusterService =
    hostname.startsWith("mcpilot-") ||
    hostname.includes("mcpilot-woocommerce-mcp.store-") ||
    hostname.endsWith(".local.test") ||
    hostname.includes(".cluster.local");

  // If it's not a cluster service, ensure it has a valid domain structure
  if (!isWhitelistedClusterService) {
    // Check if it's a private RFC 1918 raw IP (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) without a domain
    const isPrivateIp =
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname);

    if (isPrivateIp) {
      return {
        valid: false,
        reason: `Direct private subnet IP '${hostname}' is prohibited. Use Kubernetes Service DNS names for internal services.`,
      };
    }
  }

  return { valid: true };
}
