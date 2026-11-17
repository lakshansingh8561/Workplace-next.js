import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./slices/authSlice";
import notificationsReducer from "./slices/notificationsSlice";
import messagingReducer from "./slices/messagingSlice";
import jobsReducer from "./slices/jobsSlice";
import uiReducer from "./slices/uiSlice";

export const makeStore = () => {
  // Next.js 16 Partial Prerendering checks for unstable Math.random() calls during SSR.
  // We provide a deterministic seed strictly during configureStore() initialization on server.
  const isServer = typeof window === "undefined";
  const origRandom = Math.random;
  if (isServer) {
    let seed = 0.123456789;
    Math.random = () => ((seed * 9301 + 49297) % 233280) / 233280;
  }

  try {
    return configureStore({
      reducer: {
        auth: authReducer,
        notifications: notificationsReducer,
        messaging: messagingReducer,
        jobs: jobsReducer,
        ui: uiReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
        }),
      devTools: process.env.NODE_ENV !== "production",
    });
  } finally {
    if (isServer) {
      Math.random = origRandom;
    }
  }
};

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
