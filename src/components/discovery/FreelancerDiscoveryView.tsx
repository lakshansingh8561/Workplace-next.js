"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import {
  SearchFreelancersResult,
} from "@/lib/actions/freelancer-discovery";

interface FreelancerDiscoveryViewProps {
  initialData: SearchFreelancersResult;
}

export function FreelancerDiscoveryView({
  initialData,
}: FreelancerDiscoveryViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(searchParams.get("query") || "");
  const [selectedSkill, setSelectedSkill] = useState(
    searchParams.get("skill") || "ALL"
  );
  const [sortBy, setSortBy] = useState(
    searchParams.get("sort") || "rating"
  );
  const [maxRate, setMaxRate] = useState(searchParams.get("maxRate") || "");

  const applyFilters = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (!v || v === "ALL") {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    });
    // Reset page to 1
    if (!newParams.page) {
      params.delete("page");
    }

    startTransition(() => {
      router.push(`/freelancers?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters({ query, maxRate });
  };

  const handleClearAll = () => {
    setQuery("");
    setSelectedSkill("ALL");
    setMaxRate("");
    applyFilters({ query: "", skill: "ALL", maxRate: "" });
  };

  const handlePageChange = (newPage: number) => {
    applyFilters({ page: String(newPage) });
  };

  const freelancers = initialData.freelancers || [];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
          Find Top Freelance Talent
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
          Discover vetted developers, designers, and domain specialists. Review portfolios, explore verified client ratings, and start pre-hire project discussions.
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="mb-8 rounded-3xl border border-zinc-200/90 bg-white p-4 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by freelancer name, title, skill, or bio..."
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 pl-10 pr-10 py-3 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-white dark:placeholder-zinc-500 transition"
            />
            <span className="absolute left-3.5 top-3.5 text-zinc-400 text-sm">🔍</span>
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  applyFilters({ query: "" });
                }}
                className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm"
              >
                ✕
              </button>
            )}
          </div>

          {/* Rate ceiling */}
          <div className="w-full md:w-40">
            <input
              type="number"
              min="0"
              max="500"
              value={maxRate}
              onChange={(e) => setMaxRate(e.target.value)}
              placeholder="Max $/hr..."
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white transition"
            />
          </div>

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              applyFilters({ sort: e.target.value });
            }}
            className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-xs sm:text-sm text-zinc-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
          >
            <option value="rating">Top Rated</option>
            <option value="rate_asc">Rate: Low to High</option>
            <option value="rate_desc">Rate: High to Low</option>
            <option value="recent">Recently Joined</option>
          </select>

          <button
            type="submit"
            disabled={isPending}
            className="rounded-2xl bg-emerald-600 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition"
          >
            {isPending ? "Filtering..." : "Search"}
          </button>
        </form>

        {/* Skill Pills */}
        {initialData.topSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
            <span className="text-[11px] font-bold text-zinc-400 mr-1 uppercase tracking-wider">
              Popular Skills:
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedSkill("ALL");
                applyFilters({ skill: "ALL" });
              }}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                selectedSkill === "ALL"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              All Skills
            </button>
            {initialData.topSkills.map((sk) => (
              <button
                key={sk}
                type="button"
                onClick={() => {
                  const target = selectedSkill === sk ? "ALL" : sk;
                  setSelectedSkill(target);
                  applyFilters({ skill: target });
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  selectedSkill === sk
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                {sk}
              </button>
            ))}
          </div>
        )}

        {/* Summary Row */}
        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-1">
          <span>
            Found <strong className="text-zinc-900 dark:text-zinc-100">{freelancers.length}</strong> of{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">{initialData.totalCount}</strong> verified freelancers
          </span>
          {(query || selectedSkill !== "ALL" || maxRate) && (
            <button
              type="button"
              onClick={handleClearAll}
              className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* Grid of Freelancer Cards */}
      {freelancers.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-3xl dark:bg-zinc-800 mb-4">
            👨‍💻
          </div>
          <h3 className="text-base font-bold text-zinc-950 dark:text-white">
            No freelancers found
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            We couldn&apos;t find any freelance talent matching your current search parameters. Try clearing your filters or searching for different keywords.
          </p>
          <button
            type="button"
            onClick={handleClearAll}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm transition"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {freelancers.map((f) => (
            <div
              key={f.id}
              className="flex flex-col justify-between rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm hover:shadow-md hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 transition"
            >
              <div>
                {/* Header with Avatar & Details */}
                <div className="flex items-start gap-4 mb-4">
                  <Avatar
                    src={f.image}
                    name={f.name}
                    role="FREELANCER"
                    userId={f.id}
                    size="lg"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <Link
                        href={`/freelancers/${f.id}`}
                        className="text-base font-extrabold text-zinc-950 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400 truncate block transition"
                      >
                        {f.name}
                      </Link>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-sm whitespace-nowrap">
                        {f.hourlyRate ? `$${f.hourlyRate}/hr` : "Open"}
                      </span>
                    </div>

                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 truncate mt-0.5">
                      {f.title || "Freelancer"}
                    </p>

                    <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {f.location && (
                        <span className="flex items-center gap-0.5 truncate">
                          <span>📍</span>
                          <span className="truncate">{f.location}</span>
                        </span>
                      )}
                      <span>•</span>
                      <span>⭐ {f.averageRating ? f.averageRating.toFixed(1) : "5.0"}</span>
                      {f.completedContractsCount > 0 && (
                        <>
                          <span>•</span>
                          <span>{f.completedContractsCount} done</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bio */}
                <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed mb-4">
                  {f.bio ||
                    "Experienced freelancer ready to collaborate on challenging technical projects, responsive designs, and custom software."}
                </p>

                {/* Skills Badges */}
                {f.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-4">
                    {f.skills.slice(0, 4).map((sk) => (
                      <span
                        key={sk}
                        className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {sk}
                      </span>
                    ))}
                    {f.skills.length > 4 && (
                      <span className="rounded-lg bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-400 dark:bg-zinc-850">
                        +{f.skills.length - 4}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer Actions */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-2 gap-2">
                <Link
                  href={`/freelancers/${f.id}`}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 transition"
                >
                  View Profile
                </Link>
                <Link
                  href={`/freelancers/${f.id}#contact`}
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                >
                  Contact Candidate
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {initialData.totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={initialData.page <= 1 || isPending}
            onClick={() => handlePageChange(initialData.page - 1)}
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
          >
            ← Previous
          </button>
          <span className="text-xs font-semibold text-zinc-500 px-3">
            Page {initialData.page} of {initialData.totalPages}
          </span>
          <button
            type="button"
            disabled={initialData.page >= initialData.totalPages || isPending}
            onClick={() => handlePageChange(initialData.page + 1)}
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
