"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { updateProposalStatusAction } from "@/lib/actions/proposal";
import { getOrCreatePreHireConversationAction } from "@/lib/actions/message";
import { Avatar } from "@/components/ui/Avatar";
import { ProposalStatus } from "@/types";

const HireConfirmationModal = dynamic(
  () =>
    import("@/components/dashboard/HireConfirmationModal").then(
      (m) => m.HireConfirmationModal
    ),
  { ssr: false }
);
const SendInvitationModal = dynamic(
  () =>
    import("@/components/dashboard/SendInvitationModal").then(
      (m) => m.SendInvitationModal
    ),
  { ssr: false }
);
const DeclineReasonModal = dynamic(
  () =>
    import("@/components/dashboard/DeclineReasonModal").then(
      (m) => m.DeclineReasonModal
    ),
  { ssr: false }
);
const NegotiateProposalModal = dynamic(
  () =>
    import("@/components/dashboard/NegotiateProposalModal").then(
      (m) => m.NegotiateProposalModal
    ),
  { ssr: false }
);

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
    title?: string | null;
    skills?: string[];
    hourlyRate?: number | null;
    location?: string | null;
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
  const router = useRouter();
  const [proposals, setProposals] = useState<ReviewProposalItem[]>(initialProposals);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<{
    message: string;
    link?: string;
    linkText?: string;
  } | null>(null);
  const [contractCreated, setContractCreated] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string>(job.status);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "ACCEPTED" | "REJECTED">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Modals state
  const [hireModalProposal, setHireModalProposal] = useState<ReviewProposalItem | null>(null);
  const [inviteModalProposal, setInviteModalProposal] = useState<ReviewProposalItem | null>(null);
  const [declineModalProposal, setDeclineModalProposal] = useState<ReviewProposalItem | null>(null);
  const [negotiateModalProposal, setNegotiateModalProposal] = useState<ReviewProposalItem | null>(null);

  const isHourly = job.type.toUpperCase() === "HOURLY";

  // Counts for tabs
  const pendingCount = proposals.filter((p) => p.status === "PENDING").length;
  const acceptedCount = proposals.filter((p) => p.status === "ACCEPTED").length;
  const rejectedCount = proposals.filter((p) => p.status === "REJECTED").length;

  // Filtered proposals list
  const filteredProposals = proposals.filter((p) => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const name = p.freelancer.name?.toLowerCase() || "";
      const title = p.freelancer.title?.toLowerCase() || "";
      const cover = p.coverLetter.toLowerCase();
      const skills = (p.freelancer.skills || []).some((s) => s.toLowerCase().includes(q));
      return name.includes(q) || title.includes(q) || cover.includes(q) || skills;
    }
    return true;
  });

  // Action: Start Pre-Hire Chat
  const handleStartChat = (proposal: ReviewProposalItem) => {
    setActionError(null);
    setActiveActionId(proposal.id);

    startTransition(async () => {
      const res = await getOrCreatePreHireConversationAction(job.id, proposal.freelancerId);
      if (!res.success || !res.conversationId) {
        setActionError(res.error || "Failed to initialize conversation thread.");
        setActiveActionId(null);
        return;
      }

      router.push(`/messages?conversationId=${res.conversationId}`);
    });
  };

  // Action: Confirm Hire (Accept Proposal)
  const handleConfirmHire = () => {
    if (!hireModalProposal) return;
    const proposalId = hireModalProposal.id;
    setActionError(null);
    setActiveActionId(proposalId);

    startTransition(async () => {
      const res = await updateProposalStatusAction({
        proposalId,
        status: "ACCEPTED",
      });

      if (!res.success) {
        setActionError(res.error || "Failed to complete hiring action.");
        setActiveActionId(null);
        setHireModalProposal(null);
        return;
      }

      // Update state: winning proposal accepted, other pending proposals rejected
      setProposals((prev) =>
        prev.map((p) => {
          if (p.id === proposalId) return { ...p, status: "ACCEPTED" };
          if (p.status === "PENDING") return { ...p, status: "REJECTED" };
          return p;
        })
      );

      setJobStatus("CLOSED");
      if (res.contractId) {
        setContractCreated(res.contractId);
        setSuccessToast({
          message: "Contract created! Freelancer hired successfully.",
          link: `/contracts/${res.contractId}`,
          linkText: "View Contract →",
        });
      }

      setActiveActionId(null);
      setHireModalProposal(null);
      router.refresh();
    });
  };

  // Action: Confirm Decline (Reject Proposal)
  const handleConfirmDecline = () => {
    if (!declineModalProposal) return;
    const proposalId = declineModalProposal.id;
    setActionError(null);
    setActiveActionId(proposalId);

    startTransition(async () => {
      const res = await updateProposalStatusAction({
        proposalId,
        status: "REJECTED",
      });

      if (!res.success) {
        setActionError(res.error || "Failed to decline proposal.");
        setActiveActionId(null);
        setDeclineModalProposal(null);
        return;
      }

      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: "REJECTED" } : p))
      );

      setSuccessToast({
        message: "Proposal has been declined.",
      });

      setActiveActionId(null);
      setDeclineModalProposal(null);
      router.refresh();
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
            • Status:{" "}
            <span
              className={`uppercase font-bold ${
                jobStatus === "CLOSED" ? "text-zinc-500" : "text-emerald-600"
              }`}
            >
              {jobStatus}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/client"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition"
          >
            Dashboard
          </Link>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {proposals.length} {proposals.length === 1 ? "Proposal" : "Proposals"}
          </span>
        </div>
      </div>

      {/* Contract Created Success Banner */}
      {contractCreated && (
        <div className="mb-6 rounded-2xl bg-emerald-50 p-4 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 text-sm font-medium text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🎉</span>
            <span>
              Proposal accepted! A formal contract has been created and this job is now closed to new proposals.
            </span>
          </div>
          <Link
            href={`/contracts/${contractCreated}`}
            className="inline-flex items-center rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition shrink-0 ml-4"
          >
            View Contract →
          </Link>
        </div>
      )}

      {/* Toast Notification Banner */}
      {successToast && (
        <div className="mb-6 rounded-2xl bg-emerald-50 p-3.5 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{successToast.message}</span>
          </div>
          <div className="flex items-center gap-3">
            {successToast.link && (
              <Link
                href={successToast.link}
                className="font-bold underline text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
              >
                {successToast.linkText || "View →"}
              </Link>
            )}
            <button
              type="button"
              onClick={() => setSuccessToast(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold ml-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}

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

      {/* Filter Tabs & Search Controls */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/80 dark:border-zinc-700/80">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "ALL"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            All ({proposals.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("PENDING")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "PENDING"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("ACCEPTED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "ACCEPTED"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Hired ({acceptedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("REJECTED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "REJECTED"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Declined ({rejectedCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search candidates or skills..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-xs text-zinc-900 shadow-xs placeholder-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Proposals List or Empty State */}
      {filteredProposals.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
            📬
          </div>
          <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
            {searchQuery
              ? "No matching candidate proposals"
              : statusFilter === "PENDING"
              ? "No pending proposals awaiting review"
              : statusFilter === "ACCEPTED"
              ? "No hired proposals for this job"
              : statusFilter === "REJECTED"
              ? "No declined proposals"
              : "No proposals submitted yet"}
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            {searchQuery
              ? "Try adjusting your search keywords to find matching candidates."
              : "Freelancers can discover your job on the marketplace and submit applications."}
          </p>
          {searchQuery && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="text-xs font-bold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                Clear Search
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {filteredProposals.map((proposal) => {
            const isProcessingThis = isPending && activeActionId === proposal.id;
            const freelancerDisplayName =
              proposal.freelancer.name ||
              (proposal.freelancer.email ? proposal.freelancer.email.split("@")[0] : "Freelancer");

            return (
              <div
                key={proposal.id}
                className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 transition hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                {/* Header row: Freelancer Info & Status */}
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-start gap-3">
                    <Link
                      href={`/freelancers/${proposal.freelancer.id}`}
                      target="_blank"
                      className="shrink-0 hover:scale-105 transition"
                      title="View Freelancer Public Profile"
                    >
                      <Avatar
                        src={proposal.freelancer.image}
                        name={freelancerDisplayName}
                        role="FREELANCER"
                        userId={proposal.freelancer.id}
                        size="md"
                      />
                    </Link>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/freelancers/${proposal.freelancer.id}`}
                          target="_blank"
                          className="text-base font-bold text-zinc-900 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400 hover:underline transition"
                        >
                          {freelancerDisplayName}
                        </Link>
                        <Link
                          href={`/freelancers/${proposal.freelancer.id}`}
                          target="_blank"
                          className="rounded-lg bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600 hover:bg-emerald-50 hover:text-emerald-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 transition"
                        >
                          View Profile ↗
                        </Link>
                      </div>
                      {proposal.freelancer.title && (
                        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {proposal.freelancer.title}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        {proposal.freelancer.location && (
                          <span>📍 {proposal.freelancer.location} •</span>
                        )}
                        {proposal.freelancer.hourlyRate ? (
                          <span>${proposal.freelancer.hourlyRate}/hr rate •</span>
                        ) : null}
                        <span>
                          Applied{" "}
                          {new Date(proposal.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>

                      {/* Freelancer Profile Skills */}
                      {proposal.freelancer.skills && proposal.freelancer.skills.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {proposal.freelancer.skills.slice(0, 6).map((skill) => (
                            <span
                              key={skill}
                              className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
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
                      <div className="flex items-center gap-2">
                        {/* Chat / Message Candidate Button */}
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleStartChat(proposal)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 transition disabled:opacity-50"
                        >
                          <span>💬</span>
                          <span>{isProcessingThis ? "Opening Chat..." : "Chat Candidate"}</span>
                        </button>

                        {/* Send Interview Invitation Button */}
                        {jobStatus === "OPEN" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => setInviteModalProposal(proposal)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/60 transition disabled:opacity-50"
                          >
                            <span>🤝</span>
                            <span>Invite to Interview</span>
                          </button>
                        )}
                      </div>

                      {/* Decision Action Buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setNegotiateModalProposal(proposal)}
                          className="inline-flex items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50/80 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 transition disabled:opacity-50"
                        >
                          <span>💬</span>
                          <span>Negotiate Rate</span>
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setDeclineModalProposal(proposal)}
                          className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-rose-400 dark:hover:bg-rose-950/40 transition disabled:opacity-50"
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => setHireModalProposal(proposal)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 transition disabled:opacity-50 active:scale-95"
                        >
                          <span>Hire Freelancer</span>
                          <span>→</span>
                        </button>
                      </div>
                    </>
                  ) : proposal.status === "ACCEPTED" ? (
                    <div className="w-full rounded-2xl bg-emerald-50 p-3.5 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                      <div className="flex items-center gap-2 font-semibold">
                        <span>✓</span>
                        <span>Proposal accepted. Contract established.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartChat(proposal)}
                          className="rounded-lg border border-emerald-300 bg-white px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-zinc-800 dark:text-emerald-300 transition"
                        >
                          Chat →
                        </button>
                        <Link
                          href="/contracts"
                          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-500 transition"
                        >
                          View Contracts →
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full rounded-2xl bg-zinc-100 p-3.5 text-xs text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 flex items-center justify-between">
                      <span>Proposal declined. The candidate was notified.</span>
                      <button
                        type="button"
                        onClick={() => handleStartChat(proposal)}
                        className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white underline"
                      >
                        Message History
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hire Freelancer Confirmation Modal */}
      {hireModalProposal && (
        <HireConfirmationModal
          isOpen={Boolean(hireModalProposal)}
          onClose={() => setHireModalProposal(null)}
          onConfirm={handleConfirmHire}
          isPending={isPending}
          candidateName={
            hireModalProposal.freelancer.name ||
            (hireModalProposal.freelancer.email ? hireModalProposal.freelancer.email.split("@")[0] : "Freelancer")
          }
          candidateTitle={hireModalProposal.freelancer.title}
          jobTitle={job.title}
          bidAmount={hireModalProposal.bidAmount}
          isHourly={isHourly}
          estimatedDuration={hireModalProposal.estimatedDuration}
        />
      )}

      {/* Send Interview Invitation Modal */}
      {inviteModalProposal && (
        <SendInvitationModal
          isOpen={Boolean(inviteModalProposal)}
          onClose={() => setInviteModalProposal(null)}
          jobId={job.id}
          jobTitle={job.title}
          freelancerId={inviteModalProposal.freelancerId}
          freelancerName={
            inviteModalProposal.freelancer.name ||
            (inviteModalProposal.freelancer.email ? inviteModalProposal.freelancer.email.split("@")[0] : "Freelancer")
          }
          onSuccess={(invitationId, conversationId) => {
            setInviteModalProposal(null);
            setSuccessToast({
              message: "Interview invitation sent successfully! Discussion thread opened.",
              link: `/messages?conversationId=${conversationId}`,
              linkText: "Open Chat →",
            });
            router.refresh();
          }}
        />
      )}

      {/* Decline Proposal Confirmation Modal */}
      {declineModalProposal && (
        <DeclineReasonModal
          isOpen={Boolean(declineModalProposal)}
          onClose={() => setDeclineModalProposal(null)}
          onConfirm={handleConfirmDecline}
          isPending={isPending}
          title="Decline Candidate Proposal"
          description={`Are you sure you want to decline ${
            declineModalProposal.freelancer.name || "this freelancer"
          }'s proposal for "${job.title}"? This candidate will be notified.`}
          confirmButtonLabel="Decline Proposal"
          showReasonInput={false}
        />
      )}

      {/* Negotiate Rate Modal */}
      {negotiateModalProposal && (
        <NegotiateProposalModal
          isOpen={Boolean(negotiateModalProposal)}
          onClose={() => setNegotiateModalProposal(null)}
          proposalId={negotiateModalProposal.id}
          freelancerName={
            negotiateModalProposal.freelancer.name ||
            (negotiateModalProposal.freelancer.email ? negotiateModalProposal.freelancer.email.split("@")[0] : "Freelancer")
          }
          currentBidAmount={negotiateModalProposal.bidAmount}
          jobType={job.type}
          jobTitle={job.title}
          onSuccess={() => {
            setSuccessToast({
              message: "Rate negotiation offer sent to freelancer successfully!",
            });
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
