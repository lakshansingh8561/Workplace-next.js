import Link from "next/link";

export function Footer() {
  const currentYear = 2026;

  return (
    <footer className="w-full border-t border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto w-full px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-200">
              For Clients
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link
                  href="#how-it-works"
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                >
                  How to Hire
                </Link>
              </li>
              <li>
                <Link
                  href="#categories"
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                >
                  Talent Marketplace
                </Link>
              </li>
              <li>
                <Link
                  href="#why-workpulse"
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                >
                  Why WorkPulse
                </Link>
              </li>
              <li>
                <Link
                  href="#enterprise"
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                >
                  Enterprise Solutions
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-200">
              For Talent
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link
                  href="#how-it-works"
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                >
                  How to Find Work
                </Link>
              </li>
              <li>
                <Link
                  href="/jobs"
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                >
                  Find Freelance Jobs
                </Link>
              </li>
              <li>
                <Link
                  href="#why-workpulse"
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                >
                  Escrow & Direct Contracts
                </Link>
              </li>
              <li>
                <Link
                  href="#enterprise"
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                >
                  Enterprise Talent Pool
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-200">
              Resources & Trust
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link
                  href="#why-workpulse"
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                >
                  Trust & Security
                </Link>
              </li>
              <li>
                <Link
                  href="#why-workpulse"
                  className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded"
                >
                  Payment Protection
                </Link>
              </li>
              <li>
                <span className="text-zinc-400 dark:text-zinc-500 text-xs cursor-default">
                  Terms of Service (v1.0)
                </span>
              </li>
              <li>
                <span className="text-zinc-400 dark:text-zinc-500 text-xs cursor-default">
                  Privacy Policy (v1.0)
                </span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-200">
              Platform Status
            </h3>
            <div className="mt-4 space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                </span>
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  All systems operational
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                WorkPulse Marketplace Engine • Next.js App Router • Tailwind CSS v4
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-zinc-200 pt-8 dark:border-zinc-800 text-center sm:flex sm:justify-between sm:text-left">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            © {currentYear} WorkPulse Technologies. Upwork-inspired freelance marketplace architecture.
          </p>
          <p className="mt-2 text-xs text-zinc-400 sm:mt-0">
            Designed for secure, distributed freelance work
          </p>
        </div>
      </div>
    </footer>
  );
}
