import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface MessagingState {
  activeConversationId: string | null;
  unreadConversationCount: number;
  draftMessages: Record<string, string>;
  isChatSidebarOpen: boolean;
  onlineUsers: Record<string, boolean>;
  typingUsers: Record<string, Record<string, { isTyping: boolean; name?: string }>>;
  connectionStatus: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RECONNECTING";
}

const initialState: MessagingState = {
  activeConversationId: null,
  unreadConversationCount: 0,
  draftMessages: {},
  isChatSidebarOpen: false,
  onlineUsers: {},
  typingUsers: {},
  connectionStatus: "DISCONNECTED",
};

export const messagingSlice = createSlice({
  name: "messaging",
  initialState,
  reducers: {
    setActiveConversationId: (state, action: PayloadAction<string | null>) => {
      state.activeConversationId = action.payload;
    },
    setUnreadConversationCount: (state, action: PayloadAction<number>) => {
      state.unreadConversationCount = Math.max(0, action.payload);
    },
    saveDraftMessage: (
      state,
      action: PayloadAction<{ conversationId: string; text: string }>
    ) => {
      state.draftMessages[action.payload.conversationId] = action.payload.text;
    },
    clearDraftMessage: (state, action: PayloadAction<string>) => {
      delete state.draftMessages[action.payload];
    },
    setChatSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.isChatSidebarOpen = action.payload;
    },
    setConnectionStatus: (
      state,
      action: PayloadAction<"DISCONNECTED" | "CONNECTING" | "CONNECTED" | "RECONNECTING">
    ) => {
      state.connectionStatus = action.payload;
    },
    setOnlineUsers: (state, action: PayloadAction<string[]>) => {
      const map: Record<string, boolean> = {};
      action.payload.forEach((id) => {
        map[id] = true;
      });
      state.onlineUsers = map;
    },
    setUserOnline: (state, action: PayloadAction<string>) => {
      state.onlineUsers[action.payload] = true;
    },
    setUserOffline: (state, action: PayloadAction<string>) => {
      delete state.onlineUsers[action.payload];
    },
    setUserTyping: (
      state,
      action: PayloadAction<{
        conversationId: string;
        userId: string;
        isTyping: boolean;
        name?: string | null;
      }>
    ) => {
      const { conversationId, userId, isTyping, name } = action.payload;
      if (!state.typingUsers[conversationId]) {
        state.typingUsers[conversationId] = {};
      }
      if (isTyping) {
        state.typingUsers[conversationId][userId] = {
          isTyping: true,
          name: name || undefined,
        };
      } else {
        delete state.typingUsers[conversationId][userId];
      }
    },
    clearTypingForConversation: (state, action: PayloadAction<string>) => {
      delete state.typingUsers[action.payload];
    },
  },
});

export const {
  setActiveConversationId,
  setUnreadConversationCount,
  saveDraftMessage,
  clearDraftMessage,
  setChatSidebarOpen,
  setConnectionStatus,
  setOnlineUsers,
  setUserOnline,
  setUserOffline,
  setUserTyping,
  clearTypingForConversation,
} = messagingSlice.actions;

export default messagingSlice.reducer;
