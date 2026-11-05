import { describe, expect, it } from "vitest";
import {
  cellKey,
  cellRect,
  createGrid,
  DELTA,
  generateBattlefield,
  Mask,
  OPPOSITE,
  parseLayout,
  rectContains,
  rectDistance,
  rectFromCentre,
  rotateOpenings,
  scenarioOverlay,
  trenchConnectsEdges,
  type Dir,
  type Layout,
  type LayoutPiece,
} from "../src/index.js";
import { fixtureEnv, SEEDS_100 } from "./fixtures.js";

const env = fixtureEnv();
const grid = createGrid(36, 4);
const gen = (scenarioId: string, seed: number): Layout => generateBattlefield({ scenarioId, archetype: "trench-lines", seed }, env);

const rectOf = (p: LayoutPiece) => rectFromCentre(p.position[0], p.position[1], p.footprintIn[0], p.footprintIn[1]);
const trenchCells = (layout: Layout) => layout.cells.filter((c) => c.kind === "trench").map((c) => ({ c: c.c, r: c.r, openings: c.openings! }));
const dressing = (layout: Layout) => layout.pieces.filter((p) => p.layer === "surface" || (p.role === "crater" && p.layer === "ground"));

const SCENARIOS = ["claim-no-mans-land", "fields-of-glory"];

describe("generateBattlefield", () => {
  it("is deterministic: the same seed gives byte-identical layouts, different seeds differ", () => {
    const a = gen("claim-no-mans-land", 7);
    const b = gen("claim-no-mans-land", 7);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(gen("claim-no-mans-land", 8))).not.toBe(JSON.stringify(a));
    expect(parseLayout(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });

  it("rejects unknown scenarios and other archetypes", () => {
    expect(() => gen("not-a-scenario", 1)).toThrow(/unknown scenario/);
    expect(() => generateBattlefield({ scenarioId: "fields-of-glory", archetype: "no-mans-land" as "trench-lines", seed: 1 }, env)).toThrow(/not supported/);
  });

  it("covers every cell exactly once with ground, trench or crater pieces", () => {
    for (const seed of [1, 2, 3]) {
      const layout = gen("claim-no-mans-land", seed);
      expect(layout.cells.length).toBe(81);
      const seen = new Map<string, string>();
      for (const p of layout.pieces.filter((p) => p.cells)) {
        for (const [c, r] of p.cells!) {
          expect(seen.has(cellKey(c, r)), `cell ${c},${r} claimed twice`).toBe(false);
          seen.set(cellKey(c, r), p.id);
        }
      }
      expect(seen.size).toBe(81);
      for (const cell of layout.cells) expect(seen.get(cellKey(cell.c, cell.r))).toBe(cell.pieceId);
    }
  });

  describe.each(SCENARIOS)("%s across 100 seeds", (scenarioId) => {
    const layouts = SEEDS_100.map((seed) => gen(scenarioId, seed));

    it("lays a trench network a model can walk from one board edge to the opposite edge", () => {
      for (const layout of layouts) {
        expect(trenchConnectsEdges(grid, trenchCells(layout), layout.trench.axis), `seed ${layout.seed}`).toBe(true);
        expect(layout.trench.exits.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("gives every trench cell the piece and rotation its neighbours demand, with no crosses and no 2x2 blocks", () => {
      for (const layout of layouts) {
        const cells = trenchCells(layout);
        const set = new Set(cells.map((c) => cellKey(c.c, c.r)));
        for (const cell of cells) {
          const expected: Dir[] = [];
          for (const dir of ["N", "E", "S", "W"] as const) {
            const [dc, dr] = DELTA[dir];
            if (set.has(cellKey(cell.c + dc, cell.r + dr)) || layout.trench.exits.some((e) => e.c === cell.c && e.r === cell.r && e.dir === dir)) expected.push(dir);
          }
          expect(cell.openings, `seed ${layout.seed} cell ${cell.c},${cell.r}`).toEqual(expected);
          expect(expected.length).toBeGreaterThanOrEqual(2);
          expect(expected.length).toBeLessThanOrEqual(3);
          const piece = layout.pieces.find((p) => p.id === `t-${cell.c}-${cell.r}`)!;
          const role = expected.length === 3 ? "trench-t" : OPPOSITE[expected[0]!] === expected[1] ? "trench-straight" : "trench-corner";
          expect(piece.role, `seed ${layout.seed} cell ${cell.c},${cell.r}`).toBe(role);
          const paletteEntry = env.palette.pieces.find((p) => p.id === piece.paletteId)!;
          expect(rotateOpenings(paletteEntry.openings!.rotY0, piece.rotY, env.palette.rotation.rotYSense)).toEqual(expected);
          expect(set.has(cellKey(cell.c + 1, cell.r)) && set.has(cellKey(cell.c, cell.r + 1)) && set.has(cellKey(cell.c + 1, cell.r + 1)), `2x2 at ${cell.c},${cell.r}`).toBe(false);
        }
      }
    });

    it("keeps dressing pieces at least 3in apart", () => {
      for (const layout of layouts) {
        const pieces = dressing(layout);
        for (let i = 0; i < pieces.length; i++) {
          for (let j = i + 1; j < pieces.length; j++) {
            expect(rectDistance(rectOf(pieces[i]!), rectOf(pieces[j]!)), `seed ${layout.seed} ${pieces[i]!.id} vs ${pieces[j]!.id}`).toBeGreaterThanOrEqual(3 - 1e-9);
          }
        }
      }
    });

    it("keeps dressing at least 1in from every trench cell", () => {
      for (const layout of layouts) {
        const trench = trenchCells(layout).map((c) => cellRect(grid, c.c, c.r));
        for (const p of dressing(layout)) {
          for (const t of trench) expect(rectDistance(rectOf(p), t), `seed ${layout.seed} ${p.id}`).toBeGreaterThanOrEqual(1 - 1e-9);
        }
      }
    });

    it("meets the archetype minimum of two pieces per listed type", () => {
      for (const layout of layouts) {
        for (const sf of layout.stats.shortfalls) expect(sf.placed, `seed ${layout.seed} ${sf.typeId}`).toBeGreaterThanOrEqual(sf.min);
        const roles = layout.stats.piecesByRole;
        expect((roles.ruin ?? 0) >= 2 && (roles.wire ?? 0) + (roles.dangerous ?? 0) >= 2 && (roles.crater ?? 0) + (roles.difficult ?? 0) >= 2 && (roles.landmark ?? 0) >= 2, `seed ${layout.seed}`).toBe(true);
      }
    });

    it("keeps impassable landmarks out of the deployment zones", () => {
      for (const layout of layouts) {
        const dz = new Mask(grid);
        for (const zone of layout.deploymentZones.filter((z) => z.isDeployment)) for (const [c, r] of zone.cells) dz.set(c, r);
        for (const p of layout.pieces.filter((p) => p.role === "landmark")) {
          const rect = rectOf(p);
          for (const { c, r } of dz.cells()) {
            const cr = cellRect(grid, c, r);
            const overlaps = rect.x0 < cr.x1 && cr.x0 < rect.x1 && rect.y0 < cr.y1 && cr.y0 < rect.y1;
            expect(overlaps, `seed ${layout.seed} ${p.id} in DZ cell ${c},${r}`).toBe(false);
          }
        }
      }
    });
  });

  it("covers every Claim No Man's Land objective with a terrain piece and keeps the trench off them", () => {
    for (const seed of SEEDS_100) {
      const layout = gen("claim-no-mans-land", seed);
      expect(layout.objectives.length).toBe(5);
      for (const o of layout.objectives) {
        expect(o.requiresCover).toBe(true);
        const cover = layout.pieces.find((p) => p.id === o.coverPieceId);
        expect(cover, `seed ${seed} ${o.id} uncovered`).toBeDefined();
        expect(rectContains(rectOf(cover!), o.position[0], o.position[1])).toBe(true);
        expect(["ruin", "landmark", "difficult"]).toContain(cover!.role);
        const cell = layout.cells.find((c) => c.c === o.cell[0] && c.r === o.cell[1])!;
        expect(cell.kind).not.toBe("trench");
        for (const p of dressing(layout)) if (p.id !== cover!.id) expect(rectContains(rectOf(p), o.position[0], o.position[1]), `seed ${seed} ${p.id} sits on ${o.id}`).toBe(false);
      }
    }
  });

  it("reads the scenario prose into placement rules", () => {
    const claim = scenarioOverlay(env.scenarios.find((s) => s.id === "claim-no-mans-land")!);
    expect(claim.objectives.every((o) => o.requiresCover)).toBe(true);
    expect(claim.zones.map((z) => z.isDeployment)).toEqual([true, true]);
    const warfare = scenarioOverlay(env.scenarios.find((s) => s.id === "trench-warfare")!);
    expect(warfare.zones.map((z) => [z.isDeployment, z.noTerrain])).toEqual([
      [true, true],
      [true, true],
      [false, false],
    ]);
    expect(warfare.objectives.every((o) => o.allowsTrench && !o.requiresCover)).toBe(true);
    const below = scenarioOverlay(env.scenarios.find((s) => s.id === "from-below")!);
    expect(below.objectives.find((o) => o.id === "ichor-pit-centre")!.keepOutIn).toBe(1);
  });

  it("records when the scenario does not list the archetype", () => {
    expect(gen("claim-no-mans-land", 1).stats.archetypeMatchesScenario).toBe(false);
    expect(gen("fields-of-glory", 1).stats.archetypeMatchesScenario).toBe(true);
    expect(gen("great-war", 1).stats.archetypeMatchesScenario).toBe(true);
  });

  it("honours a forced axis and branch count", () => {
    const layout = generateBattlefield({ scenarioId: "fields-of-glory", archetype: "trench-lines", seed: 3, options: { axis: "x", branches: 0 } }, env);
    expect(layout.trench.axis).toBe("x");
    expect(layout.trench.branches).toBe(0);
    expect(layout.trench.exits.length).toBe(2);
  });
});
