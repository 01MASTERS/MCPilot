import fs from "node:fs";
import https from "node:https";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { generateStoreManifests } from "./store-templates.js";
import {
  createStoreRecord,
  getStoreRecord,
  updateStoreStatus,
  deleteStoreRecord,
  getDbPool,
} from "../db.js";

const execAsync = promisify(exec);

export class StoreProvisioner {
  private isK8sPod: boolean;
  private saToken: string = "";
  private saCa: Buffer | null = null;
  private k8sHost: string = "kubernetes.default.svc";
  private k8sPort: string = "443";
  private httpsAgent: https.Agent | null = null;

  constructor() {
    const tokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token";
    const caPath = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";

    if (fs.existsSync(tokenPath) && fs.existsSync(caPath)) {
      this.isK8sPod = true;
      this.saToken = fs.readFileSync(tokenPath, "utf-8").trim();
      this.saCa = fs.readFileSync(caPath);
      this.k8sHost = process.env.KUBERNETES_SERVICE_HOST || "kubernetes.default.svc";
      this.k8sPort = process.env.KUBERNETES_SERVICE_PORT || "443";
      this.httpsAgent = new https.Agent({
        ca: this.saCa,
        rejectUnauthorized: true,
      });
      console.log(`[store-provisioner] In-cluster K8s credentials loaded (${this.k8sHost}:${this.k8sPort}).`);
    } else {
      this.isK8sPod = false;
      console.log("[store-provisioner] Running outside Kubernetes cluster; falling back to kubectl CLI.");
    }
  }

  /**
   * Apply a raw Kubernetes manifest JSON via K8s API or kubectl
   */
  async applyManifest(manifest: any): Promise<void> {
    const jsonStr = JSON.stringify(manifest);

    if (this.isK8sPod) {
      const kind = manifest.kind;
      const apiVersion = manifest.apiVersion;
      const name = manifest.metadata.name;
      const namespace = manifest.metadata.namespace;

      let basePath = "";
      if (apiVersion === "v1") {
        basePath = namespace ? `/api/v1/namespaces/${namespace}` : `/api/v1`;
      } else {
        basePath = namespace ? `/apis/${apiVersion}/namespaces/${namespace}` : `/apis/${apiVersion}`;
      }

      const plural = this.getPluralForKind(kind);
      const url = `https://${this.k8sHost}:${this.k8sPort}${basePath}/${plural}`;

      try {
        await this.k8sRequest(url, "POST", manifest);
      } catch (err: any) {
        // If resource already exists (HTTP 409), attempt PUT / update
        if (err.message && err.message.includes("409")) {
          const updateUrl = `${url}/${name}`;
          await this.k8sRequest(updateUrl, "PUT", manifest).catch(() => {});
        } else {
          throw err;
        }
      }
    } else {
      // Local fallback using kubectl
      await new Promise<void>((resolve, reject) => {
        const child = spawn("kubectl", ["apply", "-f", "-"], { stdio: ["pipe", "pipe", "pipe"], shell: true });
        child.stdin.write(jsonStr);
        child.stdin.end();
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`kubectl apply exited with code ${code}`));
        });
        child.on("error", reject);
      });
    }
  }

  /**
   * Delete a Kubernetes namespace (cascading all child resources)
   */
  async deleteNamespace(namespace: string): Promise<void> {
    if (this.isK8sPod) {
      const url = `https://${this.k8sHost}:${this.k8sPort}/api/v1/namespaces/${namespace}`;
      await this.k8sRequest(url, "DELETE").catch((err) => {
        console.warn(`[store-provisioner] Warning deleting namespace ${namespace}:`, err.message);
      });
    } else {
      await execAsync(`kubectl delete namespace ${namespace} --wait=false --ignore-not-found=true`).catch(() => {});
    }
  }

  /**
   * Asynchronously provision an isolated WooCommerce store environment
   */
  async startProvisioning(storeId: string, slug: string, name: string, createdBy: string): Promise<void> {
    const namespace = `store-${slug}`;
    const ingressHost = `${slug}.local.test`;

    try {
      console.log(`[store-provisioner] Starting provisioning for store '${name}' (${namespace})...`);

      // 1. Generate high-entropy credentials
      const mariadbRootPassword = randomBytes(16).toString("hex");
      const mariadbPassword = randomBytes(16).toString("hex");
      const wpAdminPassword = randomBytes(16).toString("hex");
      const wcConsumerKey = `ck_${randomBytes(20).toString("hex")}`;
      const wcConsumerSecret = `cs_${randomBytes(20).toString("hex")}`;

      // 2. Generate manifests
      const manifests = generateStoreManifests({
        slug,
        name,
        namespace,
        ingressHost,
        mariadbRootPassword,
        mariadbPassword,
        wpAdminPassword,
        wcConsumerKey,
        wcConsumerSecret,
      });

      // 3. Apply manifests in dependency order
      console.log(`[store-provisioner] Applying namespace and isolation policies for ${namespace}...`);
      await this.applyManifest(manifests.namespace);
      await this.applyManifest(manifests.resourceQuota);
      await this.applyManifest(manifests.limitRange);
      await this.applyManifest(manifests.networkPolicy);
      await this.applyManifest(manifests.secret);

      console.log(`[store-provisioner] Applying workloads for ${namespace}...`);
      await this.applyManifest(manifests.mariadbService);
      await this.applyManifest(manifests.mariadbStatefulSet);
      await this.applyManifest(manifests.wordpressPvc);
      await this.applyManifest(manifests.wordpressService);
      await this.applyManifest(manifests.wordpressDeployment);
      await this.applyManifest(manifests.ingress);
      await this.applyManifest(manifests.mcpService);
      await this.applyManifest(manifests.mcpDeployment);

      // 4. Poll MCP server readiness in background with 5-minute timeout (BONUS-06)
      this.reconcileReadinessInBackground(storeId, slug, name, namespace);
    } catch (err: any) {
      console.error(`[store-provisioner] Error provisioning store '${slug}':`, err);
      await updateStoreStatus(storeId, "failed", err.message || String(err));
    }
  }

  /**
   * Background reconciliation checking pod readiness and auto-registering in Gateway
   */
  private async reconcileReadinessInBackground(
    storeId: string,
    slug: string,
    name: string,
    namespace: string
  ): Promise<void> {
    const startTime = Date.now();
    const timeoutMs = 5 * 60 * 1000; // 5 minutes

    const pollInterval = setInterval(async () => {
      try {
        if (Date.now() - startTime > timeoutMs) {
          clearInterval(pollInterval);
          console.error(`[store-provisioner] Provisioning timeout exceeded for ${slug}.`);
          await updateStoreStatus(storeId, "failed", "Provisioning timed out after 5 minutes.");
          return;
        }

        const isReady = await this.checkMcpServerReady(namespace);
        if (isReady) {
          clearInterval(pollInterval);
          console.log(`[store-provisioner] Store '${slug}' workloads ready. Auto-registering MCP server...`);

          // Register in Gateway mcp_servers table (BONUS-03)
          const db = getDbPool();
          const serverId = `store_${slug}`;
          const baseUrl = `http://mcpilot-woocommerce-mcp.${namespace}.svc.cluster.local:3000/mcp`;

          await db.query(
            `INSERT INTO mcp_servers (id, name, base_url, status, enabled)
             VALUES (?, ?, ?, 'Connected', TRUE)
             ON DUPLICATE KEY UPDATE base_url = VALUES(base_url), status = 'Connected', enabled = TRUE`,
            [serverId, `Store: ${name}`, baseUrl]
          );

          await updateStoreStatus(storeId, "ready", null);
          console.log(`[store-provisioner] Store '${slug}' is READY and connected to Gateway.`);
        }
      } catch (err: any) {
        console.warn(`[store-provisioner] Poll check error for ${slug}:`, err.message);
      }
    }, 5000);
  }

  /**
   * Check if the WooCommerce MCP Server pod in the target namespace is ready
   */
  private async checkMcpServerReady(namespace: string): Promise<boolean> {
    try {
      if (this.isK8sPod) {
        // Direct ping to cluster service
        const url = `http://mcpilot-woocommerce-mcp.${namespace}.svc.cluster.local:3000/healthz`;
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        return res.ok;
      } else {
        const { stdout } = await execAsync(
          `kubectl get pods -n ${namespace} -l app.kubernetes.io/component=woocommerce-mcp -o json`
        );
        const data = JSON.parse(stdout);
        const pods = data.items || [];
        if (pods.length === 0) return false;
        const pod = pods[0];
        const readyCondition = pod.status?.conditions?.find((c: any) => c.type === "Ready");
        return readyCondition?.status === "True";
      }
    } catch {
      return false;
    }
  }

  /**
   * Teardown store: unregister from Gateway and delete K8s namespace (BONUS-04)
   */
  async teardownStore(storeId: string): Promise<void> {
    const store = await getStoreRecord(storeId);
    if (!store) return;

    await updateStoreStatus(storeId, "deleting");

    // 1. Unregister from Gateway mcp_servers table immediately
    const db = getDbPool();
    const serverId = `store_${store.slug}`;
    await db.query("DELETE FROM mcp_servers WHERE id = ?", [serverId]).catch(() => {});

    // 2. Delete the Kubernetes namespace (cascades all resources)
    await this.deleteNamespace(store.namespace);

    // 3. Mark store as deleted
    await deleteStoreRecord(storeId);
    console.log(`[store-provisioner] Store '${store.slug}' cleanly deleted.`);
  }

  private async k8sRequest(url: string, method: string, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const options: https.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: method,
        agent: this.httpsAgent || undefined,
        headers: {
          Authorization: `Bearer ${this.saToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      };

      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch {
              resolve({});
            }
          } else {
            reject(new Error(`K8s API HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (err) => reject(err));
      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  private getPluralForKind(kind: string): string {
    const map: Record<string, string> = {
      Namespace: "namespaces",
      ResourceQuota: "resourcequotas",
      LimitRange: "limitranges",
      NetworkPolicy: "networkpolicies",
      Secret: "secrets",
      Service: "services",
      StatefulSet: "statefulsets",
      Deployment: "deployments",
      PersistentVolumeClaim: "persistentvolumeclaims",
      Ingress: "ingresses",
      Pod: "pods",
    };
    return map[kind] || `${kind.toLowerCase()}s`;
  }
}

export const storeProvisioner = new StoreProvisioner();
