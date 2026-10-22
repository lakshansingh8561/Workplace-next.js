"use client";

import { useState, useId, FormEvent } from "react";
import { POPULAR_CATEGORIES } from "@/data";

interface MarketplaceSearchProps {
  onSearch?: (query: string) => void;
}

export function MarketplaceSearch({ onSearch }: MarketplaceSearchProps) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const inputId = useId();

  const SUGGESTION_TAGS = [
    "Next.js",
    "Figma",
    "AI Prompting",
    "SEO",
    "Python",
    "Technical Writing",
  ];

  const handleSearch = (searchTerm: string) => {
    const trimmed = searchTerm.trim().toLowerCase();
    setQuery(searchTerm);

    if (onSearch) {
      onSearch(trimmed);
    }

    if (!trimmed) {
      setSearchFeedback(null);
      return;
    }

    // Local client-side evaluation across categories & skills
    const matchingCategories = POPULAR_CATEGORIES.filter((cat) => {
      const nameMatch = cat.name.toLowerCase().includes(trimmed);
      const descMatch = cat.description?.toLowerCase().includes(trimmed);
      const skillMatch = cat.skills?.some((s) => s.toLowerCase().includes(trimmed));
      return nameMatch || descMatch || skillMatch;
    });

    if (matchingCategories.length > 0) {
      setSearchFeedback(
        `Found ${matchingCategories.length} category ${
          matchingCategories.length === 1 ? "group" : "groups"
        } matching "${searchTerm}"`
      );
    } else {
      setSearchFeedback(`No direct category matches for "${searchTerm}". Try a skill like "React" or "Figma".`);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSearch(query);

    // Scroll to categories view smoothly to see results
    const categoriesSection = document.getElementById("categories");
    if (categoriesSection) {
      categoriesSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleTagClick = (tag: string) => {
    if (activeTag === tag) {
      setActiveTag(null);
      handleSearch("");
    } else {
      setActiveTag(tag);
      handleSearch(tag);
    }
  };

  const handleClear = () => {
    setQuery("");
    setActiveTag(null);
    setSearchFeedback(null);
    if (onSearch) onSearch("");
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Search Bar Form */}
      <form
        role="search"
        onSubmit={handleSubmit}
        className="relative flex flex-col sm:flex-row items-center gap-2 rounded-2xl border border-zinc-200/90 bg-white p-2 shadow-xl shadow-zinc-200/40 transition-all focus-within:border-emerald-500 focus-within:ring-4 focus-within:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/90 dark:shadow-none"
      >
        <div className="flex flex-1 items-center gap-3 px-3 w-full">
          {/* Magnifying Glass Icon */}
          <svg
            className="h-5 w-5 text-zinc-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>

          <label htmlFor={inputId} className="sr-only">
            Search talent, skills, or marketplace categories
          </label>
          <input
            id={inputId}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by skill, role, or category (e.g. Next.js, Figma, SEO)..."
            className="w-full bg-transparent py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-white dark:placeholder-zinc-500"
          />

          {/* Clear button if text entered */}
          {query && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear search input"
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
        </div>

        <button
          type="submit"
          className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-emerald-600 px-7 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          Search Talent
        </button>
      </form>

      {/* Local Interactive Search Feedback */}
      {searchFeedback && (
        <div className="mt-3 flex items-center justify-between text-xs px-2 text-zinc-600 dark:text-zinc-400">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
            {searchFeedback}
          </span>
          <button
            type="button"
            onClick={handleClear}
            className="text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Reset
          </button>
        </div>
      )}

      {/* Popular Suggestion Pills */}
      <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs">
        <span className="text-zinc-500 dark:text-zinc-400 font-medium mr-1">
          Popular:
        </span>
        {SUGGESTION_TAGS.map((tag) => {
          const isSelected = activeTag === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => handleTagClick(tag)}
              className={`rounded-full px-3 py-1 font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                isSelected
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
