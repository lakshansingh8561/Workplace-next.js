"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ConversationList } from "@/components/messages/ConversationList";
import { ChatRoom } from "@/components/messages/ChatRoom";
import {
  ConversationSummaryDto,
  getConversationsAction,
  getOrCreateConversationForContractAction,
} from "@/lib/actions/message";

interface MessagingLayoutProps {
  initialConversations: ConversationSummaryDto[];
  initialActiveConversationId: string | null;
  initialError?: string | null;
  currentUserId: string;
}

export function MessagingLayout({
  initialConversations,
  initialActiveConversationId,
  initialError = null,
  currentUserId,
}: MessagingLayoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conversations, setConversations] =
    useState<ConversationSummaryDto[]>(initialConversations);
  const [prevInitial, setPrevInitial] = useState(initialConversations);
  if (prevInitial !== initialConversations) {
    setPrevInitial(initialConversations);
    setConversations(initialConversations);
  }

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isResolvingContract, setIsResolvingContract] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(initialError);

  const queryConvId = searchParams.get("conversationId");
  const queryContractId = searchParams.get("contractId");

  const refreshConversations = useCallback(async () => {
    try {
      const res = await getConversationsAction();
      if (res.success && res.conversations) {
        setConversations(res.conversations);
        return res.conversations;
      }
    } catch (err) {
      console.error("Failed to refresh conversation list:", err);
    }
    return null;
  }, []);

  // Client-side resolution for ?contractId=<id>
  useEffect(() => {
    if (!queryContractId) return;

    // Check if we already have this contract's conversation in state
    const alreadyExists = conversations.some((c) => c.contractId === queryContractId);
    if (alreadyExists) return;

    // Otherwise, actively resolve or create on the fly
    let isCancelled = false;
    async function resolveContractConversation(contractId: string) {
      setIsResolvingContract(true);
      setResolutionError(null);
      try {
        const res = await getOrCreateConversationForContractAction(contractId);
        if (isCancelled) return;

        if (res.success && res.conversationId) {
          setSelectedId(res.conversationId);
          await refreshConversations();
        } else {
          setResolutionError(res.error || "Unable to load conversation for this contract.");
        }
      } catch (err) {
        if (!isCancelled) {
          console.error("Error resolving contract conversation:", err);
          setResolutionError("An unexpected error occurred while loading this contract.");
        }
      } finally {
        if (!isCancelled) {
          setIsResolvingContract(false);
        }
      }
    }

    resolveContractConversation(queryContractId);

    return () => {
      isCancelled = true;
    };
  }, [queryContractId, conversations, refreshConversations]);

  // Derive active conversation ID from:
  // 1. Direct local selection (user clicked in list)
  // 2. Query param ?conversationId=
  // 3. Contract matching in current list
  // 4. Initial server resolved ID
  // 5. Fallback to first available conversation
  const contractMatchedId = queryContractId
    ? conversations.find((c) => c.contractId === queryContractId)?.id ?? null
    : null;

  const activeConversationId =
    selectedId ||
    queryConvId ||
    contractMatchedId ||
    initialActiveConversationId ||
    (conversations[0]?.id ?? null);

  const handleSelectConversation = (id: string) => {
    setSelectedId(id);
    setResolutionError(null);
    router.push(`/messages?conversationId=${id}`, { scroll: false });
  };

  const handleBackToList = () => {
    setSelectedId(null);
    setResolutionError(null);
    router.push("/messages", { scroll: false });
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      {resolutionError && (
        <div className="mb-4 rounded-2xl bg-rose-50 border border-rose-200 p-4 text-xs font-semibold text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{resolutionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setResolutionError(null)}
            className="text-rose-500 hover:text-rose-700 dark:text-rose-400 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900 h-[calc(100vh-9.5rem)] min-h-[580px] max-h-[840px] flex">
        {/* Left Column: Conversation List */}
        <div
          className={`w-full md:w-80 lg:w-96 flex-shrink-0 h-full border-r border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 ${
            activeConversationId ? "hidden md:flex md:flex-col" : "flex flex-col"
          }`}
        >
          <ConversationList
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
          />
        </div>

        {/* Right Column: Chat Room or Empty State */}
        <div
          className={`flex-1 h-full min-w-0 overflow-hidden bg-white dark:bg-zinc-900 ${
            activeConversationId ? "flex flex-col" : "hidden md:flex md:flex-col"
          }`}
        >
          {isResolvingContract ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-zinc-50/50 dark:bg-zinc-950">
              <div className="h-8 w-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Opening contract conversation...
              </p>
            </div>
          ) : activeConversationId ? (
            <ChatRoom
              conversationId={activeConversationId}
              currentUserId={currentUserId}
              onBackToList={handleBackToList}
              onMessageSent={refreshConversations}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-zinc-50/50 dark:bg-zinc-950">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 text-3xl mb-4 shadow-sm">
                💬
              </div>
              <h3 className="text-base sm:text-lg font-extrabold text-zinc-950 dark:text-white">
                No conversation selected
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5 max-w-sm">
                Select a conversation from the left to negotiate project deliverables, review requirements, or coordinate active milestones.
              </p>

              {/* Helpful Marketplace Navigation Shortcuts */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 max-w-md">
                <Link
                  href="/freelancers"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 shadow-xs hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-500 transition"
                >
                  <span>🔍</span>
                  <span>Find Freelancers</span>
                </Link>
                <Link
                  href="/clients"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 shadow-xs hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-500 transition"
                >
                  <span>🏢</span>
                  <span>Explore Clients</span>
                </Link>
                <Link
                  href="/jobs"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 shadow-xs hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-500 transition"
                >
                  <span>💼</span>
                  <span>Browse Jobs</span>
                </Link>
                <Link
                  href="/contracts"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 shadow-xs hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-500 transition"
                >
                  <span>📄</span>
                  <span>View Contracts</span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
