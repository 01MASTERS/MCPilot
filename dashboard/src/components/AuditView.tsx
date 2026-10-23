import React, { useState, useEffect, useRef } from "react";
import type { AuditLog } from "../types";
import { getAuditLogs } from "../services/api";
import { TraceDrawer } from "./TraceDrawer";
import {
  MagnifyingGlass,
  CheckCircle,
  XCircle,
  ArrowsClockwise,
  Eye,
  X,
} from "@phosphor-icons/react";

interface AuditViewProps {
  refreshTrigger?: number;
}

export const AuditView: React.FC<AuditViewProps> = ({ refreshTrigger }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const fetchLogs = async (customSearch?: string) => {
    setLoading(true);
    try {
      const q = typeof customSearch === "string" ? customSearch : search;
      const data = await getAuditLogs({
        limit: 50,
        status: statusFilter !== "all" ? statusFilter : undefined,
        search: q.trim() || undefined,
      });
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  // Real-time debounced search filter (Item 5.2: works on typing without waiting for Enter)
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchLogs();
    }, 250);

    return () => clearTimeout(debounceTimer);
  }, [search, statusFilter]);

  useEffect(() => {
    if (refreshTrigger) {
      fetchLogs();
    }
  }, [refreshTrigger]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs();
  };

  const handleClearSearch = () => {
    setSearch("");
    fetchLogs("");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[#EDEDED] uppercase tracking-wider">
            Gateway Audit Trail ({total})
          </h3>
          <p className="text-xs text-[#888888] mt-0.5">
            Real-time trace logs of every tool call, arguments, duration, and user attribution
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <div className="flex items-center bg-[#0A0A0A] p-0.5 rounded-md border border-[#222222] text-xs">
            {["all", "success", "error"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded text-xs capitalize transition-colors ${
                  statusFilter === s
                    ? "bg-[#1E1E1E] text-white font-medium"
                    : "text-[#888888] hover:text-[#CCCCCC]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Real-time Search input */}
          <form onSubmit={handleSearchSubmit} className="relative">
            <MagnifyingGlass
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#666666]"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by tool or user..."
              className="pl-8 pr-7 py-1.5 bg-[#0A0A0A] border border-[#222222] rounded-md text-xs text-[#EDEDED] placeholder-[#555555] focus:outline-none focus:border-[#00DF8F] w-52 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666666] hover:text-[#EDEDED]"
                title="Clear filter"
              >
                <X size={12} />
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Logs Table Card */}
      <div className="geist-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D0D0D] border-b border-[#222222] text-[#888888] font-mono text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">User / API Key</th>
                <th className="px-4 py-3 font-medium">Namespaced Tool</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium text-right">Trace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A1A1A]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#666666]">
                    {loading ? "Loading audit traces..." : "No audit records found."}
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isSuccess = log.status === "success";

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-[#0E0E0E] cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium ${
                            isSuccess
                              ? "bg-emerald-950/50 text-[#00DF8F] border border-[#00DF8F]/30"
                              : "bg-red-950/50 text-[#EE0000] border border-[#EE0000]/30"
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle size={12} weight="fill" className="text-[#00DF8F]" />
                          ) : (
                            <XCircle size={12} weight="fill" className="text-[#EE0000]" />
                          )}
                          <span className="capitalize">{log.status}</span>
                        </span>
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-[#888888]">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-[#CCCCCC]">
                        <span>{log.username || "api_key"}</span>
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-mono text-[11px] text-[#00DF8F] bg-black px-2 py-0.5 rounded border border-[#222222]">
                          {log.toolName}
                        </span>
                      </td>

                      <td className="px-4 py-3 font-mono text-[11px] text-[#888888]">
                        {log.durationMs}ms
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="geist-button-secondary py-1 px-2 text-[11px] group-hover:border-[#00DF8F]/40"
                        >
                          <Eye size={12} />
                          <span>Inspect</span>
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

      {/* Slide-Over Trace Inspector Drawer */}
      <TraceDrawer log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
};
