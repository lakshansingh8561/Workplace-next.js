"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  getMessagesAction,
  sendMessageAction,
  ChatMessageDto,
} from "@/lib/actions/message";
import { Avatar } from "@/components/ui/Avatar";
import { useAppDispatch, useAppSelector } from "@/lib/store";
import {
  setActiveConversationId,
  saveDraftMessage,
  clearDraftMessage,
  setUserTyping,
} from "@/lib/store/slices/messagingSlice";
import { getSocket, WorkPulseClientSocket } from "@/lib/socket/client";

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
  const dispatch = useAppDispatch();
  const existingDraft = useAppSelector(
    (state) => state.messaging.draftMessages[conversationId] || ""
  );

  const onlineUsers = useAppSelector((state) => state.messaging.onlineUsers);
  const typingMap = useAppSelector(
    (state) => state.messaging.typingUsers[conversationId] || {}
  );

  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [conversation, setConversation] = useState<{
    id: string;
    type: "PRE_HIRE" | "CONTRACT";
    contractId: string;
    contractTitle: string;
    contractStatus: string;
    jobId?: string | null;
    jobTitle?: string | null;
    jobStatus?: string | null;
    counterparty: {
      id: string;
      name: string | null;
      image?: string | null;
      role: "CLIENT" | "FREELANCER";
    };
    invitation?: {
      id: string;
      status: string;
      expiresAt: string;
    } | null;
  } | null>(null);

  const [inputContent, setInputContent] = useState(existingDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Guards against duplicate/rapid in-flight requests and reconnect loops
  const hasLoadedInitialRef = useRef(false);
  const isFetchingHistoryRef = useRef(false);
  const reconciliationPendingRef = useRef(false);
  const reconcileDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const wasDisconnectedRef = useRef(false);
  const onMessageSentRef = useRef(onMessageSent);

  useEffect(() => {
    onMessageSentRef.current = onMessageSent;
  });

  // Sync active conversation with Redux store
  useEffect(() => {
    dispatch(setActiveConversationId(conversationId));
    return () => {
      dispatch(setActiveConversationId(null));
    };
  }, [conversationId, dispatch]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  // Reconciles latest messages missing during offline/disconnect periods.
  // Coalesces multiple reconnect triggers and avoids concurrent duplicate requests.
  const runReconcile = useCallback(async () => {
    if (isFetchingHistoryRef.current) {
      // Coalesce request: marks that a reconciliation pass must run immediately after the active fetch completes
      reconciliationPendingRef.current = true;
      return;
    }

    isFetchingHistoryRef.current = true;
    try {
      const res = await getMessagesAction(conversationId, 25);
      if (res.success && res.messages) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newArrivals = res.messages!.filter((m) => !existingIds.has(m.id));
          if (newArrivals.length === 0) return prev;
          return [...prev, ...newArrivals];
        });
        setTimeout(() => scrollToBottom("smooth"), 50);

        // Emit read receipt if new messages arrived from counterparty
        const hasCounterpartyMessage = res.messages.some((m) => m.senderId !== currentUserId);
        if (hasCounterpartyMessage) {
          getSocket().then((s) => s?.emit("message:read", { conversationId }));
        }

        if (onMessageSentRef.current) {
          try {
            onMessageSentRef.current();
          } catch {
            // Non-blocking
          }
        }
      }
    } catch (err) {
      console.warn("[WorkPulse Socket Reconnect Reconciliation Warning]:", err);
    } finally {
      isFetchingHistoryRef.current = false;
      // If another reconciliation was requested while this query was running, drain the queue
      if (reconciliationPendingRef.current) {
        reconciliationPendingRef.current = false;
        setTimeout(runReconcile, 50);
      }
    }
  }, [conversationId, currentUserId, scrollToBottom]);

  // Initial load of messages when conversationId changes (strictly deduplicated)
  useEffect(() => {
    let ignore = false;
    hasLoadedInitialRef.current = false;

    async function fetchHistory() {
      // Drop duplicate or overlapping calls for the same conversation
      if (isFetchingHistoryRef.current) return;
      isFetchingHistoryRef.current = true;

      setIsLoading(true);
      setErrorMessage(null);
      setActionSuccess(null);
      // Clean slate on conversation transition: immediately clear previous conversation state
      setMessages([]);
      setConversation(null);

      try {
        const res = await getMessagesAction(conversationId, 50);
        if (!ignore) {
          if (res.success && res.messages) {
            setMessages(res.messages);
            setHasMore(Boolean(res.hasMore));
            setNextCursor(res.nextCursor || null);
            if (res.conversation) {
              setConversation(res.conversation);
            }
            hasLoadedInitialRef.current = true;
            setTimeout(() => scrollToBottom("auto"), 60);
          } else {
            setErrorMessage(res.error || "Unable to load conversation messages.");
          }
        }
      } catch (err) {
        if (!ignore) {
          setErrorMessage("Failed to load conversation history.");
        }
        console.error("[WorkPulse Messaging] History fetch error:", err);
      } finally {
        isFetchingHistoryRef.current = false;
        if (!ignore) {
          setIsLoading(false);
        }
        // If a reconciliation was queued while the initial load was running, drain it now
        if (reconciliationPendingRef.current) {
          reconciliationPendingRef.current = false;
          runReconcile();
        }
      }
    }

    fetchHistory();

    return () => {
      ignore = true;
      isFetchingHistoryRef.current = false;
      if (reconcileDebounceTimerRef.current) {
        clearTimeout(reconcileDebounceTimerRef.current);
      }
    };
  }, [conversationId, runReconcile, scrollToBottom]);

  // Socket.IO Real-Time Subscription (WhatsApp-like immediate delivery, typing & read receipts)
  useEffect(() => {
    let isCancelled = false;
    let boundSocket: WorkPulseClientSocket | null = null;

    async function setupSocketSubscription() {
      const socket = await getSocket();
      if (!socket || isCancelled) return null;
      boundSocket = socket;

      // Join conversation room
      socket.emit("conversation:join", { conversationId }, (res) => {
        if (res && !res.success) {
          console.warn("[WorkPulse Socket Join Warning]:", res.error);
        }
      });

      // Mark conversation as read on initial open
      socket.emit("message:read", { conversationId });

      // Handle incoming messages directly via WebSockets (never refetches conversation history)
      const handleNewMessage = (msg: ChatMessageDto) => {
        if (msg.conversationId !== conversationId) return;

        setMessages((prev) => {
          // Strict conversation isolation guard
          const scopedPrev = prev.filter((m) => !m.conversationId || m.conversationId === conversationId);

          // Check if message already exists (e.g. by persistent ID or optimistic match)
          const alreadyExists = scopedPrev.some(
            (m) =>
              m.id === msg.id ||
              (m.senderId === msg.senderId &&
                m.content === msg.content &&
                Math.abs(new Date(m.createdAt).getTime() - new Date(msg.createdAt).getTime()) < 3000)
          );

          if (alreadyExists) {
            return scopedPrev.map((m) =>
              m.id === msg.id ||
              (m.senderId === msg.senderId && m.content === msg.content && m.id.startsWith("client_"))
                ? msg
                : m
            );
          }

          return [...scopedPrev, msg];
        });

        setTimeout(() => scrollToBottom("smooth"), 50);

        // If message is from counterparty, emit read receipt immediately
        if (msg.senderId !== currentUserId) {
          socket.emit("message:read", { conversationId });
        }

        // Notify parent layout to refresh conversation snippet
        if (onMessageSentRef.current) {
          try {
            onMessageSentRef.current();
          } catch {
            // Non-blocking
          }
        }
      };

      // Handle typing indicator updates
      const handleTypingUpdate = (payload: {
        conversationId: string;
        userId: string;
        isTyping: boolean;
        userName?: string | null;
      }) => {
        if (payload.conversationId === conversationId && payload.userId !== currentUserId) {
          dispatch(
            setUserTyping({
              conversationId,
              userId: payload.userId,
              isTyping: payload.isTyping,
              name: payload.userName,
            })
          );
        }
      };

      // Handle read receipts
      const handleReadReceipt = (payload: {
        conversationId: string;
        readerId: string;
        readAt: string;
      }) => {
        if (payload.conversationId === conversationId && payload.readerId !== currentUserId) {
          setMessages((prev) =>
            prev.map((m) => (m.senderId === currentUserId ? { ...m, read: true } : m))
          );
        }
      };

      // Track disconnection state to distinguish genuine reconnection from initial connection
      const handleDisconnect = () => {
        wasDisconnectedRef.current = true;
      };

      // Handle connect/reconnect: re-join room and safely debounce reconciliation
      // Guarantees that any messages sent while connecting or reconnecting arrive immediately without refresh
      const handleConnect = () => {
        socket.emit("conversation:join", { conversationId });

        if (reconcileDebounceTimerRef.current) {
          clearTimeout(reconcileDebounceTimerRef.current);
        }

        reconcileDebounceTimerRef.current = setTimeout(() => {
          if (!isCancelled) {
            runReconcile();
          }
        }, 350);
      };

      socket.on("message:new", handleNewMessage);
      socket.on("typing:update", handleTypingUpdate);
      socket.on("message:read_receipt", handleReadReceipt);
      socket.on("disconnect", handleDisconnect);
      socket.on("connect", handleConnect);

      return () => {
        socket.off("message:new", handleNewMessage);
        socket.off("typing:update", handleTypingUpdate);
        socket.off("message:read_receipt", handleReadReceipt);
        socket.off("disconnect", handleDisconnect);
        socket.off("connect", handleConnect);
        socket.emit("conversation:leave", { conversationId });
      };
    }

    let cleanupFn: (() => void) | null = null;
    setupSocketSubscription().then((fn) => {
      if (isCancelled && fn) {
        fn();
      } else {
        cleanupFn = fn || null;
      }
    });

    return () => {
      isCancelled = true;
      if (reconcileDebounceTimerRef.current) {
        clearTimeout(reconcileDebounceTimerRef.current);
      }
      if (cleanupFn) {
        cleanupFn();
      } else if (boundSocket) {
        boundSocket.emit("conversation:leave", { conversationId });
      }
      // Clear typing indicator for current conversation on unmount
      dispatch(
        setUserTyping({
          conversationId,
          userId: currentUserId,
          isTyping: false,
        })
      );
    };
  }, [conversationId, currentUserId, dispatch, runReconcile, scrollToBottom]);

  // Resilient Zero-Refresh Synchronization Loop:
  // When WebSocket is disconnected, connecting, or Render server is spinning up,
  // safely checks for new messages every 2.5 seconds and on window focus/visibility change.
  // The moment the socket is connected, WebSocket handles deliveries in real time (<100ms).
  // This guarantees that the receiver NEVER has to refresh the browser to see new messages.
  useEffect(() => {
    let isCancelled = false;

    // Wake up Render socket server in background if sleeping
    try {
      fetch("https://workplace-next-js.onrender.com/health", {
        mode: "no-cors",
        cache: "no-store",
      }).catch(() => {});
    } catch {
      // Non-blocking
    }

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible" && !isFetchingHistoryRef.current) {
        runReconcile();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    const fallbackSyncInterval = setInterval(async () => {
      if (isCancelled || document.hidden) return;

      const socket = await getSocket();
      const isSocketConnected = Boolean(socket && socket.connected);

      // If socket is offline or reconnecting, run reconcile to seamlessly fetch any new messages without refresh
      if (!isSocketConnected && !isFetchingHistoryRef.current) {
        runReconcile();
      }
    }, 2500);

    return () => {
      isCancelled = true;
      clearInterval(fallbackSyncInterval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [runReconcile]);

  // Load older messages (cursor pagination preserved)
  const handleLoadOlderMessages = async () => {
    if (!nextCursor || isLoadingOlder) return;
    setIsLoadingOlder(true);
    try {
      const res = await getMessagesAction(conversationId, {
        limit: 50,
        cursor: nextCursor,
        direction: "before",
      });
      if (res.success && res.messages) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const older = res.messages!.filter((m) => !existingIds.has(m.id));
          return [...older, ...prev];
        });
        setHasMore(Boolean(res.hasMore));
        setNextCursor(res.nextCursor || null);
      }
    } catch (err) {
      console.error("[WorkPulse Messaging] Error loading older messages:", err);
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // Helper to emit typing state to Socket.IO
  const handleInputChange = (val: string) => {
    setInputContent(val);
    dispatch(saveDraftMessage({ conversationId, text: val }));

    getSocket().then((socket) => {
      if (!socket || !socket.connected) return;

      if (val.trim()) {
        socket.emit("typing:start", { conversationId });

        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
          socket.emit("typing:stop", { conversationId });
          typingTimeoutRef.current = null;
        }, 2500);
      } else {
        socket.emit("typing:stop", { conversationId });
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
      }
    });
  };

  // Real-Time Message Sending with Optimistic UI & Socket.IO
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = inputContent.trim();
    if (!trimmed || isSending) {
      return;
    }

    if (trimmed.length > 3000) {
      setErrorMessage("Message cannot exceed 3,000 characters.");
      return;
    }

    setErrorMessage(null);
    setIsSending(true);

    // Stop typing indicator on send
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    getSocket().then((socket) => {
      if (socket && socket.connected) {
        socket.emit("typing:stop", { conversationId });
      }
    });

    const clientMessageId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Optimistic message displayed immediately
    const optimisticMessage: ChatMessageDto = {
      id: clientMessageId,
      conversationId,
      senderId: currentUserId,
      content: trimmed,
      read: false,
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUserId,
        name: "You",
        image: null,
      },
    };

    setInputContent("");
    dispatch(clearDraftMessage(conversationId));
    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => scrollToBottom("smooth"), 50);

    const fallbackToServerAction = async () => {
      try {
        const res = await sendMessageAction({
          conversationId,
          content: trimmed,
        });

        if (res.success && res.message) {
          setMessages((prev) =>
            prev.map((m) => (m.id === clientMessageId ? res.message! : m))
          );
          if (onMessageSent) {
            try {
              onMessageSent();
            } catch {
              // Non-blocking
            }
          }
        } else {
          setErrorMessage(res.error || "Failed to send message. Please try again.");
          setMessages((prev) => prev.filter((m) => m.id !== clientMessageId));
        }
      } catch {
        setErrorMessage("Failed to send message. Please try again.");
        setMessages((prev) => prev.filter((m) => m.id !== clientMessageId));
      } finally {
        setIsSending(false);
      }
    };

    try {
      const socket = await getSocket();
      if (socket && socket.connected) {
        let acknowledged = false;
        const ackTimeout = setTimeout(() => {
          if (!acknowledged) {
            acknowledged = true;
            fallbackToServerAction();
          }
        }, 5000);

        socket.emit(
          "message:send",
          { conversationId, content: trimmed, clientMessageId },
          (response) => {
            if (acknowledged) return;
            acknowledged = true;
            clearTimeout(ackTimeout);

            setIsSending(false);
            if (response && response.success && response.message) {
              setMessages((prev) =>
                prev.map((m) => (m.id === clientMessageId ? response.message! : m))
              );
              if (onMessageSent) {
                try {
                  onMessageSent();
                } catch {
                  // Non-blocking
                }
              }
            } else {
              fallbackToServerAction();
            }
          }
        );
      } else {
        // Socket offline, fallback seamlessly to server action
        await fallbackToServerAction();
      }
    } catch {
      await fallbackToServerAction();
    }
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
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    } catch {
      return "";
    }
  };

  const formatMessageDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  const isPreHire = conversation?.type === "PRE_HIRE";
  const isContract = conversation?.type === "CONTRACT";
  const counterpartyId = conversation?.counterparty.id;
  const isCounterpartyOnline = Boolean(counterpartyId && onlineUsers[counterpartyId]);

  // Check if counterparty is typing
  const counterpartyTypingEntry = counterpartyId ? typingMap[counterpartyId] : null;
  const isCounterpartyTyping = Boolean(counterpartyTypingEntry?.isTyping);

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-hidden bg-zinc-50/90 dark:bg-zinc-950">
      {/* Thread Header */}
      <div className="flex flex-col border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0 min-w-0">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 gap-3 min-w-0">
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
                <div className="relative">
                  <Avatar
                    src={conversation.counterparty.image}
                    name={conversation.counterparty.name}
                    role={conversation.counterparty.role}
                    userId={conversation.counterparty.id}
                    size="sm"
                  />
                  {/* Real-time Presence Badge */}
                  <span
                    className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-zinc-900 ${
                      isCounterpartyOnline ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                    }`}
                    title={isCounterpartyOnline ? "Online" : "Offline"}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={
                        conversation.counterparty.role === "CLIENT"
                          ? `/clients/${conversation.counterparty.id}`
                          : `/freelancers/${conversation.counterparty.id}`
                      }
                      className="text-sm font-bold text-zinc-950 dark:text-white hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline truncate"
                      title="View public profile"
                    >
                      {conversation.counterparty.name ||
                        (conversation.counterparty.role === "CLIENT"
                          ? "Client"
                          : "Freelancer")}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.2 text-[9px] font-bold ${
                        isPreHire
                          ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300"
                          : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      }`}
                    >
                      {conversation.counterparty.role === "CLIENT"
                        ? "Client"
                        : "Freelancer"}
                    </span>
                    {/* Live Online Indicator */}
                    <span
                      className={`text-[10px] font-semibold flex items-center gap-1 ${
                        isCounterpartyOnline
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-zinc-400 dark:text-zinc-500"
                      }`}
                    >
                      {isCounterpartyOnline ? "• Online" : "• Offline"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 truncate mt-0.5">
                    {isPreHire ? (
                      <>
                        <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                          Pre-Hire:
                        </span>
                        {conversation.jobId ? (
                          <Link
                            href={`/jobs/${conversation.jobId}`}
                            className="font-medium text-zinc-700 hover:text-indigo-600 dark:text-zinc-300 dark:hover:text-indigo-400 hover:underline truncate"
                          >
                            {conversation.jobTitle || conversation.contractTitle} ↗
                          </Link>
                        ) : (
                          <span className="truncate">{conversation.contractTitle}</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Contract:
                        </span>
                        {conversation.contractId ? (
                          <Link
                            href={`/contracts/${conversation.contractId}`}
                            className="font-medium text-zinc-700 hover:text-emerald-600 dark:text-zinc-300 dark:hover:text-emerald-400 hover:underline truncate"
                          >
                            {conversation.contractTitle} ↗
                          </Link>
                        ) : (
                          <span className="truncate">{conversation.contractTitle}</span>
                        )}
                      </>
                    )}
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
            <div className="flex items-center gap-2 shrink-0">
              {isContract && conversation.contractId && (
                <>
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
                </>
              )}

              {isPreHire && conversation.jobId && (
                <Link
                  href={`/jobs/${conversation.jobId}`}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition"
                >
                  View Job ↗
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Pre-Hire Context Banner (Discussion & Hiring shortcuts) */}
        {isPreHire && conversation && (
          <div className="px-4 sm:px-6 py-2 bg-indigo-50/60 dark:bg-indigo-950/30 border-t border-indigo-100/60 dark:border-indigo-900/40 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-medium">
              <span>💬</span>
              <span>Pre-hire discussion regarding project scope and requirements.</span>
            </div>

            <div className="flex items-center gap-2">
              {/* If Client: direct shortcut to Review Proposals & Hire */}
              {conversation.counterparty.role === "FREELANCER" && conversation.jobId && (
                <Link
                  href={`/dashboard/client/jobs/${conversation.jobId}/proposals`}
                  className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-emerald-500 transition"
                >
                  Review Proposals / Hire →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Success Notification Alert */}
      {actionSuccess && (
        <div className="m-3 mb-0 rounded-2xl bg-emerald-50 p-3 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <span>✓ {actionSuccess}</span>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Messages Feed */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-4 min-w-0"
      >
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
                    setErrorMessage(res.error || "Failed to load messages.");
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
              {isPreHire
                ? "Start the conversation regarding candidate qualifications, project scope, or milestones."
                : "Discuss requirements, deliverables, or deadlines. Only contract participants can view this conversation."}
            </p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-2">
                <button
                  type="button"
                  onClick={handleLoadOlderMessages}
                  disabled={isLoadingOlder}
                  className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3.5 py-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isLoadingOlder ? (
                    <>
                      <div className="h-3 w-3 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                      Loading older messages...
                    </>
                  ) : (
                    <>
                      <span>↑</span> Load older messages
                    </>
                  )}
                </button>
              </div>
            )}
            {messages.map((m, idx) => {
              const isMe = m.senderId === currentUserId;
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const showDateHeader =
                !prevMsg ||
                new Date(m.createdAt).toDateString() !==
                  new Date(prevMsg.createdAt).toDateString();

              // Check if message is a system notification message (e.g. starts with [)
              const isSystemMessage = m.content.startsWith("[") && m.content.endsWith("]");

              if (isSystemMessage) {
                return (
                  <div key={m.id} className="space-y-2">
                    {showDateHeader && (
                      <div className="flex items-center justify-center my-3">
                        <span suppressHydrationWarning className="px-2.5 py-0.5 rounded-full bg-zinc-200/80 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {formatMessageDate(m.createdAt)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-center my-2">
                      <div suppressHydrationWarning className="rounded-xl bg-zinc-100 px-3.5 py-1 text-center text-[11px] font-medium text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 max-w-md">
                        {m.content} • {formatMessageTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={m.id} className="space-y-2">
                  {showDateHeader && (
                    <div className="flex items-center justify-center my-3">
                      <span suppressHydrationWarning className="px-2.5 py-0.5 rounded-full bg-zinc-200/80 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        {formatMessageDate(m.createdAt)}
                      </span>
                    </div>
                  )}

                  <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className="text-[10px] font-bold text-zinc-500">
                        {isMe
                          ? "You"
                          : m.sender.name ||
                            (m.sender.role === "CLIENT" ? "Client" : "Freelancer")}
                      </span>
                      <span suppressHydrationWarning className="text-[10px] text-zinc-400">
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
                        {m.id.startsWith("client_") ? (
                          <span className="text-zinc-400 italic">Sending...</span>
                        ) : m.read ? (
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
            })}

            {/* Real-time Typing Indicator in Message Feed */}
            {isCounterpartyTyping && (
              <div className="flex items-center gap-2 py-1 px-2 text-xs text-zinc-500 animate-pulse">
                <span className="flex gap-1 items-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" />
                </span>
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {conversation?.counterparty.name || "Counterparty"} is typing...
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Project Negotiation & Discussion Starters */}
      <div className="px-3 sm:px-4 py-1.5 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto text-[11px] shrink-0">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider shrink-0 mr-0.5">
          💡 Topics:
        </span>
        <button
          type="button"
          onClick={() =>
            handleInputChange(
              (inputContent ? inputContent + "\n" : "") +
                "Could we clarify the core deliverables, project scope, and key acceptance criteria?"
            )
          }
          className="shrink-0 rounded-lg bg-white dark:bg-zinc-800 px-2.5 py-1 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 hover:text-emerald-600 dark:hover:border-emerald-500 transition font-medium"
        >
          🎯 Scope & Deliverables
        </button>
        <button
          type="button"
          onClick={() =>
            handleInputChange(
              (inputContent ? inputContent + "\n" : "") +
                "Let's align on the proposed milestones, rate expectations, and payment schedule."
            )
          }
          className="shrink-0 rounded-lg bg-white dark:bg-zinc-800 px-2.5 py-1 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 hover:text-emerald-600 dark:hover:border-emerald-500 transition font-medium"
        >
          💰 Rate & Milestones
        </button>
        <button
          type="button"
          onClick={() =>
            handleInputChange(
              (inputContent ? inputContent + "\n" : "") +
                "What is your target deadline and estimated availability for each project phase?"
            )
          }
          className="shrink-0 rounded-lg bg-white dark:bg-zinc-800 px-2.5 py-1 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 hover:text-emerald-600 dark:hover:border-emerald-500 transition font-medium"
        >
          ⏱️ Timeline & Deadlines
        </button>
        <button
          type="button"
          onClick={() =>
            handleInputChange(
              (inputContent ? inputContent + "\n" : "") +
                "How many rounds of revisions are included in this arrangement?"
            )
          }
          className="shrink-0 rounded-lg bg-white dark:bg-zinc-800 px-2.5 py-1 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:border-emerald-500 hover:text-emerald-600 dark:hover:border-emerald-500 transition font-medium"
        >
          🔄 Revisions & Terms
        </button>
      </div>

      {/* Composer */}
      <div className="p-3 sm:p-4 bg-white dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 shrink-0 min-w-0">
        <form onSubmit={handleSendMessage} className="space-y-2">
          <div className="relative">
            <textarea
              rows={2}
              value={inputContent}
              onChange={(e) => handleInputChange(e.target.value)}
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
