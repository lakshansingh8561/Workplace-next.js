"use client";

import { useState } from "react";
import { POPULAR_CATEGORIES } from "@/data";
import { JobFilterFacets } from "@/types";

interface JobFiltersProps {
  selectedCategory: string;
  selectedType: string;
  selectedExperience: string;
  selectedSkill: string;
  selectedMinBudget?: number | string;
  selectedMaxBudget?: number | string;
  selectedSort: string;
  facets?: JobFilterFacets;
  onCategoryChange: (category: string) => void;
  onTypeChange: (type: string) => void;
  onExperienceChange: (exp: string) => void;
  onSkillChange: (skill: string) => void;
  onBudgetChange: (min?: number, max?: number) => void;
  onSortChange: (sort: string) => void;
  onReset: () => void;
}

export function JobFilters({
  selectedCategory,
  selectedType,
  selectedExperience,
  selectedSkill,
  selectedMinBudget,
  selectedMaxBudget,
  selectedSort,
  facets,
  onCategoryChange,
  onTypeChange,
  onExperienceChange,
  onSkillChange,
  onBudgetChange,
  onSortChange,
  onReset,
}: JobFiltersProps) {
  // Local state for custom budget inputs (using React 19 state synchronization during render)
  const [prevMin, setPrevMin] = useState(selectedMinBudget);
  const [prevMax, setPrevMax] = useState(selectedMaxBudget);
  const [minInput, setMinInput] = useState(
    selectedMinBudget != null && selectedMinBudget !== ""
      ? String(selectedMinBudget)
      : ""
  );
  const [maxInput, setMaxInput] = useState(
    selectedMaxBudget != null && selectedMaxBudget !== ""
      ? String(selectedMaxBudget)
      : ""
  );

  if (prevMin !== selectedMinBudget) {
    setPrevMin(selectedMinBudget);
    setMinInput(
      selectedMinBudget != null && selectedMinBudget !== ""
        ? String(selectedMinBudget)
        : ""
    );
  }

  if (prevMax !== selectedMaxBudget) {
    setPrevMax(selectedMaxBudget);
    setMaxInput(
      selectedMaxBudget != null && selectedMaxBudget !== ""
        ? String(selectedMaxBudget)
        : ""
    );
  }

  const hasActiveFilters =
    (selectedCategory && selectedCategory !== "all") ||
    selectedType ||
    selectedExperience ||
    selectedSkill ||
    (selectedMinBudget != null && selectedMinBudget !== "") ||
    (selectedMaxBudget != null && selectedMaxBudget !== "") ||
    selectedSort !== "newest";

  const handleApplyCustomBudget = (e: React.FormEvent) => {
    e.preventDefault();
    const min = minInput ? Math.max(0, parseFloat(minInput)) : undefined;
    const max = maxInput ? Math.max(0, parseFloat(maxInput)) : undefined;
    onBudgetChange(min, max);
  };

  const handleBudgetPreset = (min?: number, max?: number) => {
    setMinInput(min != null ? String(min) : "");
    setMaxInput(max != null ? String(max) : "");
    onBudgetChange(min, max);
  };

  // Derive categories: merge real DB categories with defaults
  const categoriesList =
    facets?.categories && facets.categories.length > 0
      ? facets.categories
      : POPULAR_CATEGORIES.map((c) => ({ category: c.name, count: c.jobCount }));

  // Derive popular skills: from real data or fallback
  const skillsList =
    facets?.skills && facets.skills.length > 0
      ? facets.skills
      : [
          { skill: "React", count: 2 },
          { skill: "Next.js", count: 2 },
          { skill: "TypeScript", count: 2 },
          { skill: "Python", count: 1 },
          { skill: "Figma", count: 1 },
          { skill: "AWS", count: 1 },
        ];

  return (
    <aside className="rounded-2xl border border-zinc-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6 max-h-[calc(100vh-5rem)] overflow-y-auto overscroll-contain">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
          <span>Filters</span>
          {hasActiveFilters && (
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
          )}
        </h3>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Sort By Selector */}
      <div>
        <label
          htmlFor="sort-by"
          className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2"
        >
          Sort By
        </label>
        <select
          id="sort-by"
          value={selectedSort}
          onChange={(e) => onSortChange(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="budget_desc">Highest Budget / Rate</option>
          <option value="budget_asc">Lowest Budget / Rate</option>
          <option value="proposals_desc">Most Proposals (High Activity)</option>
          <option value="proposals_asc">Fewest Proposals (Low Competition)</option>
        </select>
      </div>

      {/* Category Filter */}
      <div>
        <label
          htmlFor="category-select"
          className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2"
        >
          Category
        </label>
        <select
          id="category-select"
          value={selectedCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          <option value="all">All Categories</option>
          {categoriesList.map((cat) => (
            <option key={cat.category} value={cat.category}>
              {cat.category} {cat.count != null ? `(${cat.count})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Contract Type */}
      <div>
        <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
          Contract Type
        </span>
        <div className="space-y-1.5 text-xs">
          {[
            { id: "", label: "All Contract Types" },
            { id: "HOURLY", label: "Hourly Rate" },
            { id: "FIXED", label: "Fixed-Price" },
          ].map((type) => (
            <label
              key={type.id}
              className="flex items-center gap-2.5 cursor-pointer text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
            >
              <input
                type="radio"
                name="contractType"
                checked={selectedType === type.id}
                onChange={() => onTypeChange(type.id)}
                className="h-3.5 w-3.5 text-emerald-600 focus:ring-emerald-500 dark:bg-zinc-800"
              />
              <span>{type.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Experience Level */}
      <div>
        <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
          Experience Level
        </span>
        <div className="space-y-1.5 text-xs">
          {[
            { id: "", label: "All Experience Levels" },
            { id: "ENTRY", label: "Entry Level" },
            { id: "INTERMEDIATE", label: "Intermediate" },
            { id: "EXPERT", label: "Expert" },
          ].map((exp) => (
            <label
              key={exp.id}
              className="flex items-center gap-2.5 cursor-pointer text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white"
            >
              <input
                type="radio"
                name="experienceLevel"
                checked={selectedExperience === exp.id}
                onChange={() => onExperienceChange(exp.id)}
                className="h-3.5 w-3.5 text-emerald-600 focus:ring-emerald-500 dark:bg-zinc-800"
              />
              <span>{exp.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Budget / Rate Range Filter */}
      <div>
        <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
          Budget / Rate Range
        </span>

        {/* Quick Presets */}
        <div className="grid grid-cols-2 gap-1.5 mb-3 text-[11px]">
          <button
            type="button"
            onClick={() => handleBudgetPreset(undefined, 1000)}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300 text-left truncate"
          >
            Under $1,000
          </button>
          <button
            type="button"
            onClick={() => handleBudgetPreset(1000, 5000)}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300 text-left truncate"
          >
            $1k – $5k
          </button>
          <button
            type="button"
            onClick={() => handleBudgetPreset(5000, 10000)}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300 text-left truncate"
          >
            $5k – $10k
          </button>
          <button
            type="button"
            onClick={() => handleBudgetPreset(10000, undefined)}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-zinc-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition dark:border-zinc-800 dark:bg-zinc-800/80 dark:text-zinc-300 text-left truncate"
          >
            $10k+
          </button>
        </div>

        {/* Custom Min / Max Inputs */}
        <form onSubmit={handleApplyCustomBudget} className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-2 text-xs text-zinc-400">$</span>
              <input
                type="number"
                min="0"
                placeholder="Min"
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-6 pr-2 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>
            <span className="text-zinc-400 text-xs">–</span>
            <div className="relative flex-1">
              <span className="absolute left-2.5 top-2 text-xs text-zinc-400">$</span>
              <input
                type="number"
                min="0"
                placeholder="Max"
                value={maxInput}
                onChange={(e) => setMaxInput(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-6 pr-2 py-1.5 text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300 py-1.5 text-xs font-semibold transition"
          >
            Apply Budget
          </button>
        </form>
      </div>

      {/* Skills Filter (Derived from real DB data) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Popular Skills
          </span>
          {selectedSkill && (
            <button
              type="button"
              onClick={() => onSkillChange("")}
              className="text-[11px] text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Clear skill
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
          {skillsList.slice(0, 15).map(({ skill, count }) => {
            const isSelected = selectedSkill.toLowerCase() === skill.toLowerCase();
            return (
              <button
                key={skill}
                type="button"
                onClick={() => onSkillChange(isSelected ? "" : skill)}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition font-medium ${
                  isSelected
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                }`}
              >
                <span>{skill}</span>
                {count > 0 && (
                  <span
                    className={`text-[10px] ${
                      isSelected ? "text-emerald-100" : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
