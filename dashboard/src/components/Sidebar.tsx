import React, { useState } from "react";
import type { User } from "../types";
import {
  Globe,
  Key,
  Scroll,
  ChatCircleDots,
  Copy,
  Check,
  SignOut,
  Cpu,
  Storefront,
  Pulse,
  ShieldCheck,
} from "@phosphor-icons/react";

import { copyToClipboard } from "../services/clipboard";

interface SidebarProps {
  activeTab: "servers" | "stores" | "observability" | "permissions" | "keys" | "audit" | "chat";
  setActiveTab: (tab: "servers" | "stores" | "observability" | "permissions" | "keys" | "audit" | "chat") => void;
  currentUser: User;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
}) => {
  const [copied, setCopied] = useState(false);
  const gatewayUrl = `${window.location.protocol}//${window.location.host}/mcp`;

  const handleCopyUrl = async () => {
    const ok = await copyToClipboard(gatewayUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const navItems = [
    { id: "servers", label: "Servers & Tools", icon: Globe },
    { id: "stores", label: "Store Environments", icon: Storefront },
    { id: "observability", label: "Observability", icon: Pulse },
    { id: "permissions", label: "Tool Permissions", icon: ShieldCheck },
    { id: "keys", label: "API Keys", icon: Key },
    { id: "audit", label: "Audit Trail", icon: Scroll },
    { id: "chat", label: "Chat Agent", icon: ChatCircleDots },
  ] as const;

  return (
    <aside className="w-64 bg-black border-r border-[#222222] flex flex-col h-screen fixed left-0 top-0 z-20 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-[#222222]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#0A0A0A] border border-[#222222] flex items-center justify-center">
            <Cpu size={18} className="text-[#00DF8F]" weight="bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-tight text-[#EDEDED]">MCPilot</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-[#111111] border border-[#222222] rounded text-[#888888] font-mono">
                v1.0
              </span>
            </div>
            <div className="text-[11px] text-[#666666]">Team Gateway</div>
          </div>
        </div>

        {/* Copy Gateway URL Box */}
        <div className="mt-4 p-2 bg-[#0A0A0A] border border-[#222222] rounded-md">
          <div className="flex items-center justify-between text-[10px] text-[#888888] mb-1">
            <span className="uppercase tracking-wider font-medium">Gateway Endpoint</span>
            <button
              onClick={handleCopyUrl}
              className="text-[#EDEDED] hover:text-[#00DF8F] transition-colors flex items-center gap-1"
              title="Copy endpoint URL"
            >
              {copied ? (
                <>
                  <Check size={12} className="text-[#00DF8F]" weight="bold" />
                  <span className="text-[#00DF8F]">Copied</span>
                </>
              ) : (
                <>
                  <Copy size={12} weight="bold" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <div className="text-[11px] font-mono text-[#CCCCCC] truncate bg-black px-1.5 py-1 rounded border border-[#1A1A1A]">
            {gatewayUrl}
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="text-[10px] uppercase tracking-wider text-[#666666] px-3 py-1 font-semibold">
          Platform
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? "bg-[#141414] text-white border border-[#2A2A2A]"
                  : "text-[#888888] hover:text-[#EDEDED] hover:bg-[#0A0A0A] border border-transparent"
              }`}
            >
              <Icon
                size={16}
                weight={isActive ? "bold" : "regular"}
                className={isActive ? "text-[#00DF8F]" : "text-[#888888]"}
              />
              <span>{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#00DF8F]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* User Profile Pill */}
      <div className="p-3 border-t border-[#222222] bg-[#0A0A0A]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-7 h-7 rounded-full bg-[#1A1A1A] border border-[#333333] flex items-center justify-center font-bold text-xs text-[#EDEDED] uppercase">
              {currentUser.username.slice(0, 2)}
            </div>
            <div className="truncate">
              <div className="text-xs font-medium text-[#EDEDED] truncate">
                {currentUser.username}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-medium uppercase ${
                    currentUser.role === "admin"
                      ? "bg-purple-950/60 text-purple-400 border border-purple-800/50"
                      : "bg-blue-950/60 text-blue-400 border border-blue-800/50"
                  }`}
                >
                  {currentUser.role}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            title="Sign Out"
            className="p-1.5 text-[#888888] hover:text-[#EE0000] hover:bg-black rounded border border-transparent hover:border-[#333333] transition-colors"
          >
            <SignOut size={16} weight="bold" />
          </button>
        </div>
      </div>
    </aside>
  );
};
