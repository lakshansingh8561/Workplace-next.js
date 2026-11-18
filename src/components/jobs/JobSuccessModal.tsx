"use client";

import { useEffect, useRef } from "react";

interface JobSuccessModalProps {
  isOpen: boolean;
  jobTitle: string;
  jobId: string;
  category?: string;
  budgetFormatted?: string;
  duration?: string;
  onViewInMyJobs: () => void;
  onPostAnother: () => void;
}

/**
 * JobSuccessModal renders a prominent confirmation popup dialog when a client
 * posts a job. It provides instant feedback, displays key contract parameters,
 * and allows immediate one-click navigation to "My Jobs" or posting another job.
 */
export function JobSuccessModal({
  isOpen,
  jobTitle,
  jobId,
  category,
  budgetFormatted,
  duration,
  onViewInMyJobs,
  onPostAnother,
}: JobSuccessModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onViewInMyJobs();
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
  }, [isOpen, onViewInMyJobs]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-success-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center animate-in zoom-in-95 duration-200"
      >
        {/* Celebration Badge */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-3xl dark:bg-emerald-950/60 shadow-inner">
          🎉
        </div>

        <h3
          id="job-success-title"
          className="mt-4 text-xl sm:text-2xl font-extrabold text-zinc-950 dark:text-white"
        >
          Job Posted Successfully!
        </h3>

        <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          Your job posting is now live on WorkPulse. Freelancers can view requirements and submit competitive proposals.
        </p>

        {/* Job Snapshot Card */}
        <div className="mt-5 rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4 text-left dark:border-zinc-800 dark:bg-zinc-800/50">
          <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
            {jobTitle}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            {category && (
              <span className="rounded-md bg-emerald-100/70 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {category}
              </span>
            )}
            {budgetFormatted && (
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                {budgetFormatted}
              </span>
            )}
            {duration && (
              <>
                <span>•</span>
                <span>{duration}</span>
              </>
            )}
            <span>•</span>
            <span className="font-bold text-emerald-600 dark:text-emerald-400">Status: LIVE</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-3">
          <button
            type="button"
            onClick={onViewInMyJobs}
            className="w-full sm:flex-1 inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-500 active:scale-95 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            View in My Jobs →
          </button>
          <button
            type="button"
            onClick={onPostAnother}
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs sm:text-sm font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition active:scale-95"
          >
            Post Another
          </button>
        </div>
      </div>
    </div>
  );
}

