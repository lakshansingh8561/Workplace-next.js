import Link from "next/link";
import type { PublicFreelancerProfileData } from "@/types";
import type { UserReviewsSummary } from "@/lib/actions/review";
import { PublicReviewsList } from "@/components/reviews/PublicReviewsList";
import { StaticStarRating } from "@/components/reviews/StarRating";
import { isSafeHttpUrl } from "@/lib/validations/profile";

export type { PublicFreelancerProfileData };

interface PublicFreelancerProfileViewProps {
  profile: PublicFreelancerProfileData;
  reviewsSummary?: UserReviewsSummary;
  isOwner?: boolean;
}

export function PublicFreelancerProfileView({
  profile,
  reviewsSummary,
  isOwner = false,
}: PublicFreelancerProfileViewProps) {
  const displayName = profile.name || "Freelancer";
  const initials = displayName.slice(0, 2).toUpperCase();
  const hasDetails = Boolean(
    profile.title ||
    profile.bio ||
    profile.skills.length > 0 ||
    profile.hourlyRate ||
    profile.portfolioUrls.length > 0
  );

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Top Navigation & Owner Banner */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/jobs"
          className="text-xs sm:text-sm font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 inline-flex items-center gap-1.5"
        >
          ← Explore Marketplace
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
        {/* Left Column: Freelancer Card & Core Specs */}
        <div className="space-y-6">
          <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 text-center">
            {/* Avatar */}
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl bg-emerald-100 text-3xl font-extrabold text-emerald-800 shadow-inner dark:bg-emerald-950 dark:text-emerald-400">
              {initials}
            </div>

            <h1 className="mt-4 text-xl sm:text-2xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              {displayName}
            </h1>

            {profile.title ? (
              <p className="mt-1 text-xs sm:text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {profile.title}
              </p>
            ) : (
              <p className="mt-1 text-xs text-zinc-400 italic">No professional title specified</p>
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
            <p className="mt-6 text-[11px] text-zinc-400">
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

        {/* Right 2 Columns: Overview, Experience, Skills */}
        <div className="lg:col-span-2 space-y-6">
          {!hasDetails ? (
            <div className="rounded-3xl border border-zinc-200 bg-white p-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl dark:bg-zinc-800">
                👤
              </div>
              <h3 className="mt-4 text-lg font-bold text-zinc-900 dark:text-white">
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
                    Experience
                  </h2>
                  <p className="mt-4 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 font-medium">
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
    </div>
  );
}
