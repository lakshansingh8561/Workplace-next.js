"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Job, JobPagination as PaginationType, JobsApiResponse } from "@/types";
import { JobCard } from "./JobCard";
import { JobFilters } from "./JobFilters";
import { JobPagination } from "./JobPagination";
import { JobSkeleton } from "./JobSkeleton";

export function JobsExplorer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL state synchronization
  const searchParam = searchParams.get("search") || "";
  const categoryParam = searchParams.get("category") || "all";
  const typeParam = searchParams.get("type") || "";
  const expParam = searchParams.get("experienceLevel") || "";
  const sortParam = searchParams.get("sortBy") || "newest";
  const pageParam = parseInt(searchParams.get("page") || "1", 10);

  // Local state
  const [searchInput, setSearchInput] = useState(searchParam);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pagination, setPagination] = useState<PaginationType>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  // URL updater helper
  const updateUrlParams = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, val]) => {
        if (val === undefined || val === "" || val === "all") {
          params.delete(key);
        } else {
          params.set(key, String(val));
        }
      });

      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams]
  );

  // Data fetching from /api/jobs
  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const query = new URLSearchParams();
        if (searchParam) query.set("search", searchParam);
        if (categoryParam && categoryParam !== "all")
          query.set("category", categoryParam);
        if (typeParam) query.set("type", typeParam);
        if (expParam) query.set("experienceLevel", expParam);
        if (sortParam) query.set("sortBy", sortParam);
        if (pageParam > 1) query.set("page", String(pageParam));

        const res = await fetch(`/api/jobs?${query.toString()}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`Failed to load jobs (HTTP ${res.status})`);
        }

        const json: JobsApiResponse = await res.json();
        if (!ignore) {
          setJobs(json.data || []);
          setPagination(
            json.pagination || {
              total: json.data?.length || 0,
              page: 1,
              limit: 10,
              totalPages: 1,
            }
          );
          setError(null);
          setIsLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          console.error("[JobsExplorer Fetch Error]:", err);
          setError(
            err instanceof Error ? err.message : "An unexpected error occurred."
          );
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, [searchParam, categoryParam, typeParam, expParam, sortParam, pageParam, refreshCount]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrlParams({ search: searchInput, page: 1 });
  };

  const handleReset = () => {
    setSearchInput("");
    router.push(pathname, { scroll: false });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Search Header */}
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
          Find Freelance Work
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Browse verified contracts across software engineering, AI, design, and marketing.
        </p>

        {/* Search Bar Form */}
        <form onSubmit={handleSearchSubmit} className="mt-6 flex gap-2 max-w-2xl">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by keywords, skill, or role..."
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  updateUrlParams({ search: undefined, page: 1 });
                }}
                className="absolute right-3 top-3 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Search
          </button>
        </form>
      </div>

      {/* Main Grid: Sidebar Filters + Job Listings */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar Filters */}
        <div className="lg:col-span-1">
          <JobFilters
            selectedCategory={categoryParam}
            selectedType={typeParam}
            selectedExperience={expParam}
            selectedSort={sortParam}
            onCategoryChange={(val) => updateUrlParams({ category: val, page: 1 })}
            onTypeChange={(val) => updateUrlParams({ type: val, page: 1 })}
            onExperienceChange={(val) =>
              updateUrlParams({ experienceLevel: val, page: 1 })
            }
            onSortChange={(val) => updateUrlParams({ sortBy: val, page: 1 })}
            onReset={handleReset}
          />
        </div>

        {/* Job Listings Column */}
        <div className="lg:col-span-3 space-y-4">
          {/* Status bar */}
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 px-1">
            <span>
              {isLoading
                ? "Searching contracts..."
                : `${pagination.total} ${
                    pagination.total === 1 ? "job" : "jobs"
                  } available`}
            </span>
            {isPending && <span className="text-emerald-600 animate-pulse">Syncing...</span>}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="space-y-4">
              <JobSkeleton />
              <JobSkeleton />
              <JobSkeleton />
            </div>
          )}

          {/* Error State */}
          {!isLoading && error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900/50 dark:bg-red-950/20">
              <p className="text-sm font-bold text-red-800 dark:text-red-400">
                Failed to load jobs
              </p>
              <p className="mt-1 text-xs text-red-600 dark:text-red-300">{error}</p>
              <button
                type="button"
                onClick={() => setRefreshCount((c) => c + 1)}
                className="mt-4 inline-flex items-center rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && jobs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                No matching jobs found
              </h3>
              <p className="mt-2 text-xs text-zinc-500 max-w-sm mx-auto">
                Try adjusting or clearing your search keywords and filter options to explore more contracts.
              </p>
              <button
                type="button"
                onClick={handleReset}
                className="mt-5 inline-flex items-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500"
              >
                Reset Search & Filters
              </button>
            </div>
          )}

          {/* Success State: Jobs List */}
          {!isLoading && !error && jobs.length > 0 && (
            <div className="space-y-4">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}

              {/* Pagination */}
              <JobPagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                onPageChange={(p) => updateUrlParams({ page: p })}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
