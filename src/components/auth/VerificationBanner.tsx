"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendEmailVerificationOtpAction } from "@/lib/actions/auth-recovery";

interface VerificationBannerProps {
  email?: string | null;
  isVerified?: boolean;
}

export function VerificationBanner({
  email,
  isVerified,
}: VerificationBannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // If already verified or no email, render nothing
  if (isVerified || !email || dismissed) {
    return null;
  }

  const handleSendOtpAndNavigate = () => {
    setErrorMessage(null);
    setSentMessage(null);

    startTransition(async () => {
      try {
        const result = await sendEmailVerificationOtpAction({ email });
        if (result.success) {
          router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        } else {
          setErrorMessage(result.error || "Failed to send verification code.");
        }
      } catch {
        setErrorMessage("An unexpected error occurred. Please try again.");
      }
    });
  };

  return (
    <div
      role="region"
      aria-label="Email verification notice"
      className="bg-amber-500/10 border-b border-amber-500/20 px-4 sm:px-6 lg:px-8 py-2.5"
    >
      <div className="w-full flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
          <svg
            className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
          <span>
            Please verify your email address (<strong className="font-semibold">{email}</strong>) to post jobs, submit proposals, send messages, and transact.
          </span>
        </div>

        <div className="flex items-center gap-3">
          {sentMessage ? (
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              ✓ {sentMessage}
            </span>
          ) : errorMessage ? (
            <span className="text-red-700 dark:text-red-400 font-medium">
              {errorMessage}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSendOtpAndNavigate}
                disabled={isPending}
                className="font-bold text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 px-3 py-1 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition"
              >
                {isPending ? "Sending OTP..." : "Verify Now (Enter OTP)"}
              </button>
              <Link
                href={`/verify-email?email=${encodeURIComponent(email)}`}
                className="font-medium text-amber-900 underline hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-100"
              >
                I already have a code
              </Link>
            </div>
          )}

          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 p-0.5 rounded cursor-pointer"
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
