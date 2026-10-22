import { POPULAR_CATEGORIES } from "@/data";

interface JobFiltersProps {
  selectedCategory: string;
  selectedType: string;
  selectedExperience: string;
  selectedSort: string;
  onCategoryChange: (category: string) => void;
  onTypeChange: (type: string) => void;
  onExperienceChange: (exp: string) => void;
  onSortChange: (sort: string) => void;
  onReset: () => void;
}

export function JobFilters({
  selectedCategory,
  selectedType,
  selectedExperience,
  selectedSort,
  onCategoryChange,
  onTypeChange,
  onExperienceChange,
  onSortChange,
  onReset,
}: JobFiltersProps) {
  const hasActiveFilters =
    (selectedCategory && selectedCategory !== "all") ||
    selectedType ||
    selectedExperience ||
    selectedSort !== "newest";

  return (
    <aside className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/90 space-y-6">
      <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
        <h3 className="font-bold text-sm tracking-tight text-zinc-900 dark:text-white">
          Filter Jobs
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
          {POPULAR_CATEGORIES.map((cat) => (
            <option key={cat.id} value={cat.name}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Payment Type */}
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
    </aside>
  );
}
