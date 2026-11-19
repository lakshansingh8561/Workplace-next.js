"use client";

import { useState, useEffect, useRef, useCallback, Suspense, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutUser } from "@/lib/actions/auth";
import { SessionUser } from "@/lib/session";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Avatar } from "@/components/ui/Avatar";
import { useAppDispatch } from "@/lib/store";
import { setCredentials, clearCredentials } from "@/lib/store/slices/authSlice";
import { disconnectSocket } from "@/lib/socket/client";

interface NavbarProps {
  user?: SessionUser | null;
}

function getHash() {
  return typeof window !== "undefined" ? window.location.hash : "";
}

function subscribeToHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function useActiveNav() {
  const pathname = usePathname();
  const [manualHash, setManualHash] = useState("");
  const externalHash = useSyncExternalStore(subscribeToHash, getHash, () => "");
  const currentHash = manualHash || externalHash;

  const setCurrentHash = (h: string) => {
    setManualHash(h);
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
    if (href === "/jobs/saved") {
      return pathname === "/jobs/saved";
    }
    if (href === "/jobs") {
      return (
        pathname === "/jobs" ||
        (pathname.startsWith("/jobs") && !pathname.startsWith("/jobs/new") && pathname !== "/jobs/saved")
      );
    }
    if (href === "/jobs/new") {
      return pathname === "/jobs/new";
    }
    if (href === "/dashboard/client/proposals") {
      return pathname.startsWith("/dashboard/client/proposals");
    }
    if (href === "/dashboard/client") {
      return pathname === "/dashboard/client";
    }
    if (href === "/dashboard/freelancer/payments") {
      return pathname === "/dashboard/freelancer/payments";
    }
    if (
      href === "/dashboard/freelancer/proposals" ||
      href === "/dashboard/freelancer"
    ) {
      return (
        pathname.startsWith("/dashboard/freelancer") &&
        pathname !== "/dashboard/freelancer/payments"
      );
    }
    if (href.startsWith("/freelancers")) {
      return pathname.startsWith("/freelancers");
    }
    if (href.startsWith("/clients")) {
      return pathname.startsWith("/clients");
    }
    if (href.startsWith("/contracts")) {
      return pathname.startsWith("/contracts");
    }
    if (href.startsWith("/messages")) {
      return pathname.startsWith("/messages");
    }
    return pathname === href;
  };

  return { isNavActive, setCurrentHash };
}

function DesktopNavList({
  user,
  getLinkClass,
  onHashClick,
}: {
  user?: SessionUser | null;
  getLinkClass: (href: string) => string;
  onHashClick?: (hash: string) => void;
}) {
  return user ? (
    <>
      {user.role === "CLIENT" ? (
        <>
          <Link href="/freelancers" prefetch={false} className={getLinkClass("/freelancers")}>
            Find Freelancers
          </Link>
          <Link href="/dashboard/client" prefetch={false} className={getLinkClass("/dashboard/client")}>
            My Jobs
          </Link>
          <Link href="/jobs/new" prefetch={false} className={getLinkClass("/jobs/new")}>
            Post a Job
          </Link>
          <Link href="/dashboard/client/proposals" prefetch={false} className={getLinkClass("/dashboard/client/proposals")}>
            Proposals
          </Link>
          <Link href="/contracts" prefetch={false} className={getLinkClass("/contracts")}>
            Contracts
          </Link>
          <Link href="/messages" prefetch={false} className={getLinkClass("/messages")}>
            Messages
          </Link>
        </>
      ) : (
        <>
          <Link href="/jobs" prefetch={false} className={getLinkClass("/jobs")}>
            Find Work
          </Link>
          <Link
            href="/dashboard/freelancer/proposals"
            prefetch={false}
            className={getLinkClass("/dashboard/freelancer/proposals")}
          >
            My Proposals
          </Link>
          <Link href="/clients" prefetch={false} className={getLinkClass("/clients")}>
            Find Clients
          </Link>
          <Link href="/contracts" prefetch={false} className={getLinkClass("/contracts")}>
            Contracts
          </Link>
          <Link href="/messages" prefetch={false} className={getLinkClass("/messages")}>
            Messages
          </Link>
          <Link
            href="/dashboard/freelancer/payments"
            prefetch={false}
            className={`hidden 2xl:inline-block ${getLinkClass("/dashboard/freelancer/payments")}`}
          >
            Earnings
          </Link>
        </>
      )}
      <Link
        href="/#enterprise"
        prefetch={true}
        onClick={() => onHashClick?.("#enterprise")}
        className={`hidden 2xl:inline-block ${getLinkClass("/#enterprise")}`}
      >
        Enterprise
      </Link>
    </>
  ) : (
    <>
      <Link
        href="/#categories"
        prefetch={true}
        onClick={() => onHashClick?.("#categories")}
        className={getLinkClass("/#categories")}
      >
        Find Talent
      </Link>
      <Link href="/jobs" prefetch={true} className={getLinkClass("/jobs")}>
        Find Work
      </Link>
      <Link
        href="/#how-it-works"
        prefetch={true}
        onClick={() => onHashClick?.("#how-it-works")}
        className={getLinkClass("/#how-it-works")}
      >
        How It Works
      </Link>
      <Link
        href="/#why-workpulse"
        prefetch={true}
        onClick={() => onHashClick?.("#why-workpulse")}
        className={getLinkClass("/#why-workpulse")}
      >
        Why WorkPulse
      </Link>
      <Link
        href="/#enterprise"
        prefetch={true}
        onClick={() => onHashClick?.("#enterprise")}
        className={getLinkClass("/#enterprise")}
      >
        Enterprise
      </Link>
    </>
  );
}

function DesktopNavLinks({ user }: { user?: SessionUser | null }) {
  const { isNavActive, setCurrentHash } = useActiveNav();

  const getDesktopLinkClass = (href: string) => {
    const active = isNavActive(href);
    return `transition-colors rounded px-1 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
      active
        ? "text-emerald-600 dark:text-emerald-400 font-semibold"
        : "text-zinc-600 dark:text-zinc-300 font-medium hover:text-emerald-600 dark:hover:text-emerald-400"
    }`;
  };

  return (
    <DesktopNavList
      user={user}
      getLinkClass={getDesktopLinkClass}
      onHashClick={setCurrentHash}
    />
  );
}

function DesktopNavListStatic({ user }: { user?: SessionUser | null }) {
  const getStaticClass = () =>
    "transition-colors rounded px-1 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 text-zinc-600 dark:text-zinc-300 font-medium hover:text-emerald-600 dark:hover:text-emerald-400";

  return <DesktopNavList user={user} getLinkClass={getStaticClass} />;
}

function MobileNavList({
  user,
  closeMenu,
  getLinkClass,
  onHashClick,
}: {
  user?: SessionUser | null;
  closeMenu: () => void;
  getLinkClass: (href: string) => string;
  onHashClick?: (hash: string) => void;
}) {
  return user ? (
    <>
      {user.role === "CLIENT" ? (
        <>
          <Link
            href="/freelancers"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/freelancers")}
          >
            Find Freelancers
          </Link>
          <Link
            href="/dashboard/client"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/dashboard/client")}
          >
            My Jobs & Dashboard
          </Link>
          <Link
            href="/jobs/new"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/jobs/new")}
          >
            Post a Job
          </Link>
          <Link
            href="/dashboard/client/proposals"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/dashboard/client/proposals")}
          >
            Proposals & Applicants
          </Link>
          <Link
            href="/contracts"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/contracts")}
          >
            Contracts
          </Link>
          <Link
            href="/messages"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/messages")}
          >
            Messages
          </Link>
          <Link
            href="/profile/client"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/profile/client")}
          >
            Company Profile
          </Link>
        </>
      ) : (
        <>
          <Link
            href="/jobs"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/jobs")}
          >
            Find Work
          </Link>
          <Link
            href="/dashboard/freelancer/proposals"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/dashboard/freelancer/proposals")}
          >
            My Proposals
          </Link>
          <Link
            href="/clients"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/clients")}
          >
            Find Clients
          </Link>
          <Link
            href="/contracts"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/contracts")}
          >
            Contracts
          </Link>
          <Link
            href="/messages"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/messages")}
          >
            Messages
          </Link>
          <Link
            href="/dashboard/freelancer/payments"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/dashboard/freelancer/payments")}
          >
            Earnings
          </Link>
          <Link
            href="/profile/freelancer"
            prefetch={true}
            onClick={closeMenu}
            className={getLinkClass("/profile/freelancer")}
          >
            Profile Settings
          </Link>
        </>
      )}
    </>
  ) : (
    <>
      <Link
        href="/#categories"
        prefetch={true}
        onClick={() => {
          onHashClick?.("#categories");
          closeMenu();
        }}
        className={getLinkClass("/#categories")}
      >
        Find Talent
      </Link>
      <Link
        href="/jobs"
        prefetch={true}
        onClick={closeMenu}
        className={getLinkClass("/jobs")}
      >
        Find Work
      </Link>
      <Link
        href="/#how-it-works"
        prefetch={true}
        onClick={() => {
          onHashClick?.("#how-it-works");
          closeMenu();
        }}
        className={getLinkClass("/#how-it-works")}
      >
        How It Works
      </Link>
      <Link
        href="/#why-workpulse"
        prefetch={true}
        onClick={() => {
          onHashClick?.("#why-workpulse");
          closeMenu();
        }}
        className={getLinkClass("/#why-workpulse")}
      >
        Why WorkPulse
      </Link>
      <Link
        href="/#enterprise"
        prefetch={true}
        onClick={() => {
          onHashClick?.("#enterprise");
          closeMenu();
        }}
        className={getLinkClass("/#enterprise")}
      >
        Enterprise
      </Link>
    </>
  );
}

function MobileNavLinks({
  user,
  closeMenu,
}: {
  user?: SessionUser | null;
  closeMenu: () => void;
}) {
  const { isNavActive, setCurrentHash } = useActiveNav();

  const getMobileLinkClass = (href: string) => {
    const active = isNavActive(href);
    return `rounded-md px-3 py-2 text-base transition-colors ${
      active
        ? "bg-emerald-50 text-emerald-600 font-semibold dark:bg-emerald-950/40 dark:text-emerald-400"
        : "font-medium text-zinc-700 hover:bg-zinc-50 hover:text-emerald-600 dark:text-zinc-200 dark:hover:bg-zinc-900"
    }`;
  };

  return (
    <MobileNavList
      user={user}
      closeMenu={closeMenu}
      getLinkClass={getMobileLinkClass}
      onHashClick={setCurrentHash}
    />
  );
}

function MobileNavListStatic({
  user,
  closeMenu,
}: {
  user?: SessionUser | null;
  closeMenu: () => void;
}) {
  const getStaticClass = () =>
    "rounded-md px-3 py-2 text-base font-medium text-zinc-700 hover:bg-zinc-50 hover:text-emerald-600 dark:text-zinc-200 dark:hover:bg-zinc-900 transition-colors";

  return <MobileNavList user={user} closeMenu={closeMenu} getLinkClass={getStaticClass} />;
}

function NavigationObserver({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    onNavigate();
  }, [pathname, onNavigate]);
  return null;
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const dispatch = useAppDispatch();
  const [liveUser, setLiveUser] = useState<SessionUser | null | undefined>(user);

  // Synchronize when server updates the prop
  useEffect(() => {
    setLiveUser(user);
  }, [user]);

  // Proactively verify and synchronize live authenticated session on mount and on every route transition.
  // Next.js App Router preserves RootLayout across client navigations; querying the live session
  // guarantees that the Navbar reflects the true active identity immediately, never displaying a stale previous user.
  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((session) => {
        if (!active) return;
        if (session?.user?.id) {
          const fresh: SessionUser = {
            id: session.user.id,
            name: session.user.name ?? null,
            email: session.user.email ?? "",
            image: session.user.image ?? null,
            role: (session.user.role as "CLIENT" | "FREELANCER") ?? "CLIENT",
            roleSelected: session.user.roleSelected !== false,
            emailVerified: session.user.emailVerified ? new Date(session.user.emailVerified) : null,
          };
          setLiveUser(fresh);
          dispatch(
            setCredentials({
              id: fresh.id,
              name: fresh.name,
              email: fresh.email,
              image: fresh.image,
              role: fresh.role as "CLIENT" | "FREELANCER",
              roleSelected: fresh.roleSelected,
              emailVerified: fresh.emailVerified
                ? new Date(fresh.emailVerified).toISOString()
                : null,
            })
          );
        } else {
          // Unauthenticated session
          setLiveUser(null);
          dispatch(clearCredentials());
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [pathname, dispatch]);

  // Authoritative identity: strictly derived from live validated session or server prop.
  // Never falls back to a zombie Redux cache if the live session is absent.
  const effectiveUser: SessionUser | null =
    liveUser !== undefined ? liveUser : user !== undefined ? user : null;

  const currentImage = effectiveUser?.image || null;

  const handleRouteChange = useCallback(() => {
    setIsMobileMenuOpen(false);
    setIsUserMenuOpen(false);
  }, []);

  // Close dropdown on outside click or escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
        setIsMobileMenuOpen(false);
      }
    }

    if (isUserMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUserMenuOpen]);

  const closeMenu = () => {
    // Defer unmounting dropdowns slightly so click events finish dispatching to Next.js router
    setTimeout(() => {
      setIsMobileMenuOpen(false);
      setIsUserMenuOpen(false);
    }, 40);
  };

  const handleSignOut = async () => {
    closeMenu();
    disconnectSocket();
    dispatch(clearCredentials());
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("workpulse_verify_email");
        sessionStorage.removeItem("workpulse_verify_role");
      } catch {
        // Safe cleanup
      }
    }
    await logoutUser();
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90">
      <Suspense fallback={null}>
        <NavigationObserver onNavigate={handleRouteChange} />
      </Suspense>
      <div className="mx-auto flex h-16 max-w-full items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo & Desktop Nav */}
        <div className="flex items-center gap-3 lg:gap-6 min-w-0">
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
            className="hidden lg:flex items-center gap-2.5 xl:gap-4 2xl:gap-5 text-sm font-medium"
          >
            <Suspense fallback={<DesktopNavListStatic user={effectiveUser} />}>
              <DesktopNavLinks user={effectiveUser} />
            </Suspense>
          </nav>
        </div>

        {/* Action Controls (Desktop & Tablet) */}
        <div className="hidden sm:flex items-center gap-2 sm:gap-3 shrink-0 ml-auto pl-4">
          <Link
            href="/jobs"
            className="hidden 2xl:flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50/80 px-3.5 py-1.5 text-xs text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 transition-colors dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 mr-1 shrink-0"
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

          {effectiveUser && <NotificationBell />}

          {effectiveUser ? (
            /* Authenticated User Menu */
            <div ref={userMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white p-1 pr-2.5 sm:pr-3 text-xs font-semibold text-zinc-800 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 transition-colors"
                aria-expanded={isUserMenuOpen}
                aria-label="User profile menu"
              >
                <Avatar
                  src={currentImage}
                  name={effectiveUser.name || effectiveUser.email}
                  role={effectiveUser.role as "CLIENT" | "FREELANCER"}
                  userId={effectiveUser.id}
                  size="xs"
                />
                <span className="max-w-[80px] sm:max-w-[100px] md:max-w-[130px] truncate">{effectiveUser.name || effectiveUser.email}</span>
                <span className="hidden md:inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                  {effectiveUser.role === "CLIENT" ? "Client" : "Freelancer"}
                </span>
              </button>

              {isUserMenuOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 z-50 flex flex-col max-h-[calc(100vh-5rem)] overflow-hidden"
                  role="menu"
                >
                  <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 shrink-0 flex items-center gap-2.5">
                    <Avatar
                      src={currentImage}
                      name={effectiveUser.name || effectiveUser.email}
                      role={effectiveUser.role as "CLIENT" | "FREELANCER"}
                      userId={effectiveUser.id}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                        {effectiveUser.name || "WorkPulse User"}
                      </p>
                      <p className="text-[11px] text-zinc-500 truncate">{effectiveUser.email}</p>
                      <span className="mt-0.5 inline-block text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">
                        Role: {effectiveUser.role}
                      </span>
                    </div>
                  </div>

                  <div className="py-1 border-b border-zinc-100 dark:border-zinc-800 overflow-y-auto overscroll-contain flex-1 max-h-[60vh] space-y-0.5">
                    {effectiveUser.role === "CLIENT" ? (
                      <>
                        <Link
                          href="/freelancers"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>🔍</span>
                          <span>Find Freelancers</span>
                        </Link>
                        <Link
                          href="/dashboard/client"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>📊</span>
                          <span>My Jobs & Dashboard</span>
                        </Link>
                        <Link
                          href="/contracts"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>📄</span>
                          <span>Contracts & Milestones</span>
                        </Link>
                        <Link
                          href="/messages"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>💬</span>
                          <span>Messages</span>
                        </Link>
                        <Link
                          href="/profile/client"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>🏢</span>
                          <span>Company Profile</span>
                        </Link>
                        <Link
                          href="/jobs/new"
                          prefetch={true}
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
                          href="/jobs"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>💼</span>
                          <span>Find Work</span>
                        </Link>
                        <Link
                          href="/dashboard/freelancer/proposals"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>📑</span>
                          <span>My Proposals</span>
                        </Link>
                        <Link
                          href="/clients"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>🏢</span>
                          <span>Find Clients</span>
                        </Link>
                        <Link
                          href="/messages"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>💬</span>
                          <span>Messages</span>
                        </Link>
                        <Link
                          href="/contracts"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>📄</span>
                          <span>Contracts & Milestones</span>
                        </Link>
                        <Link
                          href="/dashboard/freelancer/payments"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>💳</span>
                          <span>Earnings & Payments</span>
                        </Link>
                        <Link
                          href="/jobs/saved"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>📌</span>
                          <span>Saved Jobs</span>
                        </Link>
                        <Link
                          href="/profile/freelancer"
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>👤</span>
                          <span>Profile Settings</span>
                        </Link>
                        <Link
                          href={`/freelancers/${effectiveUser.id}`}
                          prefetch={true}
                          onClick={closeMenu}
                          className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                          role="menuitem"
                        >
                          <span>🌐</span>
                          <span>Public Profile</span>
                        </Link>
                      </>
                    )}
                  </div>

                  <div className="pt-1 shrink-0">
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

          {(!effectiveUser || effectiveUser.role === "CLIENT") ? (
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
          {effectiveUser && <NotificationBell />}

          {!effectiveUser && (
            <Link
              href="/login"
              className="text-xs font-semibold text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white px-2 py-1.5 transition-colors whitespace-nowrap"
            >
              Log In
            </Link>
          )}

          {(!effectiveUser || effectiveUser.role === "CLIENT") ? (
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
            {effectiveUser && (
              <div className="pb-3 border-b border-zinc-100 dark:border-zinc-800 px-1 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar
                    src={currentImage}
                    name={effectiveUser.name || effectiveUser.email}
                    role={effectiveUser.role as "CLIENT" | "FREELANCER"}
                    userId={effectiveUser.id}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                      {effectiveUser.name || effectiveUser.email}
                    </p>
                    <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {effectiveUser.role === "CLIENT" ? "Client" : "Freelancer"}
                    </span>
                  </div>
                </div>
                <Link
                  href={effectiveUser.role === "CLIENT" ? "/dashboard/client" : "/dashboard/freelancer/proposals"}
                  onClick={closeMenu}
                  className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 shrink-0"
                >
                  {effectiveUser.role === "CLIENT" ? "Dashboard →" : "Proposals →"}
                </Link>
              </div>
            )}

            {/* Mobile Action Banner inside drawer */}
            {(!effectiveUser || effectiveUser.role === "CLIENT") ? (
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

            <Suspense fallback={<MobileNavListStatic user={effectiveUser} closeMenu={closeMenu} />}>
              <MobileNavLinks user={effectiveUser} closeMenu={closeMenu} />
            </Suspense>
          </nav>

          <div className="mt-5 pt-4 border-t border-zinc-100 dark:border-zinc-800 flex flex-col gap-2.5">
            {effectiveUser ? (
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
