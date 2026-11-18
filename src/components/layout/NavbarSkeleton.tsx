import React from "react";

/**
 * NavbarSkeleton renders a neutral structural placeholder during initial SSR streaming
 * or React Suspense transitions. It maintains identical geometry (h-16, sticky, border)
 * without displaying "Log In" or "Sign Up" buttons, completely eliminating authentication
 * flickering during page navigation or form submissions.
 */
export function NavbarSkeleton() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-16 max-w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Skeletons */}
        <div className="flex items-center gap-3 lg:gap-6 min-w-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-sm">
              W
            </span>
            <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Work<span className="text-emerald-600">Pulse</span>
            </span>
          </div>

          {/* Desktop Navigation Placeholders */}
          <div className="hidden lg:flex items-center gap-4 xl:gap-5">
            <div className="h-4 w-20 rounded-md bg-zinc-200/60 dark:bg-zinc-800/60 animate-pulse" />
            <div className="h-4 w-24 rounded-md bg-zinc-200/60 dark:bg-zinc-800/60 animate-pulse" />
            <div className="h-4 w-20 rounded-md bg-zinc-200/60 dark:bg-zinc-800/60 animate-pulse" />
            <div className="h-4 w-28 rounded-md bg-zinc-200/60 dark:bg-zinc-800/60 animate-pulse" />
          </div>
        </div>

        {/* Action Controls Neutral Skeleton */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto pl-4">
          <div className="hidden sm:block h-8 w-28 rounded-full bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
          <div className="h-9 w-24 sm:w-28 rounded-lg bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
        </div>
      </div>
    </header>
  );
}

