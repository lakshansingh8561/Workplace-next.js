"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { Category } from "@/types";
import { matchesCategoryGroup } from "@/lib/jobs";
import { CategoryCard } from "./CategoryCard";

interface CategorySectionProps {
  initialCategories?: Category[];
}

export function CategorySection({ initialCategories }: CategorySectionProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories || []);
  const [isLoading, setIsLoading] = useState(!initialCategories);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [filterQuery, setFilterQuery] = useState<string>("");

  const FILTER_TABS = [
    { id: "all", label: "All Categories" },
    { id: "tech", label: "Tech & AI" },
    { id: "creative", label: "Creative & Design" },
    { id: "business", label: "Business & Growth" },
  ];

  // Client-side fallback fetch only if initialCategories was not provided
  useEffect(() => {
    if (initialCategories) {
      setCategories(initialCategories);
      setIsLoading(false);
      return;
    }

    let ignore = false;
    async function load() {
      try {
        setIsLoading(true);
        const res = await fetch("/api/jobs/filters");
        if (!res.ok) throw new Error("Failed to load category filters");
        const json = await res.json();
        if (!ignore && json.facets?.categories) {
          const { CATEGORY_METADATA } = await import("@/lib/jobs");
          const derived: Category[] = (
            json.facets.categories as Array<{
              category: string;
              count: number;
              skills?: string[];
            }>
          )
            .filter((c) => c.count > 0 && c.category)
            .map((c) => {
              const normalized = c.category.toLowerCase().trim();
              const meta = CATEGORY_METADATA[normalized] || {
                icon: "layers",
                description: `Explore specialized skills and contracts in ${c.category}.`,
              };
              const slug = c.category
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, "");
              return {
                id: slug,
                name: c.category,
                slug,
                icon: meta.icon,
                jobCount: c.count,
                description: meta.description,
                skills: c.skills || [],
              };
            });
          setCategories(derived);
        }
      } catch (err) {
        console.error("[CategorySection Error]:", err);
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }

    load();
    return () => {
      ignore = true;
    };
  }, [initialCategories]);

  const filteredCategories = useMemo(() => {
    return categories.filter((category) => {
      // 1. Group Tab filter (using centralized mapping)
      if (!matchesCategoryGroup(category.name, selectedFilter)) {
        return false;
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
  }, [categories, selectedFilter, filterQuery]);

  return (
    <section id="categories" className="w-full py-20 bg-zinc-50/50 dark:bg-zinc-950/40">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8">
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

        {/* Dynamic Category Card Grid / Loading / Empty States */}
        {isLoading ? (
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 animate-pulse h-48"
              />
            ))}
          </div>
        ) : filteredCategories.length > 0 ? (
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {filteredCategories.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              No active job categories found
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Check back soon or post a new job to open a category.
            </p>
            <Link
              href="/jobs/new"
              className="mt-4 inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition"
            >
              Post a Job →
            </Link>
          </div>
        ) : (
          <div className="mt-12 rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              No categories found for &quot;{filterQuery || selectedFilter}&quot;
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
