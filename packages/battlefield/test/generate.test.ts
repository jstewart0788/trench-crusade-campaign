import { describe, expect, it } from "vitest";
import {
  createGrid,
  generateBattlefield,
  parseLayout,
  rectInside,
  rectOverlapArea,
  trenchComponents,
  trenchConnectsEdges,
  turnedRect,
  type Archetype,
  type Layout,
  type LayoutPiece,
  type Rect,
} from "../src/index.js";
import { fixtureEnv } from "./fixtures.js";

const env = fixtureEnv();
const palette = env.palette;
const sense = palette.rotation.rotYSense;
const LAID: Archetype[] = ["trench-lines", "no-mans-land"];

const rectOf = (p: LayoutPiece): Rect => turnedRect(p.position[0], p.position[1], { footprintIn: p.sizeIn }, p.rotY, sense);
const isFree = (p: LayoutPiece) => p.cells === null && p.role !== "revetment" && p.role !== "decor";
const trenchCells = (layout: Layout) => layout.cells.filter((c) => c.kind === "trench").map((c) => ({ c: c.c, r: c.r, openings: c.openings! }));

/** Free pieces grouped as the rulebook counts them: a building group's or a heap's members are one piece. */
function units(layout: Layout): { id: string; rects: Rect[] }[] {
  const byUnit = new Map<string, LayoutPiece[]>();
  for (const p of layout.pieces.filter(isFree)) byUnit.set(p.groupId ?? p.id, [...(byUnit.get(p.groupId ?? p.id) ?? []), p]);
  return [...byUnit].map(([id, pieces]) => ({ id, rects: pieces.map(rectOf) }));
}

// One board per scenario per archetype it can be laid as, so every scenario's geometry is exercised once.
const BOARDS: Layout[] = env.scenarios.flatMap((s) =>
  LAID.filter((a) => s.archetypes.includes(a) || s.archetypes.includes("any")).map((archetype) => generateBattlefield({ scenarioId: s.id, archetype, seed: 1 }, env)),
);

describe("generateBattlefield", () => {
  it("is deterministic: the same seed gives byte-identical layouts that round-trip, different seeds differ", () => {
    const gen = (seed: number) => generateBattlefield({ scenarioId: "claim-no-mans-land", seed }, env);
    const a = gen(7);
    expect(JSON.stringify(gen(7))).toBe(JSON.stringify(a));
    expect(JSON.stringify(gen(8))).not.toBe(JSON.stringify(a));
    expect(parseLayout(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });

  it("rejects unknown scenarios", () => {
    expect(() => generateBattlefield({ scenarioId: "not-a-scenario", seed: 1 }, env)).toThrow(/unknown scenario/);
  });

  it("lays a board for every scenario as each archetype it allows", () => {
    expect(BOARDS.length).toBeGreaterThanOrEqual(env.scenarios.length);
    for (const b of BOARDS) expect(b.pieces.length, `${b.scenarioId} ${b.archetype}`).toBeGreaterThan(0);
  });

  it("keeps every footprint on the board", () => {
    for (const b of BOARDS) {
      const board: Rect = { x0: -0.05, y0: -0.05, x1: b.boardIn + 0.05, y1: b.boardIn + 0.05 };
      for (const p of b.pieces) expect(rectInside(rectOf(p), board), `${b.scenarioId} ${b.archetype} ${p.id}`).toBe(true);
    }
  });

  it("stands no free piece inside another", () => {
    for (const b of BOARDS) {
      const all = units(b);
      for (let i = 0; i < all.length; i++) {
        for (let j = i + 1; j < all.length; j++) {
          const shared = all[i]!.rects.reduce((sum, r) => sum + all[j]!.rects.reduce((s, q) => s + rectOverlapArea(r, q), 0), 0);
          expect(shared, `${b.scenarioId} ${b.archetype} ${all[i]!.id} vs ${all[j]!.id}`).toBeLessThan(0.01);
        }
      }
    }
  });

  it("lays Trench Lines as one network a model can walk from one board edge to the opposite edge", () => {
    for (const b of BOARDS.filter((x) => x.archetype === "trench-lines")) {
      const grid = createGrid(b.boardIn, palette.cellIn);
      expect(trenchConnectsEdges(grid, trenchCells(b), b.trench.axis), b.scenarioId).toBe(true);
      expect(trenchComponents(trenchCells(b)), b.scenarioId).toHaveLength(1);
    }
  });
});

