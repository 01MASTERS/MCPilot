import React, { useState, useEffect } from "react";
import {
  Storefront,
  Plus,
  Trash,
  ArrowSquareOut,
  Spinner,
  CheckCircle,
  WarningCircle,
  XCircle,
  ShieldCheck,
  Cpu,
  ArrowsClockwise,
  X,
} from "@phosphor-icons/react";
import type { StoreEnvironment, User } from "../types";
import { getStores, provisionStore, deleteStore } from "../services/api";
import { ConfirmModal } from "./ConfirmModal";

interface StoresViewProps {
  currentUser: User;
}

export const StoresView: React.FC<StoresViewProps> = ({ currentUser }) => {
  const [stores, setStores] = useState<StoreEnvironment[]>([]);
  const [maxQuota, setMaxQuota] = useState<number>(3);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Modal states
  const [isProvisionOpen, setIsProvisionOpen] = useState<boolean>(false);
  const [provisionName, setProvisionName] = useState<string>("");
  const [provisionSlug, setProvisionSlug] = useState<string>("");
  const [provisionLoading, setProvisionLoading] = useState<boolean>(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  // Delete modal state
  const [storeToDelete, setStoreToDelete] = useState<StoreEnvironment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<boolean>(false);

  const fetchStores = async () => {
    try {
      const res = await getStores();
      setStores(res.stores || []);
      if (res.quota?.maxStoresPerUser) {
        setMaxQuota(res.quota.maxStoresPerUser);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load store environments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  // Background polling every 3 seconds while any store is provisioning or deleting
  useEffect(() => {
    const hasPending = stores.some((s) => s.status === "provisioning" || s.status === "deleting");
    if (!hasPending) return;

    const interval = setInterval(() => {
      fetchStores();
    }, 3000);

    return () => clearInterval(interval);
  }, [stores]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setProvisionName(name);
    // Auto-generate slug from name if user hasn't explicitly customized slug
    const derived = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    setProvisionSlug(derived);
  };

  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provisionName.trim()) {
      setProvisionError("Store name is required.");
      return;
    }

    setProvisionLoading(true);
    setProvisionError(null);

    try {
      const res = await provisionStore({
        name: provisionName.trim(),
        slug: provisionSlug.trim() || undefined,
      });

      setIsProvisionOpen(false);
      setProvisionName("");
      setProvisionSlug("");
      setSuccessNotice(res.message || "Store provisioning initiated.");
      fetchStores();
    } catch (err: any) {
      setProvisionError(err.message || "Failed to provision store");
    } finally {
      setProvisionLoading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!storeToDelete) return;
    setDeleteLoading(true);

    try {
      const res = await deleteStore(storeToDelete.id);
      setStoreToDelete(null);
      setSuccessNotice(res.message || "Store teardown initiated.");
      fetchStores();
    } catch (err: any) {
      setError(err.message || "Failed to delete store");
      setStoreToDelete(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  const activeCount = stores.filter((s) => s.status !== "failed").length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#222222] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-[#EDEDED] flex items-center gap-2">
              <Storefront size={24} className="text-[#00DF8F]" weight="bold" />
              Store Environments
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono border bg-[#111111] text-[#888888] border-[#222222]">
              Quota: {activeCount} / {maxQuota}
            </span>
          </div>
          <p className="text-xs text-[#888888] mt-1.5 leading-relaxed max-w-2xl">
            Autonomous multi-store provisioning on Kubernetes. Each store environment runs in an isolated namespace
            with its own MariaDB instance, WordPress deployment, NetworkPolicy isolation, and dedicated WooCommerce MCP server.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setLoading(true);
              fetchStores();
            }}
            className="geist-button-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
            title="Refresh store status"
          >
            <ArrowsClockwise size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => {
              setProvisionError(null);
              setIsProvisionOpen(true);
            }}
            disabled={activeCount >= maxQuota}
            className={`text-xs px-3.5 py-1.5 rounded font-medium flex items-center gap-1.5 transition-colors ${
              activeCount >= maxQuota
                ? "bg-[#222222] text-[#666666] cursor-not-allowed border border-[#333333]"
                : "bg-[#00DF8F] hover:bg-[#00BF7A] text-black font-semibold shadow-lg shadow-[#00DF8F]/10 border border-[#00DF8F]"
            }`}
          >
            <Plus size={14} weight="bold" />
            <span>Provision Store</span>
          </button>
        </div>
      </div>

      {/* Notifications / Banners */}
      {successNotice && (
        <div className="p-3 bg-emerald-950/20 border border-[#00DF8F]/30 rounded-md text-xs text-[#00DF8F] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} weight="bold" />
            <span>{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice(null)} className="text-[#888888] hover:text-[#EDEDED]">
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-950/20 border border-[#EE0000]/30 rounded-md text-xs text-[#EE0000] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WarningCircle size={16} weight="bold" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[#888888] hover:text-[#EDEDED]">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && stores.length === 0 && (
        <div className="p-12 border border-[#222222] rounded-lg bg-[#0A0A0A] text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#111111] border border-[#222222] mx-auto flex items-center justify-center text-[#888888]">
            <Storefront size={24} />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#EDEDED]">No Store Environments Provisioned</h3>
            <p className="text-xs text-[#888888] mt-1 max-w-md mx-auto">
              Provision a new isolated store environment to automatically deploy WooCommerce, MariaDB, and a dedicated MCP server into Kubernetes.
            </p>
          </div>
          <button
            onClick={() => setIsProvisionOpen(true)}
            className="geist-button-primary text-xs inline-flex items-center gap-1.5 py-1.5 px-3.5"
          >
            <Plus size={14} weight="bold" />
            <span>Provision First Store</span>
          </button>
        </div>
      )}

      {/* Stores Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.map((s) => {
          const isReady = s.status === "ready";
          const isProvisioning = s.status === "provisioning";
          const isFailed = s.status === "failed";
          const isDeleting = s.status === "deleting";

          return (
            <div
              key={s.id}
              className="bg-[#0A0A0A] border border-[#222222] hover:border-[#333333] transition-all rounded-lg p-5 flex flex-col justify-between space-y-4 relative group"
            >
              <div className="space-y-3">
                {/* Title & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[#EDEDED] flex items-center gap-2">
                      {s.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-[11px] text-[#666666] bg-[#111111] px-1.5 py-0.5 rounded border border-[#1A1A1A]">
                        {s.namespace}
                      </span>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {isReady && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/40 text-[#00DF8F] border border-[#00DF8F]/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00DF8F]" />
                        Ready
                      </span>
                    )}

                    {isProvisioning && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/40 text-[#F5A623] border border-[#F5A623]/30 animate-pulse">
                        <Spinner size={12} className="animate-spin" />
                        Provisioning
                      </span>
                    )}

                    {isDeleting && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-950/40 text-[#EE0000] border border-[#EE0000]/30 animate-pulse">
                        <Spinner size={12} className="animate-spin" />
                        Tearing down
                      </span>
                    )}

                    {isFailed && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-950/40 text-[#EE0000] border border-[#EE0000]/30">
                        <XCircle size={12} weight="bold" />
                        Failed
                      </span>
                    )}
                  </div>
                </div>

                {/* Metadata & Ingress URL */}
                <div className="space-y-2 pt-2 border-t border-[#161616] text-xs">
                  <div>
                    <span className="text-[#666666] block text-[10px] uppercase font-mono tracking-wider">Ingress Host</span>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#00DF8F] hover:underline font-mono text-xs flex items-center gap-1 mt-0.5"
                    >
                      <span>{s.ingressHost}:8080</span>
                      <ArrowSquareOut size={12} />
                    </a>
                  </div>

                  <div className="flex items-center justify-between text-[#888888] pt-1">
                    <span className="flex items-center gap-1 text-[11px]">
                      <Cpu size={13} className="text-[#666666]" />
                      <span>Exposed Tools:</span>
                    </span>
                    <span className="font-mono text-[11px] text-[#EDEDED] bg-[#111111] px-1.5 py-0.2 rounded border border-[#222222]">
                      {s.toolCount} tools
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[#888888]">
                    <span className="flex items-center gap-1 text-[11px]">
                      <ShieldCheck size={13} className="text-[#00DF8F]" />
                      <span>Network Isolation:</span>
                    </span>
                    <span className="text-[11px] text-[#00DF8F]">Enforced</span>
                  </div>

                  {s.errorMessage && (
                    <div className="p-2 bg-red-950/30 border border-[#EE0000]/30 rounded text-[11px] text-[#EE0000] leading-snug">
                      {s.errorMessage}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-[#161616] flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="geist-button-secondary text-[11px] py-1 px-2.5 flex items-center gap-1"
                  >
                    <span>Storefront</span>
                    <ArrowSquareOut size={11} />
                  </a>

                  <a
                    href={`${s.url}wp-admin/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="geist-button-secondary text-[11px] py-1 px-2.5 flex items-center gap-1 text-[#888888]"
                  >
                    <span>WP Admin</span>
                  </a>
                </div>

                <button
                  onClick={() => setStoreToDelete(s)}
                  disabled={isDeleting}
                  className="p-1.5 rounded text-[#666666] hover:text-[#EE0000] hover:bg-red-950/20 transition-colors"
                  title="Delete Store Environment"
                >
                  <Trash size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Provision Store Modal */}
      {isProvisionOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="bg-[#0A0A0A] border border-[#222222] rounded-lg max-w-lg w-full p-6 shadow-2xl relative text-left space-y-5">
            <button
              onClick={() => setIsProvisionOpen(false)}
              className="absolute top-4 right-4 text-[#666666] hover:text-[#EDEDED] transition-colors p-1 rounded"
              aria-label="Close dialog"
            >
              <X size={16} />
            </button>

            <div>
              <h2 className="text-sm font-semibold text-[#EDEDED] flex items-center gap-2">
                <Storefront size={18} className="text-[#00DF8F]" weight="bold" />
                Provision New Store Environment
              </h2>
              <p className="text-xs text-[#888888] mt-1 leading-relaxed">
                Spins up an isolated WooCommerce environment in its own Kubernetes namespace with dedicated MariaDB, LimitRange, ResourceQuota, and WooCommerce MCP server.
              </p>
            </div>

            {provisionError && (
              <div className="p-3 bg-red-950/30 border border-[#EE0000]/30 rounded text-xs text-[#EE0000]">
                {provisionError}
              </div>
            )}

            <form onSubmit={handleProvisionSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#888888] mb-1.5 uppercase tracking-wider">
                  Store Display Name
                </label>
                <input
                  type="text"
                  value={provisionName}
                  onChange={handleNameChange}
                  placeholder="e.g. Electronics Outlet"
                  className="w-full bg-[#111111] border border-[#222222] rounded px-3 py-2 text-xs text-[#EDEDED] focus:border-[#00DF8F] focus:outline-none transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#888888] mb-1.5 uppercase tracking-wider">
                  Namespace Slug (Target Namespace: store-{provisionSlug || "slug"})
                </label>
                <input
                  type="text"
                  value={provisionSlug}
                  onChange={(e) => setProvisionSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ""))}
                  placeholder="e.g. electronics"
                  className="w-full bg-[#111111] border border-[#222222] rounded px-3 py-2 text-xs font-mono text-[#EDEDED] focus:border-[#00DF8F] focus:outline-none transition-colors"
                  required
                />
                <span className="text-[10px] text-[#666666] mt-1 block">
                  Ingress host will be: <span className="font-mono text-[#888888]">{provisionSlug || "slug"}.local.test:8080</span>
                </span>
              </div>

              <div className="p-3 bg-[#111111] border border-[#1F1F1F] rounded text-[11px] text-[#888888] space-y-1">
                <span className="font-semibold text-[#EDEDED] block">Automated Provisioning Includes:</span>
                <p>• Kubernetes Namespace: <span className="font-mono text-[#00DF8F]">store-{provisionSlug || "slug"}</span></p>
                <p>• Dedicated MariaDB StatefulSet with 1Gi persistent volume</p>
                <p>• Dedicated WordPress & WooCommerce Deployment with 2Gi storage</p>
                <p>• Strict NetworkPolicy denying cross-store network traffic</p>
                <p>• Dedicated WooCommerce MCP Server automatically registered in Gateway</p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#1F1F1F]">
                <button
                  type="button"
                  onClick={() => setIsProvisionOpen(false)}
                  disabled={provisionLoading}
                  className="geist-button-secondary text-xs px-3.5 py-1.5"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={provisionLoading || !provisionName.trim()}
                  className="bg-[#00DF8F] hover:bg-[#00BF7A] text-black font-semibold text-xs px-4 py-1.5 rounded transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  {provisionLoading && <Spinner size={14} className="animate-spin" />}
                  <span>{provisionLoading ? "Deploying Workloads..." : "Deploy Store"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Styled Native Confirmation Modal for Delete (Rule 1 compliance) */}
      <ConfirmModal
        isOpen={Boolean(storeToDelete)}
        title={`Delete Store Environment: ${storeToDelete?.name}`}
        description={`This action will permanently delete the Kubernetes namespace '${storeToDelete?.namespace}'. All associated MariaDB data, WordPress uploads, and the dedicated WooCommerce MCP server will be destroyed, and its tools will be instantly revoked from the Gateway.`}
        confirmLabel="Permanently Delete Store"
        cancelLabel="Keep Store"
        variant="danger"
        loading={deleteLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setStoreToDelete(null)}
      />
    </div>
  );
};
