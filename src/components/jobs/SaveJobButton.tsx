"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toggleSaveJobAction } from "@/lib/actions/savedJob";

interface SaveJobButtonProps {
  jobId: string;
  initialSaved?: boolean;
  variant?: "icon" | "button";
  size?: "sm" | "md" | "lg";
  userRole?: string | null;
  className?: string;
  onToggle?: (isSaved: boolean) => void;
}

export function SaveJobButton({
  jobId,
  initialSaved = false,
  variant = "icon",
  size = "md",
  userRole,
  className = "",
  onToggle,
}: SaveJobButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // If initialSaved changes from props, keep in sync
  if (initialSaved !== isSaved && !isPending && errorToast === null) {
    setIsSaved(initialSaved);
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If signed-in client, inform them
    if (userRole === "CLIENT") {
      setErrorToast("Only freelancer accounts can save jobs.");
      setTimeout(() => setErrorToast(null), 3000);
      return;
    }

    const nextState = !isSaved;
    setIsSaved(nextState);
    setErrorToast(null);

    startTransition(async () => {
      const res = await toggleSaveJobAction(jobId);

      if (!res.success) {
        // Rollback optimistic state
        setIsSaved(!nextState);
        if (res.requiresLogin) {
          router.push(`/login?redirectTo=${encodeURIComponent(pathname)}`);
        } else {
          setErrorToast(res.error || "Failed to update saved job.");
          setTimeout(() => setErrorToast(null), 3500);
        }
        return;
      }

      const confirmedSaved = Boolean(res.saved);
      setIsSaved(confirmedSaved);
      onToggle?.(confirmedSaved);
    });
  };

  const isIcon = variant === "icon";

  const sizeClasses =
    size === "sm"
      ? isIcon
        ? "h-8 w-8 text-xs"
        : "px-3 py-1.5 text-xs"
      : size === "lg"
      ? isIcon
        ? "h-11 w-11 text-base"
        : "px-6 py-3.5 text-sm"
      : isIcon
      ? "h-9 w-9 text-sm"
      : "px-4 py-2 text-xs";

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        aria-label={isSaved ? "Remove job from saved" : "Save this job for later"}
        aria-pressed={isSaved}
        title={isSaved ? "Saved to your list" : "Save job"}
        className={`group relative inline-flex items-center justify-center rounded-xl transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60 ${
          isSaved
            ? "border border-emerald-500/50 bg-emerald-50 text-emerald-700 shadow-sm hover:bg-emerald-100 dark:border-emerald-600/40 dark:bg-emerald-950/40 dark:text-emerald-400"
            : "border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        } ${sizeClasses} ${className}`}
      >
        <svg
          className={`${size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4"} transition-transform group-hover:scale-110 ${
            isSaved ? "fill-emerald-600 dark:fill-emerald-400 text-emerald-600 dark:text-emerald-400" : "fill-none text-current"
          }`}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={isSaved ? "1.5" : "2"}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
          />
        </svg>

        {!isIcon && (
          <span className="ml-2 font-bold whitespace-nowrap">
            {isSaved ? "Saved" : "Save Job"}
          </span>
        )}
      </button>

      {/* Ephemeral Feedback Toast */}
      {errorToast && (
        <div className="absolute right-0 top-full mt-2 z-50 rounded-xl bg-zinc-900 px-3 py-1.5 text-center text-[11px] font-bold text-white shadow-xl dark:bg-zinc-100 dark:text-zinc-900 whitespace-nowrap animate-in fade-in slide-in-from-top-1">
          {errorToast}
        </div>
      )}
    </div>
  );
}
