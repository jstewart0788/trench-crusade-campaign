import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPalette, parsePalette, terrainName, terrainReminder, type TerrainRules } from "../src/index.js";
import { ROOT } from "./fixtures.js";

const palette = loadPalette(ROOT);
const piece = (id: string) => palette.pieces.find((x) => x.id === id)!;
const half = (n: number) => Math.floor(n * 2 + 0.5) / 2;
/** Printed pages of the rulebook's terrain rules: terrain types to unique and scattered terrain. */
const TERRAIN_PAGES = new Set([38, 39, 40, 43, 45, 54, 55, 60, 61, 62, 63, 64]);
const STRUCTURES = new Set(["hill", "trench", "linear", "ruined-building", "corner-ruin", "unique"]);

describe("terrain rules in the palette", () => {
  const all = palette.pieces.flatMap((p) => [{ p, t: p.terrain }, ...(p.stackedTerrain ? [{ p, t: p.stackedTerrain }] : [])]);

  it("classifies every piece in the rulebook's terms, citing printed pages from its terrain rules", () => {
    expect(palette.pieces.length).toBeGreaterThan(100);
    for (const { p, t } of all) {
      expect(t.types.length, p.id).toBeGreaterThan(0);
      for (const page of t.pages) expect(TERRAIN_PAGES.has(page), `${p.id} p.${page}`).toBe(true);
      if (t.types.includes("impassable")) expect(t.climb, p.id).toBe(false);
      if (t.kind === "scattered") expect(t.cover || t.climb, p.id).toBe(false);
      // A piece the book does not name outright carries the reason for the call.
      if (t.kind === "unique" || t.kind === "scattered") expect(t.call, p.id).toBeTruthy();
    }
    for (const rule of Object.values(palette.terrainRules)) for (const page of rule!.pages) expect(TERRAIN_PAGES.has(page)).toBe(true);
  });

  it("gives every piece with a top or walls a measured height to the nearest half inch, and climbs only what stands over 1in", () => {
    const profile = JSON.parse(readFileSync(resolve(ROOT, "data/tts/palette-measured-v2.json"), "utf8")).profiles.pieces;
    const plain = Object.values(profile as Record<string, { name: string; heightAboveBottomAtZ0: { top: number[] } }>).find((x) => x.name === "Trench Straight (plain)")!;
    const tops = plain.heightAboveBottomAtZ0.top.filter((v) => v >= 0);
    const depth = half(Math.max(...tops) - Math.min(...tops));
    for (const { p, t } of all) {
      if (STRUCTURES.has(t.kind) || t.cover) expect(t.heightIn, p.id).not.toBeNull();
      if (t.heightIn === null) continue;
      expect(t.heightIn * 2, p.id).toBe(Math.round(t.heightIn * 2));
      if (t.kind === "trench") expect(t.heightIn, p.id).toBe(depth);
      else if (t.kind === "hill") expect(t.heightIn, p.id).toBe(half(p.topIn ?? p.heightIn));
      else expect(t.heightIn, p.id).toBe(half(p.heightIn));
      expect(t.climb, p.id).toBe(t.climb && t.heightIn > 1);
      if (["linear", "ruined-building", "corner-ruin"].includes(t.kind)) expect(t.climb, p.id).toBe(t.heightIn > 1);
    }
    expect(depth).toBe(2);
    expect(piece("trench-straight-ledge").terrain.fireStepIn).toBe(1);
  });

  it("rejects a piece without a classification", () => {
    const raw = JSON.parse(JSON.stringify(palette));
    delete raw.pieces[0].terrain;
    expect(() => parsePalette(raw)).toThrow(/terrain/);
  });
});

describe("terrain names", () => {
  it("names a piece by what it is, its height and how it plays", () => {
    expect(terrainName(piece("brick-wall").terrain)).toBe('Wall · 3" · Cover · Climb');
    expect(terrainName(piece("ruins-corner").terrain)).toBe('Corner ruin · 4.5" · Cover · Climb');
    expect(terrainName(piece("barbed-wire").terrain)).toBe("Barbed wire · Dangerous");
    expect(terrainName(piece("crater").terrain)).toBe("Crater · Difficult · Cover");
    expect(terrainName(piece("crater-2x2").terrain)).toBe("Crater · Difficult");
    expect(terrainName(piece("statue").terrain)).toBe("Statue · Impassable · Cover");
    expect(terrainName(piece("trench-straight-ledge").terrain)).toBe('Trench · 2" deep · Fire step · Cover');
    expect(terrainName(piece("landscape-1x2").terrain)).toBe("Ground · Open");
    expect(terrainName(piece("landscape-1x2").stackedTerrain!)).toBe('Hill · 3" · Elevated · Climb');
    expect(piece("landscape-1x2").stackedTerrain!.heightIn).toBe(2.5);
    expect(terrainName(piece("sandbags-long").terrain)).toBe('Sandbags · 1" · Cover');
    expect(terrainName(piece("barrel").terrain)).toBe("Barrel · Scatter");
    const fire: TerrainRules = { label: "Burning wreck", kind: "area", types: ["dangerous"], keywords: ["FIRE"], cover: true, climb: false, heightIn: 2, pages: [38, 54] };
    expect(terrainName(fire)).toBe("Burning wreck · Dangerous (FIRE) · Cover");
    expect(terrainName({ ...fire, label: "Hill", kind: "hill", types: ["open"], keywords: undefined, cover: false, climb: true, heightIn: 3 })).toBe('Hill · 3" · Elevated · Climb');
  });

  it("reminds of each rule a piece carries in one line, with its pages", () => {
    expect(terrainReminder(piece("difficult-flat").terrain, palette)).toBe(`Difficult: every 1" moved through it counts as 2"; Cover: -1 DICE to ranged attacks on a model in contact with it when it lies between; Defended Obstacle: -1 DICE in melee across it; p.38, 43, 45, 54, 60, 61`);
    const wall = terrainReminder(piece("brick-wall").terrain, palette);
    expect(wall).toMatch(/^Cover: .*; Over 1" high: Climb it as a sheer surface \(Risky Success Roll\); p\.38, 39, 43, 45, 62$/);
    expect(terrainReminder(piece("landscape-1x1").terrain, palette)).toBe("Open: models move freely; p.38");
    expect(terrainReminder(piece("trench-straight-ledge").terrain, palette)).toMatch(/^Trench sides under 3" cross as Open; a model may Jump across as a gap; Fire step 1" above the floor; Cover: /);
    expect(terrainReminder(piece("statue").terrain, palette)).toMatch(/^Landmark: only FLYING models cross it; Impassable: models cannot move onto or across it; Cover: /);
  });
});
