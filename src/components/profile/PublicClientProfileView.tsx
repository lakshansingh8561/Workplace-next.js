"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { StaticStarRating } from "@/components/reviews/StarRating";
import { PublicReviewsList } from "@/components/reviews/PublicReviewsList";
import { getOrCreatePreHireConversationAction } from "@/lib/actions/message";
import type { UserReviewsSummary } from "@/lib/actions/review";

export interface PublicClientJobItem {
  id: string;
  title: string;
  description: string;
  category: string;
  skills: string[];
  type: "FIXED" | "HOURLY";
  budget: number | null;
  hourlyMin: number | null;
  hourlyMax: number | null;
  duration: string | null;
  experienceLevel: string;
  proposalsCount: number;
  createdAt: string;
}

export interface PublicClientProfileData {
  id: string;
  name: string;
  image?: string | null;
  companyName: string | null;
  companyDescription: string | null;
  companyIndustry: string | null;
  companyWebsite: string | null;
  location: string | null;
  createdAt: string;
  totalJobsCount: number;
  openJobs: PublicClientJobItem[];
  completedContractsCount?: number;
  totalHiresCount?: number;
  hireRate?: number;
  paymentVerified?: boolean;
}

interface PublicClientProfileViewProps {
  client: PublicClientProfileData;
  reviewsSummary?: UserReviewsSummary;
  isOwner?: boolean;
  currentUserRole?: string;
  currentUserId?: string;
}

export function PublicClientProfileView({
  client,
  reviewsSummary,
  isOwner = false,
  currentUserRole,
  currentUserId,
}: PublicClientProfileViewProps) {
  const router = useRouter();
  const displayName = client.companyName || client.name;
  const contactName = client.companyName ? client.name : null;

  const [selectedJobId, setSelectedJobId] = useState<string>(
    client.openJobs[0]?.id || ""
  );
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [chatJobId, setChatJobId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  const handleStartChat = async (targetJobId?: string) => {
    const jobIdToUse = targetJobId || selectedJobId;
    if (!jobIdToUse) {
      setChatError("This client currently has no open job postings to discuss.");
      return;
    }

    setIsStartingChat(true);
    setChatJobId(jobIdToUse);
    setChatError(null);

    try {
      const res = await getOrCreatePreHireConversationAction(
        jobIdToUse,
        client.id
      );
      if (res.success && res.conversationId) {
        router.push(`/messages?conversationId=${res.conversationId}`);
      } else {
        setChatError(res.error || "Unable to start conversation with this client.");
      }
    } catch (err) {
      console.error("Failed to start chat with client:", err);
      setChatError("An unexpected error occurred. Please try again.");
    } finally {
      setIsStartingChat(false);
      setChatJobId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Top Navigation */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/clients"
          className="text-xs sm:text-sm font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 inline-flex items-center gap-1.5"
        >
          ← Browse Clients Directory
        </Link>
        {isOwner && (
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Viewing your company profile
            </span>
            <Link
              href="/profile/client"
              className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition"
            >
              Edit Company Profile ✏️
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Client Company Card */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 text-center">
            {/* Deterministic Client Avatar */}
            <div className="mx-auto flex justify-center mb-3">
              <Avatar
                src={client.image}
                name={displayName}
                role="CLIENT"
                userId={client.id}
                size="2xl"
              />
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-2">
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
                {displayName}
              </h1>
              <span
                className="text-emerald-600 text-sm font-bold"
                title="Verified WorkPulse Client"
              >
                ✓
              </span>
            </div>

            {contactName && (
              <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Primary contact: <strong className="text-zinc-700 dark:text-zinc-300">{contactName}</strong>
              </p>
            )}

            {client.companyIndustry && (
              <div className="mt-2.5">
                <span className="rounded-lg bg-zinc-100 px-2.5 py-0.5 text-[11px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {client.companyIndustry}
                </span>
              </div>
            )}

            {client.location && (
              <p className="mt-2.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-1">
                <span>📍</span>
                <span>{client.location}</span>
              </p>
            )}

            {client.companyWebsite && (
              <div className="mt-3">
                <a
                  href={
                    client.companyWebsite.startsWith("http")
                      ? client.companyWebsite
                      : `https://${client.companyWebsite}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400 inline-flex items-center gap-1"
                >
                  <span>🌐 Website</span>
                  <span>↗</span>
                </a>
              </div>
            )}

            {/* Hiring Stats */}
            <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Open Jobs</p>
                <p className="mt-1 text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                  {client.openJobs.length}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Total Posted</p>
                <p className="mt-1 text-sm font-extrabold text-zinc-900 dark:text-white">
                  {client.totalJobsCount}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Completed</p>
                <p className="mt-1 text-sm font-extrabold text-zinc-900 dark:text-white">
                  {client.completedContractsCount ?? 0}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Hire Rate</p>
                <p className="mt-1 text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                  {client.hireRate ?? 0}%
                </p>
              </div>
            </div>

            {/* Verification Pill */}
            <div className={`mt-5 rounded-2xl p-3 text-center border ${
              client.paymentVerified
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80"
                : "bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700"
            }`}>
              <span className={`text-xs font-bold flex items-center justify-center gap-1.5 ${
                client.paymentVerified
                  ? "text-emerald-800 dark:text-emerald-300"
                  : "text-zinc-600 dark:text-zinc-400"
              }`}>
                <span>💳</span>
                <span>{client.paymentVerified ? "Payment Method Verified" : "Payment Verification in Progress"}</span>
              </span>
            </div>

            {/* Member Since */}
            <p className="mt-5 text-[11px] text-zinc-400">
              Hiring on WorkPulse since{" "}
              {new Date(client.createdAt).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </p>

            {/* Rating Summary */}
            <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-center">
              <StaticStarRating
                rating={reviewsSummary?.averageRating ?? null}
                count={reviewsSummary?.totalReviews ?? 0}
                showCount={true}
                size="sm"
              />
            </div>

            {/* Contact Client Action for Freelancers */}
            {!isOwner && (
              <div id="contact" className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                {currentUserRole === "FREELANCER" ? (
                  client.openJobs.length > 0 ? (
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                        Discuss Active Job Opening
                      </label>
                      <select
                        value={selectedJobId}
                        onChange={(e) => setSelectedJobId(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                      >
                        {client.openJobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.title}
                          </option>
                        ))}
                      </select>

                      {chatError && (
                        <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                          {chatError}
                        </p>
                      )}

                      <button
                        type="button"
                        disabled={isStartingChat}
                        onClick={() => handleStartChat()}
                        className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition disabled:opacity-50"
                      >
                        {isStartingChat && !chatJobId ? "Connecting..." : "💬 Message Client"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2 text-center">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        This client currently has no open job openings. Direct pre-hire messaging requires an active opening.
                      </p>
                    </div>
                  )
                ) : !currentUserId ? (
                  <Link
                    href={`/login?callbackUrl=/clients/${client.id}`}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                  >
                    💬 Sign in to Contact Client
                  </Link>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Right 2 Columns: About Company & Published Openings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Company Overview */}
          <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
            <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
              About the Company
            </h2>
            <p className="mt-4 whitespace-pre-line text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
              {client.companyDescription ||
                "This client collaborates with top independent professionals on WorkPulse across engineering, product design, marketing, and technical architecture."}
            </p>
          </div>

          {/* Active Job Openings */}
          <div id="jobs" className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                Active Job Openings ({client.openJobs.length})
              </h2>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Publicly Listed
              </span>
            </div>

            {client.openJobs.length === 0 ? (
              <div className="py-10 text-center">
                <span className="text-3xl mb-2 block">💼</span>
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  No active job openings right now
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                  This client currently has no open project requirements posted. Check back later!
                </p>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800 space-y-4">
                {client.openJobs.map((job) => (
                  <div key={job.id} className="pt-4 first:pt-0">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-sm sm:text-base font-bold text-zinc-950 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400 transition"
                        >
                          {job.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                          <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            {job.category}
                          </span>
                          <span>•</span>
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                            {job.type === "FIXED"
                              ? `$${job.budget ?? 0} Fixed`
                              : `$${job.hourlyMin ?? 0} - $${job.hourlyMax ?? 0}/hr`}
                          </span>
                          <span>•</span>
                          <span>{job.experienceLevel}</span>
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
                        {currentUserRole === "FREELANCER" && (
                          <button
                            type="button"
                            disabled={isStartingChat && chatJobId === job.id}
                            onClick={() => handleStartChat(job.id)}
                            className="inline-flex items-center rounded-xl border border-emerald-300 bg-emerald-50/60 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 transition disabled:opacity-50"
                          >
                            {isStartingChat && chatJobId === job.id ? "Connecting..." : "💬 Message"}
                          </button>
                        )}
                        <Link
                          href={`/jobs/${job.id}`}
                          className="inline-flex items-center rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
                        >
                          View Job ↗
                        </Link>
                        <Link
                          href={`/jobs/${job.id}#propose`}
                          className="inline-flex items-center rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                        >
                          Apply Now
                        </Link>
                      </div>
                    </div>

                    <p className="mt-2.5 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                      {job.description}
                    </p>

                    {job.skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {job.skills.slice(0, 5).map((sk) => (
                          <span
                            key={sk}
                            className="rounded-lg bg-zinc-50 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700"
                          >
                            {sk}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Client Reviews on Completed Contracts */}
          <PublicReviewsList
            reviews={reviewsSummary?.reviews || []}
            averageRating={reviewsSummary?.averageRating ?? null}
            totalReviews={reviewsSummary?.totalReviews ?? 0}
            entityName={displayName}
            entityType="Client"
          />
        </div>
      </div>
    </div>
  );
}

