# MCPilot: YouTube Video Metadata & Evaluator Submission Package

> **Video Title**: MCPilot: Enterprise Model Context Protocol Gateway & WooCommerce Platform on Kubernetes
> **Presenter & Author**: Rithik Sharma (Team 01MASTERS)
> **GitHub Repository**: [https://github.com/01MASTERS/MCPilot](https://github.com/01MASTERS/MCPilot)
> **Rendered Master Video**: `C:\Users\ravis\Downloads\MCPilot_demo_edited.mp4`
> **Video Specifications**: 1080p Full HD (1920x1080), 30fps H.264, Studio Neural Voiceover, Ambient Tech Audio Bed, Embedded Soft Captions (mov_text / .srt).

---

## 1. YouTube Video Metadata (Copy-Paste Ready)

### Video Title Options
- **Primary (Recommended)**:
  `MCPilot: Enterprise Model Context Protocol Gateway & WooCommerce Platform on Kubernetes`
- **Alternative 1 (Technical)**:
  `MCPilot Technical Walkthrough: Multi-Store MCP Gateway, RBAC, Circuit Breakers & Observability`
- **Alternative 2 (Keynote)**:
  `Connecting AI Agents to Production Tools: MCPilot Kubernetes Gateway Architecture & Demo`

---

### Video Description

```markdown
🚀 Technical Walkthrough and Architecture Demonstration of **MCPilot** — an enterprise-grade Model Context Protocol (MCP) Gateway and WooCommerce multi-store platform built natively on Kubernetes.

Presented by Rithik Sharma (01MASTERS).
GitHub Repository: https://github.com/01MASTERS/MCPilot

MCPilot solves the fundamental enterprise AI tool-calling challenge: how to securely connect autonomous AI agents (Cursor, Claude Desktop, custom agents) and multi-tenant team members to production databases and store APIs without leaking raw credentials, suffering tool name collisions, or risking cascade failures across upstream microservices.

### ⏱️ Video Chapters & Timestamps
00:00 - Introduction & The Enterprise AI Tool Challenge
00:05 - Chapter 1: Kubernetes Architecture & Live Storefront Checkout
01:32 - Chapter 2: User A (Admin) & AI Chat Agent Live Product Creation
04:33 - Chapter 3: User B (Member) & External Client Multi-Server Federation
06:27 - Chapter 4: Instant Key Revocation (<15ms) & Server Disabling
08:18 - Chapter 5: Fault Isolation, Circuit Breakers & Pod Self-Healing
09:56 - Chapter 6: Transactional MariaDB Audit Logging & Caller Traceability
10:39 - Chapter 7: Kubernetes Cluster Topology, ClusterIP & Health Probes
11:47 - Chapter 8: MCP Protocol Internals, AES-256-GCM Vault & SSRF Defense
12:45 - Chapter 9: Production Transition (values-prod.yaml) & Safe Rollbacks
13:50 - Chapter 10: Stand-Out Bonus: Dynamic Multi-Store Provisioning
15:06 - Chapter 11: Stand-Out: Real-Time Prometheus Observability & Conclusion

### 🔑 Key Architectural Highlights
- **Native Streamable HTTP**: Full implementation of the Model Context Protocol 2024-11-05 spec over `/mcp`.
- **Zero-Trust Credential Vault**: Upstream store API keys are encrypted at rest with AES-256-GCM in MariaDB. Downstream clients use scoped `mcp_live_...` tokens and never touch store secrets.
- **ClusterIP Isolation**: WordPress, MariaDB, and upstream MCP microservices are strictly ClusterIP; only Ingress routes external traffic to the Gateway and Storefront.
- **Circuit Breaker Resilience**: 5000ms upstream timeouts isolate crashing pods (e.g., scale to 0) with zero cascade impact on healthy tools.
- **Sub-15ms Instant Revocation**: Revoking a member key immediately yields HTTP 401 Unauthorized with zero pod restarts.
- **Multi-Store Dynamic Provisioning (Bonus)**: On-demand provisioning of isolated Kubernetes namespaces (`store-gadgets`) with dedicated MariaDB, WordPress, and auto-mounted MCP toolsets.
- **Production Observability**: Prometheus telemetry tracking invocation rates, error rates, and p50/p95/p99 latency percentiles with deep trace inspection.

### 📁 Codebase Links
- Repository: https://github.com/01MASTERS/MCPilot
- Gateway Core: https://github.com/01MASTERS/MCPilot/tree/main/gateway
- WooCommerce MCP Server: https://github.com/01MASTERS/MCPilot/tree/main/mcp-servers/woocommerce
- Helm Chart: https://github.com/01MASTERS/MCPilot/tree/main/helm/mcpilot
- Threat Model: https://github.com/01MASTERS/MCPilot/blob/main/docs/THREAT_MODEL.md
- Verification Suites: https://github.com/01MASTERS/MCPilot/tree/main/scripts

#Kubernetes #ModelContextProtocol #MCP #AIAgents #WooCommerce #DevOps #Microservices #TypeScript #Prometheus
```

---

### YouTube Tags / Keywords
`MCPilot`, `Model Context Protocol`, `MCP Gateway`, `Kubernetes`, `Helm`, `WooCommerce`, `AI Agents`, `Streamable HTTP`, `LLM Tool Calling`, `Cursor`, `Claude Desktop`, `Prometheus`, `Microservices`, `TypeScript`, `Rithik Sharma`, `01MASTERS`

---

## 2. Evaluator Submission Matrix (Assignment Checklist)

| Rubric Deliverable | Video Timestamp | Proof Shown on Screen | Source Code Reference |
| :--- | :--- | :--- | :--- |
| **System Design & Pod Topology** | `00:00 - 00:48` | `kubectl get pods -o wide`, 6 workloads running healthy | `helm/mcpilot/templates/` |
| **Store Baseline & Checkout** | `00:49 - 01:32` | Live browsing, Cart, Cash on Delivery Order #36 confirmed | `helm/mcpilot/templates/store/` |
| **User A: Tool Aggregation & Collision Defense** | `01:32 - 02:22` | Unified catalog, `{server_id}__{tool_name}` prefixing | `gateway/src/tool-aggregator.ts` |
| **User A: Chat Agent & Product Creation** | `02:22 - 04:33` | Llama model via Ollama creating "Kubernetes Cloud Hoodie", 142ms latency, live in storefront | `gateway/src/chat-agent.ts` |
| **User B: Least Privilege & API Keys** | `04:33 - 05:27` | Member role restrictions, `mcp_live_...` key generation, SHA-256 storage | `gateway/src/api-keys.ts` |
| **User B: External Client Federation** | `05:27 - 06:27` | `node scripts/verify-user-b.mjs`, multi-server coordination (WooCommerce + Time) | `scripts/verify-user-b.mjs` |
| **Team Control: Instant Revocation** | `06:27 - 07:17` | Member key revoked, terminal shows immediate HTTP 401 Unauthorized in <15ms | `gateway/src/auth.ts` |
| **Team Control: Upstream Disabling** | `07:17 - 08:18` | Disabling `time` server removes tools from catalog & chat agent | `gateway/src/upstream-manager.ts` |
| **Fault Isolation & Self-Healing** | `08:18 - 09:56` | Scale WooCommerce to 0, card turns Unreachable, other servers respond sub-second, auto self-heal | `gateway/src/upstream-manager.ts` |
| **Audit Logging & Governance** | `09:56 - 10:39` | Audit log table showing caller user ID, username, arguments JSON, latency in ms, status | `gateway/src/audit.ts` |
| **Kubernetes Architecture & Probes** | `10:39 - 11:47` | ClusterIP isolation, PVC storage persistence, readiness/liveness probes | `helm/mcpilot/templates/gateway/` |
| **MCP Internals & Security Defense** | `11:47 - 12:45` | JSON-RPC 2.0 lifecycle, token stripping, AES-256-GCM vault, SSRF validation | `gateway/src/security/ssrf-filter.ts` |
| **Production Transition & Rollback** | `12:45 - 13:50` | `values-local.yaml` vs `values-prod.yaml`, cert-manager TLS, `helm rollback` | `helm/mcpilot/values-prod.yaml` |
| **Bonus: Multi-Store Dynamic Provisioning** | `13:50 - 15:06` | Creation of `store-gadgets` namespace, isolated MariaDB & WordPress, dynamic tool mounting | `gateway/src/provisioning/` |
| **Observability & Prometheus Telemetry** | `15:06 - 15:54` | Live Prometheus charts: invocations, error rate, p50/p95/p99 latency, deep trace drawer | `gateway/src/observability/` |
