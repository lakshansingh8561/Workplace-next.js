"use client";

import { useState, useTransition } from "react";
import { submitProposalAction, SubmitProposalResult } from "@/lib/actions/proposal";
import { DURATION_OPTIONS } from "@/lib/validations/job";
import { Job } from "@/types";

interface ApplyProposalModalProps {
  job: Job;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (proposalSummary: {
    id: string;
    status: "PENDING";
    bidAmount: number;
    estimatedDuration?: string | null;
    createdAt: string;
  }) => void;
}

export function ApplyProposalModal({
  job,
  isOpen,
  onClose,
  onSuccess,
}: ApplyProposalModalProps) {
  const isHourly = job.type.toUpperCase() === "HOURLY";
  const defaultBid = isHourly
    ? job.hourlyMin ? String(job.hourlyMin) : "25"
    : job.budget ? String(job.budget) : "100";

  const [bidAmount, setBidAmount] = useState(defaultBid);
  const [estimatedDuration, setEstimatedDuration] = useState<string>(DURATION_OPTIONS[1]);
  const [coverLetter, setCoverLetter] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) return null;

  const parsedBid = parseFloat(bidAmount) || 0;
  const platformFee = Math.round(parsedBid * 0.1 * 100) / 100;
  const netReceive = Math.max(0, Math.round((parsedBid - platformFee) * 100) / 100);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result: SubmitProposalResult = await submitProposalAction({
        jobId: job.id,
        bidAmount: parseFloat(bidAmount),
        estimatedDuration: estimatedDuration || undefined,
        coverLetter,
      });

      if (!result.success) {
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
        setGeneralError(result.error || "Failed to submit proposal. Please check the form.");
        return;
      }

      if (result.proposalId) {
        onSuccess({
          id: result.proposalId,
          status: "PENDING",
          bidAmount: parseFloat(bidAmount),
          estimatedDuration: estimatedDuration || null,
          createdAt: new Date().toISOString(),
        });
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="proposal-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 mb-2">
              <span>💼</span>
              <span>Submit Proposal</span>
            </div>
            <h2
              id="proposal-modal-title"
              className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-950 dark:text-white"
            >
              {job.title}
            </h2>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Contract Type:{" "}
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                {isHourly
                  ? `Hourly ($${job.hourlyMin ?? 0} - $${job.hourlyMax ?? 0}/hr)`
                  : `Fixed-Price ($${job.budget?.toLocaleString() ?? 0})`}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-full p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Global Error Alert */}
        {generalError && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-xs font-medium text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900">
            ⚠️ {generalError}
          </div>
        )}

        {/* Proposal Form */}
        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Bid Amount Section */}
          <div className="rounded-2xl bg-zinc-50 p-4 border border-zinc-100 dark:bg-zinc-800/40 dark:border-zinc-800 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              {isHourly ? "Proposed Hourly Rate" : "Proposed Bid Amount"}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="bidAmount"
                  className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
                >
                  {isHourly ? "Hourly Rate ($/hr)" : "Total Bid ($)"}
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-sm text-zinc-400">
                    $
                  </span>
                  <input
                    id="bidAmount"
                    name="bidAmount"
                    type="number"
                    step={isHourly ? "0.5" : "1"}
                    min={isHourly ? "3" : "5"}
                    max="1000000"
                    required
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    disabled={isPending}
                    className="w-full rounded-xl border border-zinc-300 bg-white pl-8 pr-4 py-2.5 text-sm font-semibold text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                  />
                </div>
                {fieldErrors.bidAmount && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {fieldErrors.bidAmount}
                  </p>
                )}
              </div>

              {/* Fee Breakdown */}
              <div className="rounded-xl bg-white p-3 border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 text-xs space-y-1.5 flex flex-col justify-center">
                <div className="flex justify-between text-zinc-500 dark:text-zinc-400">
                  <span>WorkPulse Service Fee (10%):</span>
                  <span>-${platformFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-zinc-900 dark:text-white pt-1 border-t border-zinc-100 dark:border-zinc-800">
                  <span>You&apos;ll receive:</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ${netReceive.toFixed(2)} {isHourly ? "/ hr" : ""}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Project Duration */}
          <div>
            <label
              htmlFor="estimatedDuration"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Estimated Completion Time
            </label>
            <select
              id="estimatedDuration"
              name="estimatedDuration"
              value={estimatedDuration}
              onChange={(e) => setEstimatedDuration(e.target.value)}
              disabled={isPending}
              className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            >
              {DURATION_OPTIONS.map((dur) => (
                <option key={dur} value={dur}>
                  {dur}
                </option>
              ))}
            </select>
            {fieldErrors.estimatedDuration && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.estimatedDuration}
              </p>
            )}
          </div>

          {/* Cover Letter */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label
                htmlFor="coverLetter"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Cover Letter
              </label>
              <span
                className={`text-xs ${
                  coverLetter.trim().length >= 30
                    ? "text-zinc-400 dark:text-zinc-500"
                    : "text-amber-600 dark:text-amber-400 font-medium"
                }`}
              >
                {coverLetter.trim().length} / 3,000 characters (min 30)
              </span>
            </div>
            <textarea
              id="coverLetter"
              name="coverLetter"
              rows={6}
              required
              minLength={30}
              maxLength={3000}
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              disabled={isPending}
              placeholder="Introduce yourself, explain your relevant qualifications, and detail how you will deliver this project successfully..."
              className="w-full rounded-xl border border-zinc-300 bg-white p-3.5 text-sm text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white leading-relaxed resize-y"
            />
            {fieldErrors.coverLetter && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.coverLetter}
              </p>
            )}
          </div>

          {/* Security & Terms Notice */}
          <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-500 dark:bg-zinc-800/40 dark:text-zinc-400 flex items-center gap-2">
            <span>🛡️</span>
            <span>
              By submitting this proposal, you agree to WorkPulse Terms of Service and Escrow Milestone standards.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-xl bg-zinc-100 px-5 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 transition dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || coverLetter.trim().length < 30 || !parsedBid}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              {isPending ? (
                <span className="flex items-center gap-2">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Submitting Proposal...
                </span>
              ) : (
                "Submit Proposal"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
