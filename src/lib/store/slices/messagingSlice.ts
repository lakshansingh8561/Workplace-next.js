import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface MessagingState {
  activeConversationId: string | null;
  unreadConversationCount: number;
  draftMessages: Record<string, string>;
  isChatSidebarOpen: boolean;
}

const initialState: MessagingState = {
  activeConversationId: null,
  unreadConversationCount: 0,
  draftMessages: {},
  isChatSidebarOpen: false,
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
  },
});

export const {
  setActiveConversationId,
  setUnreadConversationCount,
  saveDraftMessage,
  clearDraftMessage,
  setChatSidebarOpen,
} = messagingSlice.actions;

export default messagingSlice.reducer;

