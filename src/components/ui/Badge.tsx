import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "success" | "outline";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  const variantStyles = {
    default: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    success: "bg-emerald-600 text-white border-transparent",
    outline: "bg-transparent text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide transition-colors",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
