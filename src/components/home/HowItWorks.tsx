import Link from "next/link";
import { HOW_IT_WORKS_STEPS } from "@/data";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="w-full py-20 bg-white dark:bg-zinc-900/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-zinc-200 pb-10 dark:border-zinc-800">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Simple Workflow
            </h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
              How work gets done on WorkPulse
            </p>
          </div>
          <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
            From project scope to milestone release, collaborate transparently with proven freelance professionals.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <div
              key={step.step}
              className="relative rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-8 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <span className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                  {step.step}
                </span>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  Step {step.step}
                </span>
              </div>
              <h3 className="mt-6 text-xl font-bold text-zinc-900 dark:text-white">
                {step.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
          <Link
            href="#post-job"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Post a Job for Free
          </Link>
          <Link
            href="#categories"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl border border-zinc-300 px-6 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Explore All Categories
          </Link>
        </div>
      </div>
    </section>
  );
}
