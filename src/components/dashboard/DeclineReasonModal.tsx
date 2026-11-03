"use client";

import { useState, useEffect, useRef } from "react";

interface DeclineReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  isPending: boolean;
  title: string;
  description: string;
  confirmButtonLabel?: string;
  showReasonInput?: boolean;
}

export function DeclineReasonModal({
  isOpen,
  onClose,
  onConfirm,
  isPending,
  title,
  description,
  confirmButtonLabel = "Confirm Decline",
  showReasonInput = false,
}: DeclineReasonModalProps) {
  const [reason, setReason] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, isPending, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(reason.trim() || undefined);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="decline-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
      >
        <div className="flex items-start gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 text-xl shadow-xs">
            ✕
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="decline-modal-title"
              className="text-base sm:text-lg font-bold tracking-tight text-zinc-950 dark:text-white"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {description}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {showReasonInput && (
            <div>
              <label
                htmlFor="decline-reason"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Optional Reason or Note
              </label>
              <textarea
                id="decline-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isPending}
                maxLength={500}
                placeholder="Share a polite note explaining why you are declining..."
                className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 text-xs text-zinc-900 placeholder-zinc-400 focus:border-rose-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-rose-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-white dark:placeholder-zinc-500 transition resize-none disabled:opacity-50"
              />
              <div className="mt-1 flex justify-end text-[10px] text-zinc-400">
                <span>{reason.length} / 500</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-rose-500 transition disabled:opacity-50 active:scale-95"
            >
              {isPending ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Processing...</span>
                </>
              ) : (
                confirmButtonLabel
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
