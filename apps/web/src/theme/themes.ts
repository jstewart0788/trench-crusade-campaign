import { over } from "./contrast.js";
import { NEUTRAL, type TokenName } from "./neutral.js";

// One theme per faction (subfactions and variants inherit it, with an optional
// accent). A theme is the neutral token set re-tuned, plus the tokens the frame
// and backdrop in styles/themes.css draw with. Everything here is original:
// colours, patterns and sigils are drawn from geometric primitives.

export type ThemeToken =
  | TokenName
  /** Panel border metal, its highlight and its shadow (soot, tarnish). */
  | "--frame"
  | "--frame-hi"
  | "--frame-lo"
  /** The theme's signature colour: tab marker, sigil, rules on the backdrop. */
  | "--accent"
  /** The lightest colour the page backdrop reaches; text on the bare page is checked against it. */
  | "--bg-glow";

export type Tokens = Record<ThemeToken, string>;

export interface FactionTheme {
  /** The faction id, and the value of data-faction. */
  id: string;
  tokens: Tokens;
}

// Semantic colours (removal red, warning amber, legal green, glory blue, built-in
// oxblood) keep their meaning everywhere and are only nudged for contrast.
const semantic = {
  "--blood": "#c8463c",
  "--blood-ink": "#e46e62",
  "--amber": "#dcaa3f",
  "--moss": "#8bb05e",
  "--oxblood": "#8c2f2b",
  "--oxblood-fill": "rgba(140, 47, 43, 0.24)",
  "--oxblood-ink": "#dba69e",
  "--glory": "#aecbe0",
} satisfies Partial<Tokens>;

export const THEMES: Record<string, FactionTheme> = {
  // Field grey and brass: an army's issue kit, stencilled.
  "new-antioch": {
    id: "new-antioch",
    tokens: {
      ...semantic,
      "--bg": "#131614",
      "--bg-raised": "#1b1f1c",
      "--bg-sunken": "#0d0f0e",
      "--line": "#2f3530",
      "--line-strong": "#465046",
      "--ink": "#dadfd3",
      "--ink-muted": "#979f93",
      "--ink-quiet": "#abb2a5",
      "--brass": "#d6b25a",
      "--brass-dim": "#87713a",
      "--brass-soft": "#c2a96c",
      "--price-fill": "#262820",
      "--price-fill-dim": "#1e211d",
      "--frame": "#5d6a5e",
      "--frame-hi": "#c2a050",
      "--frame-lo": "#070908",
      "--accent": "#d6b25a",
      "--bg-glow": "#1e2420",
    },
  },
  // Blackened, worn silver; rivets and chain.
  "heretic-legion": {
    id: "heretic-legion",
    tokens: {
      ...semantic,
      "--bg": "#111113",
      "--bg-raised": "#19191d",
      "--bg-sunken": "#0b0b0d",
      "--line": "#2f2f36",
      "--line-strong": "#46464f",
      "--ink": "#dedee4",
      "--ink-muted": "#9b9ba7",
      "--ink-quiet": "#b1b1bc",
      "--brass": "#d0b46e",
      "--brass-dim": "#7c6c45",
      "--brass-soft": "#bba979",
      "--price-fill": "#24221d",
      "--price-fill-dim": "#1d1c1b",
      "--frame": "#8d929e",
      "--frame-hi": "#d6dae2",
      "--frame-lo": "#040405",
      "--accent": "#c95a40",
      "--bg-glow": "#1c1b20",
    },
  },
  // Grimy, tarnished gold and soot over candle-lit parchment.
  "trench-pilgrims": {
    id: "trench-pilgrims",
    tokens: {
      ...semantic,
      "--bg": "#16120c",
      "--bg-raised": "#201a11",
      "--bg-sunken": "#0f0c07",
      "--line": "#3a2f1f",
      "--line-strong": "#54452b",
      "--ink": "#e6dabf",
      "--ink-muted": "#a89878",
      "--ink-quiet": "#bcab8c",
      "--brass": "#dcb14c",
      "--brass-dim": "#8a6d2e",
      "--brass-soft": "#c8a964",
      "--price-fill": "#2b2214",
      "--price-fill-dim": "#221c12",
      "--frame": "#8e7234",
      "--frame-hi": "#d8b55c",
      "--frame-lo": "#050302",
      "--accent": "#e0a93a",
      "--bg-glow": "#2a2013",
    },
  },
  // Verdigris bronze on lapis, under a star-and-tile lattice.
  "iron-sultanate": {
    id: "iron-sultanate",
    tokens: {
      ...semantic,
      "--bg": "#0e131d",
      "--bg-raised": "#151c29",
      "--bg-sunken": "#090d15",
      "--line": "#26324a",
      "--line-strong": "#3a4866",
      "--ink": "#e0e5ee",
      "--ink-muted": "#9aa5bb",
      "--ink-quiet": "#b0bacd",
      "--brass": "#d8ab5e",
      "--brass-dim": "#85683a",
      "--brass-soft": "#c6a56f",
      "--price-fill": "#232836",
      "--price-fill-dim": "#1b2130",
      "--frame": "#4e9a86",
      "--frame-hi": "#8ccdb8",
      "--frame-lo": "#04070c",
      "--accent": "#57a891",
      "--bg-glow": "#16213a",
    },
  },
  // Sickly green-black, mottled with rot and specked with flies.
  "black-grail": {
    id: "black-grail",
    tokens: {
      ...semantic,
      "--bg": "#0f110b",
      "--bg-raised": "#161a10",
      "--bg-sunken": "#0a0c07",
      "--line": "#2b3220",
      "--line-strong": "#3e4930",
      "--ink": "#dbe0c8",
      "--ink-muted": "#99a184",
      "--ink-quiet": "#aeb697",
      "--brass": "#cdc75e",
      "--brass-dim": "#77732f",
      "--brass-soft": "#b9b56d",
      "--price-fill": "#22241a",
      "--price-fill-dim": "#1b1d15",
      "--frame": "#5e6c33",
      "--frame-hi": "#a6b852",
      "--frame-lo": "#040502",
      "--accent": "#9db84a",
      "--bg-glow": "#1b2113",
    },
  },
  // Deep crimson under gold filigree and serpent scale.
  "court-of-the-seven-headed-serpent": {
    id: "court-of-the-seven-headed-serpent",
    tokens: {
      ...semantic,
      "--blood-ink": "#f07e72",
      "--oxblood-ink": "#e6b2aa",
      "--bg": "#160b0e",
      "--bg-raised": "#200f15",
      "--bg-sunken": "#0e0609",
      "--line": "#3e1f27",
      "--line-strong": "#5a2d38",
      "--ink": "#eedcd6",
      "--ink-muted": "#b6978f",
      "--ink-quiet": "#c8aaa3",
      "--brass": "#e3bb5c",
      "--brass-dim": "#8f6f2f",
      "--brass-soft": "#d0ad6b",
      "--price-fill": "#2c1a15",
      "--price-fill-dim": "#231419",
      "--frame": "#b08636",
      "--frame-hi": "#efd283",
      "--frame-lo": "#070203",
      "--accent": "#d4495a",
      "--bg-glow": "#2b1219",
    },
  },
};

/** A subfaction or variant keeps its faction's theme and changes only its accent. Keyed by subfaction or variant id. */
export const ACCENTS: Record<string, Partial<Tokens>> = {
  "heretic-naval-raiders": { "--accent": "#4f9aa0" },
  "procession-of-the-sacred-affliction": { "--accent": "#b7a24a" },
};

export interface ThemeScope {
  factionId: string;
  subfactionId?: string | undefined;
  variantId?: string | undefined;
}

/** The theme a warband's screens wear, or undefined for a faction without one (it stays neutral). */
export function themeFor(scope: ThemeScope): FactionTheme | undefined {
  const base = THEMES[scope.factionId];
  if (!base) return undefined;
  const accent = { ...(scope.subfactionId ? ACCENTS[scope.subfactionId] : {}), ...(scope.variantId ? ACCENTS[scope.variantId] : {}) };
  return { id: base.id, tokens: { ...base.tokens, ...accent } };
}

export interface ContrastPair {
  label: string;
  fg: string;
  bg: string;
  /** 4.5 for text (WCAG AA), 3 for borders and markers that carry meaning. */
  min: number;
}

/** Every foreground the screens draw on every surface it is drawn on, resolved to opaque colours. */
export function contrastPairs(t: Tokens | typeof NEUTRAL): ContrastPair[] {
  const builtIn = over(t["--oxblood-fill"], t["--bg-raised"]);
  const surfaces: [string, string][] = [
    ["page", t["--bg"]],
    ["panel", t["--bg-raised"]],
    ["inset", t["--bg-sunken"]],
  ];
  if ("--bg-glow" in t) surfaces.push(["backdrop glow", t["--bg-glow"]]);
  const text = (fg: TokenName, on: [string, string][]): ContrastPair[] => on.map(([where, bg]) => ({ label: `${fg} on ${where}`, fg: t[fg], bg, min: 4.5 }));
  const panel: [string, string][] = [["panel", t["--bg-raised"]]];
  const price: [string, string][] = [["price button", t["--price-fill"]]];
  return [
    ...text("--ink", [...surfaces, ...price, ["built-in", builtIn]]),
    ...text("--ink-muted", surfaces),
    ...text("--ink-quiet", [...surfaces, ...price]),
    ...text("--brass", [...surfaces, ...price]),
    ...text("--brass-soft", panel),
    ...text("--glory", [...panel, ...price]),
    ...text("--blood-ink", [...surfaces, ...price]),
    ...text("--oxblood-ink", [...panel, ["built-in", builtIn]]),
    ...text("--amber", [...surfaces, ...price]),
    ...text("--moss", surfaces),
    { label: "--blood border on panel", fg: t["--blood"], bg: t["--bg-raised"], min: 3 },
    ...("--frame" in t
      ? [
          { label: "--frame on page", fg: t["--frame"], bg: t["--bg"], min: 3 },
          { label: "--accent on page", fg: t["--accent"], bg: t["--bg"], min: 3 },
        ]
      : []),
  ];
}
