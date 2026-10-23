import React, { useState, useEffect, useCallback } from "react";
import type { ApiKey, User, TeamMember } from "../types";
import { createKey, revokeKey, getUsers, inviteUser } from "../services/api";
import { ConfirmModal } from "./ConfirmModal";
import { copyToClipboard } from "../services/clipboard";
import {
  Key,
  Plus,
  Copy,
  Check,
  Warning,
  Prohibit,
  CheckCircle,
  WarningCircle,
  X,
  Users,
  UserPlus,
  ShieldCheck,
  User as UserIcon,
  ArrowsClockwise,
} from "@phosphor-icons/react";

interface ApiKeysViewProps {
  keys: ApiKey[];
  currentUser: User;
  onRefresh: () => void;
  isRefreshing?: boolean;
  refreshTrigger?: number;
}

export const ApiKeysView: React.FC<ApiKeysViewProps> = ({
  keys,
  currentUser,
  onRefresh,
  isRefreshing,
  refreshTrigger,
}) => {
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Team Member Management State
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Native Confirm & Toast State
  const [keyToRevoke, setKeyToRevoke] = useState<{ id: string; name: string } | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<{ type: "error" | "success"; message: string } | null>(null);

  // One-time reveal modal state
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const isAdmin = currentUser.role === "admin";

  const fetchMembers = useCallback(async () => {
    if (!isAdmin) return;
    setMembersLoading(true);
    try {
      const data = await getUsers();
      setTeamMembers(data);
    } catch (err: any) {
      console.error("Failed to load team members:", err);
    } finally {
      setMembersLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    if (refreshTrigger) {
      fetchMembers();
    }
  }, [refreshTrigger, fetchMembers]);

  const handleGenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const result = await createKey(keyName.trim(), selectedUserId || undefined);
      setRevealedKey(result.apiKey);
      setKeyName("");
      setSelectedUserId("");
      setBannerNotice({
        type: "success",
        message: `API Key '${keyName.trim()}' generated successfully${result.username ? ` for ${result.username}` : ""}.`,
      });
      onRefresh();
      fetchMembers();
    } catch (err: any) {
      setError(err.message || "Failed to generate key");
    } finally {
      setLoading(false);
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteUsername.trim() || !invitePassword.trim()) return;

    setInviteLoading(true);
    setInviteError(null);
    try {
      await inviteUser({
        username: inviteUsername.trim(),
        password: invitePassword.trim(),
        role: inviteRole,
      });
      setBannerNotice({
        type: "success",
        message: `Team member '${inviteUsername.trim()}' invited successfully.`,
      });
      setShowInviteModal(false);
      setInviteUsername("");
      setInvitePassword("");
      setInviteRole("member");
      fetchMembers();
    } catch (err: any) {
      setInviteError(err.message || "Failed to invite team member");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleIssueKeyForMember = (member: TeamMember) => {
    setSelectedUserId(member.id);
    setKeyName(`${member.username}-dev-key`);
    setRevealedKey(null);
    setError(null);
    setShowGenerateModal(true);
  };

  const handleConfirmRevoke = async () => {
    if (!keyToRevoke) return;
    setRevokeLoading(true);
    try {
      await revokeKey(keyToRevoke.id);
      const revokedName = keyToRevoke.name;
      setKeyToRevoke(null);
      setBannerNotice({
        type: "success",
        message: `API Key '${revokedName}' revoked. Downstream requests will be rejected.`,
      });
      onRefresh();
    } catch (err: any) {
      setBannerNotice({
        type: "error",
        message: `Error revoking key: ${err.message}`,
      });
    } finally {
      setRevokeLoading(false);
    }
  };

  const handleCopyRevealedKey = async () => {
    if (!revealedKey) return;
    const ok = await copyToClipboard(revealedKey);
    if (ok) {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
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

      {/* Team Members Section (Assignment User Story 4: Invite team members and issue/revoke keys) */}
      {isAdmin && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[#EDEDED] uppercase tracking-wider flex items-center gap-2">
                <Users size={16} className="text-[#00DF8F]" weight="bold" />
                <span>Team Members & Roles</span>
              </h3>
              <p className="text-xs text-[#888888] mt-0.5">
                Manage organization accounts, invite new collaborators, and issue dedicated API credentials
              </p>
            </div>

            <button
              onClick={() => {
                setInviteError(null);
                setShowInviteModal(true);
              }}
              className="geist-button-primary text-xs"
            >
              <UserPlus size={14} weight="bold" />
              <span>Invite Team Member</span>
            </button>
          </div>

          <div className="geist-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#0D0D0D] border-b border-[#222222] text-[#888888] font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium">Active Keys</th>
                    <th className="px-4 py-3 font-medium">Member Since</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A1A1A]">
                  {membersLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-[#666666]">
                        Loading team members...
                      </td>
                    </tr>
                  ) : teamMembers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-[#666666]">
                        No other team members found. Invite your first colleague!
                      </td>
                    </tr>
                  ) : (
                    teamMembers.map((member) => {
                      const isMemberAdmin = member.role === "admin";
                      return (
                        <tr key={member.id} className="hover:bg-[#0E0E0E] transition-colors">
                          <td className="px-4 py-3 font-medium text-[#EDEDED] flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#181818] border border-[#2A2A2A] flex items-center justify-center text-[#888888]">
                              <UserIcon size={12} weight="bold" />
                            </div>
                            <span className="font-mono text-xs">{member.username}</span>
                            {member.username === currentUser.username && (
                              <span className="text-[10px] text-[#666666] font-mono">(You)</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                                isMemberAdmin
                                  ? "bg-emerald-950/50 text-[#00DF8F] border border-[#00DF8F]/30"
                                  : "bg-[#181818] text-[#AAAAAA] border border-[#2A2A2A]"
                              }`}
                            >
                              {isMemberAdmin && <ShieldCheck size={11} weight="fill" />}
                              {isMemberAdmin ? "Admin" : "Member"}
                            </span>
                          </td>

                          <td className="px-4 py-3 font-mono text-[11px] text-[#CCCCCC]">
                            <span className="bg-black px-2 py-0.5 rounded border border-[#222222]">
                              {member.activeKeyCount} {member.activeKeyCount === 1 ? "key" : "keys"}
                            </span>
                          </td>

                          <td className="px-4 py-3 font-mono text-[11px] text-[#666666]">
                            {new Date(member.createdAt).toLocaleDateString()}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleIssueKeyForMember(member)}
                              className="geist-button-secondary py-1 px-2.5 text-[11px] inline-flex items-center gap-1.5"
                              title={`Issue new API key for ${member.username}`}
                            >
                              <Key size={13} className="text-[#00DF8F]" />
                              <span>Issue Key</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-[#222222]">
        <div>
          <h3 className="text-sm font-semibold text-[#EDEDED] uppercase tracking-wider">
            Team API Keys
          </h3>
          <p className="text-xs text-[#888888] mt-0.5">
            Manage granular Bearer tokens for external agents, CLI, and client integrations
          </p>
        </div>

        <button
          onClick={() => {
            setRevealedKey(null);
            setShowGenerateModal(true);
          }}
          className="geist-button-primary text-xs"
        >
          <Plus size={14} weight="bold" />
          <span>Generate API Key</span>
        </button>
      </div>

      {/* Keys Table Card */}
      <div className="geist-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D0D0D] border-b border-[#222222] text-[#888888] font-mono text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Key Prefix</th>
                <th className="px-4 py-3 font-medium">Creator</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Last Used</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#666666]">
                    No API keys issued yet. Generate your first key to connect external agents.
                  </td>
                </tr>
              ) : (
                keys.map((k) => {
                  const isActive = k.status === "active";
                  const canRevoke =
                    currentUser.role === "admin" ||
                    k.userId === currentUser.id ||
                    k.userId === currentUser.userId ||
                    (Boolean(k.username) && k.username === currentUser.username);

                  return (
                    <tr key={k.id} className="hover:bg-[#0E0E0E] transition-colors">
                      <td className="px-4 py-3 font-medium text-[#EDEDED] flex items-center gap-2">
                        <Key size={14} className={isActive ? "text-[#00DF8F]" : "text-[#666666]"} />
                        <span>{k.name}</span>
                      </td>

                      <td className="px-4 py-3 font-mono text-[#CCCCCC]">
                        <span className="bg-black px-2 py-0.5 rounded border border-[#222222] text-[11px]">
                          {k.keyPrefix}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-[#888888]">
                        <span className="font-mono text-[11px]">{k.username || "Team"}</span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                            isActive
                              ? "bg-emerald-950/50 text-[#00DF8F] border border-[#00DF8F]/30"
                              : "bg-red-950/50 text-[#EE0000] border border-[#EE0000]/30"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActive ? "bg-[#00DF8F]" : "bg-[#EE0000]"
                            }`}
                          />
                          {isActive ? "Active" : "Revoked"}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-[#666666]">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-[#666666]">
                        {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleTimeString() : "Never"}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {isActive && canRevoke ? (
                          <button
                            onClick={() => setKeyToRevoke({ id: k.id, name: k.name })}
                            className="geist-button-danger py-1 px-2.5 text-[11px]"
                            title="Instant Revocation"
                          >
                            <Prohibit size={13} weight="bold" />
                            <span>Revoke</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#444444] font-mono">
                            {!isActive ? "Revoked" : "Protected"}
                          </span>
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

      {/* Generate Key Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="geist-card p-6 w-full max-w-md bg-[#0A0A0A] shadow-geist-elevated border border-[#333333]">
            {!revealedKey ? (
              <>
                <h3 className="text-base font-semibold text-[#EDEDED] mb-1">
                  Generate Team API Key
                </h3>
                <p className="text-xs text-[#888888] mb-4">
                  Create a new high-entropy Bearer token prefixed with <code className="text-[#00DF8F]">mcp_live_</code>.
                </p>

                {error && (
                  <div className="mb-4 p-2.5 bg-red-950/40 border border-[#EE0000]/40 rounded text-xs text-[#EE0000]">
                    {error}
                  </div>
                )}

                <form onSubmit={handleGenerateSubmit} className="space-y-4">
                  {isAdmin && teamMembers.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-[#888888] mb-1 uppercase tracking-wider">
                        Issue On Behalf Of Member
                      </label>
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] focus:outline-none focus:border-[#00DF8F]"
                      >
                        <option value="">{currentUser.username} (Myself / Current User)</option>
                        {teamMembers
                          .filter((m) => m.id !== currentUser.id && m.id !== currentUser.userId)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.username} ({m.role})
                            </option>
                          ))}
                      </select>
                      <p className="text-[10px] text-[#666666] mt-1">
                        Tool executions with this key will be attributed to this member in audit logs.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-[#888888] mb-1 uppercase tracking-wider">
                      Key Description / Name *
                    </label>
                    <input
                      type="text"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      placeholder="e.g. Cursor IDE Integration or Claude Desktop"
                      required
                      className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] focus:outline-none focus:border-[#00DF8F]"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1A1A1A]">
                    <button
                      type="button"
                      onClick={() => setShowGenerateModal(false)}
                      className="geist-button-secondary text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="geist-button-primary text-xs"
                    >
                      {loading ? "Generating..." : "Generate Key"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* One-time secret reveal */
              <div>
                <div className="flex items-center gap-2 mb-2 text-[#00DF8F]">
                  <CheckCircle size={20} weight="fill" />
                  <h3 className="text-base font-semibold text-[#EDEDED]">
                    API Key Generated
                  </h3>
                </div>

                <div className="p-3 bg-amber-950/30 border border-[#F5A623]/30 rounded-md text-xs text-[#F5A623] mb-4 flex items-start gap-2">
                  <Warning size={16} weight="bold" className="flex-shrink-0 mt-0.5" />
                  <span>
                    Save this key now. For security purposes, this secret key will <strong>never be shown again</strong>.
                  </span>
                </div>

                <div className="p-3 bg-black border border-[#222222] rounded-md font-mono text-xs text-[#EDEDED] break-all select-all flex items-center justify-between gap-2">
                  <span>{revealedKey}</span>
                  <button
                    onClick={handleCopyRevealedKey}
                    className="p-1.5 bg-[#141414] hover:bg-[#222222] rounded text-white transition-colors flex-shrink-0"
                    title="Copy Key"
                  >
                    {copiedKey ? (
                      <Check size={16} className="text-[#00DF8F]" />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowGenerateModal(false);
                      setRevealedKey(null);
                    }}
                    className="geist-button-primary text-xs"
                  >
                    I have saved this key
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invite Team Member Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="geist-card p-6 w-full max-w-md bg-[#0A0A0A] shadow-geist-elevated border border-[#333333]">
            <h3 className="text-base font-semibold text-[#EDEDED] mb-1 flex items-center gap-2">
              <UserPlus size={18} className="text-[#00DF8F]" weight="bold" />
              <span>Invite Team Member</span>
            </h3>
            <p className="text-xs text-[#888888] mb-4">
              Create an account for a new team member with full audit isolation and RBAC.
            </p>

            {inviteError && (
              <div className="mb-4 p-2.5 bg-red-950/40 border border-[#EE0000]/40 rounded text-xs text-[#EE0000] flex items-center gap-2">
                <WarningCircle size={15} weight="bold" />
                <span>{inviteError}</span>
              </div>
            )}

            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#888888] mb-1 uppercase tracking-wider">
                  Username *
                </label>
                <input
                  type="text"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  placeholder="e.g. sarah"
                  required
                  className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] font-mono focus:outline-none focus:border-[#00DF8F]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#888888] mb-1 uppercase tracking-wider">
                  Initial Password *
                </label>
                <input
                  type="password"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  required
                  minLength={6}
                  className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] font-mono focus:outline-none focus:border-[#00DF8F]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#888888] mb-1 uppercase tracking-wider">
                  Access Role *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setInviteRole("member")}
                    className={`p-2.5 rounded border text-left transition-all ${
                      inviteRole === "member"
                        ? "bg-[#00DF8F]/10 border-[#00DF8F] text-[#EDEDED]"
                        : "bg-black border-[#222222] text-[#888888] hover:border-[#333333]"
                    }`}
                  >
                    <div className="text-xs font-semibold text-white">Member</div>
                    <div className="text-[10px] text-[#777777] mt-0.5">
                      Invokes tools & manages own keys
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setInviteRole("admin")}
                    className={`p-2.5 rounded border text-left transition-all ${
                      inviteRole === "admin"
                        ? "bg-[#00DF8F]/10 border-[#00DF8F] text-[#EDEDED]"
                        : "bg-black border-[#222222] text-[#888888] hover:border-[#333333]"
                    }`}
                  >
                    <div className="text-xs font-semibold text-white">Admin</div>
                    <div className="text-[10px] text-[#777777] mt-0.5">
                      Manages servers, members & all keys
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1A1A1A]">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="geist-button-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="geist-button-primary text-xs"
                >
                  {inviteLoading ? "Inviting..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Native Confirm Modal for Key Revocation */}
      <ConfirmModal
        isOpen={Boolean(keyToRevoke)}
        title="Revoke API Key"
        description={`Are you sure you want to instantly revoke key '${keyToRevoke?.name}'? Downstream requests, external agents, and CLI sessions using this token will be rejected immediately.`}
        confirmLabel="Revoke Key"
        cancelLabel="Cancel"
        variant="danger"
        loading={revokeLoading}
        onConfirm={handleConfirmRevoke}
        onCancel={() => setKeyToRevoke(null)}
      />
    </div>
  );
};
