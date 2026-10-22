import Link from "next/link";

export function CallToAction() {
  return (
    <section id="enterprise" className="w-full py-20 bg-white dark:bg-zinc-950">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-zinc-950 px-6 py-16 text-white shadow-2xl sm:px-12 sm:py-20 lg:px-16 dark:bg-zinc-900 border border-zinc-800">
          {/* Subtle background glow */}
          <div
            className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-emerald-600/20 blur-3xl pointer-events-none"
            aria-hidden="true"
          />

          <div className="relative max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              Enterprise & High-Growth Startups
            </span>
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl text-white">
              Scale your team with top 1% independent talent
            </h2>
            <p className="mt-4 text-base text-zinc-300">
              Need dedicated teams, custom enterprise compliance, or specialized technical leads?
              WorkPulse delivers flexible workforce solutions without traditional agency overhead.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
              <Link
                href="#post-job"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                Get Started Today
              </Link>
              <Link
                href="#why-workpulse"
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800/60 px-6 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
              >
                Learn About Enterprise
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
