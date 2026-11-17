import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface AuthUserState {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: "CLIENT" | "FREELANCER";
  roleSelected: boolean;
  emailVerified?: string | null;
}

export interface AuthState {
  user: AuthUserState | null;
  isAuthenticated: boolean;
  status: "idle" | "loading" | "authenticated" | "unauthenticated";
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  status: "idle",
};

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials: (
      state,
      action: PayloadAction<AuthUserState | null>
    ) => {
      state.user = action.payload;
      state.isAuthenticated = Boolean(action.payload);
      state.status = action.payload ? "authenticated" : "unauthenticated";
    },
    updateUserProfile: (
      state,
      action: PayloadAction<Partial<AuthUserState>>
    ) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    },
    clearCredentials: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.status = "unauthenticated";
    },
  },
});

export const { setCredentials, updateUserProfile, clearCredentials } =
  authSlice.actions;

export default authSlice.reducer;

