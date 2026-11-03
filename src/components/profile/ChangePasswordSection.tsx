"use client";

import { useState, useTransition } from "react";
import { changePasswordAction } from "@/lib/actions/auth-recovery";

export function ChangePasswordSection() {
  const [isPending, startTransition] = useTransition();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Client validation checks
  const hasMinLength = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const isDifferent =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    currentPassword !== newPassword;
  const passwordsMatch =
    newPassword.length > 0 && newPassword === confirmPassword;

  const isValid =
    currentPassword.length > 0 &&
    hasMinLength &&
    hasLetter &&
    hasNumber &&
    isDifferent &&
    passwordsMatch;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);
    setFieldErrors({});

    if (!isValid) {
      setErrorMessage("Please ensure all password requirements are satisfied.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await changePasswordAction({
          currentPassword,
          newPassword,
          confirmPassword,
        });

        if (result.success) {
          setSuccessMessage(
            result.message ||
              "Password updated successfully. Other active sessions have been signed out."
          );
          setCurrentPassword("");
          setNewPassword("");
          setConfirmPassword("");
        } else {
          setErrorMessage(result.error || "Failed to update password.");
          if (result.fieldErrors) {
            setFieldErrors(result.fieldErrors);
          }
        }
      } catch {
        setErrorMessage("An unexpected error occurred. Please try again.");
      }
    });
  };

  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-6">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white">
          Security & Password
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Update your password to keep your WorkPulse account secure. Changing your password will sign out all other devices.
        </p>
      </div>

      {successMessage && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3.5 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300 font-medium"
        >
          ✓ {successMessage}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-200 bg-red-50/80 p-3.5 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 font-medium"
        >
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
        {/* Current Password */}
        <div>
          <label
            htmlFor="current-password"
            className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Current Password
          </label>
          <div className="relative">
            <input
              id="current-password"
              type={showCurrent ? "text" : "password"}
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
              disabled={isPending}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 pr-12 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-medium"
              aria-label={showCurrent ? "Hide password" : "Show password"}
            >
              {showCurrent ? "Hide" : "Show"}
            </button>
          </div>
          {fieldErrors.currentPassword && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {fieldErrors.currentPassword}
            </p>
          )}
        </div>

        {/* New Password */}
        <div>
          <label
            htmlFor="change-new-password"
            className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
          >
            New Password
          </label>
          <div className="relative">
            <input
              id="change-new-password"
              type={showNew ? "text" : "password"}
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              disabled={isPending}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 pr-12 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs font-medium"
              aria-label={showNew ? "Hide password" : "Show password"}
            >
              {showNew ? "Hide" : "Show"}
            </button>
          </div>
          {fieldErrors.newPassword && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              {fieldErrors.newPassword}
            </p>
          )}
        </div>

        {/* Confirm New Password */}
        <div>
          <label
            htmlFor="change-confirm-password"
            className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1"
          >
            Confirm New Password
          </label>
          <div className="relative">
            <input
              id="change-confirm-password"
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

        {/* Requirements Checklist */}
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3 space-y-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 border border-zinc-200/60 dark:border-zinc-700/60">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
            New password checklist:
          </p>
          <div className="flex items-center gap-1.5">
            <span className={hasMinLength ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-zinc-400"}>
              {hasMinLength ? "✓" : "○"}
            </span>
            <span>At least 8 characters</span>
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
            <span className={isDifferent ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-zinc-400"}>
              {isDifferent ? "✓" : "○"}
            </span>
            <span>Different from your current password</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={passwordsMatch ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-zinc-400"}>
              {passwordsMatch ? "✓" : "○"}
            </span>
            <span>Passwords match</span>
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={isPending || !isValid}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 transition-all disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {isPending ? "Updating Password..." : "Change Password"}
          </button>
        </div>
      </form>
    </div>
  );
}
