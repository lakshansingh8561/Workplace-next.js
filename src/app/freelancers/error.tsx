"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function FreelancersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Freelancers Error Boundary Caught]:", error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 sm:p-12 text-center bg-zinc-50 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-2xl dark:bg-red-950/60 mb-4">
          ⚠️
        </div>
        <h2 className="text-lg font-bold text-zinc-950 dark:text-white">
          Unable to Load Talent Directory
        </h2>
        <p className="mt-2 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          We encountered an unexpected error while loading the freelance talent directory.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full sm:w-auto rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
          >
            Try Again
          </button>
          <Link
            href="/dashboard/client"
            className="w-full sm:w-auto rounded-xl border border-zinc-200 bg-white px-5 py-2.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 transition"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

