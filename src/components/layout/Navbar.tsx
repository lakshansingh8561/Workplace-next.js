"use client";

import { useState } from "react";
import Link from "next/link";

export function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-16 max-w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Desktop Nav */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg p-0.5"
            aria-label="WorkPulse homepage"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 font-bold text-white shadow-sm transition-transform group-hover:scale-105">
              W
            </span>
            <span className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Work<span className="text-emerald-600">Pulse</span>
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav
            aria-label="Main Navigation"
            className="hidden lg:flex items-center gap-7 text-sm font-medium text-zinc-600 dark:text-zinc-300"
          >
            <Link
              href="/#categories"
              className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded px-1"
            >
              Find Talent
            </Link>
            <Link
              href="/jobs"
              className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded px-1"
            >
              Find Work
            </Link>
            <Link
              href="/#how-it-works"
              className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded px-1"
            >
              How It Works
            </Link>
            <Link
              href="/#why-workpulse"
              className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded px-1"
            >
              Why WorkPulse
            </Link>
            <Link
              href="/#enterprise"
              className="transition-colors hover:text-emerald-600 dark:hover:text-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded px-1"
            >
              Enterprise
            </Link>
          </nav>
        </div>

        {/* Search Control & Action Controls (Desktop) */}
        <div className="hidden sm:flex items-center gap-3">
          <Link
            href="#search-section"
            className="hidden xl:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50/80 px-3.5 py-1.5 text-xs text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 transition-colors dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 mr-1"
            aria-label="Quick search talent and skills"
          >
            <svg
              className="h-3.5 w-3.5 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <span>Search</span>
          </Link>
          <Link
            href="#login"
            className="text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Log In
          </Link>
          <Link
            href="#signup"
            className="rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Sign Up
          </Link>
          <Link
            href="#post-job"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            Post a Job
          </Link>
        </div>

        {/* Mobile Hamburger Toggle Button */}
        <div className="flex sm:hidden items-center gap-2">
          <Link
            href="#post-job"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500"
          >
            Post Job
          </Link>
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
            className="inline-flex items-center justify-center rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {isMobileMenuOpen && (
        <div className="sm:hidden border-b border-zinc-200 bg-white px-4 pt-3 pb-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          <nav aria-label="Mobile Navigation" className="flex flex-col space-y-3">
            <Link
              href="/#categories"
              onClick={closeMenu}
              className="rounded-md px-3 py-2 text-base font-medium text-zinc-700 hover:bg-zinc-50 hover:text-emerald-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Find Talent
            </Link>
            <Link
              href="/jobs"
              onClick={closeMenu}
              className="rounded-md px-3 py-2 text-base font-medium text-zinc-700 hover:bg-zinc-50 hover:text-emerald-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Find Work
            </Link>
            <Link
              href="/#how-it-works"
              onClick={closeMenu}
              className="rounded-md px-3 py-2 text-base font-medium text-zinc-700 hover:bg-zinc-50 hover:text-emerald-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              How It Works
            </Link>
            <Link
              href="#why-workpulse"
              onClick={closeMenu}
              className="rounded-md px-3 py-2 text-base font-medium text-zinc-700 hover:bg-zinc-50 hover:text-emerald-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Why WorkPulse
            </Link>
            <Link
              href="#enterprise"
              onClick={closeMenu}
              className="rounded-md px-3 py-2 text-base font-medium text-zinc-700 hover:bg-zinc-50 hover:text-emerald-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Enterprise
            </Link>
          </nav>

          <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-2.5">
            <Link
              href="#login"
              onClick={closeMenu}
              className="w-full text-center py-2.5 text-sm font-semibold text-zinc-800 rounded-lg border border-zinc-200 dark:text-zinc-200 dark:border-zinc-800"
            >
              Log In
            </Link>
            <Link
              href="#signup"
              onClick={closeMenu}
              className="w-full text-center py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm"
            >
              Sign Up
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
