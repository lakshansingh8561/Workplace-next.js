"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/Avatar";
import { getOrCreateDirectConversationAction } from "@/lib/actions/message";
import { updateProposalStatusAction } from "@/lib/actions/proposal";
import { HireConfirmationModal } from "@/components/dashboard/HireConfirmationModal";
import { DeclineReasonModal } from "@/components/dashboard/DeclineReasonModal";

export interface ReceivedProposalItem {
  id: string;
  jobId: string;
  freelancerId: string;
  coverLetter: string;
  bidAmount: number;
  estimatedDuration?: string | null;
  status: string;
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
  };
  job: {
    id: string;
    title: string;
    type: string;
    budget?: number | null;
    hourlyMin?: number | null;
    hourlyMax?: number | null;
    status: string;
  };
}

interface ClientAllProposalsViewProps {
  initialProposals: ReceivedProposalItem[];
}

export function ClientAllProposalsView({ initialProposals }: ClientAllProposalsViewProps) {
  const router = useRouter();
  const [proposals, setProposals] = useState<ReceivedProposalItem[]>(initialProposals);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [hireModalProposal, setHireModalProposal] = useState<ReceivedProposalItem | null>(null);
  const [declineModalProposal, setDeclineModalProposal] = useState<ReceivedProposalItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleStartChat = async (freelancerId: string, jobId: string) => {
    setActiveChatId(freelancerId);
    setActionError(null);
    try {
      const res = await getOrCreateDirectConversationAction(freelancerId, jobId);
      if (res.success && res.conversationId) {
        router.push(`/messages?conversationId=${res.conversationId}`);
      } else {
        setActionError(res.error || "Unable to start conversation.");
      }
    } catch {
      setActionError("Failed to open chat. Please try again.");
    } finally {
      setActiveChatId(null);
    }
  };

  const handleConfirmHire = () => {
    if (!hireModalProposal) return;
    const proposalId = hireModalProposal.id;
    setActionError(null);

    startTransition(async () => {
      const res = await updateProposalStatusAction({
        proposalId,
        status: "ACCEPTED",
      });

      if (!res.success) {
        setActionError(res.error || "Failed to hire freelancer.");
        setHireModalProposal(null);
        return;
      }

      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: "ACCEPTED" } : p))
      );

      setToastMessage("Freelancer hired successfully! Contract is now active.");
      setHireModalProposal(null);
      router.refresh();
    });
  };

  const handleConfirmDecline = () => {
    if (!declineModalProposal) return;
    const proposalId = declineModalProposal.id;
    setActionError(null);

    startTransition(async () => {
      const res = await updateProposalStatusAction({
        proposalId,
        status: "REJECTED",
      });

      if (!res.success) {
        setActionError(res.error || "Failed to decline proposal.");
        setDeclineModalProposal(null);
        return;
      }

      setProposals((prev) =>
        prev.map((p) => (p.id === proposalId ? { ...p, status: "REJECTED" } : p))
      );

      setToastMessage("Proposal declined.");
      setDeclineModalProposal(null);
      router.refresh();
    });
  };

  const filtered = proposals.filter((p) => {
    if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const fName = p.freelancer.name?.toLowerCase() || "";
      const jTitle = p.job.title.toLowerCase();
      const cover = p.coverLetter.toLowerCase();
      const skills = (p.freelancer.skills || []).some((s) => s.toLowerCase().includes(q));
      return fName.includes(q) || jTitle.includes(q) || cover.includes(q) || skills;
    }
    return true;
  });

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              Received Proposals & Applicants
            </h1>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              {proposals.length} Total
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Review candidate applications, negotiate rates, chat directly, and award contracts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/client"
            className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
          >
            ← My Jobs
          </Link>
          <Link
            href="/jobs/new"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
          >
            + Post New Job
          </Link>
        </div>
      </div>

      {toastMessage && (
        <div className="mt-4 rounded-2xl bg-emerald-50 p-3.5 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <span>✓ {toastMessage}</span>
          <button type="button" onClick={() => setToastMessage(null)} className="font-bold">
            ✕
          </button>
        </div>
      )}

      {actionError && (
        <div className="mt-4 rounded-2xl bg-rose-50 p-3.5 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-900 text-xs font-semibold text-rose-800 dark:text-rose-300 flex items-center justify-between">
          <span>⚠️ {actionError}</span>
          <button type="button" onClick={() => setActionError(null)} className="font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700">
          {["ALL", "PENDING", "ACCEPTED", "REJECTED"].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                statusFilter === st
                  ? "bg-white text-zinc-950 shadow-xs dark:bg-zinc-900 dark:text-white"
                  : "text-zinc-600 hover:text-zinc-950 dark:text-zinc-400"
              }`}
            >
              {st === "ALL" ? "All" : st.charAt(0) + st.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Search applicants, jobs, skills..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-900 shadow-xs focus:border-emerald-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-white w-full sm:w-64"
        />
      </div>

      {/* Proposals List */}
      {filtered.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
            📬
          </div>
          <h3 className="mt-4 text-base font-bold text-zinc-950 dark:text-white">
            No proposals found
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            {searchQuery || statusFilter !== "ALL"
              ? "No proposals match your current filters. Try resetting search terms."
              : "When freelancers apply to your job postings, their proposals will appear here for review."}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {filtered.map((proposal) => {
            const isHourly = proposal.job.type.toUpperCase() === "HOURLY";
            const isPendingStatus =
              proposal.status === "PENDING" ||
              proposal.status === "UNDER_REVIEW" ||
              proposal.status === "SHORTLISTED";

            return (
              <div
                key={proposal.id}
                className="rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-xs hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/90 transition"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Freelancer Info */}
                  <div className="flex items-start gap-4 flex-1">
                    <Avatar
                      src={proposal.freelancer.image}
                      name={proposal.freelancer.name}
                      role="FREELANCER"
                      userId={proposal.freelancer.id}
                      size="lg"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/freelancers/${proposal.freelancer.id}`}
                          className="text-base font-extrabold text-zinc-950 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400 transition"
                        >
                          {proposal.freelancer.name || "Freelancer"}
                        </Link>
                        {proposal.freelancer.location && (
                          <span className="text-xs text-zinc-400">
                            📍 {proposal.freelancer.location}
                          </span>
                        )}
                      </div>

                      <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {proposal.freelancer.title || "Independent Specialist"}
                      </p>

                      <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap items-center gap-1.5">
                        <span>Applied for:</span>
                        <Link
                          href={`/dashboard/client/jobs/${proposal.job.id}/proposals`}
                          className="font-bold text-zinc-800 hover:text-emerald-600 dark:text-zinc-200 underline"
                        >
                          {proposal.job.title}
                        </Link>
                      </div>

                      {proposal.freelancer.skills && proposal.freelancer.skills.length > 0 && (
                        <div className="mt-2.5 flex flex-wrap gap-1">
                          {proposal.freelancer.skills.slice(0, 5).map((sk) => (
                            <span
                              key={sk}
                              className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {sk}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bid & Status */}
                  <div className="flex flex-col md:items-end gap-1.5 shrink-0 text-left md:text-right">
                    <span className="text-sm font-extrabold text-zinc-950 dark:text-white">
                      ${proposal.bidAmount.toLocaleString()} {isHourly ? "/ hr" : "Fixed"}
                    </span>
                    {proposal.estimatedDuration && (
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        ⏱️ {proposal.estimatedDuration}
                      </span>
                    )}
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
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

                {/* Cover Letter */}
                <div className="mt-4 rounded-2xl bg-zinc-50 p-4 border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed">
                  {proposal.coverLetter}
                </div>

                {/* Actions Bar */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/freelancers/${proposal.freelancer.id}`}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
                    >
                      View Profile
                    </Link>
                    <button
                      type="button"
                      disabled={activeChatId === proposal.freelancer.id}
                      onClick={() => handleStartChat(proposal.freelancer.id, proposal.job.id)}
                      className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition disabled:opacity-50"
                    >
                      {activeChatId === proposal.freelancer.id ? "Connecting..." : "💬 Message"}
                    </button>
                  </div>

                  {isPendingStatus && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDeclineModalProposal(proposal)}
                        className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-rose-400 transition"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        onClick={() => setHireModalProposal(proposal)}
                        className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                      >
                        Hire Freelancer →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {hireModalProposal && (
        <HireConfirmationModal
          isOpen={Boolean(hireModalProposal)}
          onClose={() => setHireModalProposal(null)}
          onConfirm={handleConfirmHire}
          isPending={isPending}
          candidateName={hireModalProposal.freelancer.name || "Freelancer"}
          candidateTitle={hireModalProposal.freelancer.title}
          jobTitle={hireModalProposal.job.title}
          bidAmount={hireModalProposal.bidAmount}
          isHourly={hireModalProposal.job.type.toUpperCase() === "HOURLY"}
          estimatedDuration={hireModalProposal.estimatedDuration}
        />
      )}

      {declineModalProposal && (
        <DeclineReasonModal
          isOpen={Boolean(declineModalProposal)}
          onClose={() => setDeclineModalProposal(null)}
          onConfirm={handleConfirmDecline}
          isPending={isPending}
          title="Decline Candidate Proposal"
          description={`Are you sure you want to decline ${
            declineModalProposal.freelancer.name || "this freelancer"
          }'s proposal for "${declineModalProposal.job.title}"?`}
          confirmButtonLabel="Decline Proposal"
          showReasonInput={false}
        />
      )}
    </div>
  );
}

