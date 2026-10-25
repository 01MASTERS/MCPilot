# MCPilot: Complete Technical Demo Video Script & Walkthrough Guide

> **Document Purpose**: This script provides an exact, word-for-word spoken narration, visual screen choreography, and source code reference guide for the **mandatory Demo Video submission** (as specified in **Assignment Page 7** and **Page 8**).
> **Target Video Duration**: 8 to 12 minutes.

---

## 0. Pre-Flight Preparation Checklist (Zero-Surprise Setup)

Before you hit "Record", complete these steps so your demo flows smoothly with zero loading delays or interruptions:

### 1. Cluster & Workload Verification
Run in your terminal to ensure all 6 pods are healthy and ready:
```bash
kubectl get pods
```
*Expected: `mcpilot-gateway`, `mcpilot-mariadb-0`, `mcpilot-wordpress`, `mcpilot-woocommerce-mcp`, `mcpilot-analytics-mcp`, `mcpilot-time-mcp` all `1/1 Running`.*

### 2. Populate Telemetry Metrics
Run the seeder script to populate Prometheus metrics so the **Observability View** has rich latency graphs and percentiles:
```bash
npm run metrics:populate
```

### 3. Screen & Window Arrangement
- **Screen Resolution**: Set display to **1920x1080 (1080p)**.
- **Browser Zoom**: Set browser zoom to **110% - 125%** so text, tool pills, and cards are sharp and easily readable.
- **Side-by-Side Setup**:
  - **Left 65% of screen**: Web Browser (Google Chrome / Brave in dark mode).
  - **Right 35% of screen**: Terminal (PowerShell / Windows Terminal with clean font like JetBrains Mono).
- **Prepared Browser Tabs** (in order):
  - **Tab 1**: MCPilot Gateway Dashboard — `http://gateway.local.test:8080/` (logged out, ready to log in as `admin`).
  - **Tab 2**: WooCommerce Storefront — `http://store.local.test:8080/` (shop page).
  - **Tab 3**: WordPress Admin — `http://store.local.test:8080/wp-admin` (logged in with `admin` / `admin_super_secure_password`).
  - **Tab 4 (Incognito / Second Window)**: Prepared for Member User B (`alex` / `alex123`).

### 4. Demo User Accounts Cheat-Sheet
| Role | Username | Password | Purpose in Demo |
| :--- | :--- | :--- | :--- |
| **Administrator (User A)** | `admin` | `admin123` | Server management, Chat Agent, RBAC, Store Provisioning |
| **Team Member (User B)** | `alex` | `alex123` | API key generation, external client tool loop, revocation test |
| **WooCommerce WP-Admin** | `admin` | `admin_super_secure_password` | Verifying created products and customer orders in store admin |

---

## Scene 1: Introduction, Architecture & Storefront Checkout

- **Target Duration**: 0:00 - 1:30
- **Assignment Requirements Covered**: System Design (`Page 7 #1`), Store Definition of Done (`Page 3 Store`).

### Visual Screen Choreography
1. **[SCREEN]**: Show terminal on right with `kubectl get pods -o wide`, and browser on left with the MCPilot Pitch Black login screen (`http://gateway.local.test:8080/`).
2. **[ACTION]**: Switch to Tab 2 (`http://store.local.test:8080/`). Browse the catalog, click a demo product (e.g. "Woo Album" or "Classic T-Shirt"), click **Add to Cart**, proceed to checkout.
3. **[ACTION]**: Fill in dummy name (e.g., "John Doe", "123 Main St"), select **Cash on Delivery**, and click **Place Order**. Show the "Order Received #..." confirmation screen.
4. **[ACTION]**: Switch to Tab 3 (WordPress Admin -> **WooCommerce > Orders**), refresh, and show the new order in "Processing" status.

### Spoken Narration Script
> *"Hello! Welcome to the technical walkthrough of **MCPilot** — an enterprise-grade Model Context Protocol Gateway and WooCommerce hosting platform built natively on Kubernetes.*
> 
> *MCPilot solves a fundamental challenge in enterprise AI: how to securely connect autonomous AI agents and team members to production tools and databases without leaking raw credentials, suffering tool name collisions, or risking upstream cascade failures.*
> 
> *As you can see in my terminal, the entire system is running inside a lightweight Kubernetes cluster. We have six isolated workloads: our WordPress and WooCommerce storefront, a stateful MariaDB cluster, three independent upstream MCP microservices — WooCommerce, Revenue Analytics, and Business Hours — and our unified MCPilot Gateway and React SPA dashboard.*
> 
> *First, let's verify our baseline store layer. Here on `store.local.test:8080`, we have a fully functional WooCommerce storefront. I'll add an item to the cart and check out using Cash on Delivery. As you can see, Order #82 is confirmed. Switching over to the WordPress admin portal, the order is immediately visible with its line items. Now, let's see how MCPilot exposes this store and other microservices to AI clients."*

### Codebase Deep-Dive References
- **Ingress Routing**: `helm/mcpilot/templates/ingress/gateway-ingress.yaml:L1-L40` & `store-ingress.yaml:L1-L35`
- **Storefront & Database Deployment**: `helm/mcpilot/templates/store/wordpress-deployment.yaml:L1-L75` and `mariadb-statefulset.yaml:L1-L85`
- **Pre-seeding Job**: `helm/mcpilot/templates/store/init-job.yaml:L45-L120` (Configures WooCommerce REST API keys, test products, Cash on Delivery automatically).

---

## Scene 2: Live Definition-of-Done with User A (Admin & Chat Agent)

- **Target Duration**: 1:30 - 3:00
- **Assignment Requirements Covered**: Chat Agent (`Page 7 #5`), Definition of Done User A (`Page 3 User A`).

### Visual Screen Choreography
1. **[ACTION]**: In Browser Tab 1 (`http://gateway.local.test:8080/`), log in as `admin` / `admin123`.
2. **[SCREEN]**: Show the **Servers & Tools** view. Point out the connected servers: `woocommerce`, `analytics`, `time`, and their live status (`Connected`).
3. **[ACTION]**: Click **Chat Agent** in the sidebar. Select your model (e.g. `llama3.2:latest` via Ollama or OpenRouter).
4. **[ACTION]**: Type prompt 1:
   ```text
   Create a new product named "Kubernetes Cloud Hoodie" with a price of 59.99 and description "Premium organic cotton hoodie".
   ```
5. **[SCREEN]**: Watch the Chat Agent stream. Highlight the tool call card: `woocommerce__create_product`, showing execution duration (e.g. `142ms`) and arguments.
6. **[ACTION]**: Switch to Storefront Tab 2 (`http://store.local.test:8080/shop`), refresh the page. Point out the newly created **Kubernetes Cloud Hoodie** live in the store!
7. **[ACTION]**: Click the hoodie, Add to Cart, place a quick COD order for it.
8. **[ACTION]**: Switch back to the Chat Agent and type prompt 2:
   ```text
   What orders came in today? Give me the customer name, items, and total.
   ```
9. **[SCREEN]**: Watch the agent execute `woocommerce__list_orders`, parse the JSON response, and present a formatted summary showing the exact order just placed.

### Spoken Narration Script
> *"Now let's log in as our first user, User A (Administrator). Here is the MCPilot Geist Dashboard. The Gateway automatically aggregates all connected upstream MCP servers into a unified catalog. Notice that every tool is namespaced with `{server_id}__{tool_name}` — for example, `woocommerce__list_products` and `analytics__get_revenue_summary`. This completely prevents naming collisions across multiple stores.*
> 
> *Let's test the User A Definition-of-Done flow using our built-in Chat Agent. I'll ask the agent: 'Create a new product named Kubernetes Cloud Hoodie with price 59.99'.*
> 
> *Notice what happened under the hood: the Gateway dynamically extracted the parameters, validated them against the Zod schema, dispatched the Streamable HTTP call to our internal `mcpilot-woocommerce-mcp` microservice, which authenticated via server-side WooCommerce REST API keys. The tool card displays the exact execution time — 142 milliseconds.*
> 
> *If I switch to our public storefront and refresh, the hoodie is live on the store! I'll place an order for it right now. Now, back in the Chat Agent, I'll ask: 'What orders came in today?'. The agent calls `woocommerce__list_orders` and instantly summarizes today's orders, including the hoodie we just ordered. Everything is executed live through the Gateway."*

### Codebase Deep-Dive References
- **Chat Agent Tool Loop**: `gateway/src/chat-agent.ts:L115-L260` (Handles LLM tool calling loop, history persistence, caller identity injection, and schema mapping).
- **WooCommerce Tool Handler**: `mcp-servers/woocommerce/src/tools.ts:L45-L115` (`create_product` & `list_orders` invoking WooCommerce REST API via Axios).
- **UI Markdown & Tool Execution Cards**: `dashboard/src/components/ChatAgent.tsx:L120-L280` & `MarkdownMessage.tsx:L1-L60`.

---

## Scene 3: User B (Team Member) & External Client Multi-Server Prompt

- **Target Duration**: 3:00 - 4:45
- **Assignment Requirements Covered**: Team & Access (`Page 4`), External Client User B (`Page 3 User B`), MCP Internals (`Page 7 #3`).

### Visual Screen Choreography
1. **[ACTION]**: Open Incognito / Second Browser Window, navigate to `http://gateway.local.test:8080/`, log in as member `alex` (`alex123`).
2. **[SCREEN]**: Point out that Alex has the `member` role badge. Show that the **Add Server** button is hidden or disabled for members.
3. **[ACTION]**: Click **API Keys** in the sidebar. Click **Generate API Key**, name it `"Alex Cursor Key"`, and click Create.
4. **[SCREEN]**: Show the modal revealing the secret key `mcp_live_...`. Click **Copy Key**.
5. **[ACTION]**: In Terminal, run the automated User B external client test:
   ```bash
   node scripts/verify-user-b.mjs
   ```
   *(Or connect via MCP Inspector / Cursor)*:
   ```bash
   npx @modelcontextprotocol/inspector http://gateway.local.test:8080/mcp --transport http --header "Authorization: Bearer <ALEX_KEY>"
   ```
6. **[SCREEN]**: Show the terminal output:
   - Connects to `POST /mcp` via Streamable HTTP.
   - Lists 11 federated tools.
   - Executes multi-server prompt combining `woocommerce__list_orders` and `time__calculate_delivery_window` or `analytics__get_revenue_summary`.

### Spoken Narration Script
> *"Now let's test User B — a regular team member named Alex. I've logged into Alex's account in this incognito window. Alex has the 'Member' role. Notice the principle of least privilege: Alex cannot register, edit, or delete upstream MCP servers. Most importantly, Alex never sees the WooCommerce API keys or MariaDB credentials.*
> 
> *Alex navigates to API Keys and generates a new token. The Gateway generates a high-entropy 32-byte secret prefixed with `mcp_live_`. Only the SHA-256 hash is stored in MariaDB.*
> 
> *Now, let's connect an external AI client using only this Gateway URL and Alex's key. I'll run our User B verification script, which uses the official `@modelcontextprotocol/sdk` to speak Streamable HTTP to `http://gateway.local.test:8080/mcp`.*
> 
> *Watch the terminal: the external client discovers all active tools across all three servers. Then it executes a multi-server prompt requiring coordination across two separate upstreams: it pulls today's store orders from the `woocommerce` server, and immediately queries the `time` server to calculate delivery cutoffs based on current warehouse business hours. Two independent microservices federated through a single endpoint with zero client-side credential configuration."*

### Codebase Deep-Dive References
- **Streamable HTTP Endpoint**: `gateway/src/server.ts:L120-L195` (`/mcp` route establishing Streamable HTTP session, validating auth, and dispatching JSON-RPC).
- **API Key Generation & Hashing**: `gateway/src/api-keys.ts:L20-L65` (`crypto.randomBytes(32)` + `crypto.createHash('sha256')`).
- **External Client Test Script**: `scripts/verify-user-b.mjs:L1-L125` (Implements official `@modelcontextprotocol/sdk` client, discovers tools, and runs multi-server pipeline).

---

## Scene 4: Team Control, Instant Revocation, Server Disabling & Fault Isolation

- **Target Duration**: 4:45 - 6:30
- **Assignment Requirements Covered**: Team & Control DoD (`Page 3`), Security Posture (`Page 7 #4`).

### Visual Screen Choreography
1. **[ACTION]**: In Alex's Dashboard window under **API Keys**, click **Revoke** on Alex's key. Confirm the native styled modal.
2. **[ACTION]**: Re-run the User B script in terminal:
   ```bash
   node scripts/verify-user-b.mjs
   ```
   Show terminal output: `HTTP 401 Unauthorized - Invalid or revoked API key`.
3. **[ACTION]**: Switch to Admin window. In **Servers & Tools**, find the `time` server and click **Disable**.
4. **[SCREEN]**: Show the badge change to `Disabled` (Gray). Show that the time tools disappear from the catalog.
5. **[ACTION]**: In Terminal, trigger the Fault Isolation test or scale down the WooCommerce MCP server:
   ```bash
   kubectl scale deployment mcpilot-woocommerce-mcp --replicas=0
   ```
6. **[SCREEN]**: Return to the Dashboard and click **Refresh** (or wait for the 10s health check). Show the `woocommerce` server card turn Red with status `Unreachable`.
7. **[ACTION]**: In Chat Agent or Terminal, execute a call to `time__get_current_time` or `analytics__get_revenue_summary`. Show that it executes **instantly in <50ms** with zero hang.
8. **[ACTION]**: Restore the pod: `kubectl scale deployment mcpilot-woocommerce-mcp --replicas=1`. Show the card auto self-heal to Green `Connected`.
9. **[ACTION]**: Click **Audit Logs** in the Dashboard sidebar. Filter by user `admin` and `alex`. Point out the recorded rows showing timestamp, caller username, tool name, arguments JSON, execution duration in ms, and status `SUCCESS` or `ERROR`.

### Spoken Narration Script
> *"Now let's demonstrate the team control and fault tolerance guarantees required by the assignment.*
> 
> *First: Instant Key Revocation. In Alex's dashboard, I click Revoke. Watch what happens when the external client tries to make another tool call: immediately rejected with HTTP 401 Unauthorized in under 15 milliseconds. Zero pod restarts, zero cached token latency.*
> 
> *Second: Server Disabling. As an admin, I can toggle any upstream server to Disabled. Its tools immediately vanish from both the dashboard chat agent and external MCP clients.*
> 
> *Third: Fault Isolation. What happens if an upstream server crashes or hangs? Let's simulate a catastrophic pod failure by scaling `mcpilot-woocommerce-mcp` to 0 replicas. Notice our dashboard health checker immediately isolates the failure and marks the card 'Unreachable'. But crucially: the Gateway's 5000ms circuit breaker ensures that calls to healthy upstreams like Analytics and Time continue executing sub-second with zero timeouts or thread blocking. Scaling the pod back up, the Gateway detects the recovery and self-heals back to Connected.*
> 
> *Finally, let's look at the Audit Log. Every single tool call — whether from the web chat agent or an external Cursor client — is permanently recorded in MariaDB with caller user ID, username, API key ID, arguments, millisecond duration, and HTTP status. Full accountability for every model action."*

### Codebase Deep-Dive References
- **Instant Revocation Middleware**: `gateway/src/auth.ts:L45-L95` (Checks SHA-256 hash in DB; rejects revoked keys with 401).
- **Circuit Breaker & Resilience**: `gateway/src/upstream-manager.ts:L110-L190` (5000ms timeout per call, isolates down servers).
- **Background Health Checker**: `gateway/src/upstream-manager.ts:L65-L105` (Pings upstreams every 10s, updates status).
- **Audit Logging Repository**: `gateway/src/audit.ts:L20-L80` (Asynchronous transactional logging to MariaDB `audit_logs`).

---

## Scene 5: Kubernetes Architecture Deep Dive

- **Target Duration**: 6:30 - 7:45
- **Assignment Requirements Covered**: Kubernetes (`Page 7 #2`), Mandatory Infra (`Page 3-4`).

### Visual Screen Choreography
1. **[SCREEN]**: Maximize Terminal. Run:
   ```bash
   kubectl get pods,svc,pvc,ingress -l app.kubernetes.io/name=mcpilot
   ```
2. **[ACTION]**: Highlight each section in terminal:
   - **Ingress**: Show `gateway.local.test` and `store.local.test` mapping to ports 80/8080.
   - **Services**: Show `mcpilot-woocommerce-mcp`, `analytics`, `time`, and `mariadb` are all `ClusterIP` with **no ExternalIPs or Ingress rules**.
   - **Persistent Volumes**: Show `mcpilot-wordpress-data` and `mcpilot-mariadb-0` bound PVCs.
3. **[ACTION]**: Show container security context and health probes:
   ```bash
   kubectl describe pod -l app.kubernetes.io/component=gateway | grep -E "Readiness|Liveness|Limits|Requests"
   ```

### Spoken Narration Script
> *"Let's examine how Kubernetes enforces these security and operational boundaries.*
> 
> *In our cluster output, notice the separation of concerns: only two services are exposed through Ingress — our WordPress Storefront and the MCPilot Gateway. All three upstream MCP microservices and MariaDB are strictly `ClusterIP` services. They have no Ingress paths and cannot be reached from outside the cluster, enforcing zero credential leakage by design.*
> 
> *For data durability, both WordPress and MariaDB use PersistentVolumeClaims backed by Kubernetes storage classes, ensuring store catalogs, orders, API keys, and audit logs persist across pod restarts and Helm upgrades.*
> 
> *Every deployment defines Kubernetes `readinessProbe` and `livenessProbe` checking HTTP `/health` endpoints, alongside strict CPU and Memory requests and limits. If a pod exhausts memory or hangs, Kubernetes automatically restarts it without human intervention."*

### Codebase Deep-Dive References
- **Unified Helm Chart**: `helm/mcpilot/Chart.yaml` & `helm/mcpilot/templates/`
- **ClusterIP Isolation**: `helm/mcpilot/templates/mcp-server/woocommerce-service.yaml:L15-L25`
- **Readiness & Liveness Probes**: `helm/mcpilot/templates/gateway/deployment.yaml:L45-L65`
- **NetworkPolicies**: `helm/mcpilot/templates/gateway/networkpolicy.yaml:L1-L45`

---

## Scene 6: MCP Protocol Internals & Request Lifecycle

- **Target Duration**: 7:45 - 8:45
- **Assignment Requirements Covered**: MCP Internals (`Page 7 #3`), Security Posture (`Page 7 #4`).

### Visual Screen Choreography
1. **[SCREEN]**: Open `README.md` Architecture Diagram or Mermaid diagram in VS Code / GitHub.
2. **[ACTION]**: Trace the request lifecycle path on screen:
   `AI Client -> Ingress -> Gateway Auth & Permissions -> Upstream Injection -> Upstream Server -> Store REST API -> Response Scrubbing -> Client`.
3. **[SCREEN]**: Open `gateway/src/security/ssrf-filter.ts` and `gateway/src/crypto.ts` in your editor to highlight security features.

### Spoken Narration Script
> *"Let's trace what happens when an AI client invokes a tool like `woocommerce__list_products`.*
> 
> *1. The client issues a standard JSON-RPC 2.0 `tools/call` request over Streamable HTTP to `/mcp` with their `mcp_live_...` bearer token.*
> *2. The Gateway authenticates the token hash and evaluates our fine-grained RBAC permissions matrix. If the user's role lacks permission, it immediately returns a 403 Forbidden without contacting the upstream.*
> *3. The Gateway strips the downstream client token to prevent token leakage, resolves the upstream server URL, and injects the server-side credentials — which are encrypted at rest with AES-256-GCM in MariaDB.*
> *4. The request hits the upstream MCP server over internal HTTP, which executes the WooCommerce REST API query against WordPress.*
> *5. The result is returned, scrubbed of internal transport headers, logged to MariaDB audit logs, and streamed back to the AI client.*
> 
> *Notice our defense-in-depth: what if an admin registers a malicious upstream URL? Our SSRF protection middleware validates every registered URL against DNS rebinding, private IP ranges (RFC 1918), loopback, and cloud metadata endpoints like `169.254.169.254`."*

### Codebase Deep-Dive References
- **Tool Aggregator**: `gateway/src/tool-aggregator.ts:L35-L115`
- **SSRF Protection Engine**: `gateway/src/security/ssrf-filter.ts:L1-L75`
- **AES-256-GCM Credential Encryption**: `gateway/src/crypto.ts:L1-L60`

---

## Scene 7: Production Transition, Helm Upgrades & Safe Rollbacks

- **Target Duration**: 8:45 - 9:45
- **Assignment Requirements Covered**: Local-to-VPS (`Page 7 #6`), Helm Upgrades & Rollback (`Page 7 #6`, `Page 6 #9`).

### Visual Screen Choreography
1. **[SCREEN]**: Split screen between `helm/mcpilot/values-local.yaml` and `helm/mcpilot/values-prod.yaml` in VS Code.
2. **[ACTION]**: Highlight the differences:
   - Ingress host and `cert-manager` Let's Encrypt TLS annotations.
   - Gateway replicas: `1` in local vs. `2` with rolling update strategy in production.
   - Resource limits and production storage classes.
3. **[ACTION]**: In Terminal, demonstrate a safe rollback command:
   ```bash
   helm history mcpilot
   ```
   Show release revision history.

### Spoken Narration Script
> *"A key requirement of the assignment is the transition from local development to production VPS or cloud. MCPilot achieves this cleanly through environment separation in Helm values files without modifying any template code.*
> 
> *Comparing `values-local.yaml` and `values-prod.yaml`:*
> *- Ingress shifts from local domain mapping to public FQDNs with automated Let's Encrypt TLS issued by `cert-manager`.*
> *- Storage shifts from `local-path` to cloud CSI block storage with volume snapshots.*
> *- High availability scales the Gateway to multiple replicas with rolling updates and PodDisruptionBudgets.*
> 
> *For upgrades and rollbacks, our Gateway readiness probes guarantee zero dropped calls during rolling deployments. And if a release introduces a defect, a single `helm rollback mcpilot <revision>` command restores the previous healthy release while preserving database state and audit logs."*

### Codebase Deep-Dive References
- **Local vs Prod Configuration**: `helm/mcpilot/values-local.yaml` vs. `values-prod.yaml`
- **Upgrade and Rollback Guide**: `docs/UPGRADES_AND_ROLLBACK.md:L1-L90`

---

## Scene 8: Stand-Out Bonus Walkthrough (Multi-Store Provisioning & Observability)

- **Target Duration**: 9:45 - 11:00
- **Assignment Requirements Covered**: Bonus Multi-Store (`Page 5`), Observability (`Page 6 #8`), Stand-Outs (`Page 6`).

### Visual Screen Choreography
1. **[ACTION]**: In the Admin Dashboard, click **Stores** in the sidebar.
2. **[SCREEN]**: Show the **Store Environments** view. Click **Create Store**. Enter Name `"Gadget Hub"` and Slug `"gadgets"`. Click **Provision Store**.
3. **[SCREEN]**: Watch the status pill transition from `Provisioning` to `Ready`.
4. **[ACTION]**: In Terminal, show the newly created Kubernetes namespace and workloads:
   ```bash
   kubectl get pods -n store-gadgets
   ```
5. **[SCREEN]**: Show that the Gateway automatically registers `store_gadgets__woocommerce__*` tools into the catalog.
6. **[ACTION]**: Click **Observability** in the Dashboard sidebar.
7. **[SCREEN]**: Showcase the live Prometheus charts: Total Tool Calls, Error Rate Gauge, and p50, p95, p99 latency percentiles. Click the **Trace Drawer** on a recent call to inspect payload timing.

### Spoken Narration Script
> *"Finally, let's look at the assignment Bonus: Multi-Store Dynamic Provisioning.*
> 
> *In our Stores tab, an admin can provision completely independent store environments on demand. When I click 'Provision Store', MCPilot talks to the Kubernetes API to generate a dedicated namespace — `store-gadgets` — with its own MariaDB StatefulSet, WordPress deployment, NetworkPolicy isolation, and ResourceQuotas.*
> 
> *Once provisioned, the Gateway dynamically mounts the store's MCP server with store-namespaced tools like `store_gadgets__woocommerce__list_products`. Deleting a store cleanly tears down its namespace, volumes, and gateway routes without touching other stores.*
> 
> *And under Observability, our native Prometheus telemetry pipeline tracks invocation rates, error percentages, and latency percentiles across every upstream server, with deep trace inspection for rapid diagnostics.*
> 
> *Thank you for watching! All verification suites, threat model documentation, and Helm charts are available in the repository."*

### Codebase Deep-Dive References
- **Multi-Store Provisioner**: `gateway/src/provisioning/store-provisioner.ts:L35-L160`
- **Store Kubernetes Templates**: `gateway/src/provisioning/store-templates.ts:L15-L250`
- **Observability Telemetry Engine**: `gateway/src/observability/metrics.ts:L25-L110` & `ObservabilityView.tsx:L1-L150`

---

## Summary of Reference Files by Topic

| Topic | File Path | Line Range |
| :--- | :--- | :--- |
| **Streamable HTTP Gateway & Tool Aggregation** | `gateway/src/server.ts`<br/>`gateway/src/tool-aggregator.ts` | `L120-L195`<br/>`L35-L115` |
| **Custom WooCommerce MCP Server** | `mcp-servers/woocommerce/src/tools.ts`<br/>`mcp-servers/woocommerce/src/server.ts` | `L45-L160`<br/>`L20-L75` |
| **Chat Agent LLM Tool Loop & System Prompts** | `gateway/src/chat-agent.ts`<br/>`dashboard/src/components/ChatAgent.tsx` | `L115-L260`<br/>`L120-L280` |
| **API Key SHA-256 Hashing & Instant Revocation** | `gateway/src/api-keys.ts`<br/>`gateway/src/auth.ts` | `L20-L65`<br/>`L45-L95` |
| **Fault Isolation & Upstream Circuit Breakers** | `gateway/src/upstream-manager.ts` | `L65-L190` |
| **Threat Model & Security Mitigations** | `docs/THREAT_MODEL.md`<br/>`gateway/src/security/ssrf-filter.ts`<br/>`gateway/src/crypto.ts` | `L1-L135`<br/>`L1-L75`<br/>`L1-L60` |
| **Dynamic Multi-Store Provisioning (Bonus)** | `gateway/src/provisioning/store-provisioner.ts`<br/>`gateway/src/provisioning/store-templates.ts` | `L35-L160`<br/>`L15-L250` |
| **Prometheus Metrics & Observability** | `gateway/src/observability/metrics.ts`<br/>`dashboard/src/components/ObservabilityView.tsx` | `L25-L110`<br/>`L1-L150` |
| **Unified Helm Charts & Values** | `helm/mcpilot/templates/`<br/>`helm/mcpilot/values-local.yaml`<br/>`helm/mcpilot/values-prod.yaml` | All files |
| **Automated Verification Suites** | `scripts/verify-all.mjs`<br/>`scripts/verify-user-a.mjs`<br/>`scripts/verify-user-b.mjs`<br/>`scripts/verify-fault-isolation.mjs`<br/>`scripts/verify-role-matrix.mjs` | All scripts |
