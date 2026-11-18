"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  InvitationDto,
  withdrawInterviewInvitationAction,
} from "@/lib/actions/invitation";
import { Avatar } from "@/components/ui/Avatar";
import { formatDate } from "@/lib/utils";

interface ClientInvitationsViewProps {
  initialInvitations: InvitationDto[];
}

export function ClientInvitationsView({
  initialInvitations,
}: ClientInvitationsViewProps) {
  const router = useRouter();
  const [invitations, setInvitations] = useState<InvitationDto[]>(initialInvitations);
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED"
  >("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Counts
  const pendingCount = invitations.filter((i) => i.status === "PENDING").length;
  const acceptedCount = invitations.filter((i) => i.status === "ACCEPTED").length;
  const declinedCount = invitations.filter((i) => i.status === "DECLINED").length;
  const expiredCount = invitations.filter(
    (i) => i.status === "EXPIRED" || i.status === "WITHDRAWN"
  ).length;

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
      const freelancerName = inv.counterparty.name?.toLowerCase() || "";
      const message = inv.message.toLowerCase();
      return jobTitle.includes(q) || freelancerName.includes(q) || message.includes(q);
    }
    return true;
  });

  const handleWithdraw = (invitationId: string) => {
    if (isPending) return;
    setActionError(null);
    setActionSuccess(null);
    setWithdrawingId(invitationId);

    startTransition(async () => {
      const res = await withdrawInterviewInvitationAction({ invitationId });

      if (!res.success) {
        setActionError(res.error || "Failed to withdraw invitation.");
        setWithdrawingId(null);
        return;
      }

      setInvitations((prev) =>
        prev.map((inv) =>
          inv.id === invitationId
            ? { ...inv, status: "WITHDRAWN", respondedAt: new Date().toISOString() }
            : inv
        )
      );

      setActionSuccess("Interview invitation successfully withdrawn.");
      setWithdrawingId(null);
      router.refresh();
    });
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              Sent Interview Invitations
            </h1>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              {invitations.length} Sent
            </span>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Track interview invitations sent to prospective freelancers and monitor responses.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/client"
            className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 transition active:scale-95"
          >
            ← My Jobs
          </Link>
          <Link
            href="/freelancers"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition active:scale-95"
          >
            🔍 Find Freelancers
          </Link>
        </div>
      </div>

      {/* Notifications */}
      {actionSuccess && (
        <div className="mt-6 rounded-2xl bg-emerald-50 p-4 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <span>✅ {actionSuccess}</span>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

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

      {/* Tabs & Search */}
      <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "ALL", label: "All", count: invitations.length },
            { id: "PENDING", label: "Pending", count: pendingCount },
            { id: "ACCEPTED", label: "Accepted", count: acceptedCount },
            { id: "DECLINED", label: "Declined", count: declinedCount },
            { id: "EXPIRED", label: "Expired / Withdrawn", count: expiredCount },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                statusFilter === tab.id
                  ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-950"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  statusFilter === tab.id
                    ? "bg-white/20 text-white dark:bg-zinc-950/20 dark:text-zinc-950"
                    : "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search candidate or job..."
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </div>

      {/* Invitations List */}
      <div className="mt-6 space-y-4">
        {filteredInvitations.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200/80 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-4xl block mb-2">✉️</span>
            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
              No interview invitations found
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
              {searchQuery || statusFilter !== "ALL"
                ? "No sent invitations match your current filter criteria."
                : "You haven't sent any interview invitations yet. Explore available talent to interview."}
            </p>
            <div className="mt-5">
              <Link
                href="/freelancers"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition"
              >
                Find Freelancers
              </Link>
            </div>
          </div>
        ) : (
          filteredInvitations.map((inv) => {
            const isPendingState = inv.status === "PENDING";
            const isAcceptedState = inv.status === "ACCEPTED";
            const isDeclinedState = inv.status === "DECLINED";

            return (
              <div
                key={inv.id}
                className="rounded-3xl border border-zinc-200/80 bg-white p-5 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 transition hover:border-zinc-300 dark:hover:border-zinc-700"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Left: Freelancer & Job details */}
                  <div className="flex items-start gap-4">
                    <Avatar
                      src={inv.counterparty.image}
                      name={inv.counterparty.name || "Freelancer"}
                      role="FREELANCER"
                      userId={inv.counterparty.id}
                      size="md"
                      className="shrink-0 border border-zinc-200 dark:border-zinc-700 rounded-2xl"
                    />

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/freelancers/${inv.counterparty.id}`}
                          className="text-sm font-bold text-zinc-950 dark:text-white hover:underline"
                        >
                          {inv.counterparty.name || "Freelancer"}
                        </Link>

                        {/* Status Badge */}
                        {isPendingState && (
                          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                            ⏳ Pending Response
                          </span>
                        )}
                        {isAcceptedState && (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                            🤝 Accepted
                          </span>
                        )}
                        {isDeclinedState && (
                          <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                            ✕ Declined
                          </span>
                        )}
                        {inv.status === "WITHDRAWN" && (
                          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            ↩ Withdrawn
                          </span>
                        )}
                        {inv.status === "EXPIRED" && (
                          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                            ⏱ Expired
                          </span>
                        )}
                      </div>

                      {/* Job Opening info */}
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Invited for:{" "}
                        <Link
                          href={`/jobs/${inv.job.id}`}
                          className="font-semibold text-zinc-800 dark:text-zinc-200 hover:underline"
                        >
                          {inv.job.title}
                        </Link>
                      </p>

                      {/* Message preview */}
                      <div className="mt-3 rounded-2xl bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300 border border-zinc-100 dark:border-zinc-800">
                        <p className="line-clamp-3 italic">&ldquo;{inv.message}&rdquo;</p>
                      </div>

                      {/* Timeline details */}
                      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-zinc-400">
                        <span>Sent {formatDate(inv.createdAt)}</span>
                        {isPendingState && (
                          <span>Expires {formatDate(inv.expiresAt)}</span>
                        )}
                        {inv.respondedAt && (
                          <span>Responded {formatDate(inv.respondedAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
                    <Link
                      href={`/messages?conversationId=${inv.conversationId}`}
                      className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200 transition"
                    >
                      💬 Discussion
                    </Link>

                    {isPendingState && (
                      <button
                        type="button"
                        onClick={() => handleWithdraw(inv.id)}
                        disabled={withdrawingId === inv.id || isPending}
                        className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/40 transition disabled:opacity-50"
                      >
                        {withdrawingId === inv.id ? "Withdrawing..." : "Withdraw"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
