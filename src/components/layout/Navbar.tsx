"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutUser } from "@/lib/actions/auth";
import { SessionUser } from "@/lib/session";
import { NotificationBell } from "@/components/notifications/NotificationBell";

interface NavbarProps {
  user?: SessionUser | null;
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const [currentHash, setCurrentHash] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  useEffect(() => {
    setCurrentHash(typeof window !== "undefined" ? window.location.hash : "");
    const handleHash = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [pathname]);

  const closeMenu = () => {
    setIsMobileMenuOpen(false);
    setIsUserMenuOpen(false);
  };

  const handleSignOut = async () => {
    closeMenu();
    await logoutUser();
  };

  const isNavActive = (href: string) => {
    if (!pathname) return false;
    if (href.startsWith("/#")) {
      const hash = href.slice(1);
      if (pathname === "/") {
        if (!currentHash && hash === "#categories") return true;
        return currentHash === hash;
      }
      return false;
    }
    if (href === "/jobs") {
      return (
        pathname === "/jobs" ||
        (pathname.startsWith("/jobs") && !pathname.startsWith("/jobs/new"))
      );
    }
    if (href.startsWith("/dashboard")) {
      return pathname.startsWith("/dashboard");
    }
    if (href.startsWith("/contracts")) {
      return pathname.startsWith("/contracts");
    }
    if (href.startsWith("/messages")) {
      return pathname.startsWith("/messages");
    }
    return pathname === href;
  };

  const getDesktopLinkClass = (href: string) => {
    const active = isNavActive(href);
    return `transition-colors rounded px-1 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
      active
        ? "text-emerald-600 dark:text-emerald-400 font-semibold"
        : "text-zinc-600 dark:text-zinc-300 font-medium hover:text-emerald-600 dark:hover:text-emerald-400"
    }`;
  };

  const getMobileLinkClass = (href: string) => {
    const active = isNavActive(href);
    return `rounded-md px-3 py-2 text-base transition-colors ${
      active
        ? "bg-emerald-50 text-emerald-600 font-semibold dark:bg-emerald-950/40 dark:text-emerald-400"
        : "font-medium text-zinc-700 hover:bg-zinc-50 hover:text-emerald-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
    }`;
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-16 max-w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Desktop Nav */}
        <div className="flex items-center gap-4 lg:gap-8 min-w-0">
          <Link
            href="/"
            className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg p-0.5 shrink-0"
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
            className="hidden lg:flex items-center gap-4 xl:gap-6 text-sm font-medium min-w-0"
          >
            {user ? (
              /* Authenticated User Nav Links */
              <>
                <Link
                  href={user.role === "CLIENT" ? "/dashboard/client" : "/dashboard/freelancer"}
                  className={getDesktopLinkClass("/dashboard")}
                >
                  {user.role === "CLIENT" ? "Dashboard" : "My Proposals"}
                </Link>
                <Link
                  href="/jobs"
                  className={getDesktopLinkClass("/jobs")}
                >
                  Find Work
                </Link>
                <Link
                  href="/#categories"
                  onClick={() => setCurrentHash("#categories")}
                  className={getDesktopLinkClass("/#categories")}
                >
                  Find Talent
                </Link>
                <Link
                  href="/contracts"
                  className={getDesktopLinkClass("/contracts")}
                >
                  Contracts
                </Link>
                <Link
                  href="/messages"
                  className={getDesktopLinkClass("/messages")}
                >
                  Messages
                </Link>
                <Link
                  href="/#enterprise"
                  onClick={() => setCurrentHash("#enterprise")}
                  className={`hidden 2xl:inline-block ${getDesktopLinkClass("/#enterprise")}`}
                >
                  Enterprise
                </Link>
              </>
            ) : (
              /* Guest Navigation Links */
              <>
                <Link
                  href="/#categories"
                  onClick={() => setCurrentHash("#categories")}
                  className={getDesktopLinkClass("/#categories")}
                >
                  Find Talent
                </Link>
                <Link
                  href="/jobs"
                  className={getDesktopLinkClass("/jobs")}
                >
                  Find Work
                </Link>
                <Link
                  href="/#how-it-works"
                  onClick={() => setCurrentHash("#how-it-works")}
                  className={getDesktopLinkClass("/#how-it-works")}
                >
                  How It Works
                </Link>
                <Link
                  href="/#why-workpulse"
                  onClick={() => setCurrentHash("#why-workpulse")}
                  className={getDesktopLinkClass("/#why-workpulse")}
                >
                  Why WorkPulse
                </Link>
                <Link
                  href="/#enterprise"
                  onClick={() => setCurrentHash("#enterprise")}
                  className={getDesktopLinkClass("/#enterprise")}
                >
                  Enterprise
                </Link>
              </>
            )}
          </nav>
        </div>

        {/* Action Controls (Desktop & Tablet) */}
        <div className="hidden sm:flex items-center gap-2 sm:gap-3 shrink-0">
          <Link
            href="/jobs"
            className="hidden xl:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50/80 px-3.5 py-1.5 text-xs text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 transition-colors dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 mr-1 shrink-0"
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

          {user && <NotificationBell />}

          {user ? (
            /* Authenticated User Menu */
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white p-1 pr-2.5 sm:pr-3 text-xs font-semibold text-zinc-800 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
                aria-expanded={isUserMenuOpen}
                aria-label="User profile menu"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white uppercase shrink-0">
                  {user.name ? user.name.charAt(0) : user.email?.charAt(0) || "U"}
                </span>
                <span className="max-w-[80px] sm:max-w-[100px] md:max-w-[130px] truncate">{user.name || user.email}</span>
                <span className="hidden md:inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                  {user.role === "CLIENT" ? "Client" : "Freelancer"}
                </span>
              </button>

              {isUserMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-52 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 z-50"
                  role="menu"
                >
                  <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                      {user.name || "WorkPulse User"}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
                    <span className="mt-1 inline-block text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">
                      Role: {user.role}
                    </span>
                  </div>

                  <div className="py-1 border-b border-zinc-100 dark:border-zinc-800">
                    {user.role === "CLIENT" ? (
                      <>
                        <Link
                          href="/dashboard/client"
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>📊</span>
                          <span>Client Dashboard</span>
                        </Link>
                        <Link
                          href="/contracts"
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>📄</span>
                          <span>Contracts & Milestones</span>
                        </Link>
                        <Link
                          href="/messages"
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>💬</span>
                          <span>Messages</span>
                        </Link>
                        <Link
                          href="/jobs/new"
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>➕</span>
                          <span>Post a Job</span>
                        </Link>
                      </>
                    ) : (
                      <>
                        <Link
                          href="/dashboard/freelancer"
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>📑</span>
                          <span>My Proposals</span>
                        </Link>
                        <Link
                          href="/contracts"
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>📄</span>
                          <span>Contracts & Milestones</span>
                        </Link>
                        <Link
                          href="/messages"
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>💬</span>
                          <span>Messages</span>
                        </Link>
                        <Link
                          href="/jobs"
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>🔍</span>
                          <span>Browse Jobs</span>
                        </Link>
                      </>
                    )}
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full text-left rounded-xl px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                      role="menuitem"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Unauthenticated Guest Actions */
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <Link
                href="/login"
                className="text-xs sm:text-sm font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white px-2.5 sm:px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 whitespace-nowrap"
              >
                Log In
              </Link>
              <Link
                href="/signup"
                className="rounded-lg border border-zinc-300 px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 whitespace-nowrap"
              >
                Sign Up
              </Link>
            </div>
          )}

          {(!user || user.role === "CLIENT") ? (
            <Link
              href="/jobs/new"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 whitespace-nowrap shrink-0"
            >
              Post a Job
            </Link>
          ) : (
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 whitespace-nowrap shrink-0"
            >
              Browse Jobs
            </Link>
          )}
        </div>

        {/* Mobile Header Controls (< sm) */}
        <div className="flex sm:hidden items-center gap-2 shrink-0">
          {user && <NotificationBell />}

          {!user && (
            <Link
              href="/login"
              className="text-xs font-semibold text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white px-2 py-1.5 transition-colors whitespace-nowrap"
            >
              Log In
            </Link>
          )}

          {(!user || user.role === "CLIENT") ? (
            <Link
              href="/jobs/new"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95 whitespace-nowrap shrink-0"
            >
              Post a Job
            </Link>
          ) : (
            <Link
              href="/jobs"
              className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-95 whitespace-nowrap shrink-0"
            >
              Browse Jobs
            </Link>
          )}

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMobileMenuOpen}
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shrink-0"
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
            {user && (
              <div className="pb-3 border-b border-zinc-100 dark:border-zinc-800 px-1 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white uppercase shrink-0">
                    {user.name ? user.name.charAt(0) : user.email?.charAt(0) || "U"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                      {user.name || user.email}
                    </p>
                    <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {user.role === "CLIENT" ? "Client" : "Freelancer"}
                    </span>
                  </div>
                </div>
                <Link
                  href={user.role === "CLIENT" ? "/dashboard/client" : "/dashboard/freelancer"}
                  onClick={closeMenu}
                  className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 shrink-0"
                >
                  {user.role === "CLIENT" ? "Dashboard →" : "Proposals →"}
                </Link>
              </div>
            )}

            {/* Mobile Action Banner inside drawer */}
            {(!user || user.role === "CLIENT") ? (
              <Link
                href="/jobs/new"
                onClick={closeMenu}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
              >
                <span>➕</span>
                <span>Post a Job</span>
              </Link>
            ) : (
              <Link
                href="/jobs"
                onClick={closeMenu}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 transition-colors"
              >
                <span>🔍</span>
                <span>Browse All Jobs</span>
              </Link>
            )}

            {user ? (
              <>
                <Link
                  href="/contracts"
                  onClick={closeMenu}
                  className={getMobileLinkClass("/contracts")}
                >
                  Contracts & Milestones
                </Link>
                <Link
                  href="/messages"
                  onClick={closeMenu}
                  className={getMobileLinkClass("/messages")}
                >
                  Messages
                </Link>
                <Link
                  href="/jobs"
                  onClick={closeMenu}
                  className={getMobileLinkClass("/jobs")}
                >
                  Find Work
                </Link>
                <Link
                  href="/#categories"
                  onClick={() => {
                    setCurrentHash("#categories");
                    closeMenu();
                  }}
                  className={getMobileLinkClass("/#categories")}
                >
                  Find Talent
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/#categories"
                  onClick={() => {
                    setCurrentHash("#categories");
                    closeMenu();
                  }}
                  className={getMobileLinkClass("/#categories")}
                >
                  Find Talent
                </Link>
                <Link
                  href="/jobs"
                  onClick={closeMenu}
                  className={getMobileLinkClass("/jobs")}
                >
                  Find Work
                </Link>
                <Link
                  href="/#how-it-works"
                  onClick={() => {
                    setCurrentHash("#how-it-works");
                    closeMenu();
                  }}
                  className={getMobileLinkClass("/#how-it-works")}
                >
                  How It Works
                </Link>
                <Link
                  href="/#why-workpulse"
                  onClick={() => {
                    setCurrentHash("#why-workpulse");
                    closeMenu();
                  }}
                  className={getMobileLinkClass("/#why-workpulse")}
                >
                  Why WorkPulse
                </Link>
                <Link
                  href="/#enterprise"
                  onClick={() => {
                    setCurrentHash("#enterprise");
                    closeMenu();
                  }}
                  className={getMobileLinkClass("/#enterprise")}
                >
                  Enterprise
                </Link>
              </>
            )}
          </nav>

          <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-2.5">
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full text-center py-2.5 text-sm font-semibold text-red-600 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:hover:bg-red-950/50 transition-colors"
              >
                Sign Out
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={closeMenu}
                  className="w-full text-center py-2.5 text-sm font-semibold text-zinc-800 rounded-lg border border-zinc-200 hover:bg-zinc-50 dark:text-zinc-200 dark:border-zinc-800 dark:hover:bg-zinc-900 transition-colors"
                >
                  Log In
                </Link>
                <Link
                  href="/signup"
                  onClick={closeMenu}
                  className="w-full text-center py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm transition-colors"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
