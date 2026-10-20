import React from "react";
import { Warning, Trash, Prohibit, Check, X } from "@phosphor-icons/react";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (variant) {
      case "danger":
        return <Trash size={22} className="text-[#EE0000]" weight="bold" />;
      case "warning":
        return <Warning size={22} className="text-[#F5A623]" weight="bold" />;
      default:
        return <Check size={22} className="text-[#00DF8F]" weight="bold" />;
    }
  };

  const getConfirmButtonClasses = () => {
    if (variant === "danger") {
      return "bg-[#EE0000] hover:bg-[#CC0000] text-white border border-[#EE0000]";
    }
    if (variant === "warning") {
      return "bg-[#F5A623] hover:bg-[#D48806] text-black font-semibold border border-[#F5A623]";
    }
    return "bg-[#00DF8F] hover:bg-[#00BF7A] text-black font-semibold border border-[#00DF8F]";
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="bg-[#0A0A0A] border border-[#222222] rounded-lg max-w-md w-full p-6 shadow-2xl relative text-left">
        {/* Close icon button */}
        <button
          onClick={onCancel}
          disabled={loading}
          className="absolute top-4 right-4 text-[#666666] hover:text-[#EDEDED] transition-colors p-1 rounded"
          aria-label="Close dialog"
        >
          <X size={16} />
        </button>

        <div className="flex items-start gap-4">
          <div
            className={`p-3 rounded-md border flex-shrink-0 ${
              variant === "danger"
                ? "bg-red-950/30 border-[#EE0000]/30"
                : variant === "warning"
                ? "bg-amber-950/30 border-[#F5A623]/30"
                : "bg-emerald-950/30 border-[#00DF8F]/30"
            }`}
          >
            {getIcon()}
          </div>

          <div className="space-y-2 flex-1">
            <h3 id="confirm-modal-title" className="text-sm font-semibold text-[#EDEDED]">
              {title}
            </h3>
            <p className="text-xs text-[#888888] leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-[#1F1F1F]">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="geist-button-secondary text-xs px-3.5 py-1.5"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-3.5 py-1.5 rounded text-xs transition-colors flex items-center gap-1.5 ${getConfirmButtonClasses()} ${
              loading ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            {loading && (
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
            )}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
