import { describe, expect, it } from "vitest";
import {
  cellKey,
  cellRect,
  createGrid,
  DELTA,
  decoratedSides,
  generateBattlefield,
  HILL_RATE_OBJECTIVES,
  HILL_RATE_OPEN,
  hillRateFor,
  mapCell,
  mapPoint,
  OPPOSITE,
  parseLayout,
  pieceById,
  placeablesIn,
  pointInPolygon,
  rectContains,
  rectArea,
  rectDistance,
  rectFromCentre,
  rectInside,
  rectOverlapArea,
  rotateSides,
  scenarioOverlay,
  SCATTER_ROLES,
  sideOf,
  STRUCTURAL_ROLES,
  TERRAIN_YAW_JITTER_DEG,
  trenchComponents,
  trenchConnectsEdges,
  turnedRect,
  type Dir,
  type Layout,
  type LayoutPiece,
  type Parity,
  type Rect,
  type SlotRef,
} from "../src/index.js";
import { fixtureEnv, SEEDS_100 } from "./fixtures.js";

const env = fixtureEnv();
const palette = env.palette;
const sense = palette.rotation.rotYSense;
const grid = createGrid(36, 4);
const gen = (scenarioId: string, seed: number, archetype: "trench-lines" | "no-mans-land" = "trench-lines"): Layout => generateBattlefield({ scenarioId, archetype, seed }, env);

const entry = (p: LayoutPiece) => pieceById(palette, p.paletteId);
/** A piece's footprint as it stands: turned off the axes, its exact outline. */
const rectOf = (p: LayoutPiece): Rect => turnedRect(p.position[0], p.position[1], { footprintIn: p.sizeIn }, p.rotY, sense);
const trenchCells = (layout: Layout) => layout.cells.filter((c) => c.kind === "trench").map((c) => ({ c: c.c, r: c.r, openings: c.openings! }));
const isFree = (p: LayoutPiece) => p.cells === null && p.role !== "revetment" && p.role !== "decor";
const isScatter = (p: LayoutPiece) => (p.slot ? palette.categories[p.slot.category]!.scatter : p.role === "scatter");
const onPlateau = (layout: Layout, p: LayoutPiece) => p.supportIds.some((id) => layout.pieces.find((x) => x.id === id)?.id.startsWith("s-"));
const onRaised = (layout: Layout, p: LayoutPiece) => onPlateau(layout, p) || p.supportIds.some((id) => layout.pieces.find((x) => x.id === id)?.paletteId === "h4x4");

/** Free pieces grouped into rulebook pieces (a group's or a heap's members count as one): terrain pieces, or scattered terrain. */
function units(layout: Layout, kind: "terrain" | "scatter" = "terrain"): { id: string; rects: Rect[]; pieces: LayoutPiece[] }[] {
  const byUnit = new Map<string, LayoutPiece[]>();
  for (const p of layout.pieces.filter((x) => isFree(x) && isScatter(x) === (kind === "scatter"))) byUnit.set(p.groupId ?? p.id, [...(byUnit.get(p.groupId ?? p.id) ?? []), p]);
  return [...byUnit].map(([id, pieces]) => ({ id, pieces, rects: pieces.map(rectOf) }));
}

/** Every slot on a board, once each. */
function slotsOf(layout: Layout): SlotRef[] {
  const byId = new Map<string, SlotRef>();
  for (const p of layout.pieces) if (p.slot) byId.set(p.slot.id, p.slot);
  return [...byId.values()];
}

const parityOf = (layout: Layout): Parity => ({ kind: layout.parity.kind, boardIn: layout.boardIn, objectivesMatch: layout.parity.objectivesMatch });

const raisedCells = (layout: Layout) => layout.cells.filter((c) => c.feature === "plateau" || c.feature === "ramp" || c.feature === "hill" || c.feature === "raised-trench");
const trenchRects = (layout: Layout) => layout.cells.filter((c) => c.kind === "trench" || c.feature === "raised-trench").map((c) => cellRect(grid, c.c, c.r));
const dist = (a: Rect[], b: Rect[]) => Math.min(...a.flatMap((x) => b.map((y) => rectDistance(x, y))));
/** Layout positions and footprints are rounded to thousandths of an inch. */
const ROUNDING = 2e-3;

/** The trench piece in a cell: the network piece, or the one dug into the plateau. */
function trenchPieceAt(layout: Layout, c: number, r: number): LayoutPiece | undefined {
  const cell = layout.cells.find((x) => x.c === c && x.r === r)!;
  const ids = cell.kind === "trench" ? [cell.pieceId] : cell.upperPieceIds;
  return ids.map((id) => layout.pieces.find((p) => p.id === id)!).find((p) => p.role.startsWith("trench"));
}

const SCENARIOS = ["claim-no-mans-land", "fields-of-glory"];
const LAYOUTS = new Map(SCENARIOS.map((id) => [id, SEEDS_100.map((seed) => gen(id, seed))]));

// Hill rates are measured over 200 seeds per scenario group: the scenarios
// with objectives, relics or supplies (each laid as its own archetype where
// Trench Lines cannot lay it), and the open ones.
// Hill rates are measured over 200 seeds per scenario group, each scenario
// taking its own run of seeds (the seed fixes the draw, so the same seeds on
// two scenarios would draw the same hills): the scenarios with objectives,
// relics or supplies (Hunt for Heroes laid as its own No Man's Land, which
// Trench Lines cannot get a cross trench through), and the open ones.
const seedsFrom = (first: number, n: number) => Array.from({ length: n }, (_, i) => first + i);
const HILL_GROUPS: { rate: number; boards: Layout[] }[] = [
  {
    rate: HILL_RATE_OBJECTIVES,
    boards: [
      ...LAYOUTS.get("claim-no-mans-land")!.slice(0, 40),
      ...["relic-hunt", "supply-raid", "the-high-ground"].flatMap((id, i) => seedsFrom(41 + 40 * i, 40).map((seed) => gen(id, seed))),
      ...seedsFrom(161, 40).map((seed) => gen("hunt-for-heroes", seed, "no-mans-land")),
    ],
  },
  { rate: HILL_RATE_OPEN, boards: [...LAYOUTS.get("fields-of-glory")!, ...seedsFrom(101, 100).map((seed) => gen("great-war", seed))] },
];
// Every scenario here mirrors across the line between its zones; point symmetry is laid on request.
const POINT_BOARDS = seedsFrom(1, 40).map((seed) => generateBattlefield({ scenarioId: "relic-hunt", archetype: "trench-lines", seed, options: { parity: "point" } }, env));

describe("generateBattlefield", () => {
  it("is deterministic: the same seed gives byte-identical layouts, different seeds differ", () => {
    const a = gen("claim-no-mans-land", 7);
    const b = gen("claim-no-mans-land", 7);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(gen("claim-no-mans-land", 8))).not.toBe(JSON.stringify(a));
    expect(parseLayout(JSON.parse(JSON.stringify(a)))).toEqual(a);
  });

  it("rejects unknown scenarios and archetypes it does not lay", () => {
    expect(() => gen("not-a-scenario", 1)).toThrow(/unknown scenario/);
    expect(() => generateBattlefield({ scenarioId: "fields-of-glory", archetype: "decimated-ruins" as "trench-lines", seed: 1 }, env)).toThrow(/not supported/);
  });

  it("stands exactly one piece on the mat in every cell", () => {
    for (const seed of [1, 2, 3]) {
      const layout = gen("claim-no-mans-land", seed);
      expect(layout.cells.length).toBe(81);
      const seen = new Map<string, string>();
      for (const p of layout.pieces.filter((p) => p.cells && p.zOrder === 0)) {
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
    const layouts = LAYOUTS.get(scenarioId)!;
    const overlay = scenarioOverlay(env.scenarios.find((s) => s.id === scenarioId)!);

    it("lays one connected network that a model can walk from one board edge to the opposite edge", () => {
      for (const layout of layouts) {
        expect(trenchConnectsEdges(grid, trenchCells(layout), layout.trench.axis), `seed ${layout.seed}`).toBe(true);
        expect(trenchComponents(trenchCells(layout)), `seed ${layout.seed}`).toHaveLength(1);
      }
    });

    it("runs a trench line in each deployment zone, joined to the network: mostly inside the zone, with an occasional jog out of it", () => {
      for (const layout of layouts) {
        const network = new Set(trenchCells(layout).map((c) => cellKey(c.c, c.r)));
        for (const zone of overlay.zones.filter((z) => z.isDeployment)) {
          const line = layout.trench.deploymentLines.find((l) => l.zoneLabel === zone.label);
          expect(line, `seed ${layout.seed} ${zone.label}`).toBeDefined();
          expect(line!.jog, `seed ${layout.seed} ${zone.label} runs straight`).not.toBeNull();
          const inside = line!.cells.map(([c, r]) => {
            const rect = cellRect(grid, c, r);
            return ([[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x0, rect.y1], [rect.x1, rect.y1]] as const).every((corner) => pointInPolygon(corner, zone.polygon));
          });
          for (const [c, r] of line!.cells) expect(network.has(cellKey(c, r))).toBe(true);
          expect(inside.filter(Boolean).length).toBe(line!.insideCells);
          // Mostly inside with an occasional jog: one single-bay jog on a nine-cell line leaves 8 of its 11 cells wholly inside.
          expect(line!.insideCells / line!.cells.length, `seed ${layout.seed} ${zone.label}`).toBeGreaterThanOrEqual(8 / 11 - 1e-9);
          let run = 0;
          let longest = 0;
          for (const ok of inside) longest = Math.max(longest, (run = ok ? run + 1 : 0));
          expect(longest, `seed ${layout.seed} ${zone.label}`).toBeGreaterThanOrEqual(4);
        }
      }
    });

    it("moves the jog along the line from board to board, not always to the same bay", () => {
      const at = new Map<number, number>();
      for (const layout of layouts) for (const line of layout.trench.deploymentLines.slice(0, 1)) at.set(line.jog!, (at.get(line.jog!) ?? 0) + 1);
      expect(at.size).toBeGreaterThanOrEqual(4);
      expect(Math.max(...at.values()) / layouts.length).toBeLessThan(0.6);
    });

    it("keeps every straight run of trench to six cells or fewer and bends every line and the cross trench", () => {
      for (const layout of layouts) {
        const byKey = new Map(trenchCells(layout).map((c) => [cellKey(c.c, c.r), c]));
        // A run is every cell the trench passes through in one direction, the corners at its ends and any T it runs through included.
        const joined = (c: number, r: number, d: Dir) => byKey.get(cellKey(c, r))?.openings.includes(d) && byKey.get(cellKey(c + DELTA[d][0], r + DELTA[d][1]))?.openings.includes(OPPOSITE[d]);
        for (const cell of byKey.values()) {
          for (const d of ["E", "N"] as const) {
            if (!joined(cell.c, cell.r, d) || joined(cell.c - DELTA[d][0], cell.r - DELTA[d][1], d)) continue;
            let n = 1;
            for (let [c, r] = [cell.c, cell.r]; joined(c, r, d); [c, r] = [c + DELTA[d][0], r + DELTA[d][1]]) n++;
            expect(n, `seed ${layout.seed} run ${d} from ${cell.c},${cell.r}`).toBeLessThanOrEqual(6);
          }
        }
        // A line bends when its cells do not all stand in one row or one column.
        const bends = (cells: readonly (readonly [number, number])[]) => new Set(cells.map(([c]) => c)).size > 1 && new Set(cells.map(([, r]) => r)).size > 1;
        for (const line of layout.trench.deploymentLines) expect(bends(line.cells), `seed ${layout.seed} ${line.zoneLabel}`).toBe(true);
        const cross = layout.trench.deploymentLines.flatMap((l) => l.commCells);
        expect(layout.trench.straightCross, `seed ${layout.seed}`).toBe(false);
        expect(bends(cross), `seed ${layout.seed} cross trench`).toBe(true);
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
          expect(rotateSides(entry(piece).openings!.rotY0, piece.rotY, sense)).toEqual(expected);
          expect(set.has(cellKey(cell.c + 1, cell.r)) && set.has(cellKey(cell.c, cell.r + 1)) && set.has(cellKey(cell.c + 1, cell.r + 1)), `2x2 at ${cell.c},${cell.r}`).toBe(false);
        }
      }
    });

    it("lines every full-length inner trench wall with the mesh's ledge or logs or a log fence, and nothing else", () => {
      for (const layout of layouts) {
        for (const cell of layout.cells.filter((c) => c.kind === "trench" || c.feature === "raised-trench")) {
          const piece = trenchPieceAt(layout, cell.c, cell.r)!;
          const openings = rotateSides(entry(piece).openings!.rotY0, piece.rotY, sense);
          const walls = (["N", "E", "S", "W"] as const).filter((d) => !openings.includes(d));
          const meshLined = decoratedSides(entry(piece), piece.rotY, sense);
          const fences = layout.pieces
            .filter((p) => p.role === "revetment" && p.supportIds.includes(piece.id))
            .map((p): Dir => {
              const dx = p.position[0] - (cell.c * 4 + 2);
              const dy = p.position[1] - (cell.r * 4 + 2);
              return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "N" : "S";
            });
          for (const wall of walls) expect(meshLined.includes(wall) || fences.includes(wall), `seed ${layout.seed} cell ${cell.c},${cell.r} bare ${wall} wall`).toBe(true);
          for (const fence of fences) {
            expect(walls.includes(fence) && !meshLined.includes(fence), `seed ${layout.seed} cell ${cell.c},${cell.r} fence on ${fence}`).toBe(true);
          }
          expect(new Set(fences).size).toBe(fences.length);
        }
      }
    });

    it("keeps terrain pieces at least 3in apart and clear of raised ground they do not stand on", () => {
      for (const layout of layouts) {
        const all = units(layout, "terrain");
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) expect(dist(all[i]!.rects, all[j]!.rects), `seed ${layout.seed} ${all[i]!.id} vs ${all[j]!.id}`).toBeGreaterThanOrEqual(3 - ROUNDING);
        }
        const raised = raisedCells(layout).map((c) => cellRect(grid, c.c, c.r));
        for (const u of all) {
          if (u.pieces.some((p) => onRaised(layout, p))) continue;
          if (raised.length) expect(dist(u.rects, raised), `seed ${layout.seed} ${u.id}`).toBeGreaterThanOrEqual(3 - ROUNDING);
        }
      }
    });

    it("keeps terrain pieces and scattered terrain at least 1in from every trench, including one dug into a plateau", () => {
      for (const layout of layouts) {
        const trench = trenchRects(layout);
        for (const u of [...units(layout, "terrain"), ...units(layout, "scatter")]) expect(dist(u.rects, trench), `seed ${layout.seed} ${u.id}`).toBeGreaterThanOrEqual(1 - ROUNDING);
      }
    });

    it("keeps scattered terrain apart from everything by a model base (1in), touching only the raised face it dresses", () => {
      for (const layout of layouts) {
        const scatter = units(layout, "scatter");
        const terrain = units(layout, "terrain");
        const raisedBy = new Map<string, Rect[]>([...layout.plateaus.map((x) => [x.id, [...x.cells, ...x.ramps.map((r) => r.cell)].map(([c, r]) => cellRect(grid, c, r))] as const), ...layout.hills.map((h) => [h.id, [...h.cells, ...h.ramps.map((r) => r.cell)].map(([c, r]) => cellRect(grid, c, r))] as const)]);
        for (let i = 0; i < scatter.length; i++) {
          const u = scatter[i]!;
          // Inside a heap the pieces may touch and lean on each other, but none swallows another.
          for (let a = 0; a < u.rects.length; a++) {
            for (let b = a + 1; b < u.rects.length; b++) {
              const [ra, rb] = [u.rects[a]!, u.rects[b]!];
              const shared = rectOverlapArea(ra, rb);
              const smaller = Math.min(rectArea(ra), rectArea(rb));
              expect(shared, `seed ${layout.seed} ${u.id} members pile into each other`).toBeLessThanOrEqual(0.3 * smaller + ROUNDING);
            }
          }
          for (let j = i + 1; j < scatter.length; j++) expect(dist(u.rects, scatter[j]!.rects), `seed ${layout.seed} ${u.id} vs ${scatter[j]!.id}`).toBeGreaterThanOrEqual(1 - ROUNDING);
          for (const t of terrain) expect(dist(u.rects, t.rects), `seed ${layout.seed} ${u.id} vs ${t.id}`).toBeGreaterThanOrEqual(1 - ROUNDING);
          const against = u.pieces[0]!.slot?.against ?? null;
          for (const [id, rects] of raisedBy) expect(dist(u.rects, rects), `seed ${layout.seed} ${u.id} vs ${id}`).toBeGreaterThanOrEqual(id === against ? 0 : 1 - ROUNDING);
        }
      }
    });

    it("keeps every footprint inside the board, free pieces 0.5in in from the edge", () => {
      const board: Rect = { x0: 0, y0: 0, x1: 36, y1: 36 };
      const inset: Rect = { x0: 0.5 - ROUNDING, y0: 0.5 - ROUNDING, x1: 35.5 + ROUNDING, y1: 35.5 + ROUNDING };
      const loose: Rect = { x0: -0.05, y0: -0.05, x1: 36.05, y1: 36.05 };
      for (const layout of layouts) {
        for (const p of layout.pieces) {
          const rect = rectOf(p);
          if (isFree(p)) expect(rectInside(rect, inset), `seed ${layout.seed} ${p.id}`).toBe(true);
          else expect(rectInside(rect, p.cells ? loose : board), `seed ${layout.seed} ${p.id}`).toBe(true);
        }
      }
    });

    it("meets the archetype minimum of two pieces per listed type", () => {
      for (const layout of layouts) {
        for (const sf of layout.stats.shortfalls) expect(sf.placed, `seed ${layout.seed} ${sf.typeId}`).toBeGreaterThanOrEqual(sf.min);
      }
    });

    it("keeps impassable landmarks out of the deployment zones", () => {
      for (const layout of layouts) {
        const dz = layout.deploymentZones.filter((z) => z.isDeployment).flatMap((z) => z.cells.map(([c, r]) => cellRect(grid, c, r)));
        for (const p of layout.pieces.filter((p) => p.role === "landmark")) {
          const rect = rectOf(p);
          for (const cr of dz) expect(rect.x0 < cr.x1 && cr.x0 < rect.x1 && rect.y0 < cr.y1 && cr.y0 < rect.y1, `seed ${layout.seed} ${p.id}`).toBe(false);
        }
      }
    });

    it("raises ground on nearly every board; each plateau is 1-6 stacked cells reached by ramps that climb onto it from open ground", () => {
      expect(layouts.filter((l) => l.plateaus.length || l.hills.length).length).toBeGreaterThanOrEqual(90);
      for (const layout of layouts) {
        for (const plateau of layout.plateaus) {
          const inPlateau = (c: number, r: number) => plateau.cells.some(([x, y]) => x === c && y === r);
          expect(plateau.cells.length).toBeGreaterThanOrEqual(1);
          expect(plateau.cells.length).toBeLessThanOrEqual(6);
          const reached = new Set([cellKey(...plateau.cells[0]!)]);
          for (let grew = true; grew; ) {
            grew = false;
            for (const [c, r] of plateau.cells) {
              if (reached.has(cellKey(c, r))) continue;
              if ((["N", "E", "S", "W"] as const).some((d) => reached.has(cellKey(c + DELTA[d][0], r + DELTA[d][1])))) {
                reached.add(cellKey(c, r));
                grew = true;
              }
            }
          }
          expect(reached.size, `seed ${layout.seed} plateau not connected`).toBe(plateau.cells.length);
          expect(plateau.ramps.length).toBeGreaterThanOrEqual(1);
          for (const ramp of plateau.ramps) {
            const [c, r] = ramp.cell;
            const [dc, dr] = DELTA[ramp.up];
            expect(inPlateau(c + dc, r + dr), `seed ${layout.seed} ramp ${c},${r} climbs onto nothing`).toBe(true);
            const [bc, br] = [c - dc, r - dr];
            expect(bc >= 0 && br >= 0 && bc < 9 && br < 9 && !inPlateau(bc, br)).toBe(true);
            expect(layout.cells.find((x) => x.c === bc && x.r === br)!.kind, `seed ${layout.seed} ramp foot`).not.toBe("trench");
            const piece = layout.pieces.find((p) => p.id === `ramp-${c}-${r}`)!;
            expect(rotateSides([entry(piece).uphill!.rotY0], piece.rotY, sense), `seed ${layout.seed} ramp ${c},${r}`).toEqual([ramp.up]);
            expect(piece.baseIn).toBeCloseTo(2.5, 6);
          }
          for (const [c, r] of plateau.cells) {
            const cell = layout.cells.find((x) => x.c === c && x.r === r)!;
            expect(cell.kind).not.toBe("trench");
            if (cell.feature === "plateau") expect(cell.topIn).toBeCloseTo(5, 6);
          }
        }
      }
    });

    it("builds hills from stacked Landscape tiles whose tops sit at 5.00 like a plateau's, and never uses an H4x4", () => {
      for (const layout of layouts) {
        expect(layout.pieces.some((p) => p.paletteId === "h4x4"), `seed ${layout.seed}`).toBe(false);
        for (const hill of layout.hills) {
          for (const [c, r] of hill.cells) {
            const cell = layout.cells.find((x) => x.c === c && x.r === r)!;
            expect(cell.feature).toBe("hill");
            expect(cell.kind).not.toBe("trench");
            const tiles = cell.upperPieceIds.map((id) => layout.pieces.find((p) => p.id === id)!).filter((p) => p.role === "ground");
            expect(tiles.length, `seed ${layout.seed} ${hill.id} ${c},${r}`).toBe(1);
            expect(tiles[0]!.baseIn).toBeCloseTo(2.5, 6);
            expect(cell.topIn).toBeCloseTo(5, 6);
          }
          for (const ramp of hill.ramps) {
            const [dc, dr] = DELTA[ramp.up];
            expect(hill.cells.some(([x, y]) => x === ramp.cell[0] + dc && y === ramp.cell[1] + dr), `seed ${layout.seed} ${hill.id} ramp climbs onto nothing`).toBe(true);
          }
        }
      }
    });

    it("rests every piece on the top of what it stands on", () => {
      for (const layout of layouts) {
        const byId = new Map(layout.pieces.map((p) => [p.id, p]));
        for (const p of layout.pieces) {
          if (!p.supportIds.length) {
            expect(p.baseIn, `seed ${layout.seed} ${p.id}`).toBe(0);
            continue;
          }
          const supports = p.supportIds.map((id) => byId.get(id)!);
          const trench = supports.find((s) => s.role.startsWith("trench"));
          const expected = trench
            ? trench.baseIn + (p.role === "revetment" ? palette.revetment.bottomAboveTrenchBaseIn : entry(trench).channelFloorIn!)
            : Math.max(...supports.map((s) => s.baseIn + entry(s).topIn!));
          expect(p.baseIn, `seed ${layout.seed} ${p.id}`).toBeCloseTo(expected, 6);
          expect(p.zOrder).toBe(Math.max(...supports.map((s) => s.zOrder)) + 1);
        }
      }
    });
  });

  describe("parity between the two halves", () => {
    const boards = [...LAYOUTS.get("claim-no-mans-land")!, ...LAYOUTS.get("fields-of-glory")!, ...POINT_BOARDS];
    const keys = (cells: readonly (readonly [number, number])[]) => cells.map(([c, r]) => cellKey(c, r)).sort();

    it("mirrors Claim No Man's Land and Fields of Glory across the line between the zones, and turns Relic Hunt about the centre on request", () => {
      for (const layout of LAYOUTS.get("claim-no-mans-land")!) expect(layout.parity).toEqual({ kind: "mirror-x", objectivesMatch: true });
      for (const layout of LAYOUTS.get("fields-of-glory")!) expect(layout.parity.kind).toBe("mirror-x");
      expect(POINT_BOARDS.length).toBe(40);
      for (const layout of POINT_BOARDS) expect(layout.parity).toEqual({ kind: "point", objectivesMatch: true });
    });

    it("lays the two deployment-zone trench lines as mirror images: same length and shape, junctions at mirrored cells", () => {
      for (const layout of boards) {
        const p = parityOf(layout);
        const mapped = (cells: readonly (readonly [number, number])[]) => cells.map(([c, r]): [number, number] => {
          const t = mapCell(p, grid, { c, r });
          return [t.c, t.r];
        });
        const [a, b] = layout.trench.deploymentLines;
        expect(a && b, `seed ${layout.seed}`).toBeTruthy();
        expect(b!.cells.length, `seed ${layout.seed}`).toBe(a!.cells.length);
        expect(keys(mapped(a!.cells)), `seed ${layout.seed}`).toEqual(keys(b!.cells));
        // A junction is a line cell that opens onto a trench cell off the line: where a communication trench joins.
        const junctions = (cells: readonly (readonly [number, number])[]) => {
          const own = new Set(keys(cells));
          return cells.filter(([c, r]) => layout.cells.find((x) => x.c === c && x.r === r)!.openings!.some((d) => {
            const n = layout.cells.find((x) => x.c === c + DELTA[d][0] && x.r === r + DELTA[d][1]);
            return n?.kind === "trench" && !own.has(cellKey(n.c, n.r));
          }));
        };
        expect(junctions(a!.cells).length, `seed ${layout.seed}`).toBeGreaterThan(0);
        expect(keys(mapped(junctions(a!.cells))), `seed ${layout.seed}`).toEqual(keys(junctions(b!.cells)));
      }
    });

    it("lays the whole trench network under a mirror as its own image, the bent cross trench included", () => {
      for (const layout of boards.filter((l) => l.parity.kind.startsWith("mirror"))) {
        const p = parityOf(layout);
        const trench = layout.cells.filter((c) => c.kind === "trench" || c.feature === "raised-trench");
        const mapped = trench.map(({ c, r }) => mapCell(p, grid, { c, r })).map(({ c, r }): [number, number] => [c, r]);
        expect(keys(mapped), `seed ${layout.seed}`).toEqual(keys(trench.map(({ c, r }): [number, number] => [c, r])));
      }
    });

    // The role a slot's filling plays: its palette piece's or group's role (a scatter heap is scatter).
    const roleOf = (fill: string) => palette.pieces.find((x) => x.id === fill)?.role ?? palette.groups.find((g) => g.id === fill)?.role ?? "scatter";

    it("holds a terrain slot of the same category and role at the mirror of every terrain slot, and the same scatter per category on each half", () => {
      for (const layout of boards) {
        const p = parityOf(layout);
        const slots = slotsOf(layout);
        const isScatterSlot = (x: SlotRef) => palette.categories[x.category]!.scatter;
        const terrain = slots.filter((x) => !isScatterSlot(x) && x.side !== "centre");
        expect(terrain.length, `seed ${layout.seed}`).toBeGreaterThanOrEqual(8);
        // Found by position, not through the twin link, so a slot whose twin went astray cannot hide.
        const at = (x: number, y: number) => terrain.filter((s) => Math.abs(s.at[0] - x) < 1e-6 && Math.abs(s.at[1] - y) < 1e-6);
        for (const slot of terrain) {
          const [x, y] = mapPoint(p, slot.at[0], slot.at[1]);
          const mirror = at(x, y);
          expect(mirror.length, `seed ${layout.seed} ${slot.id} (${slot.category} at ${slot.at.join(",")}) has nothing at its mirror`).toBe(1);
          expect(mirror[0]!.side, `seed ${layout.seed} ${slot.id}`).toBe(slot.side === "A" ? "B" : "A");
          expect(`${mirror[0]!.category}/${roleOf(mirror[0]!.fill)}`, `seed ${layout.seed} ${slot.id} ${slot.fill} vs ${mirror[0]!.id} ${mirror[0]!.fill}`).toBe(`${slot.category}/${roleOf(slot.fill)}`);
          expect(slot.twin, `seed ${layout.seed} ${slot.id}`).toBe(mirror[0]!.id);
        }
        const scatter = (side: SlotRef["side"]) => slots.filter((x) => isScatterSlot(x) && x.side === side).map((x) => x.category).sort();
        expect(scatter("A"), `seed ${layout.seed}`).toEqual(scatter("B"));
        // A single stands on the line (or point) the halves mirror across, or covers the one objective there.
        for (const slot of slots.filter((x) => x.side === "centre")) {
          expect(slot.twin).toBeNull();
          const onLine = sideOf(p, slot.at[0], slot.at[1]) === "centre";
          const objective = layout.objectives.find((o) => `o-${o.id}` === slot.id);
          const ownTwin = objective && sideOf(p, objective.position[0], objective.position[1]) === "centre";
          expect(onLine || ownTwin, `seed ${layout.seed} ${slot.id} at ${slot.at.join(",")}`).toBe(true);
        }
      }
    });
  });

  it("holds the repeat cap: no piece or group fills more than three terrain slots on a board until every variant of its category and role has three", () => {
    const capped = (layout: Layout) => {
      const count = new Map<string, number>();
      const categoryOf = new Map<string, string>();
      for (const slot of slotsOf(layout)) {
        if (palette.categories[slot.category]?.scatter) continue;
        count.set(slot.fill, (count.get(slot.fill) ?? 0) + 1);
        categoryOf.set(slot.fill, slot.category);
      }
      return { count, categoryOf };
    };
    for (const layout of [...LAYOUTS.values()].flat().concat(HILL_GROUPS[0]!.boards)) {
      const { count, categoryOf } = capped(layout);
      for (const [fill, n] of count) {
        if (n <= 3) continue;
        // Twins share a role, so a category's variants count by role: one ruin-role corner repeats in mirrored pairs.
        const role = placeablesIn(palette, categoryOf.get(fill)!).find((p) => p.key === fill)!.role;
        const variants = placeablesIn(palette, categoryOf.get(fill)!).filter((p) => p.role === role).map((p) => p.key);
        for (const v of variants) expect(count.get(v) ?? 0, `seed ${layout.seed} ${layout.scenarioId}: ${fill} x${n} while ${v} has fewer than 3`).toBeGreaterThanOrEqual(3);
      }
      expect(Math.max(...count.values())).toBeGreaterThanOrEqual(1);
    }
  });

  describe("hills", () => {
    const scenario = (id: string) => env.scenarios.find((s) => s.id === id)!;

    it("takes 60% for scenarios with objectives, relics or supplies to fight over and 20% for the rest", () => {
      for (const id of ["claim-no-mans-land", "relic-hunt", "supply-raid", "the-high-ground", "hunt-for-heroes", "dragon-hunt", "from-below"]) expect(hillRateFor(scenario(id)), id).toBe(0.6);
      for (const id of ["fields-of-glory", "great-war", "trench-warfare"]) expect(hillRateFor(scenario(id)), id).toBe(0.2);
    });

    it.each(HILL_GROUPS.map((g) => [g.rate, g] as const))("raises hills on %s of 200 boards, within 10 points, on every board that draws them", (rate, group) => {
      expect(group.boards.length).toBe(200);
      const withHills = group.boards.filter((l) => l.hills.length > 0).length / group.boards.length;
      expect(withHills).toBeGreaterThanOrEqual(rate - 0.1);
      expect(withHills).toBeLessThanOrEqual(rate + 0.1);
      for (const layout of group.boards) expect(layout.hills.length > 0, `${layout.scenarioId} seed ${layout.seed}`).toBe(layout.stats.hillsWanted);
    });

    it("meets the archetype minimums and keeps every footprint on the board across the hill groups' scenarios", () => {
      const inset: Rect = { x0: 0.5 - ROUNDING, y0: 0.5 - ROUNDING, x1: 35.5 + ROUNDING, y1: 35.5 + ROUNDING };
      for (const layout of HILL_GROUPS.flatMap((g) => g.boards)) {
        for (const sf of layout.stats.shortfalls) expect(sf.placed, `${layout.scenarioId} seed ${layout.seed} ${sf.typeId}`).toBeGreaterThanOrEqual(sf.min);
        for (const p of layout.pieces.filter(isFree)) expect(rectInside(rectOf(p), inset), `${layout.scenarioId} seed ${layout.seed} ${p.id}`).toBe(true);
      }
    });
  });

  it("ramps up to every plateau or hill that carries a building, a tower or an objective's cover, over 600 boards", () => {
    let carrying = 0;
    for (const layout of [...[...LAYOUTS.values()].flat(), ...HILL_GROUPS.flatMap((g) => g.boards)]) {
      const byId = new Map(layout.pieces.map((p) => [p.id, p]));
      for (const group of [...layout.plateaus, ...layout.hills]) {
        const tops = new Set(group.cells.map(([c, r]) => cellKey(c, r)));
        // Standing on the group: supported by one of its stacked tiles.
        const carried = layout.pieces.filter((p) => (p.role === "building" || p.role === "tower" || p.objectiveId) && p.supportIds.some((id) => {
          const s = byId.get(id)!;
          return s.role === "ground" && s.baseIn > 0 && s.cells!.some(([c, r]) => tops.has(cellKey(c, r)));
        }));
        if (!carried.length) continue;
        carrying++;
        expect(group.ramps.length, `${layout.scenarioId} seed ${layout.seed} ${group.id} carries ${carried.map((p) => p.paletteId).join(",")} with no ramp`).toBeGreaterThanOrEqual(1);
        for (const ramp of group.ramps) {
          const cell = layout.cells.find((x) => x.c === ramp.cell[0] && x.r === ramp.cell[1])!;
          expect(cell.upperPieceIds.some((id) => byId.get(id)!.role === "ramp"), `${layout.scenarioId} seed ${layout.seed} ${group.id} ramp at ${ramp.cell.join(",")} has no ramp piece`).toBe(true);
          const [dc, dr] = DELTA[ramp.up];
          expect(tops.has(cellKey(ramp.cell[0] + dc, ramp.cell[1] + dr))).toBe(true);
          const foot = layout.cells.find((x) => x.c === ramp.cell[0] - dc && x.r === ramp.cell[1] - dr)!;
          expect(foot.kind, `${layout.scenarioId} seed ${layout.seed} ${group.id} ramp foot`).not.toBe("trench");
          expect(foot.feature, `${layout.scenarioId} seed ${layout.seed} ${group.id} ramp foot`).toBeNull();
        }
      }
    }
    expect(carrying).toBeGreaterThan(200);
  });

  it("gives raised ground two ramps where a pair fits, as on every Claim and Fields board", () => {
    for (const layout of [...LAYOUTS.values()].flat()) {
      for (const group of [...layout.plateaus, ...layout.hills]) expect(group.ramps.length, `${layout.scenarioId} seed ${layout.seed} ${group.id}`).toBeGreaterThanOrEqual(2);
    }
  });

  describe("scattered terrain laid by hand", () => {
    const boards = [...LAYOUTS.values()].flat();
    const scatterPieces = boards.flatMap((l) => l.pieces.filter(isScatter));
    const heapsOf = (l: Layout): LayoutPiece[][] => {
      const by = new Map<string, LayoutPiece[]>();
      for (const p of l.pieces) if (isScatter(p) && p.groupId) by.set(p.groupId, [...(by.get(p.groupId) ?? []), p]);
      return [...by.values()];
    };
    const heaps = boards.flatMap(heapsOf);

    it("stands off any grid: positions on a half-inch grid no more often than chance", () => {
      expect(scatterPieces.length).toBeGreaterThan(2000);
      const onGrid = (v: number) => Math.abs(v * 2 - Math.round(v * 2)) < 0.02;
      const share = scatterPieces.filter((p) => onGrid(p.position[0]) && onGrid(p.position[1])).length / scatterPieces.length;
      // Chance: 0.04 per axis, 0.0016 for both.
      expect(share).toBeLessThan(0.01);
    });

    it("turns to any angle, not to quarter turns", () => {
      const nearQuarter = scatterPieces.filter((p) => {
        const off = p.rotY % 90;
        return Math.min(off, 90 - off) < 1;
      }).length / scatterPieces.length;
      // Chance: 8 degrees in 360; face dressing leans up to 18 degrees off its face.
      expect(nearQuarter).toBeLessThan(0.08);
      const octants = new Set(scatterPieces.map((p) => Math.floor(p.rotY / 45)));
      expect(octants.size).toBe(8);
    });

    it("heaps irregularly: spacing inside a heap varies, and no two heaps are laid out alike", () => {
      const big = heaps.filter((h) => h.length >= 3);
      expect(big.length).toBeGreaterThan(40);
      const spread = (h: LayoutPiece[]) => {
        const d: number[] = [];
        for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) d.push(Math.hypot(h[i]!.position[0] - h[j]!.position[0], h[i]!.position[1] - h[j]!.position[1]));
        const mean = d.reduce((a, b) => a + b, 0) / d.length;
        return { d, cv: Math.sqrt(d.reduce((a, b) => a + (b - mean) ** 2, 0) / d.length) / mean };
      };
      const irregular = big.filter((h) => spread(h).cv > 0.1).length / big.length;
      expect(irregular).toBeGreaterThan(0.8);
      for (const layout of boards) {
        const shapes = heapsOf(layout).filter((h) => h.length >= 3).map((h) => spread(h).d.map((v) => v.toFixed(2)).sort().join(","));
        // A heap and its mirrored twin share a shape; no third heap does.
        const counts = new Map<string, number>();
        for (const k of shapes) counts.set(k, (counts.get(k) ?? 0) + 1);
        for (const [k, n] of counts) expect(n, `seed ${layout.seed} heap shape ${k}`).toBeLessThanOrEqual(2);
      }
    });

    it("lays the scatter before the house fill: Fields keeps a12a0d8's 36 a board and Claim its measured ceiling, most of it in heaps of two to five, under 200 objects a board", () => {
      // Claim's minimums, five objective covers, its trench lines and the raised centre leave room for about 29 (a12a0d8 laid 30.9 round a straighter, smaller network).
      for (const [id, least] of [["claim-no-mans-land", 28], ["fields-of-glory", 36.3]] as const) {
        const set = LAYOUTS.get(id)!;
        const pieces = set.flatMap((l) => l.pieces.filter(isScatter)).length;
        const inHeaps = set.flatMap(heapsOf).filter((h) => h.length >= 2 && h.length <= 5).reduce((n, h) => n + h.length, 0);
        expect(pieces / set.length, id).toBeGreaterThanOrEqual(least);
        expect(inHeaps / pieces, id).toBeGreaterThanOrEqual(0.5);
        for (const layout of set) expect(layout.stats.totalPieces, `${id} seed ${layout.seed}`).toBeLessThanOrEqual(200);
      }
    });

    it("gives every scatter piece a placement role, counted in the stats, and uses every role somewhere", () => {
      const seen = new Set<string>();
      for (const layout of boards) {
        const counted: Record<string, number> = {};
        for (const p of layout.pieces.filter(isScatter)) {
          expect(SCATTER_ROLES, `seed ${layout.seed} ${p.id}`).toContain(p.slot!.placement);
          counted[p.slot!.placement!] = (counted[p.slot!.placement!] ?? 0) + 1;
          seen.add(p.slot!.placement!);
        }
        expect(layout.stats.scatterByRole, `seed ${layout.seed}`).toEqual(counted);
      }
      expect([...seen].sort()).toEqual([...SCATTER_ROLES].sort());
    });

    it("turns free terrain pieces a few degrees off the quarter turn, keeping square the cell-aligned and those on the mirror line", () => {
      const terrain = boards.flatMap((l) => l.pieces.filter((p) => p.slot && !isScatter(p) && !p.cells && !p.objectiveId));
      for (const p of terrain) {
        const off = p.rotY % 90;
        expect(Math.min(off, 90 - off), p.id).toBeLessThanOrEqual(TERRAIN_YAW_JITTER_DEG + 1e-6);
        // A piece on the mirror line is its own twin, so it stays square to stay mirror-true.
        if (p.slot!.side === "centre") expect(off, p.id).toBe(0);
      }
      const paired = terrain.filter((p) => p.slot!.side !== "centre" && !p.groupId);
      expect(paired.filter((p) => p.rotY % 90 !== 0).length / paired.length).toBeGreaterThan(0.95);
      for (const p of boards.flatMap((l) => l.pieces.filter((x) => x.cells))) expect(p.rotY % 90, p.id).toBe(0);
    });
  });

  it("counts every object under a category and reports the share that fills terrain and scatter slots", () => {
    for (const layout of [...LAYOUTS.values()].flat()) {
      const total = Object.values(layout.stats.objectsByCategory).reduce((a, b) => a + b, 0);
      expect(total).toBe(layout.stats.totalPieces);
      expect(total).toBe(layout.pieces.length);
      const slotted = layout.pieces.filter((p) => p.slot && !STRUCTURAL_ROLES.includes(p.role)).length;
      expect(Math.abs(layout.stats.dressingShare - slotted / total)).toBeLessThanOrEqual(0.0005 + 1e-9);
      expect(layout.stats.scatterPieces).toBe(layout.pieces.filter(isScatter).length);
    }
  });

  it("covers every Claim No Man's Land objective, mostly with ruined buildings, and keeps the trench off the markers", () => {
    let covers = 0;
    let buildings = 0;
    let raised = 0;
    for (const layout of LAYOUTS.get("claim-no-mans-land")!) {
      const seed = layout.seed;
      expect(layout.objectives.length).toBe(5);
      for (const o of layout.objectives) {
        expect(o.requiresCover).toBe(true);
        const cover = layout.pieces.filter((p) => p.id === o.coverPieceId || p.groupId === o.coverPieceId);
        expect(cover.length, `seed ${seed} ${o.id} uncovered`).toBeGreaterThan(0);
        expect(cover.some((p) => rectContains(rectOf(p), o.position[0], o.position[1]))).toBe(true);
        expect(layout.cells.find((c) => c.c === o.cell[0] && c.r === o.cell[1])!.kind).not.toBe("trench");
        covers++;
        if (cover[0]!.role === "building") buildings++;
        if (onRaised(layout, cover[0]!)) raised++;
        for (const p of layout.pieces.filter(isFree)) if (!cover.includes(p)) expect(rectContains(rectOf(p), o.position[0], o.position[1]), `seed ${seed} ${p.id} sits on ${o.id}`).toBe(false);
      }
    }
    expect(buildings / covers).toBeGreaterThanOrEqual(0.6);
    expect(raised).toBeGreaterThanOrEqual(50);
  });

  it("skips the deployment lines where the scenario bans terrain in the zones, and says so", () => {
    for (const seed of [1, 2, 3]) {
      const layout = gen("trench-warfare", seed);
      expect(layout.trench.deploymentLines).toEqual([]);
      expect(layout.stats.warnings.filter((w) => /no deployment trench in .*bans terrain/.test(w))).toHaveLength(2);
      expect(trenchConnectsEdges(grid, trenchCells(layout), layout.trench.axis)).toBe(true);
      const banned = layout.deploymentZones.filter((z) => z.noTerrain).flatMap((z) => z.cells.map(([c, r]) => cellKey(c, r)));
      for (const cell of trenchCells(layout)) expect(banned).not.toContain(cellKey(cell.c, cell.r));
    }
  });

  it("lays No Man's Land trenches only wholly inside the deployment zones", () => {
    for (const seed of SEEDS_100.slice(0, 20)) {
      const layout = gen("claim-no-mans-land", seed, "no-mans-land");
      expect(layout.trench.mode).toBe("deployment-only");
      expect(layout.trench.mainPathLength).toBe(0);
      expect(layout.trench.deploymentLines).toHaveLength(2);
      const zones = layout.deploymentZones.filter((z) => z.isDeployment);
      for (const cell of trenchCells(layout)) {
        const rect = cellRect(grid, cell.c, cell.r);
        const inside = zones.some((z) => [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x0, rect.y1], [rect.x1, rect.y1]].every((p) => pointInPolygon(p as [number, number], z.polygon)));
        expect(inside, `seed ${seed} cell ${cell.c},${cell.r}`).toBe(true);
      }
    }
  });

  it("reads the scenario prose into placement rules", () => {
    const claim = scenarioOverlay(env.scenarios.find((s) => s.id === "claim-no-mans-land")!);
    expect(claim.objectives.every((o) => o.requiresCover && o.preferredRoles[0] === "building")).toBe(true);
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

  it("records when the scenario does not list the archetype, and what was placed off its list", () => {
    const claim = gen("claim-no-mans-land", 1);
    expect(claim.stats.archetypeMatchesScenario).toBe(false);
    expect(claim.stats.houseRules).toContain("ruined-building");
    expect(gen("fields-of-glory", 1).stats.archetypeMatchesScenario).toBe(true);
    expect(gen("great-war", 1).stats.archetypeMatchesScenario).toBe(true);
  });

  it("honours a forced axis and branch count when no deployment lines are laid", () => {
    const layout = generateBattlefield({ scenarioId: "fields-of-glory", archetype: "trench-lines", seed: 3, options: { axis: "x", branches: 0, deploymentLines: false } }, env);
    expect(layout.trench.axis).toBe("x");
    expect(layout.trench.branches).toBe(0);
    expect(layout.trench.exits.length).toBe(2);
  });
});
