"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import Link from "next/link";
import {
  getMessagesAction,
  sendMessageAction,
  ChatMessageDto,
} from "@/lib/actions/message";

interface ChatRoomProps {
  conversationId: string;
  currentUserId: string;
  onBackToList?: () => void;
  onMessageSent?: () => void;
}

export function ChatRoom({
  conversationId,
  currentUserId,
  onBackToList,
  onMessageSent,
}: ChatRoomProps) {
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [conversation, setConversation] = useState<{
    id: string;
    contractId: string;
    contractTitle: string;
    contractStatus: string;
    counterparty: {
      id: string;
      name: string | null;
      email: string | null;
      role: "CLIENT" | "FREELANCER";
    };
  } | null>(null);

  const [inputContent, setInputContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, startSendTransition] = useTransition();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Initial load when conversationId changes
  useEffect(() => {
    let ignore = false;

    async function fetchHistory() {
      try {
        const res = await getMessagesAction(conversationId, 60);
        if (!ignore) {
          if (res.success && res.messages) {
            setMessages(res.messages);
            if (res.conversation) {
              setConversation(res.conversation);
            }
            setErrorMessage(null);
            setTimeout(() => scrollToBottom("auto"), 50);
          } else {
            setErrorMessage(res.error || "Unable to load messages.");
          }
        }
      } catch (err) {
        if (!ignore) {
          setErrorMessage("Failed to load conversation history.");
        }
        console.error("Messages fetch error:", err);
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    fetchHistory();

    return () => {
      ignore = true;
    };
  }, [conversationId, scrollToBottom]);

  // Sane background polling: poll every 6s only when tab is visible
  useEffect(() => {
    let ignore = false;

    const interval = setInterval(async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await getMessagesAction(conversationId, 60);
          if (!ignore && res.success && res.messages) {
            setMessages(res.messages);
            if (res.conversation) {
              setConversation(res.conversation);
            }
          }
        } catch (err) {
          console.error("Polling message update error:", err);
        }
      }
    }, 6000);

    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, [conversationId]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = inputContent.trim();
    if (!trimmed) {
      return;
    }

    if (trimmed.length > 3000) {
      setErrorMessage("Message cannot exceed 3,000 characters.");
      return;
    }

    setErrorMessage(null);

    startSendTransition(async () => {
      const res = await sendMessageAction({
        conversationId,
        content: trimmed,
      });

      if (res.success && res.message) {
        setInputContent("");
        setMessages((prev) => [...prev, res.message!]);
        setTimeout(() => scrollToBottom("smooth"), 50);
        if (onMessageSent) {
          onMessageSent();
        }
      } else {
        setErrorMessage(res.error || "Failed to send message. Please try again.");
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const formatMessageDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50/50 dark:bg-zinc-950">
      {/* Thread Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3 min-w-0">
          {onBackToList && (
            <button
              type="button"
              onClick={onBackToList}
              className="md:hidden p-1.5 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label="Back to conversations list"
            >
              ←
            </button>
          )}

          {conversation ? (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white flex-shrink-0">
                {conversation.counterparty.name
                  ? conversation.counterparty.name.charAt(0).toUpperCase()
                  : conversation.counterparty.email?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                    {conversation.counterparty.name ||
                      conversation.counterparty.email?.split("@")[0] ||
                      "Contract Partner"}
                  </h3>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {conversation.counterparty.role === "CLIENT"
                      ? "Client"
                      : "Freelancer"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-zinc-500 truncate">
                  <span className="truncate">Contract:</span>
                  <Link
                    href={`/contracts/${conversation.contractId}`}
                    className="font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 hover:underline truncate"
                  >
                    {conversation.contractTitle}
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-800 animate-pulse" />
              <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
            </div>
          )}
        </div>

        {conversation && (
          <div className="flex items-center gap-2">
            <span
              className={`hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                conversation.contractStatus === "ACTIVE"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              }`}
            >
              {conversation.contractStatus}
            </span>
            <Link
              href={`/contracts/${conversation.contractId}`}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 px-2 py-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition"
            >
              View Contract ↗
            </Link>
          </div>
        )}
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full space-y-2">
            <div className="h-6 w-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-zinc-500 font-medium">Loading messages...</p>
          </div>
        ) : errorMessage ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <span className="text-3xl mb-2">⚠️</span>
            <p className="text-xs font-semibold text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => {
                setIsLoading(true);
                getMessagesAction(conversationId, 60).then((res) => {
                  if (res.success && res.messages) {
                    setMessages(res.messages);
                    if (res.conversation) setConversation(res.conversation);
                    setErrorMessage(null);
                  } else {
                    setErrorMessage(res.error || "Failed to load.");
                  }
                  setIsLoading(false);
                });
              }}
              className="mt-3 text-xs font-bold text-emerald-600 hover:underline"
            >
              Try Again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400 text-xl mb-3">
              💬
            </div>
            <h4 className="text-sm font-bold text-zinc-900 dark:text-white">
              No messages yet
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm">
              Start the discussion regarding deliverables, deadlines, or project
              milestones. Only contract members can view this conversation.
            </p>
          </div>
        ) : (
          messages.map((m, idx) => {
            const isMe = m.senderId === currentUserId;
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showDateHeader =
              !prevMsg ||
              new Date(m.createdAt).toDateString() !==
                new Date(prevMsg.createdAt).toDateString();

            return (
              <div key={m.id} className="space-y-2">
                {showDateHeader && (
                  <div className="flex items-center justify-center my-3">
                    <span className="px-2.5 py-0.5 rounded-full bg-zinc-200/80 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {formatMessageDate(m.createdAt)}
                    </span>
                  </div>
                )}

                <div
                  className={`flex flex-col ${
                    isMe ? "items-end" : "items-start"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <span className="text-[10px] font-bold text-zinc-500">
                      {isMe
                        ? "You"
                        : m.sender.name || m.sender.email?.split("@")[0] || "Partner"}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {formatMessageTime(m.createdAt)}
                    </span>
                  </div>

                  <div
                    className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-xs shadow-xs break-words whitespace-pre-wrap ${
                      isMe
                        ? "bg-emerald-600 text-white rounded-br-xs"
                        : "bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 rounded-bl-xs border border-zinc-200/80 dark:border-zinc-700/80"
                    }`}
                  >
                    {m.content}
                  </div>

                  {isMe && (
                    <div className="mt-0.5 px-1 flex items-center gap-1 text-[9px] text-zinc-400">
                      {m.read ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          ✓✓ Read
                        </span>
                      ) : (
                        <span>✓ Sent</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800">
        <form onSubmit={handleSendMessage} className="space-y-2">
          <div className="relative">
            <textarea
              rows={2}
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Press Enter to send, Shift+Enter for newline)"
              className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50/70 p-3 text-xs text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-white dark:placeholder-zinc-500 transition"
              maxLength={3000}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400">
              {inputContent.length}/3000 characters
            </span>

            <button
              type="submit"
              disabled={isSending || !inputContent.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {isSending ? (
                <>
                  <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <span>Send</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
