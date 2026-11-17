import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { JobFilterFacets } from "@/types";

export interface JobsFilterState {
  searchQuery: string;
  category: string;
  paymentType: string;
  experienceLevel: string;
  skill: string;
  minBudget: number | null;
  maxBudget: number | null;
  sortBy: string;
  page: number;
  facets: JobFilterFacets | null;
  savedJobIds: string[];
}

const initialState: JobsFilterState = {
  searchQuery: "",
  category: "all",
  paymentType: "",
  experienceLevel: "",
  skill: "",
  minBudget: null,
  maxBudget: null,
  sortBy: "newest",
  page: 1,
  facets: null,
  savedJobIds: [],
};

export const jobsSlice = createSlice({
  name: "jobs",
  initialState,
  reducers: {
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
      state.page = 1;
    },
    setCategory: (state, action: PayloadAction<string>) => {
      state.category = action.payload;
      state.page = 1;
    },
    setPaymentType: (state, action: PayloadAction<string>) => {
      state.paymentType = action.payload;
      state.page = 1;
    },
    setExperienceLevel: (state, action: PayloadAction<string>) => {
      state.experienceLevel = action.payload;
      state.page = 1;
    },
    setSkill: (state, action: PayloadAction<string>) => {
      state.skill = action.payload;
      state.page = 1;
    },
    setBudgetRange: (
      state,
      action: PayloadAction<{ min: number | null; max: number | null }>
    ) => {
      state.minBudget = action.payload.min;
      state.maxBudget = action.payload.max;
      state.page = 1;
    },
    setSortBy: (state, action: PayloadAction<string>) => {
      state.sortBy = action.payload;
      state.page = 1;
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.page = Math.max(1, action.payload);
    },
    setFacets: (state, action: PayloadAction<JobFilterFacets | null>) => {
      state.facets = action.payload;
    },
    setSavedJobIds: (state, action: PayloadAction<string[]>) => {
      state.savedJobIds = action.payload;
    },
    toggleSavedJobId: (
      state,
      action: PayloadAction<{ jobId: string; isSaved: boolean }>
    ) => {
      const { jobId, isSaved } = action.payload;
      if (isSaved) {
        if (!state.savedJobIds.includes(jobId)) {
          state.savedJobIds.push(jobId);
        }
      } else {
        state.savedJobIds = state.savedJobIds.filter((id) => id !== jobId);
      }
    },
    resetFilters: (state) => {
      state.searchQuery = "";
      state.category = "all";
      state.paymentType = "";
      state.experienceLevel = "";
      state.skill = "";
      state.minBudget = null;
      state.maxBudget = null;
      state.sortBy = "newest";
      state.page = 1;
    },
  },
});

export const {
  setSearchQuery,
  setCategory,
  setPaymentType,
  setExperienceLevel,
  setSkill,
  setBudgetRange,
  setSortBy,
  setPage,
  setFacets,
  setSavedJobIds,
  toggleSavedJobId,
  resetFilters,
} = jobsSlice.actions;

export default jobsSlice.reducer;

