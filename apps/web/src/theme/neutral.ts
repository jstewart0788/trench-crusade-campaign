// The neutral palette: the values styles/global.css sets on :root (a test keeps the two in step).
// Home, New and Import use it, and every faction theme overrides these same names.

export const NEUTRAL = {
  "--bg": "#15130f",
  "--bg-raised": "#1d1a15",
  "--bg-sunken": "#0f0e0b",
  "--line": "#352f26",
  "--line-strong": "#4a4234",
  "--ink": "#d8d0c0",
  "--ink-muted": "#8f8676",
  "--brass": "#d9b352",
  "--brass-dim": "#8c7334",
  "--blood": "#c8463c",
  "--amber": "#d9a63a",
  "--moss": "#7fa352",
  "--oxblood": "#8c2f2b",
  "--oxblood-fill": "rgba(140, 47, 43, 0.24)",
  "--oxblood-ink": "#d29a92",
  "--glory": "#a9c6dc",
  "--blood-ink": "#e0675c",
  "--brass-soft": "#bfa35f",
  "--ink-quiet": "#a39a89",
  "--price-fill": "#2a2418",
  "--price-fill-dim": "#211e19",
} as const;

export type TokenName = keyof typeof NEUTRAL;
