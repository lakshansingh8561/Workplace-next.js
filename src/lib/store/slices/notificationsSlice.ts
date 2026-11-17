import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ReduxNotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationsState {
  items: ReduxNotificationItem[];
  unreadCount: number;
  lastFetchedAt: number | null;
  status: "idle" | "loading" | "succeeded" | "failed";
}

const initialState: NotificationsState = {
  items: [],
  unreadCount: 0,
  lastFetchedAt: null,
  status: "idle",
};

export const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    setNotifications: (
      state,
      action: PayloadAction<{
        items: ReduxNotificationItem[];
        unreadCount: number;
      }>
    ) => {
      state.items = action.payload.items;
      state.unreadCount = action.payload.unreadCount;
      state.lastFetchedAt = Date.now();
      state.status = "succeeded";
    },
    markAsRead: (state, action: PayloadAction<string>) => {
      const target = state.items.find((item) => item.id === action.payload);
      if (target && !target.read) {
        target.read = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },
    markAllAsRead: (state) => {
      state.items.forEach((item) => {
        item.read = true;
      });
      state.unreadCount = 0;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.status = action.payload ? "loading" : "idle";
    },
  },
});

export const {
  setNotifications,
  markAsRead,
  markAllAsRead,
  setLoading,
} = notificationsSlice.actions;

export default notificationsSlice.reducer;

