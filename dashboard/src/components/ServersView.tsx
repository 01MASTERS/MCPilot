import React, { useState } from "react";
import type { McpServer, McpTool, User } from "../types";
import {
  registerServer,
  updateServer,
  deleteServer,
  toggleServer,
} from "../services/api";
import { ConfirmModal } from "./ConfirmModal";
import {
  Plus,
  Trash,
  PencilSimple,
  ToggleLeft,
  ToggleRight,
  MagnifyingGlass,
  Code,
  CaretDown,
  CaretRight,
  Copy,
  Check,
  WarningCircle,
  Shield,
  Lightning,
  X,
  Funnel,
} from "@phosphor-icons/react";

interface ServersViewProps {
  servers: McpServer[];
  tools: McpTool[];
  currentUser: User;
  onRefresh: () => void;
}

export const ServersView: React.FC<ServersViewProps> = ({
  servers,
  tools,
  currentUser,
  onRefresh,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [newServerUrl, setNewServerUrl] = useState("");
  const [newServerToken, setNewServerToken] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit Server Modal State
  const [serverToEdit, setServerToEdit] = useState<McpServer | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editToken, setEditToken] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Native Confirm & Toast State
  const [serverToDelete, setServerToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<{ type: "error" | "success"; message: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [copiedTool, setCopiedTool] = useState<string | null>(null);

  const isAdmin = currentUser.role === "admin";

  const handleToggle = async (id: string, name: string) => {
    try {
      await toggleServer(id);
      setBannerNotice({ type: "success", message: `Server '${name}' status updated.` });
      onRefresh();
    } catch (err: any) {
      setBannerNotice({ type: "error", message: `Error toggling server: ${err.message}` });
    }
  };

  const handleConfirmDelete = async () => {
    if (!serverToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteServer(serverToDelete.id);
      const deletedName = serverToDelete.name;
      setServerToDelete(null);
      setBannerNotice({ type: "success", message: `Upstream server '${deletedName}' removed successfully.` });
      onRefresh();
    } catch (err: any) {
      setBannerNotice({ type: "error", message: `Error removing server: ${err.message}` });
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newServerName || !newServerUrl) return;

    setModalLoading(true);
    setModalError(null);
    try {
      await registerServer({
        name: newServerName,
        baseUrl: newServerUrl,
        authToken: newServerToken || undefined,
      });
      setShowAddModal(false);
      setNewServerName("");
      setNewServerUrl("");
      setNewServerToken("");
      onRefresh();
    } catch (err: any) {
      setModalError(err.message || "Failed to register server");
    } finally {
      setModalLoading(false);
    }
  };

  const toggleToolExpand = (name: string) => {
    setExpandedTools((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleCopyToolName = (name: string) => {
    navigator.clipboard.writeText(name);
    setCopiedTool(name);
    setTimeout(() => setCopiedTool(null), 1500);
  };

  const handleOpenEdit = (server: McpServer) => {
    setServerToEdit(server);
    setEditName(server.name);
    setEditUrl(server.baseUrl);
    setEditToken("");
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverToEdit || !editName.trim() || !editUrl.trim()) return;

    setEditLoading(true);
    setEditError(null);
    try {
      await updateServer(serverToEdit.id, {
        name: editName.trim(),
        baseUrl: editUrl.trim(),
        authToken: editToken.trim() ? editToken.trim() : undefined,
      });
      setBannerNotice({
        type: "success",
        message: `Upstream server '${editName.trim()}' updated successfully.`,
      });
      setServerToEdit(null);
      onRefresh();
    } catch (err: any) {
      setEditError(err.message || "Failed to update upstream server");
    } finally {
      setEditLoading(false);
    }
  };

  const handleSelectServerTools = (serverId: string) => {
    const nextCategory = selectedCategory === serverId ? "all" : serverId;
    setSelectedCategory(nextCategory);
    const catalogEl = document.getElementById("tool-catalog-section");
    if (catalogEl) {
      catalogEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Dynamically derive category pills from registered servers
  const dynamicCategories = [
    { id: "all", label: "All Servers", count: tools.length },
    ...servers.map((s) => ({
      id: s.id,
      label: s.name,
      count: tools.filter((t) => t.name.startsWith(`${s.id}__`)).length,
    })),
  ];

  // Filter tools
  const filteredTools = tools.filter((tool) => {
    const matchesSearch =
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tool.description && tool.description.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedCategory === "all") return true;
    return tool.name.startsWith(`${selectedCategory}__`);
  });

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Native Notification Banner */}
      {bannerNotice && (
        <div
          role="alert"
          className={`p-3 rounded-md border text-xs flex items-center justify-between gap-3 ${
            bannerNotice.type === "error"
              ? "bg-red-950/40 border-[#EE0000]/40 text-[#EDEDED]"
              : "bg-emerald-950/40 border-[#00DF8F]/40 text-[#EDEDED]"
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerNotice.type === "error" ? (
              <WarningCircle size={16} className="text-[#EE0000] flex-shrink-0" weight="fill" />
            ) : (
              <Check size={16} className="text-[#00DF8F] flex-shrink-0" weight="bold" />
            )}
            <span>{bannerNotice.message}</span>
          </div>
          <button
            onClick={() => setBannerNotice(null)}
            className="text-[#888888] hover:text-white p-1"
            aria-label="Dismiss notice"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Upstream Health Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-[#EDEDED] uppercase tracking-wider">
              Registered Upstream Servers
            </h3>
            <p className="text-xs text-[#888888] mt-0.5">
              Live status, health checks, and tool federation endpoints
            </p>
          </div>

          {isAdmin && (
            <button
              onClick={() => setShowAddModal(true)}
              className="geist-button-primary text-xs"
            >
              <Plus size={14} weight="bold" />
              <span>Register Upstream Server</span>
            </button>
          )}
        </div>

        {/* Server Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => {
            const isConnected = server.status === "Connected";
            const isDisabled = server.status === "Disabled";
            const isFiltered = selectedCategory === server.id;

            return (
              <div
                key={server.id}
                onClick={() => handleSelectServerTools(server.id)}
                className={`geist-card p-4 flex flex-col justify-between relative group cursor-pointer transition-all ${
                  isFiltered
                    ? "border-[#00DF8F]/70 ring-1 ring-[#00DF8F]/40 bg-[#00DF8F]/5"
                    : "hover:border-[#333333]"
                }`}
                title="Click to filter tools exposed by this server"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-semibold text-[#EDEDED] flex items-center gap-2">
                        {server.name}
                        {server.hasAuthToken && (
                          <span title="Secured with static token">
                            <Shield size={13} className="text-[#00DF8F]" weight="fill" />
                          </span>
                        )}
                        {isFiltered && (
                          <span className="text-[10px] font-normal text-[#00DF8F] bg-[#00DF8F]/15 border border-[#00DF8F]/30 px-1.5 py-0.2 rounded-full">
                            Filtered
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] font-mono text-[#777777] mt-0.5 truncate max-w-[220px]">
                        {server.baseUrl}
                      </p>
                    </div>

                    {/* Status Dot */}
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black border border-[#222222] text-[10px] font-mono">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isConnected
                            ? "bg-[#00DF8F]"
                            : isDisabled
                            ? "bg-[#F5A623]"
                            : "bg-[#EE0000]"
                        }`}
                      />
                      <span
                        className={
                          isConnected
                            ? "text-[#00DF8F]"
                            : isDisabled
                            ? "text-[#F5A623]"
                            : "text-[#EE0000]"
                        }
                      >
                        {server.status}
                      </span>
                    </div>
                  </div>

                  {/* Metrics bar */}
                  <div className="mt-4 pt-3 border-t border-[#1A1A1A] flex items-center justify-between text-xs text-[#888888]">
                    <div className="flex items-center gap-1.5 text-[#EDEDED] hover:text-[#00DF8F] transition-colors">
                      <Lightning size={14} className="text-[#00DF8F]" weight="fill" />
                      <span className="font-medium">{server.toolCount} exposed tools</span>
                    </div>

                    <div className="font-mono text-[11px] text-[#666666]">
                      {isConnected ? "Ping: 12ms" : "Offline"}
                    </div>
                  </div>
                </div>

                {/* Admin controls */}
                {isAdmin && (
                  <div
                    className="mt-4 pt-3 border-t border-[#1A1A1A] flex items-center justify-between"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleToggle(server.id, server.name)}
                      className="text-xs text-[#888888] hover:text-[#EDEDED] flex items-center gap-1.5 transition-colors"
                      title={server.enabled ? "Disable server" : "Enable server"}
                    >
                      {server.enabled ? (
                        <>
                          <ToggleRight size={20} className="text-[#00DF8F]" weight="fill" />
                          <span>Enabled</span>
                        </>
                      ) : (
                        <>
                          <ToggleLeft size={20} className="text-[#666666]" />
                          <span>Disabled</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEdit(server)}
                        className="p-1.5 text-[#888888] hover:text-[#00DF8F] rounded hover:bg-black transition-colors"
                        title="Edit Upstream Server"
                        aria-label={`Edit ${server.name}`}
                      >
                        <PencilSimple size={15} />
                      </button>

                      <button
                        onClick={() => setServerToDelete({ id: server.id, name: server.name })}
                        className="p-1.5 text-[#666666] hover:text-[#EE0000] rounded hover:bg-black transition-colors"
                        title="Remove Upstream Server"
                        aria-label={`Delete ${server.name}`}
                      >
                        <Trash size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Aggregated Tool Catalog */}
      <div id="tool-catalog-section" className="pt-4 border-t border-[#222222]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-sm font-semibold text-[#EDEDED] uppercase tracking-wider flex items-center gap-2 flex-wrap">
              <span>Aggregated Tool Catalog ({filteredTools.length})</span>
              {selectedCategory !== "all" && (
                <span className="text-[11px] font-normal normal-case text-[#00DF8F] bg-[#00DF8F]/10 border border-[#00DF8F]/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Funnel size={12} weight="bold" />
                  Filtered by: {servers.find((s) => s.id === selectedCategory)?.name || selectedCategory}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCategory("all");
                    }}
                    className="ml-1 text-[#00DF8F] hover:text-white"
                    title="Clear filter"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
            </h3>
            <p className="text-xs text-[#888888] mt-0.5">
              Unified schema-validated tools dynamically discovered from active upstreams
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Category Filter Pills (Dynamically Derived from Registered Upstreams) */}
            <div className="flex items-center bg-[#0A0A0A] p-0.5 rounded-md border border-[#222222] text-xs flex-wrap gap-0.5">
              {dynamicCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors flex items-center gap-1.5 ${
                    selectedCategory === cat.id
                      ? "bg-[#1E1E1E] text-white font-medium shadow-sm"
                      : "text-[#888888] hover:text-[#CCCCCC]"
                  }`}
                >
                  <span>{cat.label}</span>
                  <span
                    className={`text-[10px] px-1 rounded ${
                      selectedCategory === cat.id
                        ? "bg-[#333333] text-[#00DF8F]"
                        : "bg-[#141414] text-[#666666]"
                    }`}
                  >
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <MagnifyingGlass
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#666666]"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tools..."
                className="pl-8 pr-3 py-1.5 bg-[#0A0A0A] border border-[#222222] rounded-md text-xs text-[#EDEDED] placeholder-[#555555] focus:outline-none focus:border-[#00DF8F] w-48 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Tools List */}
        <div className="space-y-3">
          {filteredTools.length === 0 ? (
            <div className="geist-card p-8 text-center text-xs text-[#666666] space-y-2">
              <p>No tools matching filter criteria.</p>
              {selectedCategory !== "all" && (
                <button
                  onClick={() => setSelectedCategory("all")}
                  className="geist-button-secondary text-xs inline-flex items-center gap-1.5 mt-2"
                >
                  Show All Tools ({tools.length})
                </button>
              )}
            </div>
          ) : (
            filteredTools.map((tool) => {
              const isExpanded = Boolean(expandedTools[tool.name]);
              const prefix = tool.name.split("__")[0];

              return (
                <div key={tool.name} className="geist-card p-4 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-semibold text-[#00DF8F] bg-black px-2 py-0.5 rounded border border-[#222222]">
                          {tool.name}
                        </span>

                        <button
                          onClick={() => handleCopyToolName(tool.name)}
                          className="text-[#666666] hover:text-white transition-colors"
                          title="Copy namespaced tool name"
                        >
                          {copiedTool === tool.name ? (
                            <Check size={13} className="text-[#00DF8F]" />
                          ) : (
                            <Copy size={13} />
                          )}
                        </button>

                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 bg-[#141414] text-[#888888] rounded border border-[#222222]">
                          {prefix}
                        </span>
                      </div>

                      <p className="text-xs text-[#AAAAAA] mt-1.5 leading-relaxed">
                        {tool.description || "No description provided."}
                      </p>
                    </div>

                    <button
                      onClick={() => toggleToolExpand(tool.name)}
                      className="geist-button-secondary text-xs py-1 px-2.5 flex items-center gap-1.5"
                    >
                      <Code size={13} />
                      <span>{isExpanded ? "Hide Schema" : "Schema"}</span>
                      {isExpanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
                    </button>
                  </div>

                  {/* Expandable JSON Schema */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-[#1A1A1A]">
                      <div className="text-[10px] uppercase font-mono text-[#666666] mb-1">
                        JSON Schema Parameters
                      </div>
                      <pre className="p-3 bg-black rounded border border-[#222222] font-mono text-[11px] text-[#CCCCCC] overflow-x-auto max-h-60">
                        {JSON.stringify(tool.inputSchema || {}, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Register Server Modal Dialog */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="geist-card p-6 w-full max-w-lg bg-[#0A0A0A] shadow-geist-elevated border border-[#333333]">
            <h3 className="text-base font-semibold text-[#EDEDED] mb-1">
              Register Upstream MCP Server
            </h3>
            <p className="text-xs text-[#888888] mb-4">
              Connect a new Streamable HTTP MCP service into the federated gateway.
            </p>

            {modalError && (
              <div className="mb-4 p-2.5 bg-red-950/40 border border-[#EE0000]/40 rounded text-xs text-[#EE0000] flex items-center gap-2">
                <WarningCircle size={15} weight="bold" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#888888] mb-1 uppercase tracking-wider">
                  Server Name *
                </label>
                <input
                  type="text"
                  value={newServerName}
                  onChange={(e) => setNewServerName(e.target.value)}
                  placeholder="e.g. Warehouse Inventory MCP"
                  required
                  className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] focus:outline-none focus:border-[#00DF8F]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#888888] mb-1 uppercase tracking-wider">
                  Base URL (Streamable HTTP /mcp) *
                </label>
                <input
                  type="url"
                  value={newServerUrl}
                  onChange={(e) => setNewServerUrl(e.target.value)}
                  placeholder="http://mcpilot-inventory-mcp:3003/mcp"
                  required
                  className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] font-mono focus:outline-none focus:border-[#00DF8F]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#888888] mb-1 uppercase tracking-wider">
                  Auth Token (Optional static Bearer credential)
                </label>
                <input
                  type="password"
                  value={newServerToken}
                  onChange={(e) => setNewServerToken(e.target.value)}
                  placeholder="Optional token injected server-side"
                  className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] font-mono focus:outline-none focus:border-[#00DF8F]"
                />
                <p className="text-[10px] text-[#666666] mt-1">
                  Static tokens are stored securely in MariaDB and never leaked downstream.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1A1A1A]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="geist-button-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  className="geist-button-primary text-xs"
                >
                  {modalLoading ? "Connecting..." : "Register Server"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Edit Server Modal Dialog */}
      {serverToEdit && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="geist-card p-6 w-full max-w-lg bg-[#0A0A0A] shadow-geist-elevated border border-[#333333]">
            <h3 className="text-base font-semibold text-[#EDEDED] mb-1">
              Edit Upstream Server
            </h3>
            <p className="text-xs text-[#888888] mb-4">
              Update endpoint URL, display name, or static authentication token for &apos;{serverToEdit.name}&apos;.
            </p>

            {editError && (
              <div className="mb-4 p-2.5 bg-red-950/40 border border-[#EE0000]/40 rounded text-xs text-[#EE0000] flex items-center gap-2">
                <WarningCircle size={15} weight="bold" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#888888] mb-1 uppercase tracking-wider">
                  Server Name *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. WooCommerce MCP"
                  required
                  className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] focus:outline-none focus:border-[#00DF8F]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#888888] mb-1 uppercase tracking-wider">
                  Base URL (Streamable HTTP /mcp) *
                </label>
                <input
                  type="url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  placeholder="http://mcpilot-woocommerce-mcp:3000/mcp"
                  required
                  className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] font-mono focus:outline-none focus:border-[#00DF8F]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#888888] mb-1 uppercase tracking-wider">
                  New Auth Token (Optional - leave blank to keep unchanged)
                </label>
                <input
                  type="password"
                  value={editToken}
                  onChange={(e) => setEditToken(e.target.value)}
                  placeholder={
                    serverToEdit.hasAuthToken
                      ? "•••••••••••• (existing token active)"
                      : "Optional static Bearer token"
                  }
                  className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] font-mono focus:outline-none focus:border-[#00DF8F]"
                />
                <p className="text-[10px] text-[#666666] mt-1">
                  Injected server-side by the Gateway for upstream verification; never visible to downstream clients.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1A1A1A]">
                <button
                  type="button"
                  onClick={() => setServerToEdit(null)}
                  className="geist-button-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="geist-button-primary text-xs"
                >
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Native Confirm Modal for Deletion */}
      <ConfirmModal
        isOpen={Boolean(serverToDelete)}
        title="Remove Upstream Server"
        description={`Are you sure you want to remove upstream server '${serverToDelete?.name}'? Downstream agents will immediately lose access to all tools exposed by this server.`}
        confirmLabel="Remove Server"
        cancelLabel="Cancel"
        variant="danger"
        loading={deleteLoading}
        onConfirm={handleConfirmDelete}
        onCancel={() => setServerToDelete(null)}
      />
    </div>
  );
};
