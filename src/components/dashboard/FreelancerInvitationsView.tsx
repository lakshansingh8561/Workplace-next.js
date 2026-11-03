"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  InvitationDto,
  respondToInvitationAction,
} from "@/lib/actions/invitation";
import { DeclineReasonModal } from "@/components/dashboard/DeclineReasonModal";
import { Avatar } from "@/components/ui/Avatar";

interface FreelancerInvitationsViewProps {
  initialInvitations: InvitationDto[];
}

export function FreelancerInvitationsView({
  initialInvitations,
}: FreelancerInvitationsViewProps) {
  const router = useRouter();
  const [invitations, setInvitations] = useState<InvitationDto[]>(initialInvitations);
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<{
    message: string;
    conversationId?: string;
  } | null>(null);
  const [declineModalInvitation, setDeclineModalInvitation] = useState<InvitationDto | null>(null);
  const [isPending, startTransition] = useTransition();

  // Tab counts
  const pendingCount = invitations.filter((i) => i.status === "PENDING").length;
  const acceptedCount = invitations.filter((i) => i.status === "ACCEPTED").length;
  const declinedCount = invitations.filter((i) => i.status === "DECLINED").length;
  const expiredCount = invitations.filter(
    (i) => i.status === "EXPIRED" || i.status === "WITHDRAWN"
  ).length;

  // Filtered invitations list
  const filteredInvitations = invitations.filter((inv) => {
    if (statusFilter === "PENDING" && inv.status !== "PENDING") return false;
    if (statusFilter === "ACCEPTED" && inv.status !== "ACCEPTED") return false;
    if (statusFilter === "DECLINED" && inv.status !== "DECLINED") return false;
    if (
      statusFilter === "EXPIRED" &&
      inv.status !== "EXPIRED" &&
      inv.status !== "WITHDRAWN"
    )
      return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const jobTitle = inv.job.title.toLowerCase();
      const clientName = inv.counterparty.name?.toLowerCase() || "";
      const message = inv.message.toLowerCase();
      return jobTitle.includes(q) || clientName.includes(q) || message.includes(q);
    }
    return true;
  });

  // Action: Accept Interview Invitation
  const handleAcceptInvitation = (invitation: InvitationDto) => {
    setActionError(null);
    setActiveActionId(invitation.id);

    startTransition(async () => {
      const res = await respondToInvitationAction({
        invitationId: invitation.id,
        action: "ACCEPT",
      });

      if (!res.success) {
        setActionError(res.error || "Failed to accept interview invitation.");
        setActiveActionId(null);
        return;
      }

      setInvitations((prev) =>
        prev.map((i) =>
          i.id === invitation.id
            ? { ...i, status: "ACCEPTED", respondedAt: new Date().toISOString() }
            : i
        )
      );

      setActionSuccess({
        message: "Interview invitation accepted! Pre-hire discussion thread is active.",
        conversationId: invitation.conversationId,
      });

      setActiveActionId(null);
      router.refresh();
    });
  };

  // Action: Confirm Decline
  const handleConfirmDecline = (reason?: string) => {
    if (!declineModalInvitation) return;
    const invId = declineModalInvitation.id;
    setActionError(null);
    setActiveActionId(invId);

    startTransition(async () => {
      const res = await respondToInvitationAction({
        invitationId: invId,
        action: "DECLINE",
        reason,
      });

      if (!res.success) {
        setActionError(res.error || "Failed to decline invitation.");
        setActiveActionId(null);
        setDeclineModalInvitation(null);
        return;
      }

      setInvitations((prev) =>
        prev.map((i) =>
          i.id === invId
            ? { ...i, status: "DECLINED", respondedAt: new Date().toISOString() }
            : i
        )
      );

      setActionSuccess({
        message: "Invitation declined.",
      });

      setActiveActionId(null);
      setDeclineModalInvitation(null);
      router.refresh();
    });
  };

  const formatExpiry = (expiresAtStr: string) => {
    try {
      const expiry = new Date(expiresAtStr);
      const now = new Date();
      const diffMs = expiry.getTime() - now.getTime();
      if (diffMs <= 0) return "Expired";
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 24) return `Expires in ${diffHours}h`;
      const diffDays = Math.ceil(diffHours / 24);
      return `Expires in ${diffDays}d`;
    } catch {
      return "Expired";
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              Interview Invitations
            </h1>
            <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
              {invitations.length} Total
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Clients who want to interview you for their posted freelance jobs.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/freelancer/proposals"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition"
          >
            📋 My Proposals
          </Link>
          <Link
            href="/jobs/saved"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition"
          >
            📌 Saved Jobs
          </Link>
          <Link
            href="/jobs"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition"
          >
            🔍 Browse Jobs
          </Link>
        </div>
      </div>

      {/* Success Notification Alert */}
      {actionSuccess && (
        <div className="mt-6 rounded-2xl bg-emerald-50 p-4 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{actionSuccess.message}</span>
          </div>
          <div className="flex items-center gap-3">
            {actionSuccess.conversationId && (
              <Link
                href={`/messages?conversationId=${actionSuccess.conversationId}`}
                className="font-bold underline text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
              >
                Open Message Thread →
              </Link>
            )}
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              className="text-emerald-700 hover:text-emerald-900 font-bold"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Action Error Alert */}
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

      {/* Tabs & Search Controls */}
      <div className="mt-6 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Status Tab Filters */}
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
            All ({invitations.length})
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
            Accepted ({acceptedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("DECLINED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "DECLINED"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Declined ({declinedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("EXPIRED")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              statusFilter === "EXPIRED"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-white"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            Expired / Withdrawn ({expiredCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <input
            type="text"
            placeholder="Search jobs or clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-1.5 text-xs text-zinc-900 shadow-xs placeholder-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
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

      {/* Invitations List or Empty State */}
      {filteredInvitations.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
            🤝
          </div>
          <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
            {searchQuery
              ? "No matching interview invitations"
              : statusFilter === "PENDING"
              ? "No pending invitations awaiting response"
              : statusFilter === "ACCEPTED"
              ? "No accepted invitations yet"
              : statusFilter === "DECLINED"
              ? "No declined invitations"
              : "No interview invitations received yet"}
          </h3>
          <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            {searchQuery
              ? "Try adjusting your search keywords to find specific invitations."
              : "When clients discover your profile or review your proposals, their interview requests will appear here."}
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
            >
              Browse Open Jobs
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {filteredInvitations.map((inv) => {
            const isProcessingThis = isPending && activeActionId === inv.id;
            const clientName = inv.counterparty.name || "Client";
            const isHourly = inv.job.type.toUpperCase() === "HOURLY";
            const isPendingStatus = inv.status === "PENDING";
            const isAcceptedStatus = inv.status === "ACCEPTED";
            const isDeclinedStatus = inv.status === "DECLINED";

            return (
              <div
                key={inv.id}
                className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 transition hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                {/* Header: Client info & Status */}
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-start gap-3">
                    <Avatar
                      src={inv.counterparty.image}
                      name={clientName}
                      role="CLIENT"
                      userId={inv.counterparty.id}
                      size="md"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-zinc-900 dark:text-white">
                          {clientName}
                        </span>
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          Client
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        <span>
                          Invited on{" "}
                          {new Date(inv.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        {isPendingStatus && (
                          <>
                            <span>•</span>
                            <span className="font-semibold text-amber-600 dark:text-amber-400">
                              ⏳ {formatExpiry(inv.expiresAt)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wider uppercase ${
                        isAcceptedStatus
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800"
                          : isDeclinedStatus
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-400 border border-rose-300 dark:border-rose-800"
                          : isPendingStatus
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-400 border border-amber-300 dark:border-amber-800"
                          : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700"
                      }`}
                    >
                      {isAcceptedStatus
                        ? "✓ Accepted"
                        : isDeclinedStatus
                        ? "✕ Declined"
                        : isPendingStatus
                        ? "⏳ Action Required"
                        : inv.status === "WITHDRAWN"
                        ? "Withdrawn"
                        : "Expired"}
                    </span>
                  </div>
                </div>

                {/* Job Link & Overview */}
                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/jobs/${inv.job.id}`}
                      className="text-base sm:text-lg font-bold text-zinc-950 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400 transition hover:underline"
                    >
                      {inv.job.title} ↗
                    </Link>
                    <span className="rounded-xl bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      {isHourly
                        ? `Hourly ($${inv.job.hourlyMin ?? 0} - $${inv.job.hourlyMax ?? 0}/hr)`
                        : `Fixed-Price ($${inv.job.budget?.toLocaleString() ?? 0})`}
                    </span>
                  </div>
                </div>

                {/* Invitation Message Box */}
                <div className="mt-4">
                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                    Client&apos;s Invitation Message:
                  </h5>
                  <div className="rounded-2xl bg-indigo-50/50 p-4 border border-indigo-100 dark:bg-indigo-950/20 dark:border-indigo-900/40 text-xs sm:text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-line leading-relaxed">
                    &ldquo;{inv.message}&rdquo;
                  </div>
                </div>

                {/* Action Buttons Footer */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/jobs/${inv.job.id}`}
                      className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-750 transition"
                    >
                      View Job Details
                    </Link>
                    <Link
                      href={`/messages?conversationId=${inv.conversationId}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-750 transition"
                    >
                      <span>💬</span>
                      <span>Message Thread</span>
                    </Link>
                  </div>

                  {isPendingStatus ? (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setDeclineModalInvitation(inv)}
                        className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-rose-400 dark:hover:bg-rose-950/40 transition disabled:opacity-50"
                      >
                        Decline
                      </button>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleAcceptInvitation(inv)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition disabled:opacity-50 active:scale-95"
                      >
                        {isProcessingThis ? (
                          <>
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            <span>Accepting...</span>
                          </>
                        ) : (
                          <>
                            <span>Accept Interview</span>
                            <span>→</span>
                          </>
                        )}
                      </button>
                    </div>
                  ) : isAcceptedStatus ? (
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <span>✓ You accepted this interview request.</span>
                      <Link
                        href={`/messages?conversationId=${inv.conversationId}`}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 transition ml-2"
                      >
                        Open Discussion Thread →
                      </Link>
                    </div>
                  ) : isDeclinedStatus ? (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      You declined this invitation.
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {inv.status === "WITHDRAWN"
                        ? "This invitation was withdrawn by the client."
                        : "This invitation has expired."}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Decline Invitation Modal */}
      {declineModalInvitation && (
        <DeclineReasonModal
          isOpen={Boolean(declineModalInvitation)}
          onClose={() => setDeclineModalInvitation(null)}
          onConfirm={handleConfirmDecline}
          isPending={isPending}
          title="Decline Interview Invitation"
          description={`Are you sure you want to decline the interview invitation for "${declineModalInvitation.job.title}"?`}
          confirmButtonLabel="Decline Invitation"
          showReasonInput={true}
        />
      )}
    </div>
  );
}
