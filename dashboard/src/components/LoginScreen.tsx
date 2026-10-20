import React, { useState } from "react";
import { login } from "../services/api";
import type { User } from "../types";
import { ShieldCheck, UserCheck, Key, ArrowRight, WarningCircle } from "@phosphor-icons/react";

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);
    setError(null);
    try {
      const data = await login(username, password);
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setLoading(true);
    setError(null);
    try {
      const data = await login(u, p);
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background ambient grid */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: "radial-gradient(#222 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#0A0A0A] border border-[#222222] mb-4 shadow-geist">
            <Key size={24} className="text-[#00DF8F]" weight="bold" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#EDEDED]">MCPilot</h1>
          <p className="text-sm text-[#888888] mt-1">
            Team MCP Gateway & WooCommerce Orchestration
          </p>
        </div>

        {/* Card */}
        <div className="geist-card p-6 bg-[#0A0A0A] shadow-geist-elevated">
          {error && (
            <div className="mb-4 p-3 bg-red-950/40 border border-[#EE0000]/40 rounded-md flex items-center gap-2 text-xs text-[#EE0000]">
              <WarningCircle size={16} weight="bold" className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#888888] mb-1.5 uppercase tracking-wider">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin or alex"
                required
                className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] placeholder-[#444444] focus:outline-none focus:border-[#00DF8F] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#888888] mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2 bg-black border border-[#222222] rounded-md text-sm text-[#EDEDED] placeholder-[#444444] focus:outline-none focus:border-[#00DF8F] transition-colors font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full geist-button-primary mt-2 py-2.5 font-semibold"
            >
              {loading ? "Authenticating..." : "Sign In to Gateway"}
              <ArrowRight size={16} weight="bold" />
            </button>
          </form>

          {/* Quick Pre-Seeded Profiles */}
          <div className="mt-6 pt-5 border-t border-[#1A1A1A]">
            <p className="text-[11px] font-medium text-[#666666] uppercase tracking-wider mb-2.5 text-center">
              Quick Test Sign In
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin("admin", "admin123")}
                className="p-2.5 bg-black hover:bg-[#141414] border border-[#222222] hover:border-[#333333] rounded-md text-left transition-all group"
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#EDEDED] group-hover:text-white">
                  <ShieldCheck size={14} className="text-[#00DF8F]" weight="bold" />
                  <span>Admin</span>
                </div>
                <div className="text-[10px] text-[#666666] font-mono mt-0.5">admin123</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin("alex", "alex123")}
                className="p-2.5 bg-black hover:bg-[#141414] border border-[#222222] hover:border-[#333333] rounded-md text-left transition-all group"
              >
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#EDEDED] group-hover:text-white">
                  <UserCheck size={14} className="text-[#0070F3]" weight="bold" />
                  <span>Member (Alex)</span>
                </div>
                <div className="text-[10px] text-[#666666] font-mono mt-0.5">alex123</div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-[#555555] mt-6 font-mono">
          k3d-mcpilot &bull; Traefik Ingress &bull; Port 8080
        </p>
      </div>
    </div>
  );
};
