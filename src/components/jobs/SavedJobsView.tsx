"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Job } from "@/types";
import { unsaveJobAction } from "@/lib/actions/savedJob";

export interface SavedJobViewItem {
  id: string; // savedJob record ID
  jobId: string;
  savedAt: string;
  job: Job;
}

interface SavedJobsViewProps {
  initialSavedJobs: SavedJobViewItem[];
}

export function SavedJobsView({ initialSavedJobs }: SavedJobsViewProps) {
  const [savedJobs, setSavedJobs] = useState<SavedJobViewItem[]>(initialSavedJobs);
  const [activeUnsavingId, setActiveUnsavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleUnsave = (savedJobId: string, jobId: string, jobTitle: string) => {
    setActionError(null);
    setSuccessNotice(null);
    setActiveUnsavingId(savedJobId);

    // Optimistically remove from list
    const original = [...savedJobs];
    setSavedJobs((prev) => prev.filter((item) => item.id !== savedJobId));

    startTransition(async () => {
      const res = await unsaveJobAction(jobId);

      if (!res.success) {
        // Rollback
        setSavedJobs(original);
        setActionError(res.error || "Failed to remove job from saved list.");
        setActiveUnsavingId(null);
        return;
      }

      setActiveUnsavingId(null);
      setSuccessNotice(`"${jobTitle}" was removed from your saved jobs.`);
      setTimeout(() => setSuccessNotice(null), 4000);
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Top Breadcrumb & Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/jobs"
          className="text-xs sm:text-sm font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 inline-flex items-center gap-1.5"
        >
          ← Explore All Marketplace Jobs
        </Link>
        <Link
          href="/dashboard/freelancer"
          className="rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
        >
          View Submitted Proposals ↗
        </Link>
      </div>

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              Saved Jobs
            </h1>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              {savedJobs.length} {savedJobs.length === 1 ? "Job Saved" : "Jobs Saved"}
            </span>
          </div>
          <p className="mt-1.5 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Keep track of promising freelance opportunities and apply when ready.
          </p>
        </div>
      </div>

      {/* Ephemeral Feedback Notices */}
      {successNotice && (
        <div className="mb-6 rounded-2xl bg-emerald-50 p-4 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 text-xs sm:text-sm font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{successNotice}</span>
          </div>
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
        <div className="mb-6 rounded-2xl bg-red-50 p-4 border border-red-200 dark:bg-red-950/40 dark:border-red-900 text-xs sm:text-sm font-semibold text-red-800 dark:text-red-300 flex items-center justify-between">
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

      {/* Empty State */}
      {savedJobs.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
            📑
          </div>
          <h3 className="mt-4 text-lg font-bold text-zinc-950 dark:text-white">
            No saved jobs yet
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            Discover contracts that match your skill set on the marketplace and click the bookmark icon on any job card to save it for later review.
          </p>
          <div className="mt-6">
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-500 transition active:scale-95"
            >
              Explore Marketplace Jobs →
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {savedJobs.map(({ id: savedJobId, jobId, savedAt, job }) => {
            const isHourly = job.type.toUpperCase() === "HOURLY";
            const formattedPay = isHourly
              ? `$${job.hourlyMin ?? 0} - $${job.hourlyMax ?? 0} / hr`
              : `$${job.budget?.toLocaleString() ?? 0} Fixed`;

            const isOpen = job.status === "OPEN";
            const isClosed = job.status === "CLOSED";
            const isPaused = job.status === "PAUSED";
            const isUnsavingThis = isPending && activeUnsavingId === savedJobId;

            return (
              <article
                key={savedJobId}
                className="group rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-7 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/90"
              >
                <div className="flex flex-col gap-3">
                  {/* Top Meta: Category, Status, Saved Date, Unsave button */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        {job.category}
                      </span>
                      <span>•</span>
                      {isOpen && (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          Open to Proposals
                        </span>
                      )}
                      {isPaused && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          Paused
                        </span>
                      )}
                      {isClosed && (
                        <span className="rounded-full bg-zinc-200 px-2.5 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                          Closed
                        </span>
                      )}
                      <span className="text-zinc-400">
                        Saved on{" "}
                        {new Date(savedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => handleUnsave(savedJobId, jobId, job.title)}
                      className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800 dark:hover:text-red-400 transition disabled:opacity-50"
                      title="Remove from saved jobs"
                    >
                      <span>🗑️</span>
                      <span>{isUnsavingThis ? "Removing..." : "Remove"}</span>
                    </button>
                  </div>

                  {/* Title */}
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-950 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    <Link href={`/jobs/${job.id}`}>{job.title}</Link>
                  </h2>

                  {/* Specs Row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    <span className="text-zinc-950 dark:text-white">{formattedPay}</span>
                    <span>•</span>
                    <span>{job.experienceLevel}</span>
                    {job.duration && (
                      <>
                        <span>•</span>
                        <span className="text-zinc-500 dark:text-zinc-400">
                          Est. {job.duration}
                        </span>
                      </>
                    )}
                    <span>•</span>
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {job.proposalsCount} {job.proposalsCount === 1 ? "proposal" : "proposals"}
                    </span>
                  </div>

                  {/* Description snippet */}
                  <p className="text-xs sm:text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 line-clamp-2">
                    {job.description}
                  </p>

                  {/* Skills */}
                  {job.skills && job.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {job.skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Card Footer: Client Info & Apply Action */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500">
                    <div className="flex items-center gap-3">
                      {job.clientPaymentVerified && (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          ✓ Payment verified
                        </span>
                      )}
                      {job.clientCountry && <span>📍 {job.clientCountry}</span>}
                    </div>

                    <div className="flex items-center gap-3">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="rounded-xl px-3.5 py-1.5 font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition"
                      >
                        View Details
                      </Link>
                      {isOpen && (
                        <Link
                          href={`/jobs/${job.id}`}
                          className="rounded-xl bg-emerald-600 px-4 py-1.5 font-bold text-white shadow-sm hover:bg-emerald-500 transition active:scale-95"
                        >
                          Apply Now →
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
