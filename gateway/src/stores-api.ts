import { Router, Request, Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireAuth } from "./auth.js";
import {
  listStoreRecords,
  getStoreRecord,
  getStoreRecordBySlug,
  createStoreRecord,
  countActiveStoresByUser,
  updateStoreStatus,
  StoreRecord,
} from "./db.js";
import { storeProvisioner } from "./provisioning/store-provisioner.js";
import { ToolAggregator } from "./tool-aggregator.js";

const CreateStoreSchema = z.object({
  name: z.string().min(2, "Store name must be at least 2 characters").max(64),
  slug: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Slug must be lowercase alphanumeric with hyphens")
    .optional(),
});

export function createStoresRouter(toolAggregator: ToolAggregator): Router {
  const router = Router();

  /**
   * GET /api/stores
   * Lists all store environments with status, Ingress URL, and exposed tools count (BONUS-01)
   */
  router.get("/", requireAuth, async (_req: Request, res: Response) => {
    try {
      const stores = await listStoreRecords();

      // Proactively reconcile any stores currently marked 'provisioning'
      for (const s of stores) {
        if (s.status === "provisioning") {
          await storeProvisioner.reconcileStoreStatus(s).catch(() => {});
        }
      }

      // Retrieve aggregated tools to count tools per store
      let allTools: any[] = [];
      try {
        allTools = await toolAggregator.getAllNamespacedTools();
      } catch {
        allTools = [];
      }

      const enrichedStores = stores.map((s) => {
        const prefix = `store_${s.slug}__`;
        const storeTools = allTools.filter((t) => t.name.startsWith(prefix));

        return {
          id: s.id,
          name: s.name,
          slug: s.slug,
          namespace: s.namespace,
          ingressHost: s.ingress_host,
          url: `http://${s.slug}.127.0.0.1.nip.io:8080/`,
          localTestUrl: `http://${s.ingress_host}:8080/`,
          status: s.status,
          createdBy: s.created_by,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
          errorMessage: s.error_message,
          toolCount: storeTools.length,
        };
      });

      res.status(200).json({
        stores: enrichedStores,
        quota: {
          maxStoresPerUser: 3,
        },
      });
    } catch (err: any) {
      console.error("[stores-api] Error listing stores:", err);
      res.status(500).json({ error: "Failed to list store environments" });
    }
  });

  /**
   * POST /api/stores
   * Initiates asynchronous provisioning of a new store in its own namespace (BONUS-01, BONUS-02, BONUS-06)
   */
  router.post("/", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const parsed = CreateStoreSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid store data", details: parsed.error.format() });
        return;
      }

      const { name } = parsed.data;
      const slug =
        parsed.data.slug ||
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");

      const userId = req.user?.userId || "unknown";

      // 1. Guardrail check: max 3 active stores per user (BONUS-06)
      const userStoreCount = await countActiveStoresByUser(userId);
      if (userStoreCount >= 3) {
        res.status(403).json({
          error: "Store quota exceeded: Maximum of 3 active store environments allowed per user.",
        });
        return;
      }

      // 2. Check for duplicate slug
      const existing = await getStoreRecordBySlug(slug);
      if (existing) {
        if (existing.status === "failed") {
          // Allow safe retry: cleanup failed store first
          await storeProvisioner.teardownStore(existing.id);
        } else {
          res.status(409).json({
            error: `A store with slug '${slug}' already exists (status: ${existing.status}). Choose a unique name or slug.`,
          });
          return;
        }
      }

      const storeId = randomUUID();
      const namespace = `store-${slug}`;
      const ingressHost = `${slug}.local.test`;

      // 3. Create store record in DB
      await createStoreRecord({
        id: storeId,
        name,
        slug,
        namespace,
        ingress_host: ingressHost,
        status: "provisioning",
        created_by: userId,
      });

      // 4. Trigger asynchronous background provisioning (BONUS-01, BONUS-02)
      storeProvisioner.startProvisioning(storeId, slug, name, userId);

      res.status(202).json({
        message: `Store provisioning initiated for '${name}' in namespace '${namespace}'.`,
        store: {
          id: storeId,
          name,
          slug,
          namespace,
          ingressHost,
          url: `http://${ingressHost}:8080/`,
          status: "provisioning",
          createdBy: userId,
        },
      });
    } catch (err: any) {
      console.error("[stores-api] Error initiating store provisioning:", err);
      res.status(500).json({ error: "Failed to initiate store provisioning" });
    }
  });

  /**
   * DELETE /api/stores/:id
   * Cascading teardown of store environment: removes MCP registration and deletes K8s namespace (BONUS-04)
   */
  router.delete("/:id", requireAuth, async (req: Request, res: Response): Promise<void> => {
    try {
      const storeId = String(req.params.id);
      const store = await getStoreRecord(storeId);

      if (!store) {
        res.status(404).json({ error: "Store not found" });
        return;
      }

      // Check permission: admin or creator
      if (req.user?.role !== "admin" && req.user?.userId !== store.created_by) {
        res.status(403).json({ error: "Forbidden: You do not have permission to delete this store." });
        return;
      }

      // Trigger cascading teardown
      await storeProvisioner.teardownStore(storeId);
      toolAggregator.invalidateCache();

      res.status(200).json({
        message: `Store '${store.name}' (${store.namespace}) teardown initiated. Namespace and MCP registration removed.`,
      });
    } catch (err: any) {
      console.error("[stores-api] Error deleting store:", err);
      res.status(500).json({ error: "Failed to delete store environment" });
    }
  });

  return router;
}
