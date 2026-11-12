"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SavedSearchItem,
  updateSavedSearchAction,
  deleteSavedSearchAction,
} from "@/lib/actions/saved-search";
import { formatDate } from "@/lib/utils";

interface SavedSearchesViewProps {
  initialSearches: SavedSearchItem[];
}

export function SavedSearchesView({ initialSearches }: SavedSearchesViewProps) {
  const router = useRouter();
  const [searches, setSearches] = useState<SavedSearchItem[]>(initialSearches);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleToggleAlerts = (searchId: string, currentAlerts: boolean) => {
    if (isPending) return;
    setActionError(null);
    setSuccessNotice(null);
    setActiveActionId(searchId);

    startTransition(async () => {
      const res = await updateSavedSearchAction(searchId, {
        alertsEnabled: !currentAlerts,
      });

      if (!res.success) {
        setActionError(res.error || "Failed to update alert preference.");
        setActiveActionId(null);
        return;
      }

      setSearches((prev) =>
        prev.map((s) => (s.id === searchId ? { ...s, alertsEnabled: !currentAlerts } : s))
      );
      setSuccessNotice(
        !currentAlerts ? "Job alerts enabled for this search." : "Job alerts disabled."
      );
      setActiveActionId(null);
      setTimeout(() => setSuccessNotice(null), 3000);
    });
  };

  const handleDelete = (searchId: string, searchName: string) => {
    if (isPending) return;
    setActionError(null);
    setSuccessNotice(null);
    setActiveActionId(searchId);

    startTransition(async () => {
      const res = await deleteSavedSearchAction(searchId);

      if (!res.success) {
        setActionError(res.error || "Failed to delete saved search.");
        setActiveActionId(null);
        return;
      }

      setSearches((prev) => prev.filter((s) => s.id !== searchId));
      setSuccessNotice(`Saved search "${searchName}" was deleted.`);
      setActiveActionId(null);
      setTimeout(() => setSuccessNotice(null), 3000);
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {successNotice && (
        <div className="rounded-2xl bg-emerald-50 p-4 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <span>✓ {successNotice}</span>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {actionError && (
        <div className="rounded-2xl bg-red-50 p-4 border border-red-200 dark:bg-red-950/40 dark:border-red-900 text-xs font-semibold text-red-800 dark:text-red-300 flex items-center justify-between">
          <span>⚠️ {actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-red-700 hover:text-red-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {searches.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-4xl block mb-2">🔔</span>
          <h3 className="text-base font-bold text-zinc-900 dark:text-white">
            No saved searches yet
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            Save your favorite job search keywords and filters on the Job Marketplace page to receive alerts when new matching jobs are published.
          </p>
          <div className="mt-5">
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition"
            >
              Browse Jobs & Save Search
            </Link>
          </div>
        </div>
      ) : (
        searches.map((s) => {
          // Construct URL for this saved search
          const params = new URLSearchParams();
          if (s.query) params.set("search", s.query);
          if (s.category && s.category !== "all") params.set("category", s.category);
          if (s.type) params.set("type", s.type);
          if (s.skills && s.skills[0]) params.set("skill", s.skills[0]);
          if (s.minBudget !== null && s.minBudget !== undefined) params.set("minBudget", String(s.minBudget));
          if (s.maxBudget !== null && s.maxBudget !== undefined) params.set("maxBudget", String(s.maxBudget));
          const searchUrl = `/jobs?${params.toString()}`;

          return (
            <div
              key={s.id}
              className="rounded-3xl border border-zinc-200/80 bg-white p-5 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 transition hover:border-zinc-300 dark:hover:border-zinc-700"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={searchUrl}
                      className="text-base font-bold text-zinc-950 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 transition"
                    >
                      {s.name}
                    </Link>
                    {s.alertsEnabled ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        🔔 Alerts On
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        🔕 Alerts Off
                      </span>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {s.query && (
                      <span className="rounded-lg bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        &ldquo;{s.query}&rdquo;
                      </span>
                    )}
                    {s.category && (
                      <span className="rounded-lg bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        📁 {s.category}
                      </span>
                    )}
                    {s.type && (
                      <span className="rounded-lg bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        💳 {s.type}
                      </span>
                    )}
                    {s.skills?.map((sk) => (
                      <span
                        key={sk}
                        className="rounded-lg bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      >
                        ⚡ {sk}
                      </span>
                    ))}
                    {(s.minBudget !== null || s.maxBudget !== null) && (
                      <span className="rounded-lg bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        💰 ${s.minBudget || "0"} - ${s.maxBudget || "Any"}
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-[11px] text-zinc-400">
                    Saved on {formatDate(s.createdAt)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
                  <Link
                    href={searchUrl}
                    className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition shadow-xs"
                  >
                    View Results ↗
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleToggleAlerts(s.id, s.alertsEnabled)}
                    disabled={activeActionId === s.id && isPending}
                    className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition"
                  >
                    {s.alertsEnabled ? "Mute" : "Alert Me"}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(s.id, s.name)}
                    disabled={activeActionId === s.id && isPending}
                    className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/40 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

