import type { ChatMessageDto } from "@/lib/actions/message";

export interface ServerToClientEvents {
  // Real-time message broadcast
  "message:new": (message: ChatMessageDto) => void;

  // Real-time read receipt notification
  "message:read_receipt": (payload: {
    conversationId: string;
    readerId: string;
    readAt: string;
  }) => void;

  // Typing state update
  "typing:update": (payload: {
    conversationId: string;
    userId: string;
    isTyping: boolean;
    userName?: string | null;
  }) => void;

  // Presence updates
  "presence:online": (payload: { userId: string }) => void;
  "presence:offline": (payload: { userId: string }) => void;
  "presence:init": (payload: { onlineUserIds: string[] }) => void;

  // Unread badge / snippet update
  "conversation:updated": (payload: {
    conversationId: string;
    lastMessageSnippet: string;
    lastMessageAt: string;
    senderId: string;
  }) => void;

  // Real-time contract and milestone state update
  "contract:updated": (payload: {
    contractId: string;
    milestoneId?: string;
    status?: string;
  }) => void;

  // Error notifications
  "socket:error": (payload: { message: string; code?: string }) => void;
}

export interface ClientToServerEvents {
  // Join a specific authorized conversation room
  "conversation:join": (
    payload: { conversationId: string },
    callback?: (response: { success: boolean; error?: string; conversationId?: string }) => void
  ) => void;

  // Leave a conversation room
  "conversation:leave": (payload: { conversationId: string }) => void;

  // Join a contract room for real-time milestone synchronization
  "contract:join": (payload: { contractId: string }) => void;

  // Leave a contract room
  "contract:leave": (payload: { contractId: string }) => void;

  // Send message over WebSockets
  "message:send": (
    payload: {
      conversationId: string;
      content: string;
      clientMessageId?: string;
    },
    callback?: (response: {
      success: boolean;
      message?: ChatMessageDto;
      clientMessageId?: string;
      error?: string;
    }) => void
  ) => void;

  // Typing indicators
  "typing:start": (payload: { conversationId: string }) => void;
  "typing:stop": (payload: { conversationId: string }) => void;

  // Mark conversation read
  "message:read": (
    payload: { conversationId: string },
    callback?: (response: { success: boolean; markedCount?: number; error?: string }) => void
  ) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  user: {
    id: string;
    role: string;
    name?: string | null;
  };
}

