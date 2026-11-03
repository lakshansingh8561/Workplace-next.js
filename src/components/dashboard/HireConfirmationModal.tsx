"use client";

import { useEffect, useRef } from "react";

interface HireConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
  candidateName: string;
  candidateTitle?: string | null;
  jobTitle: string;
  bidAmount: number;
  isHourly: boolean;
  estimatedDuration?: string | null;
}

export function HireConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  isPending,
  candidateName,
  candidateTitle,
  jobTitle,
  bidAmount,
  isHourly,
  estimatedDuration,
}: HireConfirmationModalProps) {
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hire-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg overflow-hidden rounded-3xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
      >
        {/* Header Icon & Title */}
        <div className="flex items-start gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 text-2xl shadow-xs">
            🤝
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="hire-modal-title"
              className="text-lg sm:text-xl font-bold tracking-tight text-zinc-950 dark:text-white"
            >
              Hire Freelancer & Create Contract
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Formally award this job and establish an active contract agreement.
            </p>
          </div>
        </div>

        {/* Candidate & Job Summary Box */}
        <div className="my-5 space-y-3 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-200/60 dark:border-zinc-700/60">
            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Freelancer:</span>
            <div className="text-right">
              <span className="font-bold text-zinc-900 dark:text-white block">
                {candidateName}
              </span>
              {candidateTitle && (
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                  {candidateTitle}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-zinc-200/60 dark:border-zinc-700/60">
            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Job Posting:</span>
            <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-right truncate max-w-[220px]">
              {jobTitle}
            </span>
          </div>

          <div className="flex items-center justify-between pb-2 border-b border-zinc-200/60 dark:border-zinc-700/60">
            <span className="text-zinc-500 dark:text-zinc-400 font-medium">Agreed Rate / Price:</span>
            <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm">
              ${bidAmount.toLocaleString()} {isHourly ? "/ hr" : "Fixed"}
            </span>
          </div>

          {estimatedDuration && (
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">Estimated Timeline:</span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {estimatedDuration}
              </span>
            </div>
          )}
        </div>

        {/* Notice of Contract Binding */}
        <div className="mb-6 rounded-2xl bg-amber-50 p-3.5 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300 space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold">
            <span>ℹ️</span>
            <span>Important Hiring Terms:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1 text-amber-700 dark:text-amber-400">
            <li>Accepting creates an official, active contract immediately.</li>
            <li>This job posting will be marked as CLOSED to new proposals.</li>
            <li>All other pending proposals for this job will be automatically declined.</li>
            <li>Your message thread will be upgraded to an active contract conversation.</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={onClose}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={onConfirm}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition disabled:opacity-50 active:scale-95"
          >
            {isPending ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Creating Contract...</span>
              </>
            ) : (
              <>
                <span>Confirm & Hire Freelancer</span>
                <span>→</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

