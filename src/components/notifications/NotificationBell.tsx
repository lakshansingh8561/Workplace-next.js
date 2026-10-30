"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getNotificationsAction,
  markNotificationReadAction,
} from "@/lib/actions/notification";

interface NotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"unread" | "all">("unread");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await getNotificationsAction(40);
      if (res.success && res.notifications) {
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount || 0);
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    }
  };

  useEffect(() => {
    let ignore = false;

    async function loadInitial() {
      try {
        const res = await getNotificationsAction(40);
        if (!ignore && res.success && res.notifications) {
          setNotifications(res.notifications);
          setUnreadCount(res.unreadCount || 0);
        }
      } catch (err) {
        console.error("Failed to load notifications:", err);
      }
    }

    loadInitial();

    // Sane polling: refresh every 25 seconds
    const interval = setInterval(() => {
      fetchNotifications();
    }, 25000);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  // Close dropdown on outside click or escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      fetchNotifications();
    }
  };

  const handleMarkAllRead = () => {
    startTransition(async () => {
      setIsLoading(true);
      // Optimistic update immediately
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);

      try {
        await markNotificationReadAction({ all: true });
      } catch (err) {
        console.error("Failed to mark all as read:", err);
        // Resync from server on failure
        fetchNotifications();
      } finally {
        setIsLoading(false);
      }
    });
  };

  const handleItemClick = async (
    e: React.MouseEvent,
    notification: NotificationItem
  ) => {
    if (notification.link) {
      e.preventDefault();
    }

    if (!notification.read) {
      // Optimistic state update immediately
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
      );

      // Persist read status to database
      markNotificationReadAction({ notificationId: notification.id }).catch(
        (err) => {
          console.error("Failed to mark notification as read:", err);
        }
      );
    }

    setIsOpen(false);

    if (notification.link) {
      router.push(notification.link);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return "";
    }
  };

  // Filter based on active tab: "unread" displays ONLY unopened notifications
  const displayedNotifications =
    activeTab === "unread"
      ? notifications.filter((n) => !n.read)
      : notifications;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label="View notifications"
        aria-expanded={isOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-white transition-colors"
      >
        <svg
          className="h-4.5 w-4.5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.8"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-bold text-white shadow-xs">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950 z-50 animate-in fade-in zoom-in-95 duration-100"
          role="region"
          aria-label="Notifications menu"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/80">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isLoading}
                className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 disabled:opacity-50 transition-colors"
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Unread / All Filter Tabs */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-lg my-1">
            <button
              type="button"
              onClick={() => setActiveTab("unread")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === "unread"
                  ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <span>Unread</span>
              {unreadCount > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("all")}
              className={`flex-1 flex items-center justify-center py-1 text-xs font-semibold rounded-md transition-all ${
                activeTab === "all"
                  ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              <span>All</span>
              <span className="text-[10px] text-zinc-400 ml-1">
                ({notifications.length})
              </span>
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/50">
            {displayedNotifications.length === 0 ? (
              <div className="py-8 text-center px-4">
                <span className="text-2xl block mb-2">
                  {activeTab === "unread" ? "🎉" : "🔔"}
                </span>
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {activeTab === "unread"
                    ? "You're all caught up!"
                    : "No notifications yet"}
                </p>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 max-w-xs mx-auto">
                  {activeTab === "unread"
                    ? "No unopened notifications. Switch to 'All' to review your past activity."
                    : "We will notify you when you receive new messages, proposals, or milestone updates."}
                </p>
              </div>
            ) : (
              displayedNotifications.map((n) => {
                const content = (
                  <div
                    className={`flex items-start gap-3 p-3 rounded-xl transition-colors ${
                      n.read
                        ? "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                        : "bg-emerald-50/50 text-zinc-900 dark:bg-emerald-950/20 dark:text-zinc-100 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                    }`}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {n.type === "NEW_MESSAGE" ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300 text-xs">
                          💬
                        </span>
                      ) : n.type === "MILESTONE_APPROVED" ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300 text-xs">
                          ✅
                        </span>
                      ) : n.type === "MILESTONE_SUBMITTED" ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 text-xs">
                          📦
                        </span>
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 text-xs">
                          🔔
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={`text-xs truncate ${
                            !n.read ? "font-bold text-zinc-900 dark:text-white" : "font-medium"
                          }`}
                        >
                          {n.title}
                        </p>
                        <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                          {formatTime(n.createdAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-0.5">
                        {n.message}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-600 flex-shrink-0" />
                    )}
                  </div>
                );

                return n.link ? (
                  <Link
                    key={n.id}
                    href={n.link}
                    onClick={(e) => handleItemClick(e, n)}
                    className="block focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500 rounded-xl"
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={n.id}
                    onClick={(e) => handleItemClick(e, n)}
                    className="cursor-pointer"
                  >
                    {content}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
