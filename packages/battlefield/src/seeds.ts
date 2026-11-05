import { generateBattlefield, type GeneratorEnv } from "./generate.js";
import type { Layout } from "./layout.js";

/** How a seed's board measures against the generator's own quality report. */
export interface SeedQuality {
  seed: number;
  /** Every slot category placed at least its minimum. */
  minimumsMet: boolean;
  warnings: number;
  shortfallRows: number;
  /** Pieces missing against the targets, summed over the shortfall rows. */
  missing: number;
}

export function seedQuality(layout: Layout): SeedQuality {
  const s = layout.stats;
  return {
    seed: layout.seed,
    minimumsMet: s.shortfalls.every((f) => f.placed >= f.min),
    warnings: s.warnings.length,
    shortfallRows: s.shortfalls.length,
    missing: s.shortfalls.reduce((n, f) => n + Math.max(0, f.target - f.placed), 0),
  };
}

/**
 * The best `count` seeds of `seeds` for a scenario: minimums met, then fewest
 * warnings, fewest shortfall rows, fewest missing pieces, lowest seed. A seed
 * the generator cannot lay is skipped.
 */
export function recommendSeeds(env: GeneratorEnv, scenarioId: string, seeds: readonly number[], count: number): SeedQuality[] {
  const rated: SeedQuality[] = [];
  for (const seed of seeds) {
    try {
      rated.push(seedQuality(generateBattlefield({ scenarioId, seed }, env)));
    } catch {
      continue;
    }
  }
  return rated
    .filter((q) => q.minimumsMet)
    .sort((a, b) => a.warnings - b.warnings || a.shortfallRows - b.shortfallRows || a.missing - b.missing || a.seed - b.seed)
    .slice(0, count);
}
