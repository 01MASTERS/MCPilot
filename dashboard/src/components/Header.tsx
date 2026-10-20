import React from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";

interface HeaderProps {
  activeTitle: string;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTitle,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <header className="h-14 border-b border-[#222222] bg-black/80 backdrop-blur-md sticky top-0 z-10 px-6 flex items-center justify-between select-none">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-[#EDEDED] tracking-tight">{activeTitle}</h2>
      </div>

      <div className="flex items-center gap-3">
        {/* Cluster Connectivity Pill */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#0A0A0A] border border-[#222222] text-xs text-[#888888]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00DF8F] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00DF8F]"></span>
          </span>
          <span className="font-mono text-[11px] text-[#CCCCCC]">k3d-mcpilot: Connected</span>
        </div>

        {/* Refresh Action */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1.5 rounded-md text-[#888888] hover:text-[#EDEDED] hover:bg-[#111111] border border-transparent hover:border-[#222222] transition-colors"
          title="Refresh Data"
        >
          <ArrowsClockwise
            size={16}
            weight="bold"
            className={isRefreshing ? "animate-spin text-[#00DF8F]" : ""}
          />
        </button>
      </div>
    </header>
  );
};
