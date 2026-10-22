import {
  HeroVideo,
  MarketplaceSearch,
  CategorySection,
  WhyWorkPulse,
  HowItWorks,
  CallToAction,
} from "@/components";
import { PLATFORM_METRICS } from "@/data";


export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      {/* 1. Cinematic Video Background Hero */}
      <HeroVideo />

      {/* 2. Interactive Search & Platform Metrics Section */}
      <section
        id="search-section"
        className="w-full mx-auto px-4 sm:px-6 lg:px-8 -mt-2 sm:-mt-4 mb-6 relative z-20"
      >
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-6 sm:p-8 shadow-xl shadow-zinc-200/50 dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none">
          {/* Section Subtitle */}
          <div className="text-center max-w-xl mx-auto mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Instant Skill Search
            </h2>
            <p className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Search by role, specialty, or technology
            </p>
          </div>

          {/* Search bar with local interactive filtering behavior */}
          <MarketplaceSearch />

          {/* Platform Metrics (rendered dynamically from data) */}
          <div className="mt-10 pt-8 border-t border-zinc-200/80 dark:border-zinc-800 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {PLATFORM_METRICS.map((metric) => (
              <div key={metric.label} className="text-center px-2">
                <p className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-950 dark:text-white">
                  {metric.value}
                </p>
                <p className="mt-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  {metric.label}
                </p>
                {metric.description && (
                  <p className="mt-0.5 text-[11px] text-zinc-400 hidden sm:block">
                    {metric.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Popular Categories Section (dynamic grid with filter tabs) */}
      <CategorySection />

      {/* 4. Why Businesses Turn to WorkPulse */}
      <WhyWorkPulse />

      {/* 5. How It Works Section */}
      <HowItWorks />

      {/* 6. Enterprise Call to Action */}
      <CallToAction />

      {/* 7. Action Modal / Target Drawer Anchors for Post Job, Login, Signup */}
      <div id="post-job" className="sr-only">
        Post a job target
      </div>
      <div id="login" className="sr-only">
        Log in target
      </div>
      <div id="signup" className="sr-only">
        Sign up target
      </div>
    </div>
  );
}
