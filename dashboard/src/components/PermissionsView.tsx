import React, { useState, useEffect } from "react";
import type {
  User,
  ToolPermission,
  EffectiveToolPermission,
  PermissionsResponse,
} from "../types";
import {
  fetchPermissions,
  updateToolPermission,
  resetPermissionsToDefaults,
} from "../services/api";
import { ConfirmModal } from "./ConfirmModal";
import {
  ShieldCheck,
  ShieldWarning,
  LockKey,
  LockOpen,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  WarningCircle,
  MagnifyingGlass,
  Check,
  User as UserIcon,
  Users,
  Eye,
  Sliders,
  Sparkle,
} from "@phosphor-icons/react";

interface PermissionsViewProps {
  currentUser: User;
  refreshTrigger?: number;
  onRefresh?: () => void;
}

export const PermissionsView: React.FC<PermissionsViewProps> = ({ currentUser, refreshTrigger, onRefresh }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const [policies, setPolicies] = useState<ToolPermission[]>([]);
  const [matrix, setMatrix] = useState<EffectiveToolPermission[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedServerFilter, setSelectedServerFilter] = useState<string>("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<"all" | "mutating" | "read">("all");

  // Simulator state
  const [simulatedRole, setSimulatedRole] = useState<"member" | "admin">("member");

  // Reset modal state
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [resetLoading, setResetLoading] = useState<boolean>(false);

  // Updating specific tool state
  const [updatingTool, setUpdatingTool] = useState<string | null>(null);

  const loadPermissionsData = async (isManual = false) => {
    if (isManual) setLoading(true);
    try {
      const data: PermissionsResponse = await fetchPermissions();
      setPolicies(data.policies || []);
      setMatrix(data.matrix || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load permissions data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPermissionsData();
  }, []);

  useEffect(() => {
    if (refreshTrigger) {
      loadPermissionsData(true);
    }
  }, [refreshTrigger]);

  const handleToggleMemberPermission = async (
    item: EffectiveToolPermission,
    currentAllowed: boolean
  ) => {
    if (currentUser.role !== "admin") {
      setError("Only Administrators can modify tool permissions.");
      return;
    }

    const newPermission: "allow" | "deny" = currentAllowed ? "deny" : "allow";
    const key = `${item.serverId}:${item.rawToolName}`;
    setUpdatingTool(key);

    try {
      await updateToolPermission({
        targetType: "role",
        targetId: "member",
        serverId: item.serverId,
        toolName: item.rawToolName,
        permission: newPermission,
        description: `Policy updated via Dashboard: Member role ${newPermission}ed for ${item.rawToolName}`,
      });

      // Optimistically update matrix state
      setMatrix((prev) =>
        prev.map((t) =>
          t.name === item.name ? { ...t, memberAllowed: newPermission === "allow" } : t
        )
      );

      setSuccessNotice(
        `Updated policy: Member role is now ${
          newPermission === "allow" ? "ALLOWED" : "RESTRICTED"
        } for '${item.name}'`
      );
      setTimeout(() => setSuccessNotice(null), 4000);

      // Re-sync with backend
      await loadPermissionsData(false);
    } catch (err: any) {
      setError(err.message || "Failed to update permission");
    } finally {
      setUpdatingTool(null);
    }
  };

  const handleResetConfirm = async () => {
    setResetLoading(true);
    try {
      await resetPermissionsToDefaults();
      setIsResetModalOpen(false);
      setSuccessNotice("Successfully reset all tool permissions to recommended default baseline.");
      setTimeout(() => setSuccessNotice(null), 4000);
      await loadPermissionsData(false);
    } catch (err: any) {
      setError(err.message || "Failed to reset permissions");
    } finally {
      setResetLoading(false);
    }
  };

  // Distinct upstream servers for filter
  const uniqueServers = Array.from(new Set(matrix.map((t) => t.serverId))).sort();

  // Filtered matrix rows
  const filteredMatrix = matrix.filter((item) => {
    const matchesSearch =
      searchQuery === "" ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.rawToolName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.serverId.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesServer =
      selectedServerFilter === "all" || item.serverId === selectedServerFilter;

    const matchesType =
      selectedTypeFilter === "all" ||
      (selectedTypeFilter === "mutating" && item.isMutating) ||
      (selectedTypeFilter === "read" && !item.isMutating);

    return matchesSearch && matchesServer && matchesType;
  });

  // Simulator stats
  const totalTools = matrix.length;
  const visibleTools = matrix.filter((t) =>
    simulatedRole === "admin" ? t.adminAllowed : t.memberAllowed
  );
  const hiddenTools = matrix.filter((t) =>
    simulatedRole === "admin" ? !t.adminAllowed : !t.memberAllowed
  );

  return (
    <div className="space-y-6">
      {/* Top Banner Notifications (User Rule 1: styled inline alerts only) */}
      {error && (
        <div className="p-3.5 bg-[#EE0000]/10 border border-[#EE0000]/30 rounded-lg flex items-center justify-between text-sm text-[#FF5555]">
          <div className="flex items-center gap-2">
            <WarningCircle size={18} weight="bold" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-xs text-[#888888] hover:text-[#EDEDED]"
          >
            Dismiss
          </button>
        </div>
      )}

      {successNotice && (
        <div className="p-3.5 bg-[#00DF8F]/10 border border-[#00DF8F]/30 rounded-lg flex items-center justify-between text-sm text-[#00DF8F]">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} weight="bold" />
            <span>{successNotice}</span>
          </div>
          <button
            onClick={() => setSuccessNotice(null)}
            className="text-xs text-[#888888] hover:text-[#EDEDED]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* View Header with Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#222222] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-[#EDEDED] tracking-tight">
              Tool Permissions & Role-Based Access Control
            </h1>
            <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-[#00DF8F]/10 text-[#00DF8F] border border-[#00DF8F]/20">
              PERM-01..05
            </span>
          </div>
          <p className="text-xs text-[#888888] mt-1">
            Dynamic tool hiding in <code className="text-[#00DF8F]">tools/list</code> and strict JSON-RPC enforcement in <code className="text-[#00DF8F]">tools/call</code> based on caller roles.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {currentUser.role === "admin" && (
            <button
              onClick={() => setIsResetModalOpen(true)}
              className="px-3 py-1.5 bg-[#0A0A0A] hover:bg-[#1A1A1A] text-[#EDEDED] hover:text-white border border-[#222222] hover:border-[#333333] rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
              title="Reset permissions to recommended security defaults"
            >
              <Sliders size={14} className="text-[#F5A623]" weight="bold" />
              <span>Reset to Defaults</span>
            </button>
          )}
        </div>
      </div>

      {/* Live Effective Access Simulator Card */}
      <div className="bg-[#0A0A0A] border border-[#222222] rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#1A1A1A]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#00DF8F]/10 border border-[#00DF8F]/20 flex items-center justify-center text-[#00DF8F]">
              <Eye size={18} weight="bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[#EDEDED]">Live Client Visibility Simulator</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 bg-[#161616] border border-[#262626] rounded text-[#888888]">
                  MCP tools/list
                </span>
              </div>
              <p className="text-xs text-[#888888] mt-0.5">
                Simulates exactly what tool catalog an AI agent (Claude, Cursor, Chat Agent) discovers when connecting under this role.
              </p>
            </div>
          </div>

          {/* Role selector pill */}
          <div className="flex items-center gap-2 bg-[#000000] border border-[#222222] p-1 rounded-lg">
            <button
              onClick={() => setSimulatedRole("member")}
              className={`px-3 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                simulatedRole === "member"
                  ? "bg-[#1A1A1A] text-[#00DF8F] shadow-sm border border-[#333333]"
                  : "text-[#888888] hover:text-[#EDEDED]"
              }`}
            >
              <UserIcon size={13} weight={simulatedRole === "member" ? "bold" : "regular"} />
              <span>Member Role (alex)</span>
            </button>
            <button
              onClick={() => setSimulatedRole("admin")}
              className={`px-3 py-1 rounded text-xs font-medium transition-all flex items-center gap-1.5 ${
                simulatedRole === "admin"
                  ? "bg-[#1A1A1A] text-[#00DF8F] shadow-sm border border-[#333333]"
                  : "text-[#888888] hover:text-[#EDEDED]"
              }`}
            >
              <Users size={13} weight={simulatedRole === "admin" ? "bold" : "regular"} />
              <span>Admin Role (admin)</span>
            </button>
          </div>
        </div>

        {/* Simulator Metrics Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4">
          <div className="bg-[#000000] border border-[#1A1A1A] rounded p-3">
            <span className="text-[11px] text-[#666666] uppercase tracking-wider block">Total Catalog</span>
            <span className="text-lg font-mono font-bold text-[#EDEDED]">{totalTools} tools</span>
            <span className="text-[11px] text-[#888888] block mt-0.5">Aggregated across all upstreams</span>
          </div>

          <div className="bg-[#000000] border border-[#00DF8F]/20 rounded p-3">
            <span className="text-[11px] text-[#00DF8F] uppercase tracking-wider block flex items-center gap-1">
              <CheckCircle size={12} weight="bold" /> Exposed to LLM
            </span>
            <span className="text-lg font-mono font-bold text-[#00DF8F]">{visibleTools.length} tools</span>
            <span className="text-[11px] text-[#888888] block mt-0.5">
              Returned in <code className="text-[#00DF8F]">tools/list</code> response
            </span>
          </div>

          <div className="bg-[#000000] border border-[#EE0000]/20 rounded p-3">
            <span className="text-[11px] text-[#FF5555] uppercase tracking-wider block flex items-center gap-1">
              <LockKey size={12} weight="bold" /> Dynamically Hidden
            </span>
            <span className="text-lg font-mono font-bold text-[#FF5555]">{hiddenTools.length} tools</span>
            <span className="text-[11px] text-[#888888] block mt-0.5">
              LLM has zero knowledge of their existence
            </span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-[#0A0A0A] border border-[#222222] p-3 rounded-lg">
        <div className="relative flex-1 w-full">
          <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666666]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tools, servers, or functions..."
            className="w-full bg-[#000000] border border-[#222222] focus:border-[#00DF8F] rounded-md pl-9 pr-3 py-1.5 text-xs text-[#EDEDED] placeholder-[#555555] outline-none transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Server filter */}
          <select
            value={selectedServerFilter}
            onChange={(e) => setSelectedServerFilter(e.target.value)}
            className="bg-[#000000] border border-[#222222] rounded-md px-3 py-1.5 text-xs text-[#CCCCCC] outline-none"
          >
            <option value="all">All Servers</option>
            {uniqueServers.map((srv) => (
              <option key={srv} value={srv}>
                {srv}
              </option>
            ))}
          </select>

          {/* Mutating vs Read filter */}
          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value as any)}
            className="bg-[#000000] border border-[#222222] rounded-md px-3 py-1.5 text-xs text-[#CCCCCC] outline-none"
          >
            <option value="all">All Operations</option>
            <option value="mutating">Mutating (Create/Update/Delete)</option>
            <option value="read">Read Only (List/Get/Calculate)</option>
          </select>
        </div>
      </div>

      {/* Permissions Matrix Table */}
      <div className="bg-[#0A0A0A] border border-[#222222] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#222222] bg-[#0E0E0E] text-[#888888] font-mono uppercase text-[10px] tracking-wider">
                <th className="py-3 px-4">Upstream Server</th>
                <th className="py-3 px-4">Tool Identifier</th>
                <th className="py-3 px-4">Classification</th>
                <th className="py-3 px-4">Admin Role</th>
                <th className="py-3 px-4">Member Role Policy</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {loading && filteredMatrix.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#666666] font-mono">
                    Loading tool permissions matrix...
                  </td>
                </tr>
              ) : filteredMatrix.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#666666]">
                    No tools match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredMatrix.map((item) => {
                  const isUpdating = updatingTool === `${item.serverId}:${item.rawToolName}`;
                  return (
                    <tr
                      key={item.name}
                      className="hover:bg-[#111111] transition-colors"
                    >
                      {/* Upstream Server */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-[#161616] text-[#CCCCCC] border border-[#262626]">
                          {item.serverId}
                        </span>
                      </td>

                      {/* Tool Name & Description */}
                      <td className="py-3 px-4">
                        <div className="font-mono text-[#EDEDED] font-medium">{item.rawToolName}</div>
                        <div className="text-[11px] text-[#666666] line-clamp-1 max-w-md">
                          {item.description || "Namespaced gateway tool"}
                        </div>
                      </td>

                      {/* Classification: Mutating vs Read */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.isMutating ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/20">
                            MUTATING
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#00DF8F]/10 text-[#00DF8F] border border-[#00DF8F]/20">
                            READ ONLY
                          </span>
                        )}
                      </td>

                      {/* Admin Access Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#00DF8F]/10 text-[#00DF8F] border border-[#00DF8F]/20">
                          <Check size={12} weight="bold" /> Allowed
                        </span>
                      </td>

                      {/* Member Access Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.memberAllowed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#00DF8F]/10 text-[#00DF8F] border border-[#00DF8F]/20">
                            <LockOpen size={12} weight="bold" /> Allowed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-[#EE0000]/10 text-[#FF5555] border border-[#EE0000]/20">
                            <LockKey size={12} weight="bold" /> Restricted
                          </span>
                        )}
                      </td>

                      {/* Toggle Button */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {currentUser.role === "admin" ? (
                          <button
                            onClick={() => handleToggleMemberPermission(item, item.memberAllowed)}
                            disabled={isUpdating}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-all inline-flex items-center gap-1 border ${
                              item.memberAllowed
                                ? "bg-[#EE0000]/10 hover:bg-[#EE0000]/20 text-[#FF5555] border-[#EE0000]/30"
                                : "bg-[#00DF8F]/10 hover:bg-[#00DF8F]/20 text-[#00DF8F] border-[#00DF8F]/30"
                            }`}
                            title={
                              item.memberAllowed
                                ? "Restrict member role from seeing or executing this tool"
                                : "Grant member role access to see and execute this tool"
                            }
                          >
                            {isUpdating ? (
                              <ArrowsClockwise size={12} className="animate-spin" />
                            ) : item.memberAllowed ? (
                              <>
                                <LockKey size={12} weight="bold" />
                                <span>Restrict</span>
                              </>
                            ) : (
                              <>
                                <LockOpen size={12} weight="bold" />
                                <span>Allow</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="text-[#555555] text-[11px] italic">Admin Only</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Styled Native Confirmation Modal for Resetting to Defaults (Rule 1 compliance) */}
      <ConfirmModal
        isOpen={isResetModalOpen}
        title="Reset Tool Permissions to Default Template?"
        description="This will restore the recommended security policy: Administrators will retain full access (*:* allow), while Members will be restricted from mutating operations on stores (create_product, update_order_status). Any custom tool overrides will be replaced."
        confirmLabel="Reset Permissions"
        cancelLabel="Keep Current Policies"
        variant="warning"
        loading={resetLoading}
        onConfirm={handleResetConfirm}
        onCancel={() => setIsResetModalOpen(false)}
      />
    </div>
  );
};
