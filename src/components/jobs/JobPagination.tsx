interface JobPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function JobPagination({
  currentPage,
  totalPages,
  onPageChange,
}: JobPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Jobs pagination navigation"
      className="flex items-center justify-between border-t border-zinc-200 px-2 py-4 sm:px-4 dark:border-zinc-800"
    >
      <div className="flex flex-1 justify-between sm:justify-end gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          ← Previous
        </button>

        <span className="flex items-center px-3 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Page {currentPage} of {totalPages}
        </span>

        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          Next →
        </button>
      </div>
    </nav>
  );
}
