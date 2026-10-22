"use client";

import { useState, useMemo } from "react";
import { POPULAR_CATEGORIES } from "@/data";
import { CategoryCard } from "./CategoryCard";

export function CategorySection() {
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [filterQuery, setFilterQuery] = useState<string>("");

  const FILTER_TABS = [
    { id: "all", label: "All Categories" },
    { id: "tech", label: "Tech & AI" },
    { id: "creative", label: "Creative & Design" },
    { id: "business", label: "Business & Growth" },
  ];

  const filteredCategories = useMemo(() => {
    return POPULAR_CATEGORIES.filter((category) => {
      // 1. Tab filter
      if (selectedFilter === "tech") {
        if (!["dev-it", "ai-services", "engineering-arch"].includes(category.id)) return false;
      } else if (selectedFilter === "creative") {
        if (!["design", "writing"].includes(category.id)) return false;
      } else if (selectedFilter === "business") {
        if (!["sales-mkt", "admin-support", "finance-accounting"].includes(category.id)) return false;
      }

      // 2. Query filter
      if (filterQuery.trim()) {
        const q = filterQuery.toLowerCase();
        const matchesName = category.name.toLowerCase().includes(q);
        const matchesDesc = category.description?.toLowerCase().includes(q);
        const matchesSkills = category.skills?.some((s) => s.toLowerCase().includes(q));
        return matchesName || matchesDesc || matchesSkills;
      }

      return true;
    });
  }, [selectedFilter, filterQuery]);

  return (
    <section id="categories" className="w-full py-20 bg-zinc-50/50 dark:bg-zinc-950/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Heading & Filter Tabs */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Talent Directory
            </h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-white">
              Browse top talent by category
            </p>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Explore specialized skill sets verified for high-impact contracts.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTER_TABS.map((tab) => {
              const active = selectedFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedFilter(tab.id)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                    active
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Category Card Grid */}
        {filteredCategories.length > 0 ? (
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filteredCategories.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              No categories found for &quot;{filterQuery}&quot;
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Try adjusting your filter tabs or search terms.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedFilter("all");
                setFilterQuery("");
              }}
              className="mt-4 inline-flex items-center text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
            >
              Reset category filters
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
