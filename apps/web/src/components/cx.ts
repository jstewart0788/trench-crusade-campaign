/** Joins class names, skipping empty ones (CSS module lookups can be undefined in tests). */
export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
