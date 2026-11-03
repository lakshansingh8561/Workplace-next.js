"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  verifyEmailAction,
  resendVerificationEmailAction,
} from "@/lib/actions/auth-recovery";

export function VerifyEmailView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [, startTransition] = useTransition();
  const [status, setStatus] = useState<
    "verifying" | "success" | "alreadyVerified" | "expired" | "error" | "idle"
  >(token ? "verifying" : "idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Resend form state
  const [resendEmail, setResendEmail] = useState("");
  const [resendPending, startResendTransition] = useTransition();
  const [resendSent, setResendSent] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  const handleVerify = useCallback((tokenToVerify: string) => {
    startTransition(async () => {
      try {
        const result = await verifyEmailAction({ token: tokenToVerify });
        if (result.success) {
          if (result.alreadyVerified) {
            setStatus("alreadyVerified");
          } else {
            setStatus("success");
          }
        } else {
          if (result.expired) {
            setStatus("expired");
          } else {
            setStatus("error");
          }
          setErrorMessage(
            result.error || "Verification link is invalid or has expired."
          );
        }
      } catch {
        setStatus("error");
        setErrorMessage("An unexpected error occurred during verification.");
      }
    });
  }, []);

  useEffect(() => {
    if (token) {
      handleVerify(token);
    }
  }, [token, handleVerify]);

  const handleResend = (e: React.FormEvent) => {
    e.preventDefault();
    setResendError(null);

    startResendTransition(async () => {
      try {
        const result = await resendVerificationEmailAction({
          email: resendEmail,
        });
        if (result.success) {
          setResendSent(true);
        } else {
          setResendError(result.error || "Failed to resend verification email.");
        }
      } catch {
        setResendError("An unexpected error occurred. Please try again.");
      }
    });
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-3xl border border-zinc-200/90 bg-white p-8 shadow-xl shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 group mb-6"
          aria-label="WorkPulse homepage"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-sm transition-transform group-hover:scale-105">
            W
          </span>
          <span className="font-bold text-xl tracking-tight text-zinc-900 dark:text-white">
            Work<span className="text-emerald-600 dark:text-emerald-500">Pulse</span>
          </span>
        </Link>

        {/* State 1: Verifying */}
        {status === "verifying" && (
          <div className="py-6 space-y-4">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
            <h1 className="text-base font-bold text-zinc-900 dark:text-white">
              Verifying your email...
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Please wait while we confirm your email address.
            </p>
          </div>
        )}

        {/* State 2: Success */}
        {status === "success" && (
          <div className="py-4 space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
            </div>
            <h1 className="text-base font-bold text-zinc-900 dark:text-white">
              Email Verified Successfully!
            </h1>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
              Your email address has been verified. You now have full access to all WorkPulse marketplace features.
            </p>
            <div className="pt-2">
              <Link
                href="/login?verified=true"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition-all"
              >
                Continue to Sign In
              </Link>
            </div>
          </div>
        )}

        {/* State 3: Already Verified */}
        {status === "alreadyVerified" && (
          <div className="py-4 space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-base font-bold text-zinc-900 dark:text-white">
              Email Already Verified
            </h1>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
              This email address has already been confirmed. You can sign in and use WorkPulse normally.
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition-all"
              >
                Go to Sign In
              </Link>
            </div>
          </div>
        )}

        {/* State 4 & 5: Expired, Invalid, or Idle Resend Form */}
        {(status === "expired" || status === "error" || status === "idle") && (
          <div className="py-2 text-left">
            {status !== "idle" && (
              <div className="text-center mb-6">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-3">
                  <svg
                    className="h-6 w-6"
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
                </div>
                <h1 className="text-base font-bold text-zinc-900 dark:text-white mb-1">
                  {status === "expired"
                    ? "Verification Link Expired"
                    : "Invalid Verification Link"}
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {errorMessage ||
                    "This link is invalid or has already been consumed. Please request a new verification email below."}
                </p>
              </div>
            )}

            {status === "idle" && (
              <div className="text-center mb-6">
                {searchParams.get("required") === "true" && (
                  <div
                    role="alert"
                    className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300 font-medium text-left"
                  >
                    <p className="font-semibold mb-0.5">Email Verification Required</p>
                    <p>
                      You must verify your email address to create jobs, submit proposals, send messages, or transact on the marketplace.
                    </p>
                  </div>
                )}
                <h1 className="text-lg font-bold text-zinc-900 dark:text-white mb-1">
                  Verify your email
                </h1>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Enter your email address to receive a fresh verification link.
                </p>
              </div>
            )}

            {resendError && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-red-200 bg-red-50/80 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 font-medium"
              >
                {resendError}
              </div>
            )}

            {resendSent ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400 text-center">
                <p className="font-semibold mb-1">Verification link sent!</p>
                <p className="text-zinc-600 dark:text-zinc-400 mb-3">
                  If an account exists for <span className="font-semibold text-zinc-900 dark:text-zinc-200">{resendEmail}</span>, a new verification link has been sent.
                </p>
                <Link
                  href="/login"
                  className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  Return to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleResend} className="space-y-4">
                <div>
                  <label
                    htmlFor="resend-email"
                    className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
                  >
                    Email Address
                  </label>
                  <input
                    id="resend-email"
                    type="email"
                    required
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="you@company.com"
                    disabled={resendPending}
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white disabled:opacity-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={resendPending || !resendEmail.trim()}
                  className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {resendPending
                    ? "Sending verification link..."
                    : "Send Verification Link"}
                </button>

                <div className="text-center pt-2">
                  <Link
                    href="/login"
                    className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    ← Back to Sign In
                  </Link>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
