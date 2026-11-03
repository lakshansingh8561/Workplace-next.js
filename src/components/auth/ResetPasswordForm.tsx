"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { resetPasswordAction } from "@/lib/actions/auth-recovery";

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSuccess, setIsSuccess] = useState(false);

  // Live password validation checks
  const hasMinLength = password.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isValid = hasMinLength && hasLetter && hasNumber && passwordsMatch;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!token) {
      setError("Missing reset token. Please click the full link in your email.");
      return;
    }

    if (!isValid) {
      setError("Please ensure all password requirements are met.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await resetPasswordAction({
          token,
          password,
          confirmPassword,
        });

        if (result.success) {
          setIsSuccess(true);
          setTimeout(() => {
            router.push("/login?reset=success");
          }, 2000);
        } else {
          setError(result.error || "Failed to reset password.");
          if (result.fieldErrors) {
            setFieldErrors(result.fieldErrors);
          }
        }
      } catch {
        setError("An unexpected error occurred. Please try again.");
      }
    });
  };

  if (!token) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-8 shadow-xl shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400 mb-4">
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
          <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-2">
            Invalid Password Reset Link
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
            This reset link is missing a valid token. Please check that you copied the complete URL from your reset email.
          </p>
          <Link
            href="/forgot-password"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition-all"
          >
            Request New Reset Link
          </Link>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="w-full max-w-md mx-auto">
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-8 shadow-xl shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 mb-4">
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
          <h2 className="text-base font-bold text-zinc-900 dark:text-white mb-2">
            Password Reset Complete
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
            Your password has been updated and all existing sessions have been signed out. Redirecting you to sign in...
          </p>
          <Link
            href="/login?reset=success"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition-all"
          >
            Sign In Now
          </Link>
        </div>
      </div>
    );
  }

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
            Set a new password
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Create a strong, secure password for your WorkPulse account.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-200 bg-red-50/80 p-3.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 font-medium"
          >
            <p>{error}</p>
            {error.includes("expired") && (
              <div className="mt-2">
                <Link
                  href="/forgot-password"
                  className="font-semibold underline hover:text-red-800 dark:hover:text-red-300"
                >
                  Request a new password reset link
                </Link>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
          <div>
            <label
              htmlFor="new-password"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
            >
              New Password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                disabled={isPending}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 pr-12 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-medium"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
            >
              Confirm Password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                disabled={isPending}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 pr-12 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-medium"
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          {/* Password Requirements Checklist */}
          <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3 space-y-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60">
            <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Password requirements:
            </p>
            <div className="flex items-center gap-1.5">
              <span className={hasMinLength ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-zinc-400"}>
                {hasMinLength ? "✓" : "○"}
              </span>
              <span>At least 8 characters long</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={hasLetter ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-zinc-400"}>
                {hasLetter ? "✓" : "○"}
              </span>
              <span>Contains at least one letter</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={hasNumber ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-zinc-400"}>
                {hasNumber ? "✓" : "○"}
              </span>
              <span>Contains at least one number</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={passwordsMatch ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-zinc-400"}>
                {passwordsMatch ? "✓" : "○"}
              </span>
              <span>Passwords match</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending || !isValid}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {isPending ? "Updating password..." : "Reset Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
