"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ConversationList } from "@/components/messages/ConversationList";
import { ChatRoom } from "@/components/messages/ChatRoom";
import {
  ConversationSummaryDto,
  getConversationsAction,
} from "@/lib/actions/message";

interface MessagingLayoutProps {
  initialConversations: ConversationSummaryDto[];
  initialActiveConversationId: string | null;
  currentUserId: string;
}

export function MessagingLayout({
  initialConversations,
  initialActiveConversationId,
  currentUserId,
}: MessagingLayoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [conversations, setConversations] =
    useState<ConversationSummaryDto[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Derive active conversation ID from query params, explicit local selection, or initial fallback
  const queryConvId = searchParams.get("conversationId");
  const activeConversationId =
    queryConvId ||
    selectedId ||
    initialActiveConversationId ||
    (conversations[0]?.id ?? null);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await getConversationsAction();
      if (res.success && res.conversations) {
        setConversations(res.conversations);
      }
    } catch (err) {
      console.error("Failed to refresh conversation list:", err);
    }
  }, []);

  const handleSelectConversation = (id: string) => {
    setSelectedId(id);
    router.push(`/messages?conversationId=${id}`, { scroll: false });
  };

  const handleBackToList = () => {
    setSelectedId(null);
    router.push("/messages", { scroll: false });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="overflow-hidden rounded-3xl border border-zinc-200/90 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900 h-[calc(100vh-9.5rem)] min-h-[580px] max-h-[820px] flex">
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
          {activeConversationId ? (
            <ChatRoom
              conversationId={activeConversationId}
              currentUserId={currentUserId}
              onBackToList={handleBackToList}
              onMessageSent={refreshConversations}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-zinc-50/50 dark:bg-zinc-950">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 text-2xl mb-3 shadow-xs">
                💬
              </div>
              <h3 className="text-base font-extrabold text-zinc-900 dark:text-white">
                Select a conversation
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
                Choose an active contract conversation from the list on the left to
                read messages, review requirements, or coordinate deliverables.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
