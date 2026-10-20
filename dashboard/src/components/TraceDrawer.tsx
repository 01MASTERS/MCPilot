import React, { useEffect, useState } from "react";
import type { AuditLog } from "../types";
import {
  X,
  Clock,
  User,
  Key,
  Database,
  CheckCircle,
  XCircle,
  Copy,
  Check,
} from "@phosphor-icons/react";

interface TraceDrawerProps {
  log: AuditLog | null;
  onClose: () => void;
}

export const TraceDrawer: React.FC<TraceDrawerProps> = ({ log, onClose }) => {
  const [activeTab, setActiveTab] = useState<"payload" | "metrics">("payload");
  const [copiedPayload, setCopiedPayload] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!log) return null;

  const isSuccess = log.status === "success";

  const handleCopyPayload = () => {
    navigator.clipboard.writeText(JSON.stringify(log.arguments || {}, null, 2));
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden select-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div className="fixed inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-lg bg-[#0A0A0A] border-l border-[#222222] shadow-geist-elevated flex flex-col">
          {/* Drawer Header */}
          <div className="p-4 border-b border-[#222222] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {isSuccess ? (
                <CheckCircle size={18} className="text-[#00DF8F]" weight="fill" />
              ) : (
                <XCircle size={18} className="text-[#EE0000]" weight="fill" />
              )}
              <div>
                <h3 className="text-xs font-mono font-bold text-[#EDEDED] truncate max-w-[320px]">
                  {log.toolName}
                </h3>
                <span className="text-[10px] text-[#666666] font-mono">
                  Trace ID: {log.id}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded text-[#888888] hover:text-white hover:bg-[#141414] transition-colors"
              title="Close drawer (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-[#222222] bg-black px-4">
            <button
              onClick={() => setActiveTab("payload")}
              className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "payload"
                  ? "border-[#00DF8F] text-[#EDEDED]"
                  : "border-transparent text-[#666666] hover:text-[#AAAAAA]"
              }`}
            >
              Input & Output Payload
            </button>
            <button
              onClick={() => setActiveTab("metrics")}
              className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === "metrics"
                  ? "border-[#00DF8F] text-[#EDEDED]"
                  : "border-transparent text-[#666666] hover:text-[#AAAAAA]"
              }`}
            >
              Trace Metrics
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeTab === "payload" ? (
              <div className="space-y-4">
                {/* Arguments */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-mono uppercase text-[#888888] font-semibold">
                      Tool Arguments
                    </span>
                    <button
                      onClick={handleCopyPayload}
                      className="text-[10px] text-[#888888] hover:text-[#00DF8F] flex items-center gap-1"
                    >
                      {copiedPayload ? (
                        <>
                          <Check size={12} className="text-[#00DF8F]" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={12} />
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3 bg-black rounded border border-[#222222] font-mono text-[11px] text-[#00DF8F] overflow-x-auto max-h-64 whitespace-pre-wrap break-all break-words">
                    {JSON.stringify(log.arguments || {}, null, 2)}
                  </pre>
                </div>

                {/* Error message or execution summary */}
                {log.errorMessage ? (
                  <div>
                    <span className="text-[11px] font-mono uppercase text-[#EE0000] font-semibold block mb-1.5">
                      Error Message & Diagnostic
                    </span>
                    <pre className="p-3 bg-red-950/20 border border-[#EE0000]/40 rounded font-mono text-[11px] text-[#EE0000] overflow-x-auto whitespace-pre-wrap">
                      {log.errorMessage}
                    </pre>
                  </div>
                ) : (
                  <div>
                    <span className="text-[11px] font-mono uppercase text-[#888888] font-semibold block mb-1.5">
                      Gateway Routing Summary
                    </span>
                    <div className="p-3 bg-black rounded border border-[#222222] text-xs text-[#AAAAAA] space-y-1">
                      <div>Upstream server: <code className="text-[#EDEDED]">{log.serverId || "auto"}</code></div>
                      <div>Response latency: <code className="text-[#00DF8F]">{log.durationMs}ms</code></div>
                      <div>Execution status: <code className="text-[#00DF8F]">COMPLETED_OK</code></div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Metrics Tab */
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-black rounded border border-[#222222] space-y-2.5">
                  <div className="flex items-center justify-between text-[#888888]">
                    <span className="flex items-center gap-2">
                      <Clock size={14} /> Execution Duration
                    </span>
                    <span className="font-mono text-[#EDEDED]">{log.durationMs} ms</span>
                  </div>

                  <div className="flex items-center justify-between text-[#888888]">
                    <span className="flex items-center gap-2">
                      <Clock size={14} /> Recorded At
                    </span>
                    <span className="font-mono text-[#EDEDED]">
                      {new Date(log.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[#888888]">
                    <span className="flex items-center gap-2">
                      <User size={14} /> Attributed User
                    </span>
                    <span className="font-mono text-[#EDEDED]">{log.username || "Anonymous"}</span>
                  </div>

                  <div className="flex items-center justify-between text-[#888888]">
                    <span className="flex items-center gap-2">
                      <Key size={14} /> API Key ID
                    </span>
                    <span className="font-mono text-[#EDEDED] truncate max-w-[200px]">
                      {log.apiKeyId || "JWT Session"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[#888888]">
                    <span className="flex items-center gap-2">
                      <Database size={14} /> Target Upstream Server
                    </span>
                    <span className="font-mono text-[#EDEDED]">{log.serverId || "N/A"}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
