"use client";

import { useState } from "react";

interface InteractiveStarRatingProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  name?: string;
}

export function InteractiveStarRating({
  value,
  onChange,
  disabled = false,
}: InteractiveStarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const activeValue = hoverValue !== null ? hoverValue : value;

  return (
    <div
      className="flex items-center gap-1.5"
      role="radiogroup"
      aria-label="Star Rating"
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const isFilled = star <= activeValue;
        return (
          <button
            key={star}
            type="button"
            disabled={disabled}
            onClick={() => onChange(star)}
            onMouseEnter={() => !disabled && setHoverValue(star)}
            onMouseLeave={() => !disabled && setHoverValue(null)}
            onFocus={() => !disabled && setHoverValue(star)}
            onBlur={() => !disabled && setHoverValue(null)}
            className={`p-1 text-2xl transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-lg ${
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            }`}
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
          >
            <span
              className={
                isFilled
                  ? "text-amber-400 drop-shadow-sm"
                  : "text-zinc-300 dark:text-zinc-700"
              }
            >
              ★
            </span>
          </button>
        );
      })}
      <span className="ml-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
        {activeValue > 0
          ? `${activeValue} of 5 Stars`
          : "Select a rating (1-5)"}
      </span>
    </div>
  );
}

interface StaticStarRatingProps {
  rating: number | null;
  count?: number;
  showCount?: boolean;
  size?: "sm" | "md" | "lg";
}

export function StaticStarRating({
  rating,
  count,
  showCount = true,
  size = "md",
}: StaticStarRatingProps) {
  if (rating === null || rating === undefined || (count !== undefined && count === 0)) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-400 italic">
        ★ No reviews yet
      </span>
    );
  }

  const rounded = Math.round(rating * 10) / 10;
  const fullStars = Math.floor(rounded);
  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  }[size];

  return (
    <div className={`inline-flex items-center gap-1.5 font-bold ${sizeClasses}`}>
      <div className="flex items-center text-amber-400">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={
              star <= fullStars
                ? "text-amber-400"
                : "text-zinc-300 dark:text-zinc-700"
            }
          >
            ★
          </span>
        ))}
      </div>
      <span className="text-zinc-900 dark:text-white font-extrabold">
        {rounded.toFixed(1)}
      </span>
      {showCount && typeof count === "number" && (
        <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
          ({count} {count === 1 ? "review" : "reviews"})
        </span>
      )}
    </div>
  );
}
