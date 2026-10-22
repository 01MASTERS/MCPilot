import React, { useState, useEffect } from "react";
import type { MetricsSummary, ServerMetric, DiagnosticReport } from "../types";
import { fetchMetricsSummary, fetchDiagnostics } from "../services/api";
import {
  Pulse,
  Gauge,
  ArrowsClockwise,
  ArrowSquareOut,
  WarningCircle,
  CheckCircle,
  Copy,
  Check,
  X,
  TerminalWindow,
  Clock,
  Lightning,
  ShieldWarning,
  ChartLine,
} from "@phosphor-icons/react";

export const ObservabilityView: React.FC = () => {
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number>(5000); // 5s default
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<DiagnosticReport | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [copiedRemediation, setCopiedRemediation] = useState(false);

  const loadData = async (isManual = false) => {
    if (isManual) setLoading(true);
    try {
      const [metricsData, diagData] = await Promise.all([
        fetchMetricsSummary(),
        fetchDiagnostics(),
      ]);
      setSummary(metricsData);
      setDiagnostics(diagData.diagnostics || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load observability data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (refreshInterval <= 0) return;

    const interval = setInterval(() => {
      loadData(false);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  const copyToClipboard = (text: string, type: "snippet" | "remediation") => {
    navigator.clipboard.writeText(text);
    if (type === "snippet") {
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } else {
      setCopiedRemediation(true);
      setTimeout(() => setCopiedRemediation(false), 2000);
    }
  };

  const getErrorRateBadge = (rateNum: number) => {
    if (rateNum === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-[#00DF8F]/10 text-[#00DF8F] border border-[#00DF8F]/20">
          <CheckCircle size={12} weight="bold" /> 0.0%
        </span>
      );
    } else if (rateNum < 5) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-[#F5A623]/10 text-[#F5A623] border border-[#F5A623]/20">
          <WarningCircle size={12} weight="bold" /> {rateNum.toFixed(1)}%
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-medium bg-[#EE0000]/10 text-[#EE0000] border border-[#EE0000]/20">
          <ShieldWarning size={12} weight="bold" /> {rateNum.toFixed(1)}%
        </span>
      );
    }
  };

  const overview = summary?.overview;
  const servers = summary?.servers || [];

  return (
    <div className="space-y-6">
      {/* View Header with Refresh Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#222222] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-[#111111] border border-[#222222] text-[#00DF8F]">
              <Pulse size={22} weight="bold" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[#EDEDED]">
                Observability & Telemetry
              </h2>
              <p className="text-xs text-[#888888] mt-0.5">
                Prometheus metrics, latency quantiles ($p_{50}, p_{95}$), and automated root-cause diagnostics
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#111111] border border-[#222222] rounded-md px-3 py-1.5 text-xs text-[#888888]">
            <Clock size={14} />
            <span>Poll:</span>
            <select
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="bg-transparent text-[#EDEDED] font-mono outline-none cursor-pointer"
            >
              <option value={2000} className="bg-[#111111]">2s</option>
              <option value={5000} className="bg-[#111111]">5s</option>
              <option value={10000} className="bg-[#111111]">10s</option>
              <option value={30000} className="bg-[#111111]">30s</option>
              <option value={0} className="bg-[#111111]">Paused</option>
            </select>
          </div>

          <button
            onClick={() => loadData(true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#111111] hover:bg-[#1a1a1a] text-[#EDEDED] border border-[#222222] hover:border-[#333333] transition-colors disabled:opacity-50"
          >
            <ArrowsClockwise size={14} className={loading ? "animate-spin text-[#00DF8F]" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3.5 bg-[#EE0000]/10 border border-[#EE0000]/30 rounded-lg text-xs text-[#EE0000]">
          <WarningCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top 4 Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Invocations */}
        <div className="bg-[#0A0A0A] border border-[#222222] rounded-lg p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#888888] font-mono uppercase tracking-wider">
            <span>Total Invocations</span>
            <Lightning size={16} className="text-[#00DF8F]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#EDEDED] mt-2">
            {overview?.totalInvocations.toLocaleString() ?? "—"}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-[#888888]">
            <span className="text-[#00DF8F] font-mono font-medium">
              {overview?.successfulInvocations.toLocaleString() ?? 0} ok
            </span>
            <span>•</span>
            <span className="text-[#EE0000] font-mono font-medium">
              {overview?.failedInvocations.toLocaleString() ?? 0} err
            </span>
          </div>
        </div>

        {/* Card 2: Fleet Error Rate */}
        <div className="bg-[#0A0A0A] border border-[#222222] rounded-lg p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#888888] font-mono uppercase tracking-wider">
            <span>Fleet Error Rate</span>
            <Gauge size={16} className="text-[#F5A623]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#EDEDED] mt-2">
            {overview?.overallErrorRate ?? "0.0%"}
          </div>
          <div className="mt-2">
            {overview && getErrorRateBadge(parseFloat(overview.overallErrorRate) || 0)}
          </div>
        </div>

        {/* Card 3: Fleet p95 Latency */}
        <div className="bg-[#0A0A0A] border border-[#222222] rounded-lg p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#888888] font-mono uppercase tracking-wider">
            <span>Fleet p95 Latency</span>
            <ChartLine size={16} className="text-[#00DF8F]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#EDEDED] mt-2">
            {overview ? `${overview.p95LatencyMs}ms` : "—"}
          </div>
          <div className="text-xs text-[#888888] font-mono mt-2">
            avg: {overview ? `${overview.avgLatencyMs}ms` : "—"}
          </div>
        </div>

        {/* Card 4: Active Fleet Upstreams */}
        <div className="bg-[#0A0A0A] border border-[#222222] rounded-lg p-4 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-[#888888] font-mono uppercase tracking-wider">
            <span>Upstream Fleet</span>
            <CheckCircle size={16} className="text-[#00DF8F]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#EDEDED] mt-2">
            {overview ? `${overview.connectedUpstreams} / ${overview.totalUpstreams}` : "—"}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#00DF8F] mt-2">
            <span className="w-2 h-2 rounded-full bg-[#00DF8F] animate-pulse" />
            <span>Operational</span>
          </div>
        </div>
      </div>

      {/* Prometheus Scrape Endpoint Banner */}
      <div className="bg-[#0A0A0A] border border-[#222222] rounded-lg p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded bg-[#111111] border border-[#222222] text-[#F5A623]">
            <TerminalWindow size={20} weight="bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#EDEDED]">Prometheus Exporter</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#222222] text-[#888888]">
                OpenMetrics
              </span>
            </div>
            <p className="text-xs text-[#888888] mt-0.5 font-mono">
              Scrape route: <code className="text-[#00DF8F]">GET /metrics</code> (Port 8000)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              copyToClipboard("curl -s http://gateway.local.test:8080/metrics", "snippet")
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded bg-[#111111] hover:bg-[#1a1a1a] text-[#888888] hover:text-[#EDEDED] border border-[#222222] transition-colors"
          >
            {copiedSnippet ? <Check size={14} className="text-[#00DF8F]" /> : <Copy size={14} />}
            <span>{copiedSnippet ? "Copied curl" : "Copy curl command"}</span>
          </button>

          <a
            href="/metrics"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#00DF8F]/10 hover:bg-[#00DF8F]/20 text-[#00DF8F] border border-[#00DF8F]/30 transition-colors"
          >
            <span>Open Metrics</span>
            <ArrowSquareOut size={14} />
          </a>
        </div>
      </div>

      {/* Per-Server Performance & Latency Quantiles Table */}
      <div className="bg-[#0A0A0A] border border-[#222222] rounded-lg overflow-hidden">
        <div className="p-4 border-b border-[#222222] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#EDEDED]">Per-Server Performance & Quantiles</h3>
            <span className="text-xs font-mono text-[#888888]">({servers.length} upstreams)</span>
          </div>
          <span className="text-xs text-[#888888] font-mono">Sliding Window: 500 samples</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111111] text-[#888888] font-mono uppercase text-[10px] tracking-wider border-b border-[#222222]">
              <tr>
                <th className="py-3 px-4">Upstream Server</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Calls (Total)</th>
                <th className="py-3 px-4">Error Rate</th>
                <th className="py-3 px-4">Median (p50)</th>
                <th className="py-3 px-4">p90</th>
                <th className="py-3 px-4">p95</th>
                <th className="py-3 px-4">Max</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1a1a1a] font-mono text-[#EDEDED]">
              {servers.map((srv) => {
                const isConnected = srv.status === "Connected";
                const total = srv.totalCalls;
                const errRate = srv.errorRateNum;

                return (
                  <tr key={srv.id} className="hover:bg-[#111111]/50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-sans font-medium text-[#EDEDED]">{srv.name}</div>
                      <div className="text-[11px] text-[#888888] font-mono">{srv.id}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium ${
                          isConnected
                            ? "bg-[#00DF8F]/10 text-[#00DF8F] border border-[#00DF8F]/20"
                            : "bg-[#EE0000]/10 text-[#EE0000] border border-[#EE0000]/20"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isConnected ? "bg-[#00DF8F]" : "bg-[#EE0000]"
                          }`}
                        />
                        {srv.status}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span>{total.toLocaleString()}</span>
                      <span className="text-[#888888] text-[11px] ml-1">
                        ({srv.successfulCalls} ok / {srv.errorCalls} err)
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-[#222222] overflow-hidden">
                          <div
                            className={`h-full ${errRate > 0 ? "bg-[#EE0000]" : "bg-[#00DF8F]"}`}
                            style={{ width: `${Math.min(100, Math.max(5, errRate))}%` }}
                          />
                        </div>
                        <span className="text-xs">{srv.errorRate}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[#00DF8F]">{srv.latency.p50}ms</td>
                    <td className="py-3.5 px-4 font-mono text-[#EDEDED]">{srv.latency.p90}ms</td>
                    <td className="py-3.5 px-4 font-mono text-[#F5A623]">{srv.latency.p95}ms</td>
                    <td className="py-3.5 px-4 font-mono text-[#888888]">{srv.latency.max}ms</td>

                    <td className="py-3.5 px-4 text-right">
                      {srv.errorCalls > 0 || !isConnected ? (
                        <button
                          onClick={() => {
                            const diag = diagnostics.find((d) => d.targetServerId === srv.id);
                            if (diag) {
                              setSelectedDiagnostic(diag);
                            } else {
                              setSelectedDiagnostic({
                                code: "ERR_UNREACHABLE",
                                category: "NETWORK",
                                summary: `Upstream '${srv.name}' reported unreachable or experienced errors`,
                                technicalDetails: `Last recorded status: ${srv.status}`,
                                remediation: `Check container logs: kubectl logs -l app.kubernetes.io/component=${srv.id}`,
                                targetServerId: srv.id,
                                timestamp: new Date().toISOString(),
                                rawError: "Upstream status check reported Unreachable",
                              });
                            }
                          }}
                          className="px-2.5 py-1 text-xs font-medium rounded bg-[#EE0000]/10 hover:bg-[#EE0000]/20 text-[#EE0000] border border-[#EE0000]/30 transition-colors"
                        >
                          Diagnostics
                        </button>
                      ) : (
                        <span className="text-xs text-[#00DF8F] flex items-center justify-end gap-1">
                          <Check size={12} weight="bold" /> Healthy
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {servers.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#888888]">
                    No upstream servers connected yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Diagnostic Events Feed */}
      <div className="bg-[#0A0A0A] border border-[#222222] rounded-lg p-4">
        <div className="flex items-center justify-between mb-3 border-b border-[#222222] pb-3">
          <div className="flex items-center gap-2">
            <WarningCircle size={16} className="text-[#F5A623]" />
            <h3 className="text-sm font-semibold text-[#EDEDED]">Recent Diagnostic Events</h3>
          </div>
          <span className="text-xs text-[#888888] font-mono">
            {diagnostics.length} recorded events
          </span>
        </div>

        {diagnostics.length > 0 ? (
          <div className="space-y-2.5">
            {diagnostics.slice(0, 5).map((d, idx) => (
              <div
                key={idx}
                className="p-3 rounded-md bg-[#111111] border border-[#222222] flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[#EE0000]/10 text-[#EE0000] border border-[#EE0000]/20">
                      {d.code}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#222222] text-[#888888]">
                      {d.category}
                    </span>
                    <span className="text-[#EDEDED] font-medium">{d.summary}</span>
                  </div>
                  <div className="text-[#888888] text-[11px] font-mono">
                    Target: <span className="text-[#EDEDED]">{d.targetServerId}</span> • Time:{" "}
                    {new Date(d.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedDiagnostic(d)}
                  className="self-start md:self-auto px-2.5 py-1 rounded bg-[#222222] hover:bg-[#2a2a2a] text-[#EDEDED] text-xs transition-colors shrink-0"
                >
                  Inspect Remediation
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-[#888888]">
            <CheckCircle size={20} className="mx-auto text-[#00DF8F] mb-1.5" />
            No failure diagnostics recorded. All systems healthy.
          </div>
        )}
      </div>

      {/* Styled Native Failure Diagnostic Modal (Rule 1: Never browser alert/confirm) */}
      {selectedDiagnostic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#0A0A0A] border border-[#222222] rounded-xl max-w-xl w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded bg-[#EE0000]/10 border border-[#EE0000]/20 text-[#EE0000]">
                  <WarningCircle size={22} weight="bold" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#EDEDED]">Diagnostic Inspection Report</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[#EE0000]/20 text-[#EE0000]">
                      {selectedDiagnostic.code}
                    </span>
                    <span className="text-xs text-[#888888] font-mono">
                      Category: {selectedDiagnostic.category}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedDiagnostic(null)}
                className="text-[#888888] hover:text-[#EDEDED] p-1 rounded-md hover:bg-[#1a1a1a] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#888888]">
                  Summary
                </label>
                <div className="mt-1 p-2.5 rounded bg-[#111111] border border-[#222222] text-[#EDEDED]">
                  {selectedDiagnostic.summary}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#888888]">
                  Technical Error Details
                </label>
                <div className="mt-1 p-2.5 rounded bg-[#111111] border border-[#222222] font-mono text-[11px] text-[#EE0000] break-all max-h-24 overflow-y-auto">
                  {selectedDiagnostic.rawError || selectedDiagnostic.technicalDetails}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-[#888888] flex items-center justify-between">
                  <span>Actionable Remediation Guidance</span>
                  <button
                    onClick={() => copyToClipboard(selectedDiagnostic.remediation, "remediation")}
                    className="flex items-center gap-1 text-[10px] text-[#00DF8F] hover:underline cursor-pointer"
                  >
                    {copiedRemediation ? <Check size={12} /> : <Copy size={12} />}
                    {copiedRemediation ? "Copied" : "Copy"}
                  </button>
                </label>
                <div className="mt-1 p-3 rounded bg-[#00DF8F]/5 border border-[#00DF8F]/20 text-[#EDEDED] space-y-1.5">
                  <p>{selectedDiagnostic.remediation}</p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedDiagnostic(null)}
                className="px-4 py-2 text-xs font-medium rounded-md bg-[#222222] hover:bg-[#333333] text-[#EDEDED] transition-colors"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
