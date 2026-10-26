"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ProposalStatus } from "@/types";

export interface FreelancerDashboardProposal {
  id: string;
  bidAmount: number;
  estimatedDuration?: string | null;
  coverLetter: string;
  status: ProposalStatus;
  createdAt: string;
  job: {
    id: string;
    title: string;
    category: string;
    type: string;
    budget?: number | null;
    hourlyMin?: number | null;
    hourlyMax?: number | null;
    status: string;
    clientName?: string | null;
    clientCountry?: string | null;
  };
}

interface FreelancerDashboardViewProps {
  proposals: FreelancerDashboardProposal[];
  totalProposals: number;
  currentPage: number;
  totalPages: number;
  currentStatus: string;
  searchQuery: string;
}

export function FreelancerDashboardView({
  proposals,
  totalProposals,
  currentPage,
  totalPages,
  currentStatus,
  searchQuery,
}: FreelancerDashboardViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchQuery);

  const handleStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "ALL") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    params.set("page", "1");
    router.push(`/dashboard/freelancer?${params.toString()}`);
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
    router.push(`/dashboard/freelancer?${params.toString()}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    router.push(`/dashboard/freelancer?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              Freelancer Proposals
            </h1>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {totalProposals} {totalProposals === 1 ? "Application" : "Applications"}
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Track submitted applications, client review statuses, and proposed milestones.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/jobs/saved"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition active:scale-95 whitespace-nowrap shrink-0"
          >
            📌 Saved Jobs
          </Link>
          <Link
            href="/profile/freelancer"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition active:scale-95 whitespace-nowrap shrink-0"
          >
            👤 Profile Settings
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition active:scale-95 whitespace-nowrap shrink-0"
          >
            🔍 Browse More Jobs
          </Link>
        </div>
      </div>

      {/* Controls: Search & Status Filters */}
      <div className="mt-6 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Status Tab Filters */}
        <div className="flex flex-wrap gap-2">
          {["ALL", "PENDING", "ACCEPTED", "REJECTED"].map((status) => {
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
                {status === "ALL"
                  ? "All Proposals"
                  : status === "PENDING"
                  ? "Under Review"
                  : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>

        {/* Search Input Form */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <input
            type="text"
            placeholder="Search proposals..."
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
                router.push(`/dashboard/freelancer?${params.toString()}`);
              }}
              className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-600"
            >
              Reset
            </button>
          )}
        </form>
      </div>

      {/* Proposals List or Empty State */}
      {proposals.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
            📑
          </div>
          <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
            {searchQuery || currentStatus
              ? "No matching proposals found"
              : "No applications submitted yet"}
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            {searchQuery || currentStatus
              ? "Try adjusting your search terms or status filters."
              : "Browse the marketplace and apply for freelance contracts that match your expertise."}
          </p>
          <div className="mt-6">
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
            >
              Browse Open Jobs
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {proposals.map((proposal) => {
            const isHourly = proposal.job.type.toUpperCase() === "HOURLY";

            return (
              <div
                key={proposal.id}
                className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 transition hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Left Column: Job & Bid Summary */}
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {proposal.job.category}
                      </span>
                      <span className="text-zinc-300 dark:text-zinc-700">•</span>
                      <span className="text-zinc-500">
                        Submitted {new Date(proposal.createdAt).toLocaleDateString()}
                      </span>
                      {proposal.job.clientCountry && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700">•</span>
                          <span className="text-zinc-500">📍 {proposal.job.clientCountry}</span>
                        </>
                      )}
                    </div>

                    <Link
                      href={`/jobs/${proposal.job.id}`}
                      className="block text-lg font-bold text-zinc-950 dark:text-white hover:text-emerald-600 transition"
                    >
                      {proposal.job.title}
                    </Link>

                    {/* Proposal Specs Grid */}
                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-2xl bg-zinc-50 p-3.5 border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800 text-xs">
                      <div>
                        <span className="text-zinc-500 dark:text-zinc-400">Your Proposed Bid:</span>
                        <p className="font-bold text-zinc-900 dark:text-white mt-0.5">
                          ${proposal.bidAmount.toLocaleString()} {isHourly ? "/ hr" : "Fixed"}
                        </p>
                      </div>
                      {proposal.estimatedDuration && (
                        <div>
                          <span className="text-zinc-500 dark:text-zinc-400">Duration:</span>
                          <p className="font-semibold text-zinc-900 dark:text-white mt-0.5">
                            {proposal.estimatedDuration}
                          </p>
                        </div>
                      )}
                      <div>
                        <span className="text-zinc-500 dark:text-zinc-400">Job Status:</span>
                        <p className="font-semibold text-zinc-900 dark:text-white mt-0.5 uppercase">
                          {proposal.job.status}
                        </p>
                      </div>
                    </div>

                    {/* Cover Letter Excerpt */}
                    <div className="mt-3">
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                        <span className="font-bold text-zinc-700 dark:text-zinc-300">Cover Letter: </span>
                        {proposal.coverLetter}
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Status Badge & View Job */}
                  <div className="flex md:flex-col items-center md:items-end justify-between gap-3 min-w-[140px]">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                        proposal.status === "ACCEPTED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                          : proposal.status === "REJECTED"
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-400 border border-rose-300 dark:border-rose-800"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-800"
                      }`}
                    >
                      {proposal.status === "ACCEPTED"
                        ? "✓ Accepted"
                        : proposal.status === "REJECTED"
                        ? "✕ Declined"
                        : "⏳ Under Review"}
                    </span>

                    <Link
                      href={`/jobs/${proposal.job.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 transition"
                    >
                      View Contract →
                    </Link>
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
