import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface UiState {
  activeModal: string | null;
  modalPayload: Record<string, unknown> | null;
  isMobileNavOpen: boolean;
  isMobileFiltersOpen: boolean;
}

const initialState: UiState = {
  activeModal: null,
  modalPayload: null,
  isMobileNavOpen: false,
  isMobileFiltersOpen: false,
};

export const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    openModal: (
      state,
      action: PayloadAction<{ modalId: string; payload?: Record<string, unknown> }>
    ) => {
      state.activeModal = action.payload.modalId;
      state.modalPayload = action.payload.payload || null;
    },
    closeModal: (state) => {
      state.activeModal = null;
      state.modalPayload = null;
    },
    setMobileNavOpen: (state, action: PayloadAction<boolean>) => {
      state.isMobileNavOpen = action.payload;
    },
    toggleMobileNav: (state) => {
      state.isMobileNavOpen = !state.isMobileNavOpen;
    },
    setMobileFiltersOpen: (state, action: PayloadAction<boolean>) => {
      state.isMobileFiltersOpen = action.payload;
    },
    toggleMobileFilters: (state) => {
      state.isMobileFiltersOpen = !state.isMobileFiltersOpen;
    },
  },
});

export const {
  openModal,
  closeModal,
  setMobileNavOpen,
  toggleMobileNav,
  setMobileFiltersOpen,
  toggleMobileFilters,
} = uiSlice.actions;

export default uiSlice.reducer;

