# MCPilot: Helm Upgrades & Safe Rollback Guide

This guide details the operational procedures for performing zero-downtime rolling upgrades and safe, deterministic rollbacks for the MCPilot platform using Helm on Kubernetes, satisfying **Assignment Page 7 & 8** requirements.

---

## 1. Upgrades Overview & Zero-Downtime Architecture

MCPilot is designed with high availability and Kubernetes rolling updates in mind:
- **RollingUpdate Strategy**: Workloads (Gateway, WooCommerce MCP, Analytics MCP, Time MCP) use Kubernetes `RollingUpdate` with `maxSurge: 1` and `maxUnavailable: 0` (or `25%`), ensuring new pods are completely initialized and pass readiness probes before old pods are terminated.
- **Readiness Probes**: Traefik and Kubernetes services do not route ingress traffic to new pods until `/healthz` or HTTP ping probes return HTTP 200.
- **Decoupled Workloads**: The Gateway, upstream MCP microservices, and WordPress store are deployed as independent pods, allowing individual components to be upgraded without restarting unaffected services.

---

## 2. Step-by-Step Production Upgrade Procedure

### Step 1: Pre-Upgrade Verification
Ensure current cluster health and inspect the existing release:
```bash
# Check current pod states
kubectl get pods -A

# Check existing Helm release revision
helm list -n default
helm history mcpilot -n default
```

### Step 2: Dry-Run and Diff Verification
Always validate templates and verify the proposed diff before applying to a production cluster:
```bash
# Render templates locally to verify manifest syntax
helm template mcpilot ./helm/mcpilot -f ./helm/mcpilot/values-prod.yaml --set gateway.image.tag=v1.1.0

# Optional: use helm-diff plugin if installed
helm diff upgrade mcpilot ./helm/mcpilot -f ./helm/mcpilot/values-prod.yaml --set gateway.image.tag=v1.1.0
```

### Step 3: Execute the Upgrade
Apply the upgrade using Helm:
```bash
helm upgrade mcpilot ./helm/mcpilot \
  -f ./helm/mcpilot/values-prod.yaml \
  --set gateway.image.tag=v1.1.0 \
  --atomic \
  --timeout 5m
```
> **Tip:** The `--atomic` flag automatically triggers a safe rollback if any new pod fails readiness probes or crashes during rollout.

### Step 4: Monitor Rollout Progress
Track the rolling update in real time:
```bash
# Watch Gateway rolling update
kubectl rollout status deployment/mcpilot-gateway -w

# Watch upstream MCP servers rolling update
kubectl rollout status deployment/mcpilot-woocommerce-mcp -w
kubectl rollout status deployment/mcpilot-analytics-mcp -w
```

### Step 5: Post-Upgrade Automated Smoke Test
Run the automated verification suite to confirm that tool routing, authentication, and store connections remain 100% operational:
```bash
npm run verify:all
```

---

## 3. Safe Rollback Procedure

If an upgrade introduces an unexpected regression or an upstream service fails to initialize, execute a rollback to the previous known-good revision.

### Step 1: Inspect Release History
Find the previous stable revision number:
```bash
helm history mcpilot
```
*Example Output:*
```
REVISION  UPDATED                   STATUS      CHART          APP VERSION  DESCRIPTION
1         Mon Oct 12 10:00:00 2026  superseded  mcpilot-0.1.0  1.0.0        Install complete
2         Wed Oct 14 14:30:00 2026  superseded  mcpilot-0.1.0  1.0.0        Upgrade values
3         Fri Oct 16 09:15:00 2026  deployed    mcpilot-0.1.0  1.1.0        Upgrade to v1.1.0
```

### Step 2: Execute Safe Helm Rollback
Roll back to Revision 2:
```bash
helm rollback mcpilot 2 --timeout 5m --wait
```

### Step 3: Monitor Rollback Status
Verify that Kubernetes rolls back pods to the previous container image and configuration:
```bash
kubectl rollout status deployment/mcpilot-gateway
kubectl rollout status deployment/mcpilot-woocommerce-mcp
```

### Step 4: Verify Post-Rollback Health
```bash
# Verify healthz endpoint
curl -s http://gateway.local.test:8080/healthz

# Run quick verification
node scripts/verify-user-b.mjs
```

---

## 4. State & Database Compatibility Considerations During Rollbacks

Rolling back stateless containers is safe and instantaneous; however, stateful workloads (MariaDB, WordPress uploads) require operational care:

1. **Additive Schema Migrations**:
   - Database migrations in `gateway/src/db.ts` must always be backwards-compatible (expand-and-contract pattern).
   - Add new columns with default values (`ALTER TABLE users ADD COLUMN IF NOT EXISTS ...`); never drop columns or rename existing tables within an upgrade that might need to be rolled back.
2. **PersistentVolume Claims (PVCs)**:
   - Helm rollbacks **do not delete or mutate PVCs**. Data stored in MariaDB (`/var/lib/mysql`) and WordPress (`wp-content/uploads`) remains intact and unmodified during a `helm rollback`.
3. **Database Backups Before Major Migrations**:
   - Before executing breaking schema changes or major WordPress version bumps, create an instant snapshot:
   ```bash
   kubectl exec -it mcpilot-mariadb-0 -- mariadb-dump -u root -p"$ROOT_PASS" --all-databases > pre-upgrade-backup.sql
   ```
