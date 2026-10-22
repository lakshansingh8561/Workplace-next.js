/**
 * Utility helper to conditionally join class names together.
 * Keeps styling utilities lightweight and modular.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
