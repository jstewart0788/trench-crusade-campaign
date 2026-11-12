import { loadRulesData } from "@tc/rules";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { applyTheme } from "./apply.js";
import { SIGIL_IDS } from "./Backdrop.js";
import { contrast, over } from "./contrast.js";
import { NEUTRAL } from "./neutral.js";
import { ACCENTS, contrastPairs, THEMES, themeFor, type Tokens } from "./themes.js";

const css = (file: string) => readFileSync(resolve(import.meta.dirname, "../styles", file), "utf8");
const THEME_ONLY = ["--frame", "--frame-hi", "--frame-lo", "--accent", "--bg-glow"];
const SUBFACTION_OF: Record<string, string> = { "heretic-naval-raiders": "heretic-legion", "procession-of-the-sacred-affliction": "trench-pilgrims" };

describe("contrast()", () => {
  it("matches the WCAG reference points", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#15130f", "#15130f")).toBe(1);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(over("rgba(255, 255, 255, 0.5)", "#000000")).toBe("#808080");
  });
});

describe("faction themes", () => {
  it("cover every faction in the rules data, each with a sigil", () => {
    const factions = loadRulesData(resolve(import.meta.dirname, "../../../..")).factions.map((f) => f.id);
    expect(Object.keys(THEMES).sort()).toEqual([...factions].sort());
    expect(SIGIL_IDS.sort()).toEqual([...factions].sort());
  });

  it("set every token the neutral palette sets, plus the frame, accent and glow, as colours", () => {
    for (const theme of Object.values(THEMES)) {
      expect(Object.keys(theme.tokens).sort(), theme.id).toEqual([...Object.keys(NEUTRAL), ...THEME_ONLY].sort());
      for (const [name, value] of Object.entries(theme.tokens)) expect(() => contrast(value.startsWith("rgba") ? over(value, "#000000") : value, "#000000"), `${theme.id} ${name}`).not.toThrow();
    }
  });

  it("each have a backdrop and a panel frame in styles/themes.css, with nothing animated", () => {
    const sheet = css("themes.css");
    for (const id of Object.keys(THEMES)) {
      expect(sheet, id).toContain(`:root[data-faction="${id}"] .faction-backdrop {`);
      expect(sheet, id).toContain(`:root[data-faction="${id}"] .panel {`);
    }
    expect(sheet).not.toMatch(/animation|transition|@keyframes/);
    // Inline SVG only: no image files, nothing fetched (url(%23n) is an SVG's own filter reference).
    expect(sheet).not.toMatch(/url\((?!"data:image\/svg\+xml,|%23)/);
    for (const [uri] of sheet.matchAll(/url\("data:[^"]+"\)/g)) expect(uri.length).toBeLessThan(2_000);
    expect(sheet.length).toBeLessThan(30_000);
  });

  it("draw text in the AA reds: --blood is for borders, --blood-ink for words", () => {
    const sheets = readdirSync(resolve(import.meta.dirname, ".."), { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".css"));
    expect(sheets.length).toBeGreaterThan(10);
    const offenders = sheets.filter((f) => /(^|[^-])color:\s*var\(--blood\)/.test(readFileSync(resolve(import.meta.dirname, "..", f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("keep the neutral palette in step with styles/global.css", () => {
    const root = /:root \{([\s\S]*?)\n\}/.exec(css("global.css"))![1]!;
    const declared = Object.fromEntries([...root.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].filter(([, k]) => !k!.startsWith("--space") && !k!.startsWith("--font")).map(([, k, v]) => [k, v!.trim()]));
    expect(declared).toEqual(NEUTRAL);
  });

  const scored = (tokens: Tokens | typeof NEUTRAL) => contrastPairs(tokens).map((p) => ({ ...p, ratio: Math.round(contrast(p.fg, p.bg) * 100) / 100 }));
  const failing = (tokens: Tokens | typeof NEUTRAL) => scored(tokens).filter((p) => p.ratio < p.min).map((p) => `${p.label} ${p.ratio}`);

  it("keep every text colour at WCAG AA (4.5:1) on every surface it is drawn on, and frames and accents at 3:1", () => {
    expect(failing(NEUTRAL)).toEqual([]);
    for (const theme of Object.values(THEMES)) {
      expect(scored(theme.tokens).length, theme.id).toBeGreaterThan(40);
      expect(failing(theme.tokens), theme.id).toEqual([]);
    }
    for (const [sub, faction] of Object.entries(SUBFACTION_OF)) expect(failing(themeFor({ factionId: faction, subfactionId: sub })!.tokens), sub).toEqual([]);
  });

  it("let a subfaction or variant inherit its faction's theme and change only the accent", () => {
    expect(Object.keys(ACCENTS).sort()).toEqual(Object.keys(SUBFACTION_OF).sort());
    const raiders = themeFor({ factionId: "heretic-legion", subfactionId: "heretic-naval-raiders" })!;
    const legion = THEMES["heretic-legion"]!;
    expect(raiders.id).toBe("heretic-legion");
    expect(raiders.tokens["--accent"]).toBe(ACCENTS["heretic-naval-raiders"]!["--accent"]);
    expect({ ...raiders.tokens, "--accent": legion.tokens["--accent"] }).toEqual(legion.tokens);
    expect(themeFor({ factionId: "new-antioch", variantId: "no-such-variant" })).toEqual(THEMES["new-antioch"]);
    expect(themeFor({ factionId: "no-such-faction" })).toBeUndefined();
  });

  it("go onto the root and come off it again", () => {
    const style = new Map<string, string>();
    const root = { dataset: {} as Record<string, string | undefined>, style: { setProperty: (k: string, v: string) => void style.set(k, v), removeProperty: (k: string) => void style.delete(k) } };
    const off = applyTheme(root, THEMES["trench-pilgrims"]);
    expect(root.dataset.faction).toBe("trench-pilgrims");
    expect(Object.fromEntries(style)).toEqual(THEMES["trench-pilgrims"]!.tokens);
    off();
    expect(root.dataset.faction).toBeUndefined();
    expect(style.size).toBe(0);
    expect(applyTheme(root, undefined)).toBeInstanceOf(Function);
    expect(root.dataset.faction).toBeUndefined();
  });
});
