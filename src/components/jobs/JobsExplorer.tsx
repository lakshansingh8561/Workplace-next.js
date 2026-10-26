"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Job,
  JobPagination as PaginationType,
  JobsApiResponse,
  JobFilterFacets,
} from "@/types";
import { JobCard } from "./JobCard";
import { JobFilters } from "./JobFilters";
import { JobPagination } from "./JobPagination";
import { JobSkeleton } from "./JobSkeleton";
import { getSavedJobIdsAction } from "@/lib/actions/savedJob";

export function JobsExplorer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // URL query parameters synchronization
  const searchParam = searchParams.get("search") || "";
  const categoryParam = searchParams.get("category") || "all";
  const typeParam = searchParams.get("type") || "";
  const expParam = searchParams.get("experienceLevel") || "";
  const skillParam = searchParams.get("skill") || "";
  const minBudgetParam = searchParams.get("minBudget") || "";
  const maxBudgetParam = searchParams.get("maxBudget") || "";
  const sortParam = searchParams.get("sortBy") || "newest";
  const pageParam = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  // Local state
  const [prevSearchParam, setPrevSearchParam] = useState(searchParam);
  const [searchInput, setSearchInput] = useState(searchParam);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [savedJobIds, setSavedJobIds] = useState<Set<string>>(new Set());
  const [facets, setFacets] = useState<JobFilterFacets | undefined>(undefined);
  const [pagination, setPagination] = useState<PaginationType>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  if (prevSearchParam !== searchParam) {
    setPrevSearchParam(searchParam);
    setSearchInput(searchParam);
  }

  // Fetch saved job IDs for current authenticated user
  useEffect(() => {
    let ignore = false;
    getSavedJobIdsAction().then((res) => {
      if (!ignore && res.success && res.savedJobIds) {
        setSavedJobIds(new Set(res.savedJobIds));
      }
    });
    return () => {
      ignore = true;
    };
  }, []);

  const handleToggleSaved = (jobId: string, isSaved: boolean) => {
    setSavedJobIds((prev) => {
      const next = new Set(prev);
      if (isSaved) {
        next.add(jobId);
      } else {
        next.delete(jobId);
      }
      return next;
    });
  };

  // URL updater helper that resets to page 1 whenever search, filters, or sort change
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

  // Fetch jobs from /api/jobs with active URL state
  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        setIsLoading(true);
        const query = new URLSearchParams();
        if (searchParam) query.set("search", searchParam);
        if (categoryParam && categoryParam !== "all") query.set("category", categoryParam);
        if (typeParam) query.set("type", typeParam);
        if (expParam) query.set("experienceLevel", expParam);
        if (skillParam) query.set("skill", skillParam);
        if (minBudgetParam) query.set("minBudget", minBudgetParam);
        if (maxBudgetParam) query.set("maxBudget", maxBudgetParam);
        if (sortParam) query.set("sortBy", sortParam);
        if (pageParam > 1) query.set("page", String(pageParam));
        query.set("includeFacets", "true");

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
              page: pageParam,
              limit: 10,
              totalPages: 1,
            }
          );
          if (json.facets) {
            setFacets(json.facets);
          }
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
  }, [
    searchParam,
    categoryParam,
    typeParam,
    expParam,
    skillParam,
    minBudgetParam,
    maxBudgetParam,
    sortParam,
    pageParam,
    refreshCount,
  ]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUrlParams({ search: searchInput, page: 1 });
  };

  const handleResetAll = () => {
    setSearchInput("");
    setIsMobileFiltersOpen(false);
    router.push(pathname, { scroll: false });
  };

  // Active filters calculation
  const activeFilters: { label: string; key: string }[] = [];
  if (searchParam) activeFilters.push({ label: `Search: "${searchParam}"`, key: "search" });
  if (categoryParam && categoryParam !== "all") {
    activeFilters.push({ label: `Category: ${categoryParam}`, key: "category" });
  }
  if (typeParam) {
    activeFilters.push({
      label: typeParam === "HOURLY" ? "Hourly Rate" : "Fixed-Price",
      key: "type",
    });
  }
  if (expParam) {
    activeFilters.push({
      label:
        expParam === "ENTRY"
          ? "Entry Level"
          : expParam === "INTERMEDIATE"
          ? "Intermediate"
          : "Expert",
      key: "experienceLevel",
    });
  }
  if (skillParam) {
    activeFilters.push({ label: `Skill: ${skillParam}`, key: "skill" });
  }
  if (minBudgetParam || maxBudgetParam) {
    const minStr = minBudgetParam ? `$${minBudgetParam}` : "$0";
    const maxStr = maxBudgetParam ? `$${maxBudgetParam}` : "any";
    activeFilters.push({ label: `Budget: ${minStr} – ${maxStr}`, key: "budget" });
  }

  const removeSingleFilter = (key: string) => {
    if (key === "search") {
      setSearchInput("");
      updateUrlParams({ search: undefined, page: 1 });
    } else if (key === "category") {
      updateUrlParams({ category: undefined, page: 1 });
    } else if (key === "type") {
      updateUrlParams({ type: undefined, page: 1 });
    } else if (key === "experienceLevel") {
      updateUrlParams({ experienceLevel: undefined, page: 1 });
    } else if (key === "skill") {
      updateUrlParams({ skill: undefined, page: 1 });
    } else if (key === "budget") {
      updateUrlParams({ minBudget: undefined, maxBudget: undefined, page: 1 });
    }
  };

  // Calculation for result bounds
  const startItem = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, pagination.total);

  return (
    <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header & Search */}
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
          Find Freelance Work
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Discover verified contracts across software engineering, AI, design, marketing, and finance.
        </p>

        {/* Search Bar Form */}
        <form onSubmit={handleSearchSubmit} className="mt-6 flex flex-col sm:flex-row gap-2 max-w-3xl">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-3 text-zinc-400 dark:text-zinc-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search jobs by keyword, skill, title, or category..."
              className="w-full rounded-xl border border-zinc-300 bg-white pl-10 pr-10 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white shadow-sm"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  updateUrlParams({ search: undefined, page: 1 });
                }}
                className="absolute right-3 top-3 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                aria-label="Clear search input"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 flex items-center justify-center gap-1.5"
          >
            <span>Search</span>
          </button>
        </form>

        {/* Mobile Filter Toggle Button */}
        <div className="mt-4 flex sm:hidden items-center justify-between">
          <button
            type="button"
            onClick={() => setIsMobileFiltersOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <span>⚙ Filters</span>
            {activeFilters.length > 0 && (
              <span className="rounded-full bg-emerald-600 px-1.5 py-0.2 text-[10px] text-white">
                {activeFilters.length}
              </span>
            )}
          </button>
          <span className="text-xs text-zinc-500">
            {pagination.total} {pagination.total === 1 ? "job" : "jobs"}
          </span>
        </div>

        {/* Active Filter Pills Bar */}
        {activeFilters.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              Active:
            </span>
            {activeFilters.map((f) => (
              <span
                key={f.key}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300"
              >
                <span>{f.label}</span>
                <button
                  type="button"
                  onClick={() => removeSingleFilter(f.key)}
                  className="text-emerald-700 hover:text-emerald-950 dark:hover:text-emerald-100 font-bold"
                  aria-label={`Remove filter ${f.label}`}
                >
                  ✕
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={handleResetAll}
              className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400 ml-1"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* Main Grid: Sidebar Filters + Job Listings */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
        {/* Mobile Filter Drawer / Collapsible */}
        {isMobileFiltersOpen && (
          <div className="lg:hidden col-span-1 mb-4">
            <JobFilters
              selectedCategory={categoryParam}
              selectedType={typeParam}
              selectedExperience={expParam}
              selectedSkill={skillParam}
              selectedMinBudget={minBudgetParam}
              selectedMaxBudget={maxBudgetParam}
              selectedSort={sortParam}
              facets={facets}
              onCategoryChange={(val) => {
                updateUrlParams({ category: val, page: 1 });
                setIsMobileFiltersOpen(false);
              }}
              onTypeChange={(val) => {
                updateUrlParams({ type: val, page: 1 });
                setIsMobileFiltersOpen(false);
              }}
              onExperienceChange={(val) => {
                updateUrlParams({ experienceLevel: val, page: 1 });
                setIsMobileFiltersOpen(false);
              }}
              onSkillChange={(val) => {
                updateUrlParams({ skill: val, page: 1 });
                setIsMobileFiltersOpen(false);
              }}
              onBudgetChange={(min, max) => {
                updateUrlParams({ minBudget: min, maxBudget: max, page: 1 });
                setIsMobileFiltersOpen(false);
              }}
              onSortChange={(val) => {
                updateUrlParams({ sortBy: val, page: 1 });
                setIsMobileFiltersOpen(false);
              }}
              onReset={handleResetAll}
            />
          </div>
        )}

        {/* Desktop Sidebar Filters (Sticky) */}
        <div className="hidden lg:block lg:col-span-1 lg:sticky lg:top-20 self-start">
          <JobFilters
            selectedCategory={categoryParam}
            selectedType={typeParam}
            selectedExperience={expParam}
            selectedSkill={skillParam}
            selectedMinBudget={minBudgetParam}
            selectedMaxBudget={maxBudgetParam}
            selectedSort={sortParam}
            facets={facets}
            onCategoryChange={(val) => updateUrlParams({ category: val, page: 1 })}
            onTypeChange={(val) => updateUrlParams({ type: val, page: 1 })}
            onExperienceChange={(val) =>
              updateUrlParams({ experienceLevel: val, page: 1 })
            }
            onSkillChange={(val) => updateUrlParams({ skill: val, page: 1 })}
            onBudgetChange={(min, max) =>
              updateUrlParams({ minBudget: min, maxBudget: max, page: 1 })
            }
            onSortChange={(val) => updateUrlParams({ sortBy: val, page: 1 })}
            onReset={handleResetAll}
          />
        </div>

        {/* Job Listings Column */}
        <div className="col-span-1 lg:col-span-3 space-y-4">
          {/* Status bar */}
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 px-1">
            <span>
              {isLoading ? (
                "Searching verified contracts..."
              ) : pagination.total === 0 ? (
                "0 jobs found"
              ) : (
                <>
                  Showing <span className="font-semibold text-zinc-800 dark:text-zinc-200">{startItem}–{endItem}</span> of{" "}
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">{pagination.total}</span> jobs
                </>
              )}
            </span>
            {isPending && (
              <span className="text-emerald-600 animate-pulse font-medium">Syncing...</span>
            )}
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
            <div className="rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
              <div className="h-12 w-12 mx-auto rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-400 text-xl">
                🔍
              </div>
              <h3 className="mt-4 text-base font-bold text-zinc-900 dark:text-white">
                No matching jobs found
              </h3>
              <p className="mt-2 text-xs text-zinc-500 max-w-sm mx-auto">
                No active contracts match your current search criteria. Try adjusting or clearing your filters to see more opportunities.
              </p>
              <button
                type="button"
                onClick={handleResetAll}
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
                <JobCard
                  key={job.id}
                  job={job}
                  isSaved={savedJobIds.has(job.id)}
                  onToggleSave={(isSaved) => handleToggleSaved(job.id, isSaved)}
                />
              ))}

              {/* Server-side Pagination */}
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
