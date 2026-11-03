"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublicFreelancerProfileData } from "@/types";
import type { UserReviewsSummary } from "@/lib/actions/review";
import { PublicReviewsList } from "@/components/reviews/PublicReviewsList";
import { StaticStarRating } from "@/components/reviews/StarRating";
import { isSafeHttpUrl } from "@/lib/validations/profile";
import { Avatar } from "@/components/ui/Avatar";
import { SendInvitationModal } from "@/components/dashboard/SendInvitationModal";
import { getOrCreatePreHireConversationAction } from "@/lib/actions/message";

export type { PublicFreelancerProfileData };

interface PublicFreelancerProfileViewProps {
  profile: PublicFreelancerProfileData;
  reviewsSummary?: UserReviewsSummary;
  isOwner?: boolean;
  currentUserRole?: string | null;
  clientJobs?: { id: string; title: string }[];
}

export function PublicFreelancerProfileView({
  profile,
  reviewsSummary,
  isOwner = false,
  currentUserRole,
  clientJobs = [],
}: PublicFreelancerProfileViewProps) {
  const router = useRouter();
  const displayName = profile.name || "Freelancer";
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>(clientJobs[0]?.id || "");
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const hasDetails = Boolean(
    profile.title ||
      profile.bio ||
      profile.skills.length > 0 ||
      profile.hourlyRate ||
      profile.portfolioUrls.length > 0
  );

  const handleStartDirectChat = async () => {
    if (!selectedJobId) {
      setChatError("Please select an active job opening to initiate discussion.");
      return;
    }
    setIsStartingChat(true);
    setChatError(null);
    try {
      const res = await getOrCreatePreHireConversationAction(selectedJobId, profile.id);
      if (res.success && res.conversationId) {
        router.push(`/messages?conversationId=${res.conversationId}`);
      } else {
        setChatError(res.error || "Unable to start pre-hire conversation.");
      }
    } catch (err) {
      console.error("Direct chat error:", err);
      setChatError("Failed to initiate chat. Please try again.");
    } finally {
      setIsStartingChat(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Top Navigation & Owner Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/freelancers"
          className="text-xs sm:text-sm font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 inline-flex items-center gap-1.5"
        >
          ← Browse Freelancers
        </Link>
        {isOwner && (
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              Viewing your public profile
            </span>
            <Link
              href="/profile/freelancer"
              className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition"
            >
              Edit Profile ✏️
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Freelancer Card & Contact CTA */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 text-center">
            {/* Deterministic Freelancer Avatar */}
            <div className="mx-auto flex justify-center mb-3">
              <Avatar
                src={profile.image}
                name={displayName}
                role="FREELANCER"
                userId={profile.id}
                size="2xl"
              />
            </div>

            <h1 className="mt-2 text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              {displayName}
            </h1>

            {profile.title ? (
              <p className="mt-1 text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {profile.title}
              </p>
            ) : (
              <p className="mt-1 text-xs text-zinc-400 italic">Independent Professional</p>
            )}

            {profile.location && (
              <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 flex items-center justify-center gap-1">
                <span>📍</span>
                <span>{profile.location}</span>
              </p>
            )}

            <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Rate</p>
                <p className="mt-1 text-base font-extrabold text-zinc-900 dark:text-white">
                  {profile.hourlyRate ? `$${profile.hourlyRate}/hr` : "Open"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Contracts</p>
                <p className="mt-1 text-base font-extrabold text-zinc-900 dark:text-white">
                  {profile._count?.freelancerContracts ?? 0}
                </p>
              </div>
            </div>

            {/* Member Since */}
            <p className="mt-4 text-[11px] text-zinc-400">
              Member since {new Date(profile.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
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

            {/* Contact Action for Clients */}
            {!isOwner && (
              <div id="contact" className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                {currentUserRole === "CLIENT" ? (
                  clientJobs.length > 0 ? (
                    <div className="space-y-2 text-left">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                        Select Job To Discuss
                      </label>
                      <select
                        value={selectedJobId}
                        onChange={(e) => setSelectedJobId(e.target.value)}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                      >
                        {clientJobs.map((j) => (
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

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isStartingChat}
                          onClick={handleStartDirectChat}
                          className="w-full rounded-xl border border-zinc-200 bg-white py-2 text-xs font-bold text-zinc-800 shadow-xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
                        >
                          {isStartingChat ? "Connecting..." : "💬 Chat"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsInviteModalOpen(true)}
                          className="w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                        >
                          🤝 Invite
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 text-center">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Post a job opening to interview this candidate.
                      </p>
                      <Link
                        href="/jobs/new"
                        className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                      >
                        ➕ Post a Job to Interview
                      </Link>
                    </div>
                  )
                ) : (
                  <Link
                    href="/login?callbackUrl=/freelancers"
                    className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
                  >
                    💼 Sign in to Hire Talent
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Languages Sidebar */}
          {profile.languages.length > 0 && (
            <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                Languages
              </h3>
              <div className="mt-3 space-y-2">
                {profile.languages.map((lang) => (
                  <div key={lang} className="text-xs font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
                    <span className="text-emerald-500">✓</span>
                    <span>{lang}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Portfolio & External Links */}
          {profile.portfolioUrls.length > 0 && (
            <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                Project & Portfolio Links
              </h3>
              <div className="mt-3 space-y-2.5">
                {profile.portfolioUrls.map((url, i) => {
                  let host = url;
                  try {
                    host = new URL(url).hostname;
                  } catch {
                    // Fallback
                  }

                  const isSafe = isSafeHttpUrl(url);

                  return isSafe ? (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 hover:underline group"
                    >
                      <span className="truncate max-w-[200px]">{host}</span>
                      <span className="transition-transform group-hover:translate-x-0.5">↗</span>
                    </a>
                  ) : (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs text-zinc-400 italic"
                    >
                      <span className="truncate max-w-[200px]">{host || "Invalid URL"}</span>
                      <span className="text-[10px] text-zinc-400">blocked</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right 2 Columns: Overview, Experience, Skills & Client Reviews */}
        <div className="lg:col-span-2 space-y-6">
          {!hasDetails ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
                👤
              </div>
              <h3 className="mt-4 text-lg font-bold text-zinc-950 dark:text-white">
                Profile Setup In Progress
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                This freelancer hasn&apos;t added an overview, verified skills, or portfolio links yet.
              </p>
              {isOwner && (
                <div className="mt-6">
                  <Link
                    href="/profile/freelancer"
                    className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
                  >
                    Complete Your Profile Now
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Overview / Bio */}
              <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
                <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
                  Overview
                </h2>
                {profile.bio ? (
                  <p className="mt-4 whitespace-pre-line text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed">
                    {profile.bio}
                  </p>
                ) : (
                  <p className="mt-4 text-xs text-zinc-400 italic">No overview written yet.</p>
                )}
              </div>

              {/* Skills */}
              <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
                <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
                  Skills & Expertise
                </h2>
                {profile.skills.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {profile.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border border-zinc-200/60 dark:border-zinc-700"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-zinc-400 italic">No skills listed yet.</p>
                )}
              </div>

              {/* Experience */}
              {profile.experience && (
                <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
                  <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    Experience & Background
                  </h2>
                  <p className="mt-4 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed font-medium">
                    {profile.experience}
                  </p>
                </div>
              )}

              {/* Client Reviews & Ratings */}
              <PublicReviewsList
                reviews={reviewsSummary?.reviews || []}
                averageRating={reviewsSummary?.averageRating ?? null}
                totalReviews={reviewsSummary?.totalReviews ?? 0}
                entityName={displayName}
                entityType="Freelancer"
              />
            </>
          )}
        </div>
      </div>

      {/* Interview Invitation Modal */}
      {isInviteModalOpen && selectedJobId && (
        <SendInvitationModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          jobId={selectedJobId}
          jobTitle={clientJobs.find((j) => j.id === selectedJobId)?.title || "Project Opening"}
          freelancerId={profile.id}
          freelancerName={displayName}
          onSuccess={(conversationId) => {
            setIsInviteModalOpen(false);
            router.push(`/messages?conversationId=${conversationId}`);
          }}
        />
      )}
    </div>
  );
}
