import Link from "next/link";
import { Job } from "@/types";
import { SaveJobButton } from "./SaveJobButton";

interface JobCardProps {
  job: Job;
  isSaved?: boolean;
  userRole?: string | null;
  onToggleSave?: (isSaved: boolean) => void;
}

export function JobCard({
  job,
  isSaved = false,
  userRole,
  onToggleSave,
}: JobCardProps) {
  const isHourly = job.type.toUpperCase() === "HOURLY";

  const formattedPay = isHourly
    ? `$${job.hourlyMin ?? 0} - $${job.hourlyMax ?? 0} / hr`
    : `$${job.budget?.toLocaleString() ?? 0} Fixed-price`;

  const experienceBadge =
    job.experienceLevel.toUpperCase() === "EXPERT"
      ? "Expert"
      : job.experienceLevel.toUpperCase() === "ENTRY"
      ? "Entry level"
      : "Intermediate";

  return (
    <article className="group relative rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm transition-all hover:border-emerald-500/70 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/90">
      <div className="flex flex-col gap-3">
        {/* Top meta row */}
        <div className="flex items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {job.category}
            </span>
            <span>•</span>
            <span>
              {new Date(job.createdAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>

          <SaveJobButton
            jobId={job.id}
            initialSaved={isSaved}
            variant="icon"
            size="sm"
            userRole={userRole}
            onToggle={onToggleSave}
          />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
          <Link
            href={`/jobs/${job.id}`}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
          >
            {job.title}
          </Link>
        </h2>

        {/* Contract specifications */}
        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
          <span className="inline-flex items-center gap-1.5 text-zinc-950 dark:text-white">
            <svg
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {formattedPay}
          </span>

          <span>•</span>
          <span>{experienceBadge}</span>

          {job.duration && (
            <>
              <span>•</span>
              <span className="text-zinc-500 dark:text-zinc-400">
                Est. time: {job.duration}
              </span>
            </>
          )}

          <span>•</span>
          <span className="text-zinc-500 dark:text-zinc-400">
            Proposals: {job.proposalsCount}
          </span>
        </div>

        {/* Description snippet */}
        <p className="mt-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 line-clamp-3">
          {job.description}
        </p>

        {/* Skills Pills */}
        {job.skills && job.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {job.skills.map((skill) => (
              <span
                key={skill}
                className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        {/* Client trust footer */}
        <div className="mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-3">
            {job.clientPaymentVerified && (
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                <svg
                  className="h-3.5 w-3.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
                Payment verified
              </span>
            )}

            {job.clientRating && (
              <span className="flex items-center gap-1">
                <span className="text-amber-400">★</span>
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {job.clientRating.toFixed(1)}
                </span>
              </span>
            )}

            {job.clientSpent ? (
              <span>${job.clientSpent.toLocaleString()} spent</span>
            ) : null}

            {job.clientCountry && (
              <span className="hidden sm:inline">📍 {job.clientCountry}</span>
            )}
          </div>

          <Link
            href={`/jobs/${job.id}`}
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
          >
            View Details →
          </Link>
        </div>
      </div>
    </article>
  );
}
