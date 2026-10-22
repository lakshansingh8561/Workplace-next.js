"use client";

import { useState } from "react";
import Link from "next/link";

export function HeroVideo() {
  const [activeRole, setActiveRole] = useState<"hire" | "work">("hire");

  const content = {
    hire: {
      tagline: "For businesses & hiring managers",
      headline: "Work at the speed of your ambition",
      description:
        "How work should work. Connect with the top 1% of vetted independent talent across software engineering, AI, design, and marketing to scale your vision on demand.",
      ctaText: "Get started",
      ctaLink: "#categories",
      secondaryText: "No cost until you hire • Escrow milestone protection",
    },
    work: {
      tagline: "For independent talent & agencies",
      headline: "Find opportunities for every stage of your career",
      description:
        "Control when, where, and how you work. Discover high-value contracts from verified global clients, showcase your portfolio, and build long-term client relationships.",
      ctaText: "Find freelance jobs",
      ctaLink: "/jobs",
      secondaryText: "Direct contracts • Guaranteed milestone payouts • 0% invoice delays",
    },
  };

  const current = content[activeRole];

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8 pt-3 pb-8">
      <div className="mx-auto max-w-7xl relative overflow-hidden rounded-3xl sm:rounded-[2.5rem] bg-zinc-950 p-8 sm:p-12 lg:p-16 min-h-[560px] sm:min-h-[620px] lg:min-h-[660px] flex flex-col justify-between shadow-2xl border border-zinc-800/80">
        {/* Background Video with absolute cover */}
        <video
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
        >
          <source src="/videos/homevideo.mp4" type="video/mp4" />
        </video>

        {/* Subtle left-to-right dark gradient overlay: ~38% on left behind text, tapering to ~15% on right so video details remain clearly visible */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-black/38 via-black/28 to-black/15 pointer-events-none"
          aria-hidden="true"
        />

        {/* TOP ROW: Segmented Hire / Work Toggle & Status Pill */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          {/* Segmented Toggle Control */}
          <div
            role="radiogroup"
            aria-label="Marketplace role toggle"
            className="inline-flex items-center rounded-full bg-black/40 p-1 backdrop-blur-md border border-white/20 shadow-inner"
          >
            <button
              type="button"
              role="radio"
              aria-checked={activeRole === "hire"}
              onClick={() => setActiveRole("hire")}
              className={`rounded-full px-5 py-2 text-xs sm:text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                activeRole === "hire"
                  ? "bg-white text-zinc-950 shadow-md font-bold scale-100"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              Hire talent
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={activeRole === "work"}
              onClick={() => setActiveRole("work")}
              className={`rounded-full px-5 py-2 text-xs sm:text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                activeRole === "work"
                  ? "bg-white text-zinc-950 shadow-md font-bold scale-100"
                  : "text-white/80 hover:text-white hover:bg-white/10"
              }`}
            >
              Find work
            </button>
          </div>

          {/* Rating / Quality Badge */}
          <div className="hidden sm:inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur-md border border-white/15">
            <span className="flex text-amber-400 tracking-wider">★★★★★</span>
            <span className="text-zinc-200">4.9/5 from 120k+ contracts</span>
          </div>
        </div>

        {/* CENTER CONTENT: Dynamic Headline, Subtext, and Emerald CTA */}
        <div className="relative z-10 my-auto py-8 sm:py-12 max-w-3xl">
          <span className="inline-block text-xs sm:text-sm font-semibold tracking-wider uppercase text-emerald-400 mb-3 sm:mb-4">
            {current.tagline}
          </span>

          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-[4.25rem] leading-[1.08] drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">
            {current.headline}
          </h1>

          <p className="mt-5 sm:mt-6 max-w-2xl text-base sm:text-lg lg:text-xl text-zinc-200 leading-relaxed font-normal">
            {current.description}
          </p>

          {/* Bright Emerald CTA with right-arrow icon */}
          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Link
              href={current.ctaLink}
              className="group inline-flex items-center gap-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-base px-8 py-4 shadow-xl shadow-emerald-500/25 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              <span>{current.ctaText}</span>
              <svg
                className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2.5"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </Link>

            <Link
              href="#how-it-works"
              className="text-sm font-semibold text-white/90 hover:text-white px-4 py-3 rounded-full transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              How WorkPulse works →
            </Link>
          </div>
        </div>

        {/* BOTTOM ROW: Key Highlights / Value Pillars */}
        <div className="relative z-10 pt-4 border-t border-white/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-zinc-300">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400"></span>
            <span>{current.secondaryText}</span>
          </div>

          <div className="flex items-center gap-4 text-zinc-400">
            <span>Enterprise-grade compliance</span>
            <span className="hidden md:inline">•</span>
            <span className="hidden md:inline">24/7 dedicated support</span>
          </div>
        </div>
      </div>
    </section>
  );
}
