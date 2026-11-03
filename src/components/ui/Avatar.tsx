"use client";

import { useState } from "react";
import Image from "next/image";
import { getDeterministicAvatar, getInitials } from "@/lib/avatar-map";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  role?: "CLIENT" | "FREELANCER";
  userId?: string | null;
  size?: AvatarSize;
  className?: string;
  alt?: string;
}

const SIZE_CONFIG: Record<
  AvatarSize,
  {
    px: number;
    containerClass: string;
    textClass: string;
  }
> = {
  xs: {
    px: 24,
    containerClass: "h-6 w-6 rounded-lg",
    textClass: "text-[10px]",
  },
  sm: {
    px: 36,
    containerClass: "h-9 w-9 rounded-xl",
    textClass: "text-xs font-bold",
  },
  md: {
    px: 48,
    containerClass: "h-12 w-12 rounded-2xl",
    textClass: "text-sm font-extrabold",
  },
  lg: {
    px: 64,
    containerClass: "h-16 w-16 rounded-2xl",
    textClass: "text-lg font-extrabold",
  },
  xl: {
    px: 88,
    containerClass: "h-22 w-22 rounded-3xl",
    textClass: "text-2xl font-black",
  },
  "2xl": {
    px: 112,
    containerClass: "h-28 w-28 rounded-3xl",
    textClass: "text-3xl font-black",
  },
};

export function Avatar({
  src,
  name,
  role,
  userId,
  size = "md",
  className = "",
  alt,
}: AvatarProps) {
  const [hasError, setHasError] = useState(false);

  // Derive resolved source
  const resolvedSrc =
    src && src.trim().length > 0
      ? src.trim()
      : getDeterministicAvatar({ id: userId, name, role }, role);

  const initials = getInitials(name, role === "FREELANCER" ? "FL" : "CL");
  const accessibilityAlt =
    alt || (name ? `${name}'s profile avatar` : `${role || "User"} avatar`);
  const config = SIZE_CONFIG[size] || SIZE_CONFIG.md;

  // Background color palette depending on role for initials
  const initialsBgClass =
    role === "CLIENT"
      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-850"
      : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-850";

  if (hasError || !resolvedSrc) {
    return (
      <div
        className={`inline-flex shrink-0 items-center justify-center select-none overflow-hidden shadow-xs transition ${config.containerClass} ${config.textClass} ${initialsBgClass} ${className}`}
        aria-label={accessibilityAlt}
      >
        <span>{initials}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-zinc-100 dark:bg-zinc-800 shadow-xs ring-1 ring-zinc-900/5 dark:ring-white/10 ${config.containerClass} ${className}`}
    >
      <Image
        src={resolvedSrc}
        alt={accessibilityAlt}
        width={config.px}
        height={config.px}
        className="h-full w-full object-cover object-center"
        onError={() => setHasError(true)}
        unoptimized={resolvedSrc.startsWith("/images/")}
      />
    </div>
  );
}

