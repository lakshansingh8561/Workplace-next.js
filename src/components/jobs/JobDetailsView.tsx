"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Job, JobApiResponse } from "@/types";
import { SessionUser } from "@/lib/session";
import { FreelancerProposalSummary } from "@/lib/actions/proposal";
import { ApplyProposalModal } from "./ApplyProposalModal";

interface JobDetailsViewProps {
  jobId: string;
  initialUser?: SessionUser | null;
  initialProposal?: FreelancerProposalSummary | null;
}

export function JobDetailsView({
  jobId,
  initialUser,
  initialProposal,
}: JobDetailsViewProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user] = useState<SessionUser | null>(initialUser ?? null);
  const [userProposal, setUserProposal] = useState<FreelancerProposalSummary>(
    initialProposal ?? null
  );
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  useEffect(() => {
    async function loadJob() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, {
          cache: "no-store",
        });

        if (res.status === 404 || res.status === 400) {
          setError("Job not found");
          return;
        }

        if (!res.ok) {
          throw new Error(`Failed to load job details (HTTP ${res.status})`);
        }

        const json: JobApiResponse = await res.json();
        if (json.data) {
          setJob(json.data);
        } else {
          setError("Job data is empty");
        }
      } catch (err) {
        console.error("[JobDetailsView Fetch Error]:", err);
        setError(err instanceof Error ? err.message : "Error fetching contract details");
      } finally {
        setIsLoading(false);
      }
    }

    if (jobId) {
      loadJob();
    }
  }, [jobId]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-12 animate-pulse space-y-6">
        <div className="h-4 w-32 bg-zinc-200 rounded dark:bg-zinc-800" />
        <div className="h-8 w-2/3 bg-zinc-200 rounded dark:bg-zinc-800" />
        <div className="h-32 bg-zinc-100 rounded-2xl dark:bg-zinc-800/50" />
        <div className="h-64 bg-zinc-100 rounded-2xl dark:bg-zinc-800/50" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="rounded-3xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex h-12 w-12 mx-auto items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
            🔍
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
            Job Contract Not Found
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            The job contract with ID &quot;{jobId}&quot; does not exist or may have been archived.
          </p>
          <div className="mt-6">
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              ← Back to Job Marketplace
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isHourly = job.type.toUpperCase() === "HOURLY";
  const formattedPay = isHourly
    ? `$${job.hourlyMin ?? 0} - $${job.hourlyMax ?? 0} / hr`
    : `$${job.budget?.toLocaleString() ?? 0} Fixed-price`;

  const isOwnerClient = Boolean(user && user.role === "CLIENT" && job.clientId === user.id);
  const isOtherClient = Boolean(user && user.role === "CLIENT" && job.clientId !== user.id);
  const isFreelancer = Boolean(user && user.role === "FREELANCER");
  const isUnauthenticated = !user;

  const handleProposalSuccess = (proposalSummary: {
    id: string;
    status: "PENDING";
    bidAmount: number;
    estimatedDuration?: string | null;
    createdAt: string;
  }) => {
    setUserProposal(proposalSummary);
    setJob((prev) => (prev ? { ...prev, proposalsCount: prev.proposalsCount + 1 } : null));
    setShowApplyModal(false);
    setSuccessBanner("Your proposal was successfully submitted! The client will review your application.");
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      {/* Back Link */}
      <div className="mb-6">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
        >
          ← Back to All Jobs
        </Link>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="mb-6 rounded-2xl bg-emerald-50 p-4 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800 text-sm font-medium text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>🎉</span>
            <span>{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Contract Details (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
            {/* Header info */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {job.category}
              </span>
              <span>
                Posted {new Date(job.createdAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>

            <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
              {job.title}
            </h1>

            {/* Contract Specs Grid */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-4 rounded-2xl bg-zinc-50 p-4 border border-zinc-100 dark:bg-zinc-800/50 dark:border-zinc-800 text-xs">
              <div>
                <p className="text-zinc-500 dark:text-zinc-400 font-medium">Budget / Rate</p>
                <p className="mt-1 font-bold text-zinc-900 dark:text-white">{formattedPay}</p>
              </div>
              <div>
                <p className="text-zinc-500 dark:text-zinc-400 font-medium">Experience Level</p>
                <p className="mt-1 font-bold text-zinc-900 dark:text-white">
                  {job.experienceLevel}
                </p>
              </div>
              <div>
                <p className="text-zinc-500 dark:text-zinc-400 font-medium">Project Duration</p>
                <p className="mt-1 font-bold text-zinc-900 dark:text-white">
                  {job.duration || "Flexible"}
                </p>
              </div>
            </div>

            {/* Description */}
            <div className="mt-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-white mb-3">
                Project Description
              </h2>
              <div className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-line space-y-4">
                {job.description}
              </div>
            </div>

            {/* Skills & Expertise */}
            {job.skills && job.skills.length > 0 && (
              <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-white mb-3">
                  Skills & Expertise Required
                </h2>
                <div className="flex flex-wrap gap-2">
                  {job.skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Apply & Client Snapshot (1 col) */}
        <div className="lg:col-span-1 space-y-6">
          {/* Apply / Proposal CTA Card */}
          <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
            {/* Case A: Unauthenticated */}
            {isUnauthenticated && (
              <div className="space-y-3">
                <Link
                  href={`/login?redirectTo=${encodeURIComponent(`/jobs/${job.id}`)}`}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  Sign in to Apply
                </Link>
                <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
                  Sign in with a Freelancer account to submit proposals for this job.
                </p>
              </div>
            )}

            {/* Case B: Job Owner Client */}
            {isOwnerClient && (
              <div className="space-y-3">
                <div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
                  <span>⭐</span>
                  <span>You posted this job</span>
                </div>
                <Link
                  href={`/dashboard/client/jobs/${job.id}/proposals`}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-500 active:scale-95"
                >
                  Review Proposals ({job.proposalsCount}) →
                </Link>
                <p className="text-center text-xs text-zinc-500">
                  Manage applications and select freelancers for your project.
                </p>
              </div>
            )}

            {/* Case C: Other Client */}
            {isOtherClient && (
              <div className="rounded-2xl bg-zinc-50 p-4 border border-zinc-200 dark:bg-zinc-800/40 dark:border-zinc-700 text-xs space-y-2">
                <p className="font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                  <span>ℹ️</span> Client Account
                </p>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  You are signed in as a client. Only freelancer accounts can submit proposals to marketplace contracts.
                </p>
              </div>
            )}

            {/* Case D: Freelancer already submitted */}
            {isFreelancer && userProposal && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-zinc-50 p-4 border border-zinc-200 dark:bg-zinc-800/40 dark:border-zinc-700 text-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">
                      Application Status
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider text-[10px] ${
                        userProposal.status === "ACCEPTED"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300"
                          : userProposal.status === "REJECTED"
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300"
                      }`}
                    >
                      {userProposal.status}
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-zinc-200/80 dark:border-zinc-700">
                    <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                      <span>Your Proposed Rate:</span>
                      <span className="font-bold text-zinc-900 dark:text-white">
                        ${userProposal.bidAmount} {isHourly ? "/ hr" : ""}
                      </span>
                    </div>
                    {userProposal.estimatedDuration && (
                      <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                        <span>Duration:</span>
                        <span className="font-semibold text-zinc-900 dark:text-white">
                          {userProposal.estimatedDuration}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 text-center font-medium">
                  ✓ Proposal active and submitted to client
                </div>
              </div>
            )}

            {/* Case E: Freelancer eligible to submit */}
            {isFreelancer && !userProposal && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowApplyModal(true)}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-bold text-white shadow-md transition hover:bg-emerald-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  Apply for this Job
                </button>
                <p className="text-center text-xs text-zinc-500">
                  {job.proposalsCount} proposals already submitted
                </p>
              </div>
            )}

            {/* Escrow badge */}
            <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 text-xs text-zinc-500 space-y-2">
              <div className="flex items-center gap-2">
                <span>🛡️</span>
                <span>WorkPulse Escrow Milestone Protection</span>
              </div>
              <div className="flex items-center gap-2">
                <span>⚡</span>
                <span>Verified Client Contract</span>
              </div>
            </div>
          </div>

          {/* Client Information */}
          <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90">
            <h3 className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white pb-3 border-b border-zinc-100 dark:border-zinc-800">
              About the Client
            </h3>

            <div className="mt-4 space-y-3 text-xs text-zinc-600 dark:text-zinc-300">
              <div>
                <p className="text-zinc-400 font-medium">Organization</p>
                <p className="font-semibold text-zinc-900 dark:text-white mt-0.5">
                  {job.clientName || "Enterprise Client"}
                </p>
              </div>

              {job.clientCountry && (
                <div>
                  <p className="text-zinc-400 font-medium">Location</p>
                  <p className="font-semibold text-zinc-900 dark:text-white mt-0.5">
                    📍 {job.clientCountry}
                  </p>
                </div>
              )}

              {job.clientRating && (
                <div>
                  <p className="text-zinc-400 font-medium">Feedback Rating</p>
                  <p className="font-semibold text-zinc-900 dark:text-white mt-0.5 flex items-center gap-1">
                    <span className="text-amber-400">★</span>
                    <span>{job.clientRating.toFixed(2)} of 5 stars</span>
                  </p>
                </div>
              )}

              {job.clientSpent && (
                <div>
                  <p className="text-zinc-400 font-medium">Total Spent</p>
                  <p className="font-semibold text-zinc-900 dark:text-white mt-0.5">
                    ${job.clientSpent.toLocaleString()} on freelance contracts
                  </p>
                </div>
              )}

              {job.clientPaymentVerified && (
                <div className="pt-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    ✓ Payment method verified
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Real Application Submission Modal */}
      {showApplyModal && (
        <ApplyProposalModal
          job={job}
          isOpen={showApplyModal}
          onClose={() => setShowApplyModal(false)}
          onSuccess={handleProposalSuccess}
        />
      )}
    </div>
  );
}
