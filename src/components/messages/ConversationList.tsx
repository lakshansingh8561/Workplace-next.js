"use client";

import { useState } from "react";
import { ConversationSummaryDto } from "@/lib/actions/message";

interface ConversationListProps {
  conversations: ConversationSummaryDto[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

export function ConversationList({
  conversations,
  activeConversationId,
  onSelectConversation,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = conversations.filter((c) => {
    const q = searchQuery.toLowerCase();
    const nameMatch = c.counterparty.name?.toLowerCase().includes(q);
    const emailMatch = c.counterparty.email?.toLowerCase().includes(q);
    const contractMatch = c.contract.title.toLowerCase().includes(q);
    return nameMatch || emailMatch || contractMatch;
  });

  const formatSnippetTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      } else if (diffDays === 1) {
        return "Yesterday";
      } else if (diffDays < 7) {
        return date.toLocaleDateString([], { weekday: "short" });
      }
      return date.toLocaleDateString([], { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800">
      {/* Header & Search */}
      <div className="p-4 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-extrabold text-zinc-900 dark:text-white">
            Messages
          </h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {conversations.length}
          </span>
        </div>

        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full rounded-xl border border-zinc-200 bg-zinc-50/80 pl-9 pr-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-white dark:placeholder-zinc-500 transition"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
        </div>
      </div>

      {/* Conversations Scroll Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/60">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
            <span className="text-2xl block mb-2">💬</span>
            <p className="text-xs font-semibold">
              {searchQuery ? "No matching conversations" : "No contract conversations yet"}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
              {searchQuery
                ? "Try searching for a different name or contract title."
                : "Messages are created when you engage on active contracts."}
            </p>
          </div>
        ) : (
          filtered.map((c) => {
            const isActive = c.id === activeConversationId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectConversation(c.id)}
                className={`w-full text-left p-4 transition-colors flex items-start gap-3 focus-visible:outline-none focus-visible:bg-zinc-100 dark:focus-visible:bg-zinc-800 ${
                  isActive
                    ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-l-4 border-emerald-600 pl-3"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white shadow-xs">
                    {c.counterparty.name
                      ? c.counterparty.name.charAt(0).toUpperCase()
                      : c.counterparty.email?.charAt(0).toUpperCase() || "U"}
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white shadow-xs">
                      {c.unreadCount}
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-xs font-bold text-zinc-900 dark:text-white truncate">
                      {c.counterparty.name || c.counterparty.email?.split("@")[0] || "User"}
                    </span>
                    <span className="text-[10px] text-zinc-400 whitespace-nowrap">
                      {formatSnippetTime(c.lastMessageAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.2 text-[9px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {c.counterparty.role === "CLIENT" ? "Client" : "Freelancer"}
                    </span>
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 truncate">
                      {c.contract.title}
                    </span>
                  </div>

                  <p
                    className={`text-[11px] truncate ${
                      c.unreadCount > 0
                        ? "font-semibold text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {c.lastMessageSnippet || "No messages yet. Send a hello!"}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
