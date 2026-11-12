"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { saveJobSearchAction } from "@/lib/actions/saved-search";

interface SaveSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentParams: {
    query?: string;
    category?: string;
    type?: string;
    experienceLevel?: string;
    skill?: string;
    minBudget?: string;
    maxBudget?: string;
  };
  onSuccess?: (savedSearchId: string) => void;
}

export function SaveSearchModal({
  isOpen,
  onClose,
  currentParams,
  onSuccess,
}: SaveSearchModalProps) {
  // Generate smart default name
  const defaultName = [
    currentParams.query ? `"${currentParams.query}"` : null,
    currentParams.category && currentParams.category !== "all" ? currentParams.category : null,
    currentParams.skill ? currentParams.skill : null,
    currentParams.type ? `${currentParams.type.toLowerCase()} jobs` : null,
  ]
    .filter(Boolean)
    .join(" - ") || "My Custom Job Search";

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [name, setName] = useState(defaultName);
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const modalRef = useRef<HTMLDivElement>(null);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setName(defaultName);
      setError(null);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, isPending, onClose]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Please provide a name of at least 2 characters.");
      return;
    }

    startTransition(async () => {
      const minBudgetNum = currentParams.minBudget ? parseFloat(currentParams.minBudget) : undefined;
      const maxBudgetNum = currentParams.maxBudget ? parseFloat(currentParams.maxBudget) : undefined;

      const res = await saveJobSearchAction({
        name: trimmed,
        query: currentParams.query || null,
        category: currentParams.category || null,
        type: currentParams.type ? (currentParams.type.toUpperCase() as "FIXED" | "HOURLY") : null,
        experience: currentParams.experienceLevel
          ? (currentParams.experienceLevel.toUpperCase() as "ENTRY" | "INTERMEDIATE" | "EXPERT")
          : null,
        skills: currentParams.skill ? [currentParams.skill] : [],
        minBudget: isNaN(minBudgetNum ?? NaN) ? null : minBudgetNum,
        maxBudget: isNaN(maxBudgetNum ?? NaN) ? null : maxBudgetNum,
        alertsEnabled,
      });

      if (!res.success) {
        setError(res.error || "Failed to save job search.");
        return;
      }

      if (res.savedSearchId && onSuccess) {
        onSuccess(res.savedSearchId);
      }
      onClose();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-search-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        ref={modalRef}
        className="w-full max-w-md overflow-hidden rounded-3xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"
      >
        <div className="flex items-start gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 text-2xl shadow-xs">
            🔔
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="save-search-title"
              className="text-lg font-bold tracking-tight text-zinc-950 dark:text-white"
            >
              Save Search & Job Alert
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Save your current search criteria and get notified when new matching jobs are published.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-800 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-900">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-zinc-700 dark:text-zinc-300 block mb-1">
              Search Alert Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Next.js High Budget Fixed"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              required
            />
          </div>

          {/* Filter snapshot preview */}
          <div className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 text-[11px] space-y-1 text-zinc-600 dark:text-zinc-300">
            <p className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] mb-1">
              Included Criteria
            </p>
            {currentParams.query && (
              <p>
                <span className="font-medium text-zinc-400">Keywords:</span> &ldquo;{currentParams.query}&rdquo;
              </p>
            )}
            {currentParams.category && currentParams.category !== "all" && (
              <p>
                <span className="font-medium text-zinc-400">Category:</span> {currentParams.category}
              </p>
            )}
            {currentParams.type && (
              <p>
                <span className="font-medium text-zinc-400">Payment:</span> {currentParams.type}
              </p>
            )}
            {currentParams.skill && (
              <p>
                <span className="font-medium text-zinc-400">Skill:</span> {currentParams.skill}
              </p>
            )}
            {(currentParams.minBudget || currentParams.maxBudget) && (
              <p>
                <span className="font-medium text-zinc-400">Budget:</span> ${currentParams.minBudget || "0"} - ${currentParams.maxBudget || "Any"}
              </p>
            )}
            {!currentParams.query && (!currentParams.category || currentParams.category === "all") && !currentParams.type && !currentParams.skill && (
              <p className="text-zinc-400 italic">All marketplace job postings</p>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={alertsEnabled}
              onChange={(e) => setAlertsEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Notify me when new matching jobs are published
            </span>
          </label>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50 transition"
            >
              {isPending ? "Saving..." : "Save Search"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
