/**
 * Utility helper to conditionally join class names together.
 * Keeps styling utilities lightweight and modular.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Safely format a date deterministically for SSR and client hydration consistency.
 * Uses en-US and UTC by default to avoid server-client locale and timezone mismatches.
 */
export function formatDate(
  dateInput: string | Date | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return "";
  const d =
    typeof dateInput === "object" && dateInput instanceof Date
      ? dateInput
      : new Date(dateInput);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
    ...options,
  });
}
