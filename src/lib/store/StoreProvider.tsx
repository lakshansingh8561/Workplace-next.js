"use client";

import { useRef, useEffect } from "react";
import { Provider } from "react-redux";
import { makeStore, AppStore } from "./store";
import { setCredentials, AuthUserState } from "./slices/authSlice";

interface StoreProviderProps {
  children: React.ReactNode;
  initialUser?: AuthUserState | null;
}

export function StoreProvider({ children, initialUser }: StoreProviderProps) {
  const storeRef = useRef<AppStore | null>(null);

  if (!storeRef.current) {
    // Create the store instance the first time this renders
    storeRef.current = makeStore();
    if (initialUser) {
      storeRef.current.dispatch(setCredentials(initialUser));
    }
  }

  // Synchronize credentials if initialUser changes from server re-render
  useEffect(() => {
    if (storeRef.current && initialUser !== undefined) {
      storeRef.current.dispatch(setCredentials(initialUser));
    }
  }, [initialUser]);

  return <Provider store={storeRef.current}>{children}</Provider>;
}

