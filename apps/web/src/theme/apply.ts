import type { FactionTheme } from "./themes.js";

/** The bits of <html> a theme touches; a fake stands in for it in tests. */
export interface ThemeRoot {
  dataset: Record<string, string | undefined>;
  style: { setProperty: (name: string, value: string) => void; removeProperty: (name: string) => void };
}

/** Puts the theme on the root (data-faction and its tokens) and returns how to take it off again. */
export function applyTheme(root: ThemeRoot, theme: FactionTheme | undefined): () => void {
  if (!theme) return () => {};
  root.dataset.faction = theme.id;
  for (const [name, value] of Object.entries(theme.tokens)) root.style.setProperty(name, value);
  return () => {
    delete root.dataset.faction;
    for (const name of Object.keys(theme.tokens)) root.style.removeProperty(name);
  };
}
