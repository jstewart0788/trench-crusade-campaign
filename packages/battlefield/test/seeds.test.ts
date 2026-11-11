import { describe, expect, it } from "vitest";
import { densityBand, generateBattlefield, isDecor, pickSeeds, pieceById, recommendSeeds, seedQuality, type Archetype, type SeedQuality } from "../src/index.js";
import { fixtureEnv } from "./fixtures.js";

const env = fixtureEnv();

/** A rated board: by default qualifying, with the counts given. */
const board = (seed: number, objects: number, scatter: number, terrain: number, extra: Partial<SeedQuality> = {}): SeedQuality => ({
  seed,
  archetype: "no-mans-land",
  minimumsMet: true,
  lines: 0,
  singleFile: 1,
  objects,
  scatter,
  terrain,
  warnings: 0,
  shortfallRows: 0,
  missing: 0,
  ...extra,
});

// Twenty boards from thin to full: objects 100-195, scatter 10-48, terrain pieces 8-15.
const spread = Array.from({ length: 20 }, (_, i) => board(i + 1, 100 + i * 5, 10 + i * 2, 8 + Math.floor(i * 0.4)));

describe("recommended seeds", () => {
  it("measures the density band over the rated boards: a floor at the 25th percentile of objects, scatter and terrain pieces between the 40th and 80th", () => {
    const band = densityBand(spread);
    expect(band.objectsFloor).toBe(120);
    expect(band.scatter).toEqual([24, 28, 40]);
    expect(band.terrain).toEqual([10, 11, 14]);
  });

  it("never recommends a thin board, or one that misses a minimum or lines anything up, however few shortfalls it has", () => {
    const thin = spread.map((q) => (q.seed <= 3 ? { ...q, missing: 0 } : { ...q, missing: 5 }));
    const flawed = thin.map((q) => (q.seed === 12 ? { ...q, minimumsMet: false } : q.seed === 13 ? { ...q, lines: 1 } : q.seed === 14 ? { ...q, singleFile: 3 } : q));
    const picked = pickSeeds([flawed], 20).map((p) => p.seed);
    for (const seed of [1, 2, 3, 4, 12, 13, 14]) expect(picked).not.toContain(seed);
    expect(picked.length).toBe(13);
  });

  it("puts boards of the scenario's usual density first, then the fewest pieces short of the targets", () => {
    // Seed 20 is the fullest and short of nothing; seed 10 sits in the band but misses two pieces.
    const rated = spread.map((q) => ({ ...q, missing: q.seed === 20 ? 0 : q.seed === 10 ? 2 : 4 }));
    const picked = pickSeeds([rated], 20).map((p) => p.seed);
    const band = densityBand(rated);
    const inBand = (seed: number) => {
      const q = rated.find((x) => x.seed === seed)!;
      return q.scatter >= band.scatter[0] && q.scatter <= band.scatter[2] && q.terrain >= band.terrain[0] && q.terrain <= band.terrain[2];
    };
    const firstOut = picked.findIndex((s) => !inBand(s));
    expect(firstOut).toBeGreaterThan(0);
    expect(picked.slice(firstOut).every((s) => !inBand(s))).toBe(true);
    expect(picked[0]).toBe(10);
    expect(picked.indexOf(20)).toBeGreaterThanOrEqual(firstOut);
  });

  it("recommends a seed only if it is good as every archetype the panel lets the player lay it as", () => {
    const asNml = spread;
    const asTrenchLines = spread.map((q): SeedQuality => ({ ...q, archetype: "trench-lines", minimumsMet: q.seed !== 15 }));
    const one = pickSeeds([asNml], 20).map((p) => p.seed);
    const both = pickSeeds([asNml, asTrenchLines], 20);
    expect(one).toContain(15);
    expect(both.map((p) => p.seed)).not.toContain(15);
    for (const p of both) expect(p.fits.map((f) => f.archetype)).toEqual(["no-mans-land", "trench-lines"]);
  });

  it("measures a board's density without its decorative scatter, laid or not", () => {
    const plain = generateBattlefield({ scenarioId: "claim-no-mans-land", seed: 1 }, env);
    const dressed = generateBattlefield({ scenarioId: "claim-no-mans-land", seed: 1, options: { decor: true } }, env);
    const decor = dressed.pieces.filter((p) => p.slot && env.palette.categories[p.slot.category]!.scatter && isDecor(pieceById(env.palette, p.paletteId))).length;
    expect(decor).toBeGreaterThan(10);
    const q = seedQuality(dressed, env.palette);
    expect([q.objects, q.scatter]).toEqual([dressed.stats.totalPieces - decor, dressed.stats.scatterPieces - decor]);
    expect(seedQuality(plain, env.palette).scatter).toBe(plain.stats.scatterPieces);
  });

  it("picks Dragon Hunt seeds that are full, aligned with nothing and meet their minimums as No Man's Land and as Trench Lines", { timeout: 120_000 }, () => {
    const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
    const picks = recommendSeeds(env, "dragon-hunt", seeds, 3);
    expect(picks.length).toBe(3);
    for (const archetype of ["no-mans-land", "trench-lines"] as Archetype[]) {
      const all = seeds.map((seed) => seedQuality(generateBattlefield({ scenarioId: "dragon-hunt", archetype, seed }, env), env.palette));
      const band = densityBand(all);
      for (const p of picks) {
        const q = all.find((x) => x.seed === p.seed)!;
        expect(q.minimumsMet, `${archetype} seed ${p.seed}`).toBe(true);
        expect(q.lines, `${archetype} seed ${p.seed}`).toBe(0);
        expect(q.singleFile, `${archetype} seed ${p.seed}`).toBeLessThan(3);
        expect(q.objects, `${archetype} seed ${p.seed}`).toBeGreaterThanOrEqual(band.objectsFloor);
      }
    }
  });
});
