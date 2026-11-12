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
import { DirectHireModal } from "@/components/dashboard/DirectHireModal";
import { getOrCreatePreHireConversationAction, getOrCreateDirectConversationAction } from "@/lib/actions/message";

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
  const [isDirectHireOpen, setIsDirectHireOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>(clientJobs[0]?.id || "");
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Private profile check: If not owner and profile is private, show clean restricted state
  if (profile.visibility === "PRIVATE" && !isOwner) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="rounded-3xl border border-zinc-200 bg-white p-12 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-3xl dark:bg-zinc-800">
            🔒
          </div>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
            {displayName}&apos;s Profile is Private
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            This freelancer has set their profile visibility to Private. Only the owner can view this profile.
          </p>
          <div className="mt-6">
            <Link
              href="/freelancers"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
            >
              Browse Other Freelancers
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const hasDetails = Boolean(
    profile.title ||
      profile.bio ||
      (profile.skills && profile.skills.length > 0) ||
      profile.hourlyRate ||
      (profile.portfolioUrls && profile.portfolioUrls.length > 0) ||
      (profile.portfolioProjects && profile.portfolioProjects.length > 0) ||
      (profile.employmentHistory && profile.employmentHistory.length > 0) ||
      (profile.educationHistory && profile.educationHistory.length > 0) ||
      (profile.certifications && profile.certifications.length > 0)
  );

  const handleStartDirectChat = async () => {
    setIsStartingChat(true);
    setChatError(null);
    try {
      const res = await getOrCreateDirectConversationAction(
        profile.id,
        selectedJobId || undefined
      );
      if (res.success && res.conversationId) {
        router.push(`/messages?conversationId=${res.conversationId}`);
      } else {
        setChatError(res.error || "Unable to start conversation with freelancer.");
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
      {/* Private Profile Banner for Owner */}
      {isOwner && profile.visibility === "PRIVATE" && (
        <div className="mb-6 rounded-2xl bg-amber-50 p-4 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🔒</span>
            <span>
              Your profile is currently <strong>Private</strong>. Only you can view it. Switch to Public in Settings to appear in client search results.
            </span>
          </div>
          <Link
            href="/profile/freelancer"
            className="underline hover:text-amber-900 dark:hover:text-amber-200 text-xs"
          >
            Edit Settings
          </Link>
        </div>
      )}

      {/* Top Navigation & Owner Actions */}
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

            {/* Availability Badge */}
            <div className="mt-3 flex items-center justify-center">
              {profile.isAvailable !== false ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Available for work
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  <span className="h-2 w-2 rounded-full bg-zinc-400" />
                  Currently busy
                </span>
              )}
            </div>

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
                  <div className="space-y-3 text-left">
                    {/* Primary Direct Hire CTA */}
                    <button
                      type="button"
                      onClick={() => setIsDirectHireOpen(true)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition active:scale-98"
                    >
                      <span>🚀 Hire Freelancer</span>
                      <span>→</span>
                    </button>

                    {/* Direct Message Button */}
                    <button
                      type="button"
                      disabled={isStartingChat}
                      onClick={handleStartDirectChat}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-xs font-bold text-zinc-800 shadow-xs hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition disabled:opacity-50"
                    >
                      <span>💬</span>
                      <span>{isStartingChat ? "Opening Chat..." : "Message Freelancer"}</span>
                    </button>

                    {/* Job Invitation (if client has jobs) */}
                    {clientJobs.length > 0 && (
                      <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                          Or Invite to Open Job
                        </label>
                        <div className="flex gap-2">
                          <select
                            value={selectedJobId}
                            onChange={(e) => setSelectedJobId(e.target.value)}
                            className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                          >
                            {clientJobs.map((j) => (
                              <option key={j.id} value={j.id}>
                                {j.title}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setIsInviteModalOpen(true)}
                            className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-850 dark:bg-indigo-950/40 dark:text-indigo-300 transition"
                          >
                            Invite
                          </button>
                        </div>
                      </div>
                    )}

                    {chatError && (
                      <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 text-center">
                        {chatError}
                      </p>
                    )}
                  </div>
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
          {profile.languages && profile.languages.length > 0 && (
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

          {/* External Portfolio Links */}
          {profile.portfolioUrls && profile.portfolioUrls.length > 0 && (
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

        {/* Right 2 Columns: Overview, Projects, Work History, Education, Certifications & Reviews */}
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
                This freelancer hasn&apos;t added an overview, verified skills, or portfolio projects yet.
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

              {/* Phase 5: Rich Portfolio Projects Showcase */}
              {profile.portfolioProjects && profile.portfolioProjects.length > 0 && (
                <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                      Portfolio Projects
                    </h2>
                    <span className="text-xs font-semibold text-zinc-400">
                      {profile.portfolioProjects.length} featured project{profile.portfolioProjects.length > 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {profile.portfolioProjects.map((project) => {
                      const isSafeUrl = isSafeHttpUrl(project.projectUrl);
                      const isSafeImg = isSafeHttpUrl(project.imageUrl);

                      return (
                        <div
                          key={project.id}
                          className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/60 transition hover:shadow-md"
                        >
                          <div>
                            {/* Project Thumbnail */}
                            {isSafeImg && project.imageUrl && (
                              <div className="mb-3 overflow-hidden rounded-xl bg-zinc-200 dark:bg-zinc-800 aspect-video">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={project.imageUrl}
                                  alt={project.title}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                            )}

                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                                {project.title}
                              </h3>
                              {isSafeUrl && project.projectUrl && (
                                <a
                                  href={project.projectUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-bold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 hover:underline"
                                  title="View Live Project"
                                >
                                  Demo ↗
                                </a>
                              )}
                            </div>

                            {project.description && (
                              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 leading-relaxed">
                                {project.description}
                              </p>
                            )}
                          </div>

                          {/* Project Skills */}
                          {project.skills && project.skills.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-zinc-200/60 dark:border-zinc-800 flex flex-wrap gap-1.5">
                              {project.skills.map((s) => (
                                <span
                                  key={s}
                                  className="rounded-lg bg-white px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200/80 dark:border-zinc-700"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Skills & Expertise */}
              <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
                <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
                  Skills & Expertise
                </h2>
                {profile.skills && profile.skills.length > 0 ? (
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

              {/* Phase 5: Work & Employment History */}
              {profile.employmentHistory && profile.employmentHistory.length > 0 && (
                <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
                  <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    Employment History
                  </h2>

                  <div className="mt-6 space-y-6">
                    {profile.employmentHistory.map((item) => (
                      <div
                        key={item.id}
                        className="relative pl-6 border-l-2 border-emerald-500 dark:border-emerald-600 space-y-1.5"
                      >
                        <div className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-emerald-600" />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                            {item.position}
                          </h3>
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {item.startDate} – {item.current ? "Present" : item.endDate || "Present"}
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                          {item.company} {item.location ? `• ${item.location}` : ""}
                        </p>
                        {item.description && (
                          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-line leading-relaxed">
                            {item.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Phase 5: Education History */}
              {profile.educationHistory && profile.educationHistory.length > 0 && (
                <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
                  <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    Education & Degrees
                  </h2>

                  <div className="mt-6 space-y-4">
                    {profile.educationHistory.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
                            {item.institution}
                          </h3>
                          {(item.startYear || item.endYear) && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                              {item.startYear ? item.startYear : ""}
                              {item.startYear && item.endYear ? " – " : ""}
                              {item.endYear ? item.endYear : ""}
                            </span>
                          )}
                        </div>
                        {(item.degree || item.fieldOfStudy) && (
                          <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            {item.degree}
                            {item.degree && item.fieldOfStudy ? " in " : ""}
                            {item.fieldOfStudy}
                          </p>
                        )}
                        {item.description && (
                          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                            {item.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Phase 5: Certifications & Credentials */}
              {profile.certifications && profile.certifications.length > 0 && (
                <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
                  <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    Certifications & Credentials
                  </h2>

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {profile.certifications.map((item) => {
                      const isSafeCertUrl = isSafeHttpUrl(item.credentialUrl);

                      return (
                        <div
                          key={item.id}
                          className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/60 flex flex-col justify-between"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base">🏅</span>
                              <h3 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-white">
                                {item.name}
                              </h3>
                            </div>
                            <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              {item.issuer}
                            </p>
                            {(item.issueDate || item.expiryDate) && (
                              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                Issued: {item.issueDate || "N/A"}
                                {item.expiryDate ? ` • Expires: ${item.expiryDate}` : ""}
                              </p>
                            )}
                            {item.credentialId && (
                              <p className="mt-0.5 text-[10px] text-zinc-400 font-mono">
                                ID: {item.credentialId}
                              </p>
                            )}
                          </div>

                          {isSafeCertUrl && item.credentialUrl && (
                            <div className="mt-3 pt-2 border-t border-zinc-200/60 dark:border-zinc-800">
                              <a
                                href={item.credentialUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 hover:underline"
                              >
                                Verify Credential ↗
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Experience Summary (if specified) */}
              {profile.experience && (
                <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
                  <h2 className="text-base font-bold text-zinc-950 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
                    Experience Highlights
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

      {/* Direct Hire Modal */}
      {isDirectHireOpen && (
        <DirectHireModal
          isOpen={isDirectHireOpen}
          onClose={() => setIsDirectHireOpen(false)}
          freelancerId={profile.id}
          freelancerName={displayName}
          freelancerHourlyRate={profile.hourlyRate}
          clientJobs={clientJobs.map((j) => ({
            id: j.id,
            title: j.title,
            type: "FIXED",
          }))}
          onSuccess={(_, conversationId) => {
            setIsDirectHireOpen(false);
            if (conversationId) {
              router.push(`/messages?conversationId=${conversationId}`);
            } else {
              router.push("/dashboard/client");
            }
          }}
        />
      )}
    </div>
  );
}
