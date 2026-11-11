import { alignmentReport, layoutUnits, longestSingleFile } from "./alignment.js";
import { generateBattlefield, selectableArchetypes, type Archetype, type GeneratorEnv } from "./generate.js";
import type { Layout } from "./layout.js";
import { isDecor, pieceById, type Palette } from "./palette.js";

/** How a seed's board measures: the generator's own quality report, whether anything lines up, and how full it is. */
export interface SeedQuality {
  seed: number;
  archetype: Archetype;
  /** Every slot category placed at least its minimum. */
  minimumsMet: boolean;
  /** Lines of three (alignment.ts). */
  lines: number;
  /** The longest single file of single scatter pieces (alignment.ts longestSingleFile); three or more is a row. */
  singleFile: number;
  /** Objects and scatter pieces that bear rules: decorative scattered terrain is left out of the density, laid or not. */
  objects: number;
  scatter: number;
  /** Terrain pieces (everything but scattered terrain), a group or heap counted once. */
  terrain: number;
  warnings: number;
  shortfallRows: number;
  /** Pieces missing against the targets, summed over the shortfall rows. */
  missing: number;
}

export function seedQuality(layout: Layout, palette: Palette): SeedQuality {
  const s = layout.stats;
  const units = layoutUnits(layout, palette);
  const parity = { kind: layout.parity.kind, boardIn: layout.boardIn, objectivesMatch: layout.parity.objectivesMatch };
  // Scattered terrain only: a barrel in a crate stack is part of a cover piece.
  const decor = layout.pieces.filter((p) => p.slot && palette.categories[p.slot.category]?.scatter && isDecor(pieceById(palette, p.paletteId))).length;
  const singles = layout.pieces.filter((p) => !p.groupId && p.slot && palette.categories[p.slot.category]?.scatter).map((p) => p.position);
  return {
    seed: layout.seed,
    archetype: layout.archetype,
    minimumsMet: s.shortfalls.every((f) => f.placed >= f.min),
    lines: alignmentReport(units, parity, layout.cellIn).lines.length,
    singleFile: longestSingleFile(singles),
    objects: s.totalPieces - decor,
    scatter: s.scatterPieces - decor,
    terrain: units.filter((u) => u.terrain).length,
    warnings: s.warnings.length,
    shortfallRows: s.shortfalls.length,
    missing: s.shortfalls.reduce((n, f) => n + Math.max(0, f.target - f.placed), 0),
  };
}

/** Every seed of `seeds` the generator can lay for the scenario as the archetype, rated. */
export function rateSeeds(env: GeneratorEnv, scenarioId: string, seeds: readonly number[], archetype: Archetype): SeedQuality[] {
  const rated: SeedQuality[] = [];
  for (const seed of seeds) {
    try {
      rated.push(seedQuality(generateBattlefield({ scenarioId, archetype, seed }, env), env.palette));
    } catch {
      continue;
    }
  }
  return rated;
}

/** The density a scenario's boards are measured against, from the rated seeds: the object count a board may not fall below, and the band its scatter and terrain pieces should sit in. */
export interface DensityBand {
  objectsFloor: number;
  objectsMedian: number;
  /** [low, median, high] */
  scatter: [number, number, number];
  terrain: [number, number, number];
}

/** A board below the 25th percentile of objects is thin; between the 40th and 80th of scatter and of terrain pieces is the scenario's usual density. */
export const DENSITY_PERCENTILES = { objectsFloor: 0.25, low: 0.4, median: 0.5, high: 0.8 } as const;

/** Nearest-rank percentile. */
function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]!;
}

export function densityBand(rated: readonly SeedQuality[]): DensityBand {
  const P = DENSITY_PERCENTILES;
  const band = (values: number[]): [number, number, number] => [percentile(values, P.low), percentile(values, P.median), percentile(values, P.high)];
  const objects = rated.map((q) => q.objects);
  return { objectsFloor: percentile(objects, P.objectsFloor), objectsMedian: percentile(objects, P.median), scatter: band(rated.map((q) => q.scatter)), terrain: band(rated.map((q) => q.terrain)) };
}

/** A seed as one archetype lays it, measured against that archetype's density band. */
export interface SeedFit extends SeedQuality {
  /** Minimums met, no line, no single file, not thin. */
  qualifies: boolean;
  /** Scatter and terrain pieces both inside the band. */
  inBand: boolean;
  /** How far scatter and terrain pieces sit from the median, each in band widths. */
  distance: number;
}

export interface SeedPick {
  seed: number;
  /** One per archetype the scenario can be laid as, its own first. */
  fits: SeedFit[];
}

export function seedFit(q: SeedQuality, band: DensityBand): SeedFit {
  const inside = (v: number, [lo, , hi]: readonly number[]) => v >= lo! && v <= hi!;
  const away = (v: number, [lo, mid, hi]: readonly number[]) => Math.abs(v - mid!) / Math.max(1, hi! - lo!);
  return {
    ...q,
    qualifies: q.minimumsMet && q.lines === 0 && q.singleFile < 3 && q.objects >= band.objectsFloor,
    inBand: inside(q.scatter, band.scatter) && inside(q.terrain, band.terrain),
    distance: away(q.scatter, band.scatter) + away(q.terrain, band.terrain),
  };
}

/**
 * The best `count` seeds from rated boards of each archetype (the same seeds,
 * one list per archetype; the panel keeps one seed list whichever archetype the
 * player picks, so a seed must be good as every one). A seed qualifies when, as
 * every archetype, its minimums are met, nothing stands in a line or in single
 * file and it is not thin; then the seeds whose scatter and terrain pieces sit
 * in the density band as every archetype come first, then fewest pieces missing
 * against the targets and fewest shortfall rows, then nearest the median
 * density, fewest warnings, lowest seed.
 */
export function pickSeeds(ratedByArchetype: readonly (readonly SeedQuality[])[], count: number): SeedPick[] {
  const bands = ratedByArchetype.map(densityBand);
  const bySeed = new Map<number, SeedFit[]>();
  ratedByArchetype.forEach((rated, i) => {
    for (const q of rated) bySeed.set(q.seed, [...(bySeed.get(q.seed) ?? []), seedFit(q, bands[i]!)]);
  });
  const sum = (fits: SeedFit[], f: (x: SeedFit) => number) => fits.reduce((n, x) => n + f(x), 0);
  return [...bySeed]
    .filter(([, fits]) => fits.length === ratedByArchetype.length && fits.every((f) => f.qualifies))
    .map(([seed, fits]) => ({ seed, fits }))
    .sort(
      (a, b) =>
        sum(a.fits, (f) => Number(!f.inBand)) - sum(b.fits, (f) => Number(!f.inBand)) ||
        sum(a.fits, (f) => f.missing) - sum(b.fits, (f) => f.missing) ||
        sum(a.fits, (f) => f.shortfallRows) - sum(b.fits, (f) => f.shortfallRows) ||
        sum(a.fits, (f) => f.distance) - sum(b.fits, (f) => f.distance) ||
        sum(a.fits, (f) => f.warnings) - sum(b.fits, (f) => f.warnings) ||
        a.seed - b.seed,
    )
    .slice(0, count);
}

/** The recommended seeds for a scenario among `seeds`, judged as every archetype it can be laid as (pickSeeds). */
export function recommendSeeds(env: GeneratorEnv, scenarioId: string, seeds: readonly number[], count: number): SeedPick[] {
  const scenario = env.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) return [];
  return pickSeeds(selectableArchetypes(scenario).map((a) => rateSeeds(env, scenarioId, seeds, a)), count);
}
