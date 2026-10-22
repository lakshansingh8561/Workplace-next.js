export function JobSkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/80 animate-pulse">
      <div className="flex justify-between items-center mb-3">
        <div className="h-3 w-28 bg-zinc-200 rounded dark:bg-zinc-800" />
        <div className="h-3 w-16 bg-zinc-200 rounded dark:bg-zinc-800" />
      </div>
      <div className="h-6 w-3/4 bg-zinc-200 rounded mb-4 dark:bg-zinc-800" />
      <div className="flex gap-3 mb-4">
        <div className="h-4 w-32 bg-zinc-200 rounded dark:bg-zinc-800" />
        <div className="h-4 w-20 bg-zinc-200 rounded dark:bg-zinc-800" />
        <div className="h-4 w-24 bg-zinc-200 rounded dark:bg-zinc-800" />
      </div>
      <div className="space-y-2 mb-4">
        <div className="h-3 w-full bg-zinc-100 rounded dark:bg-zinc-800/60" />
        <div className="h-3 w-5/6 bg-zinc-100 rounded dark:bg-zinc-800/60" />
      </div>
      <div className="flex gap-2 mb-4">
        <div className="h-6 w-16 bg-zinc-100 rounded-lg dark:bg-zinc-800/60" />
        <div className="h-6 w-20 bg-zinc-100 rounded-lg dark:bg-zinc-800/60" />
        <div className="h-6 w-24 bg-zinc-100 rounded-lg dark:bg-zinc-800/60" />
      </div>
      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-between">
        <div className="h-3 w-40 bg-zinc-200 rounded dark:bg-zinc-800" />
        <div className="h-3 w-20 bg-zinc-200 rounded dark:bg-zinc-800" />
      </div>
    </div>
  );
}
