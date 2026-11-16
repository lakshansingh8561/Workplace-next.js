"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import {
  SearchClientsResult,
} from "@/lib/actions/client-discovery";

interface ClientDiscoveryViewProps {
  initialData: SearchClientsResult;
}

export function ClientDiscoveryView({ initialData }: ClientDiscoveryViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [query, setQuery] = useState(searchParams.get("query") || "");
  const [selectedIndustry, setSelectedIndustry] = useState(
    searchParams.get("industry") || "ALL"
  );
  const [sortBy, setSortBy] = useState(
    searchParams.get("sort") || "jobs_desc"
  );

  const applyFilters = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (!v || v === "ALL") {
        params.delete(k);
      } else {
        params.set(k, v);
      }
    });
    // Reset to page 1 on new filter
    if (!newParams.page) {
      params.delete("page");
    }

    startTransition(() => {
      router.push(`/clients?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters({ query });
  };

  const handleClearSearch = () => {
    setQuery("");
    applyFilters({ query: "" });
  };

  const handlePageChange = (newPage: number) => {
    applyFilters({ page: String(newPage) });
  };

  const clients = initialData.clients || [];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
          Explore Clients & Companies
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl">
          Discover verified hiring companies, explore active contract openings, and connect directly with clients looking for your expertise.
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="mb-8 rounded-3xl border border-zinc-200/90 bg-white p-4 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by company name, keywords, or description..."
              className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/80 pl-10 pr-10 py-3 text-xs sm:text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-white dark:placeholder-zinc-500 transition"
            />
            <span className="absolute left-3.5 top-3.5 text-zinc-400 text-sm">🔍</span>
            {query && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-3.5 top-3.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-sm"
              >
                ✕
              </button>
            )}
          </div>

          {/* Industry Filter */}
          {initialData.industries.length > 0 && (
            <select
              value={selectedIndustry}
              onChange={(e) => {
                setSelectedIndustry(e.target.value);
                applyFilters({ industry: e.target.value });
              }}
              className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-xs sm:text-sm text-zinc-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
            >
              <option value="ALL">All Industries</option>
              {initialData.industries.map((ind) => (
                <option key={ind} value={ind}>
                  {ind}
                </option>
              ))}
            </select>
          )}

          {/* Sort Selector */}
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              applyFilters({ sort: e.target.value });
            }}
            className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-xs sm:text-sm text-zinc-800 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
          >
            <option value="jobs_desc">Most Open Jobs</option>
            <option value="recent">Recently Joined</option>
            <option value="name_asc">Company (A-Z)</option>
          </select>

          <button
            type="submit"
            disabled={isPending}
            className="rounded-2xl bg-emerald-600 px-6 py-3 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 transition"
          >
            {isPending ? "Filtering..." : "Search"}
          </button>
        </form>

        {/* Total Results Summary */}
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <span>
            Showing <strong className="text-zinc-900 dark:text-zinc-100">{clients.length}</strong> of{" "}
            <strong className="text-zinc-900 dark:text-zinc-100">{initialData.totalCount}</strong> clients
          </span>
          {(query || selectedIndustry !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSelectedIndustry("ALL");
                applyFilters({ query: "", industry: "ALL" });
              }}
              className="font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Clear all filters
            </button>
          )}
        </div>
      </div>

      {/* Grid of Client Cards */}
      {clients.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-3xl dark:bg-zinc-800 mb-4">
            🏢
          </div>
          <h3 className="text-base font-bold text-zinc-950 dark:text-white">
            No clients found
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            We couldn&apos;t find any clients matching your search criteria. Try adjusting your query or resetting your filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSelectedIndustry("ALL");
              applyFilters({ query: "", industry: "ALL" });
            }}
            className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 shadow-sm transition"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((client) => {
            const displayName = client.companyName || client.name;
            const subtitle = client.companyName ? client.name : "Hiring Company";

            return (
              <div
                key={client.id}
                className="flex flex-col justify-between rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm hover:shadow-md hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 transition"
              >
                <div>
                  {/* Top card header */}
                  <div className="flex items-start gap-4 mb-4">
                    <Avatar
                      src={client.image}
                      name={displayName}
                      role="CLIENT"
                      userId={client.id}
                      size="lg"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/clients/${client.id}`}
                          className="text-base font-extrabold text-zinc-950 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400 truncate block transition"
                        >
                          {displayName}
                        </Link>
                        <span
                          className="shrink-0 text-emerald-600 text-xs"
                          title="Verified WorkPulse Client"
                        >
                          ✓
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                        {subtitle}
                      </p>

                      {client.location && (
                        <p className="mt-1 text-[11px] text-zinc-400 flex items-center gap-1">
                          <span>📍</span>
                          <span className="truncate">{client.location}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Industry Badge */}
                  {client.companyIndustry && (
                    <div className="mb-3">
                      <span className="rounded-lg bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {client.companyIndustry}
                      </span>
                    </div>
                  )}

                  {/* Description */}
                  <p className="text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed mb-4">
                    {client.companyDescription ||
                      "Active client collaborating with freelancers across development, design, and product initiatives."}
                  </p>
                </div>

                {/* Footer specs & actions */}
                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
                  <div className="flex items-center justify-between mb-4 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                        Open Jobs
                      </span>
                      <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                        {client.openJobsCount} active {client.openJobsCount === 1 ? "opening" : "openings"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 block">
                        Total Posted
                      </span>
                      <span className="font-bold text-zinc-700 dark:text-zinc-300">
                        {client.totalJobsCount} jobs
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href={`/clients/${client.id}`}
                      className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 transition text-center"
                    >
                      Profile
                    </Link>
                    <Link
                      href={`/clients/${client.id}#jobs`}
                      className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 transition text-center"
                    >
                      Jobs ({client.openJobsCount})
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
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
