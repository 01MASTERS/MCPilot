import React, { useMemo, useState } from "react";
import { marked } from "marked";
import { Copy, Check } from "@phosphor-icons/react";

interface MarkdownMessageProps {
  content: string;
  isUser: boolean;
  modelBadge?: string;
}

// Configure marked with GFM options
marked.setOptions({
  gfm: true,
  breaks: true,
});

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({
  content,
  isUser,
  modelBadge,
}) => {
  const [copied, setCopied] = useState(false);

  const parsedHtml = useMemo(() => {
    if (isUser) return "";
    try {
      let rawHtml = marked.parse(content || "") as string;
      // Wrap <table> tags with .table-container for horizontal scroll responsiveness
      rawHtml = rawHtml.replace(/<table>/g, '<div class="table-container"><table>');
      rawHtml = rawHtml.replace(/<\/table>/g, '</table></div>');
      return rawHtml;
    } catch (err) {
      console.warn("Markdown parsing error:", err);
      return `<p>${content}</p>`;
    }
  }, [content, isUser]);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="text-xs leading-relaxed whitespace-pre-wrap break-words text-[#EDEDED]">
        {content}
      </div>
    );
  }

  return (
    <div className="relative group">
      {/* Rich Markdown Response Body */}
      <div
        className="prose-chat"
        dangerouslySetInnerHTML={{ __html: parsedHtml }}
      />

      {/* Assistant Response Quick Actions Bar (ChatGPT / Gemini style) */}
      <div className="mt-2.5 pt-2 border-t border-[#161616] flex items-center justify-between text-[11px] font-mono text-[#666666]">
        <div className="flex items-center gap-2">
          {modelBadge && (
            <span className="bg-[#111111] border border-[#222222] px-1.5 py-0.5 rounded text-[10px] text-[#888888]">
              {modelBadge}
            </span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[#666666] hover:text-[#EDEDED] transition-colors px-1.5 py-0.5 rounded hover:bg-[#141414]"
          title="Copy response to clipboard"
        >
          {copied ? (
            <>
              <Check size={12} className="text-[#00DF8F]" weight="bold" />
              <span className="text-[#00DF8F]">Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
