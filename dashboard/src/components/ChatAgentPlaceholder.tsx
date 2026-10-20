import React from "react";
import { ChatCircleDots, Lightning } from "@phosphor-icons/react";
import type { User } from "../types";

interface ChatAgentPlaceholderProps {
  currentUser: User;
}

export const ChatAgentPlaceholder: React.FC<ChatAgentPlaceholderProps> = ({ currentUser }) => {
  return (
    <div className="max-w-4xl mx-auto geist-card p-8 text-center space-y-4">
      <div className="w-12 h-12 rounded-xl bg-black border border-[#222222] inline-flex items-center justify-center">
        <ChatCircleDots size={24} className="text-[#00DF8F]" weight="bold" />
      </div>
      <h3 className="text-base font-semibold text-[#EDEDED]">Interactive Chat Agent</h3>
      <p className="text-xs text-[#888888] max-w-md mx-auto leading-relaxed">
        Full-height LLM workspace connects directly to Gateway federated tools with caller identity attribution for <strong className="text-white">{currentUser.username}</strong> ({currentUser.role}).
      </p>
      <div className="inline-flex items-center gap-2 px-3 py-1 bg-black border border-[#222222] rounded-full text-[11px] font-mono text-[#00DF8F]">
        <Lightning size={13} weight="fill" />
        <span>Deploying in Wave 3</span>
      </div>
    </div>
  );
};
