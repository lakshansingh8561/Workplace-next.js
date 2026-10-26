"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { updateProposalStatusAction } from "@/lib/actions/proposal";
import { ProposalStatus } from "@/types";

export interface ReviewProposalItem {
  id: string;
  jobId: string;
  freelancerId: string;
  coverLetter: string;
  bidAmount: number;
  estimatedDuration?: string | null;
  status: ProposalStatus;
  createdAt: string;
  freelancer: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    createdAt?: string;
  };
}

export interface ReviewJobSummary {
  id: string;
  title: string;
  type: string;
  budget?: number | null;
  hourlyMin?: number | null;
  hourlyMax?: number | null;
  status: string;
  proposalsCount: number;
  createdAt: string;
}

interface ClientProposalReviewProps {
  job: ReviewJobSummary;
  initialProposals: ReviewProposalItem[];
}

export function ClientProposalReview({
  job,
  initialProposals,
}: ClientProposalReviewProps) {
  const [proposals, setProposals] = useState<ReviewProposalItem[]>(initialProposals);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isHourly = job.type.toUpperCase() === "HOURLY";

  const handleStatusChange = (proposalId: string, newStatus: "ACCEPTED" | "REJECTED") => {
    setActionError(null);
    setActiveActionId(proposalId);

    startTransition(async () => {
      const res = await updateProposalStatusAction({
        proposalId,
        status: newStatus,
      });

      if (!res.success) {
        setActionError(res.error || "Failed to update proposal status.");
        setActiveActionId(null);
        return;
      }

      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: newStatus } : p))
      );
      setActiveActionId(null);
    });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Navigation & Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link
            href={`/jobs/${job.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
          >
            ← View Job Posting
          </Link>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
            Proposals for: {job.title}
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Contract:{" "}
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {isHourly
                ? `Hourly ($${job.hourlyMin ?? 0} - $${job.hourlyMax ?? 0}/hr)`
                : `Fixed-Price ($${job.budget?.toLocaleString() ?? 0})`}
            </span>{" "}
            • Status: <span className="uppercase font-bold text-emerald-600">{job.status}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {proposals.length} {proposals.length === 1 ? "Proposal" : "Proposals"}
          </span>
        </div>
      </div>

      {/* Global Action Error Alert */}
      {actionError && (
        <div className="mb-6 rounded-2xl bg-red-50 p-4 border border-red-200 dark:bg-red-950/40 dark:border-red-900 text-xs font-semibold text-red-800 dark:text-red-300 flex items-center justify-between">
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

      {/* Proposals List or Empty State */}
      {proposals.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
            📬
          </div>
          <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
            No proposals submitted yet
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            Freelancers can discover your job on the marketplace and submit applications. Check back soon!
          </p>
          <div className="mt-6">
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
            >
              Browse Marketplace
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {proposals.map((proposal) => {
            const isProcessingThis = isPending && activeActionId === proposal.id;
            const freelancerDisplayName =
              proposal.freelancer.name ||
              (proposal.freelancer.email ? proposal.freelancer.email.split("@")[0] : "Freelancer");
            const initials = freelancerDisplayName.slice(0, 2).toUpperCase();

            return (
              <div
                key={proposal.id}
                className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 transition hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                {/* Header row: Freelancer Info & Status */}
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 font-extrabold text-sm dark:bg-emerald-950 dark:text-emerald-400">
                      {initials}
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-zinc-900 dark:text-white">
                        {freelancerDisplayName}
                      </h4>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Submitted on{" "}
                        {new Date(proposal.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase ${
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
                        : "⏳ Pending Review"}
                    </span>
                  </div>
                </div>

                {/* Proposal Specs Grid */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-2xl bg-zinc-50 p-4 border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800 text-xs">
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">Proposed Bid:</span>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white mt-0.5">
                      ${proposal.bidAmount.toLocaleString()} {isHourly ? "/ hr" : "Fixed"}
                    </p>
                  </div>
                  {proposal.estimatedDuration && (
                    <div>
                      <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                        Estimated Time:
                      </span>
                      <p className="text-sm font-bold text-zinc-900 dark:text-white mt-0.5">
                        {proposal.estimatedDuration}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-400 font-medium">Job Type:</span>
                    <p className="text-sm font-bold text-zinc-900 dark:text-white mt-0.5">
                      {job.type}
                    </p>
                  </div>
                </div>

                {/* Cover Letter */}
                <div className="mt-4">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">
                    Cover Letter
                  </h5>
                  <div className="rounded-2xl bg-white p-4 border border-zinc-200/80 dark:bg-zinc-800/20 dark:border-zinc-800 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
                    {proposal.coverLetter}
                  </div>
                </div>

                {/* Status-specific footer actions */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  {proposal.status === "PENDING" ? (
                    <>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Evaluate this proposal carefully before taking action.
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleStatusChange(proposal.id, "REJECTED")}
                          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-rose-400 dark:hover:bg-rose-950/40 transition disabled:opacity-50"
                        >
                          {isProcessingThis ? "Updating..." : "Decline"}
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleStatusChange(proposal.id, "ACCEPTED")}
                          className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 transition disabled:opacity-50"
                        >
                          {isProcessingThis ? (
                            <span className="flex items-center gap-1.5">
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              Accepting...
                            </span>
                          ) : (
                            "Accept Proposal"
                          )}
                        </button>
                      </div>
                    </>
                  ) : proposal.status === "ACCEPTED" ? (
                    <div className="w-full rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                      <span className="font-semibold">
                        ✓ Proposal accepted. Active Contract formed.
                      </span>
                      <Link
                        href="/contracts"
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition"
                      >
                        View Contracts →
                      </Link>
                    </div>
                  ) : (
                    <div className="w-full rounded-xl bg-zinc-100 p-3 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                      <span>Proposal declined. The freelancer has been notified.</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
