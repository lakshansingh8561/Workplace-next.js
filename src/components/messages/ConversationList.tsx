"use client";

import { useState } from "react";
import { ConversationSummaryDto } from "@/lib/actions/message";
import { Avatar } from "@/components/ui/Avatar";

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
  const [tabFilter, setTabFilter] = useState<"ALL" | "CONTRACTS" | "PRE_HIRE">("ALL");

  const contractCount = conversations.filter(
    (c) => c.type === "CONTRACT" || !c.type
  ).length;
  const preHireCount = conversations.filter(
    (c) => c.type === "PRE_HIRE"
  ).length;

  const filtered = conversations.filter((c) => {
    const isPreHire = c.type === "PRE_HIRE";
    if (tabFilter === "CONTRACTS" && isPreHire) return false;
    if (tabFilter === "PRE_HIRE" && !isPreHire) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = c.counterparty.name?.toLowerCase().includes(q);
      const contractMatch = c.contract.title.toLowerCase().includes(q);
      const jobMatch = c.job?.title.toLowerCase().includes(q);
      return nameMatch || contractMatch || Boolean(jobMatch);
    }
    return true;
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
    <div className="flex flex-col h-full w-full min-w-0 overflow-hidden bg-white dark:bg-zinc-900">
      {/* Header, Search & Filter Tabs */}
      <div className="p-3.5 sm:p-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0 w-full min-w-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold text-zinc-950 dark:text-white">
            Messages
          </h2>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {conversations.length}
          </span>
        </div>

        {/* Search */}
        <div className="relative w-full min-w-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages or projects..."
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
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tabs: All / Contracts / Pre-Hire */}
        <div className="flex gap-1 p-0.5 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 text-[11px] font-bold">
          <button
            type="button"
            onClick={() => setTabFilter("ALL")}
            className={`flex-1 py-1 rounded-lg transition-all ${
              tabFilter === "ALL"
                ? "bg-white text-zinc-950 shadow-xs dark:bg-zinc-900 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setTabFilter("CONTRACTS")}
            className={`flex-1 py-1 rounded-lg transition-all ${
              tabFilter === "CONTRACTS"
                ? "bg-white text-zinc-950 shadow-xs dark:bg-zinc-900 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Contracts ({contractCount})
          </button>
          <button
            type="button"
            onClick={() => setTabFilter("PRE_HIRE")}
            className={`flex-1 py-1 rounded-lg transition-all ${
              tabFilter === "PRE_HIRE"
                ? "bg-white text-zinc-950 shadow-xs dark:bg-zinc-900 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            Pre-Hire ({preHireCount})
          </button>
        </div>
      </div>

      {/* Conversations Scroll Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-zinc-100 dark:divide-zinc-800/60 w-full min-w-0">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
            <span className="text-2xl block mb-2">💬</span>
            <p className="text-xs font-semibold">
              {searchQuery
                ? "No matching conversations"
                : tabFilter === "PRE_HIRE"
                ? "No pre-hire conversations"
                : tabFilter === "CONTRACTS"
                ? "No contract conversations"
                : "No conversations yet"}
            </p>
            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1 max-w-xs mx-auto">
              {searchQuery
                ? "Try searching for another candidate, client, or job title."
                : "When you interview candidates or award contracts, discussions will appear here."}
            </p>
          </div>
        ) : (
          filtered.map((c) => {
            const isActive = c.id === activeConversationId;
            const isPreHire = c.type === "PRE_HIRE";
            const projectTitle = isPreHire
              ? c.job?.title || c.contract.title
              : c.contract.title;

            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectConversation(c.id)}
                className={`w-full max-w-full text-left p-3.5 sm:p-4 transition-colors flex items-start gap-3 overflow-hidden focus-visible:outline-none focus-visible:bg-zinc-100 dark:focus-visible:bg-zinc-800 ${
                  isActive
                    ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-l-4 border-emerald-600 pl-3"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                }`}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <Avatar
                    src={c.counterparty.image}
                    name={c.counterparty.name}
                    role={c.counterparty.role}
                    userId={c.counterparty.id}
                    size="sm"
                  />
                  {c.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-bold text-white shadow-xs">
                      {c.unreadCount}
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-xs font-bold text-zinc-900 dark:text-white truncate block">
                      {c.counterparty.name ||
                        (c.counterparty.role === "CLIENT" ? "Client" : "Freelancer")}
                    </span>
                    <span className="text-[10px] text-zinc-400 shrink-0 whitespace-nowrap">
                      {formatSnippetTime(c.lastMessageAt)}
                    </span>
                  </div>

                  {/* Badges row: Pre-Hire vs Contract + Role */}
                  <div className="flex items-center gap-1.5 mb-1 overflow-hidden">
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-extrabold uppercase shrink-0 ${
                        isPreHire
                          ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      }`}
                    >
                      {isPreHire ? "Pre-Hire" : "Contract"}
                    </span>
                    <span className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300 truncate block">
                      {projectTitle}
                    </span>
                  </div>

                  {/* Last message preview */}
                  <p
                    className={`text-[11px] truncate block ${
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
