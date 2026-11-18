"use client";

import { useState, useTransition, useEffect } from "react";
import { submitProposalAction, SubmitProposalResult } from "@/lib/actions/proposal";
import { broadcastProposalUpdate } from "@/lib/events/job-events";
import {
  sendEmailVerificationOtpAction,
  verifyEmailOtpAction,
} from "@/lib/actions/auth-recovery";
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

  // Email OTP verification state inside modal
  const [userEmail, setUserEmail] = useState<string>("");
  const [showOtpFlow, setShowOtpFlow] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isOtpPending, startOtpTransition] = useTransition();

  // Fetch session email on mount
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((session) => {
        if (session?.user?.email) {
          setUserEmail(session.user.email);
        }
      })
      .catch(() => {});
  }, []);

  // Cooldown countdown
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const interval = setInterval(() => {
      setOtpCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpCooldown]);

  if (!isOpen) return null;

  const parsedBid = parseFloat(bidAmount) || 0;
  const platformFee = Math.round(parsedBid * 0.1 * 100) / 100;
  const netReceive = Math.max(0, Math.round((parsedBid - platformFee) * 100) / 100);

  const executeSubmission = () => {
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
        const errorMsg = result.error || "Failed to submit proposal. Please check the form.";
        setGeneralError(errorMsg);

        // If email verification is required, immediately expose inline OTP flow
        if (errorMsg.toLowerCase().includes("verify your email")) {
          setShowOtpFlow(true);
        }
        return;
      }

      if (result.proposalId) {
        broadcastProposalUpdate(result.proposalId, "PENDING", job.id);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    executeSubmission();
  };

  // Send OTP
  const handleSendOtp = () => {
    if (!userEmail) {
      setOtpError("User email not found. Please verify your account.");
      return;
    }
    setOtpError(null);
    setOtpMessage(null);

    startOtpTransition(async () => {
      try {
        const res = await sendEmailVerificationOtpAction({ email: userEmail });
        if (res.success) {
          setOtpSent(true);
          setOtpCooldown(60);
          setOtpMessage(res.message || "A 6-digit verification code was sent to your email.");
        } else {
          setOtpError(res.error || "Failed to send code. Please try again.");
        }
      } catch {
        setOtpError("An unexpected error occurred while sending verification code.");
      }
    });
  };

  // Verify OTP and then immediately submit the proposal
  const handleVerifyOtp = () => {
    const cleanOtp = otpCode.trim();
    if (cleanOtp.length !== 6) {
      setOtpError("Please enter all 6 digits.");
      return;
    }
    setOtpError(null);
    setOtpMessage(null);

    startOtpTransition(async () => {
      try {
        const res = await verifyEmailOtpAction({
          email: userEmail,
          otp: cleanOtp,
        });

        if (res.success) {
          setOtpMessage("Email verified successfully! Submitting proposal...");
          setShowOtpFlow(false);
          setGeneralError(null);
          // Directly submit the proposal with preserved form values
          executeSubmission();
        } else {
          setOtpError(res.error || "Invalid verification code.");
        }
      } catch {
        setOtpError("Failed to verify code. Please try again.");
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

        {/* Actionable Email Verification Card (Issue 1 Requirement) */}
        {showOtpFlow && (
          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50/90 p-5 dark:border-amber-800 dark:bg-amber-950/40">
            <div className="flex items-start gap-3">
              <span className="text-xl shrink-0">✉️</span>
              <div className="flex-1 text-xs">
                <h4 className="font-bold text-amber-950 dark:text-amber-200 text-sm">
                  Verify Your Email to Complete Submission
                </h4>
                <p className="mt-1 text-amber-800 dark:text-amber-300">
                  WorkPulse requires a verified email address to submit proposals.
                  <strong className="block mt-0.5 font-semibold text-amber-950 dark:text-amber-100">
                    Your entered proposal data is saved and will not be lost.
                  </strong>
                </p>

                {otpError && (
                  <div className="mt-3 rounded-lg bg-red-100/80 p-2.5 text-red-800 dark:bg-red-950/60 dark:text-red-300 font-semibold">
                    {otpError}
                  </div>
                )}

                {otpMessage && (
                  <div className="mt-3 rounded-lg bg-emerald-100/80 p-2.5 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-semibold">
                    ✓ {otpMessage}
                  </div>
                )}

                {!otpSent ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={isOtpPending}
                      className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-700 transition disabled:opacity-50 cursor-pointer"
                    >
                      {isOtpPending ? "Sending code..." : `Send 6-Digit OTP to ${userEmail || "my email"}`}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        placeholder="123456"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        disabled={isOtpPending}
                        className="h-10 w-36 rounded-xl border border-amber-300 bg-white px-3 text-center font-mono text-base font-bold tracking-widest text-zinc-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-amber-700 dark:bg-zinc-900 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOtp}
                        disabled={isOtpPending || otpCode.trim().length !== 6}
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition disabled:opacity-50 cursor-pointer"
                      >
                        {isOtpPending ? "Verifying..." : "Verify & Submit Now"}
                      </button>
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={otpCooldown > 0 || isOtpPending}
                        className="text-xs font-semibold text-amber-800 underline hover:text-amber-900 dark:text-amber-300 disabled:opacity-50 cursor-pointer ml-2"
                      >
                        {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend Code"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Global Error Alert (Non-verification errors) */}
        {generalError && !generalError.toLowerCase().includes("verify your email") && (
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
              Estimated Project Duration
            </label>
            <select
              id="estimatedDuration"
              name="estimatedDuration"
              value={estimatedDuration}
              onChange={(e) => setEstimatedDuration(e.target.value)}
              disabled={isPending}
              className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-xs font-medium text-zinc-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
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
                Cover Letter & Pitch
              </label>
              <span className="text-[11px] text-zinc-400">
                {coverLetter.length} / 5000 characters
              </span>
            </div>
            <textarea
              id="coverLetter"
              name="coverLetter"
              rows={5}
              required
              minLength={30}
              maxLength={5000}
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
              disabled={isPending}
              placeholder="Introduce yourself, outline your relevant technical experience, explain how you'll approach this project, and highlight deliverables..."
              className="w-full rounded-xl border border-zinc-300 bg-white p-3.5 text-xs text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            />
            {fieldErrors.coverLetter && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.coverLetter}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || isOtpPending}
              className="rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition active:scale-95 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {isPending ? "Submitting..." : "Submit Proposal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
