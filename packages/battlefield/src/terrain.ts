import type { Palette, PalettePiece, TerrainRules } from "./palette.js";

const inches = (n: number): string => `${n}"`;

/** How a piece plays where it stands: a ground tile on top of another is a hill. */
export const terrainOf = (piece: PalettePiece, baseIn: number): TerrainRules => (baseIn > 0 && piece.stackedTerrain ? piece.stackedTerrain : piece.terrain);

/** The name a player reads on hover: what it is, its height, then how it plays, e.g. `Wall · 3" · Cover · Climb`. */
export function terrainName(t: TerrainRules): string {
  const parts = [t.label];
  const height = t.playedAsIn ?? t.heightIn;
  const impassable = t.types.includes("impassable");
  // Heights where they decide play: what is climbed, stood on or crossed into; area terrain and scatter go without.
  if (height !== null && !impassable && t.kind !== "scattered" && t.kind !== "area") parts.push(t.kind === "trench" && t.label === "Trench" ? `${inches(height)} deep` : inches(height));
  if (t.fireStepIn) parts.push("Fire step");
  if (t.kind === "hill" && height !== null && height >= 3) parts.push("Elevated");
  if (t.types.includes("difficult")) parts.push("Difficult");
  if (t.types.includes("dangerous")) parts.push(t.keywords?.length ? `Dangerous (${t.keywords.join(", ")})` : "Dangerous");
  if (impassable) parts.push("Impassable");
  if (t.cover) parts.push("Cover");
  if (t.climb) parts.push("Climb");
  if (t.kind === "scattered") parts.push("Scatter");
  if (parts.length === 1) parts.push("Open");
  return parts.join(" · ");
}

/** One line of the rules a piece carries, the book's wording cut short, ending with its pages. */
export function terrainReminder(t: TerrainRules, palette: Palette): string {
  const rules = palette.terrainRules;
  const said: string[] = [];
  const pages = new Set<number>();
  const say = (key: keyof Palette["terrainRules"], fill: Record<string, string> = {}) => {
    const rule = rules[key];
    if (!rule) return;
    said.push(Object.entries(fill).reduce((text, [k, v]) => text.replace(`{${k}}`, v), rule.text));
    for (const page of rule.pages) pages.add(page);
  };
  // A trench side of 3in or more is Climbed or Jumped Down (p.62), which says what the climbing reminder would.
  const deepTrench = t.kind === "trench" && (t.playedAsIn ?? t.heightIn ?? 0) >= 3;
  if (t.kind === "trench") say(deepTrench ? "trenchDeep" : "trench");
  if (t.fireStepIn) say("fireStep", { fireStep: String(t.fireStepIn) });
  if (t.kind === "hill") say("hill");
  if (t.kind === "ramp") say("ramp");
  if (t.kind === "landmark") say("landmark");
  if (t.kind === "ruined-building" || t.kind === "corner-ruin") say(t.kind);
  if (t.kind === "scattered") say("scattered");
  if (t.types.includes("difficult")) say("difficult");
  if (t.types.includes("dangerous")) say("dangerous");
  if (t.keywords?.length) say("keywords", { keywords: t.keywords.join(", ") });
  if (t.types.includes("impassable")) say("impassable");
  if (t.cover) say("cover");
  if (t.climb && !deepTrench) say("climb");
  if (!said.length) say("open");
  for (const page of t.pages) pages.add(page);
  return `${said.join("; ")}; p.${[...pages].sort((a, b) => a - b).join(", ")}`;
}
