"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { requestPasswordResetAction } from "@/lib/actions/auth-recovery";

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const result = await requestPasswordResetAction({ email });
        if (result.success) {
          setSubmitted(true);
        } else {
          setError(result.error || "Failed to process request. Please try again.");
        }
      } catch {
        setError("An unexpected error occurred. Please try again.");
      }
    });
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="rounded-3xl border border-zinc-200/90 bg-white p-8 shadow-xl shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none">
        <div className="text-center mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 group mb-4"
            aria-label="WorkPulse homepage"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-sm transition-transform group-hover:scale-105">
              W
            </span>
            <span className="font-bold text-xl tracking-tight text-zinc-900 dark:text-white">
              Work<span className="text-emerald-600 dark:text-emerald-500">Pulse</span>
            </span>
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Reset your password
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Enter your email and we will send you a secure link to reset your password.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50/80 p-3.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 font-medium"
          >
            {error}
          </div>
        )}

        {submitted ? (
          <div className="text-center py-4 space-y-4">
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
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Check your inbox
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-sm mx-auto">
              If an account exists for <span className="font-semibold text-zinc-900 dark:text-zinc-200">{email}</span>, you will receive an email with instructions to reset your password within a few minutes.
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
              >
                ← Return to sign in
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="reset-email"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
              >
                Email Address
              </label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                disabled={isPending}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={isPending || !email.trim()}
              className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {isPending ? "Sending reset link..." : "Send Reset Link"}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Remember your password? <span className="font-semibold text-emerald-600 dark:text-emerald-400">Sign in</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
