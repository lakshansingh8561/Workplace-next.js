"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { updateJobStatusAction } from "@/lib/actions/job";
import { JobStatus } from "@prisma/client";

export interface ClientDashboardJob {
  id: string;
  title: string;
  category: string;
  type: string;
  budget?: number | null;
  hourlyMin?: number | null;
  hourlyMax?: number | null;
  status: JobStatus;
  proposalsCount: number;
  createdAt: string;
}

interface ClientDashboardViewProps {
  jobs: ClientDashboardJob[];
  totalJobs: number;
  currentPage: number;
  totalPages: number;
  currentStatus: string;
  searchQuery: string;
}

export function ClientDashboardView({
  jobs: initialJobs,
  totalJobs,
  currentPage,
  totalPages,
  currentStatus,
  searchQuery,
}: ClientDashboardViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<ClientDashboardJob[]>(initialJobs);
  const [searchTerm, setSearchTerm] = useState(searchQuery);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "ALL") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    params.set("page", "1");
    router.push(`/dashboard/client?${params.toString()}`);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (searchTerm.trim()) {
      params.set("search", searchTerm.trim());
    } else {
      params.delete("search");
    }
    params.set("page", "1");
    router.push(`/dashboard/client?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/dashboard/client?${params.toString()}`);
  };

  const handleStatusUpdate = (jobId: string, newStatus: JobStatus) => {
    setActionError(null);
    setActiveJobId(jobId);

    startTransition(async () => {
      const res = await updateJobStatusAction({
        jobId,
        status: newStatus,
      });

      if (!res.success) {
        setActionError(res.error || "Failed to update job status.");
        setActiveJobId(null);
        return;
      }

      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
      );
      setActiveJobId(null);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              Client Job Management
            </h1>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {totalJobs} {totalJobs === 1 ? "Job" : "Jobs"}
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Monitor contract statuses, manage applicant proposals, and adjust job visibility.
          </p>
        </div>

        <Link
          href="/jobs/new"
          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition active:scale-95 whitespace-nowrap shrink-0"
        >
          + Post a New Job
        </Link>
      </div>

      {/* Global Error Notice */}
      {actionError && (
        <div className="mt-6 rounded-2xl bg-red-50 p-4 border border-red-200 dark:bg-red-950/40 dark:border-red-900 text-xs font-semibold text-red-800 dark:text-red-300 flex items-center justify-between">
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

      {/* Controls: Search & Status Filters */}
      <div className="mt-6 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Status Tab Filters */}
        <div className="flex flex-wrap gap-2">
          {["ALL", "OPEN", "PAUSED", "CLOSED"].map((status) => {
            const isSelected =
              status === "ALL" ? !currentStatus : currentStatus.toUpperCase() === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => handleStatusFilter(status)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-zinc-900 text-white shadow dark:bg-white dark:text-zinc-950"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {status === "ALL" ? "All Jobs" : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder="Search your jobs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
          />
          <button
            type="submit"
            className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 transition"
          >
            Search
          </button>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                const params = new URLSearchParams(searchParams.toString());
                params.delete("search");
                params.set("page", "1");
                router.push(`/dashboard/client?${params.toString()}`);
              }}
              className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-600"
            >
              Reset
            </button>
          )}
        </form>
      </div>

      {/* Jobs List or Empty State */}
      {jobs.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
            💼
          </div>
          <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
            {searchQuery || currentStatus ? "No matching jobs found" : "No job contracts posted yet"}
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            {searchQuery || currentStatus
              ? "Try adjusting your search terms or status filters to view other contracts."
              : "Post your first freelance contract to start receiving proposals from verified freelancers."}
          </p>
          <div className="mt-6">
            <Link
              href="/jobs/new"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
            >
              Post a Job Now
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {jobs.map((job) => {
            const isProcessingThis = isPending && activeJobId === job.id;
            const isHourly = job.type.toUpperCase() === "HOURLY";
            const formattedBudget = isHourly
              ? `$${job.hourlyMin ?? 0} - $${job.hourlyMax ?? 0} / hr`
              : `$${job.budget?.toLocaleString() ?? 0} Fixed`;

            return (
              <div
                key={job.id}
                className="rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 transition hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Job Details */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {job.category}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <span className="text-zinc-500">
                        Posted {new Date(job.createdAt).toLocaleDateString()}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <span className="font-bold text-zinc-800 dark:text-zinc-200">
                        {formattedBudget}
                      </span>
                    </div>

                    <Link
                      href={`/jobs/${job.id}`}
                      className="block text-lg font-bold text-zinc-950 dark:text-white hover:text-emerald-600 transition"
                    >
                      {job.title}
                    </Link>
                  </div>

                  {/* Status & Review CTA */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Status Badge */}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                        job.status === "OPEN"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                          : job.status === "PAUSED"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-800"
                          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {job.status}
                    </span>

                    {/* Proposals Review Button */}
                    <Link
                      href={`/dashboard/client/jobs/${job.id}/proposals`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-100 px-3.5 py-2 text-xs font-bold text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition"
                    >
                      <span>Review Proposals</span>
                      <span className="rounded-full bg-emerald-600 px-1.5 py-0.2 text-[10px] text-white">
                        {job.proposalsCount}
                      </span>
                    </Link>

                    {/* Lifecycle Actions */}
                    {job.status === "OPEN" && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleStatusUpdate(job.id, JobStatus.PAUSED)}
                          className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 transition disabled:opacity-50"
                        >
                          {isProcessingThis ? "Updating..." : "Pause"}
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleStatusUpdate(job.id, JobStatus.CLOSED)}
                          className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40 transition disabled:opacity-50"
                        >
                          {isProcessingThis ? "Updating..." : "Close"}
                        </button>
                      </div>
                    )}

                    {job.status === "PAUSED" && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleStatusUpdate(job.id, JobStatus.OPEN)}
                          className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition disabled:opacity-50"
                        >
                          {isProcessingThis ? "Updating..." : "Reopen"}
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleStatusUpdate(job.id, JobStatus.CLOSED)}
                          className="rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40 transition disabled:opacity-50"
                        >
                          {isProcessingThis ? "Updating..." : "Close"}
                        </button>
                      </div>
                    )}

                    {job.status === "CLOSED" && (
                      <span className="text-[11px] text-zinc-400 italic">
                        Archived
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              type="button"
              onClick={() => handlePageChange(page)}
              className={`h-9 w-9 rounded-xl text-xs font-bold transition ${
                page === currentPage
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {page}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
