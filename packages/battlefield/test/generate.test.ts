import { describe, expect, it } from "vitest";
import {
  cellKey,
  cellRect,
  createGrid,
  DELTA,
  decoratedSides,
  generateBattlefield,
  OPPOSITE,
  parseLayout,
  pieceById,
  pointInPolygon,
  rectContains,
  rectDistance,
  rectFromCentre,
  rectInside,
  rotateSides,
  scenarioOverlay,
  trenchComponents,
  trenchConnectsEdges,
  type Dir,
  type Layout,
  type LayoutPiece,
  type Rect,
} from "../src/index.js";
import { fixtureEnv, SEEDS_100 } from "./fixtures.js";

const env = fixtureEnv();
const palette = env.palette;
const sense = palette.rotation.rotYSense;
const grid = createGrid(36, 4);
const gen = (scenarioId: string, seed: number, archetype: "trench-lines" | "no-mans-land" = "trench-lines"): Layout => generateBattlefield({ scenarioId, archetype, seed }, env);

const entry = (p: LayoutPiece) => pieceById(palette, p.paletteId);
const rectOf = (p: LayoutPiece): Rect => rectFromCentre(p.position[0], p.position[1], p.footprintIn[0], p.footprintIn[1]);
const trenchCells = (layout: Layout) => layout.cells.filter((c) => c.kind === "trench").map((c) => ({ c: c.c, r: c.r, openings: c.openings! }));
const isFree = (p: LayoutPiece) => p.cells === null && p.role !== "revetment" && p.role !== "decor";
const onPlateau = (layout: Layout, p: LayoutPiece) => p.supportIds.some((id) => layout.pieces.find((x) => x.id === id)?.id.startsWith("s-"));

/** Free terrain pieces grouped into rulebook pieces: a group's members count as one. */
function units(layout: Layout): { id: string; rects: Rect[]; pieces: LayoutPiece[] }[] {
  const byUnit = new Map<string, LayoutPiece[]>();
  for (const p of layout.pieces.filter(isFree)) byUnit.set(p.groupId ?? p.id, [...(byUnit.get(p.groupId ?? p.id) ?? []), p]);
  return [...byUnit].map(([id, pieces]) => ({ id, pieces, rects: pieces.map(rectOf) }));
}

const raisedCells = (layout: Layout) => layout.cells.filter((c) => c.feature === "plateau" || c.feature === "ramp" || c.feature === "hill" || c.feature === "raised-trench");
const trenchRects = (layout: Layout) => layout.cells.filter((c) => c.kind === "trench" || c.feature === "raised-trench").map((c) => cellRect(grid, c.c, c.r));
const dist = (a: Rect[], b: Rect[]) => Math.min(...a.flatMap((x) => b.map((y) => rectDistance(x, y))));

/** The trench piece in a cell: the network piece, or the one dug into the plateau. */
function trenchPieceAt(layout: Layout, c: number, r: number): LayoutPiece | undefined {
  const cell = layout.cells.find((x) => x.c === c && x.r === r)!;
  const ids = cell.kind === "trench" ? [cell.pieceId] : cell.upperPieceIds;
  return ids.map((id) => layout.pieces.find((p) => p.id === id)!).find((p) => p.role.startsWith("trench"));
}

const SCENARIOS = ["claim-no-mans-land", "fields-of-glory"];
const LAYOUTS = new Map(SCENARIOS.map((id) => [id, SEEDS_100.map((seed) => gen(id, seed))]));

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

    it("runs a trench line of at least four cells wholly inside each deployment zone, joined to the network", () => {
      for (const layout of layouts) {
        const network = new Set(trenchCells(layout).map((c) => cellKey(c.c, c.r)));
        for (const zone of overlay.zones.filter((z) => z.isDeployment)) {
          const line = layout.trench.deploymentLines.find((l) => l.zoneLabel === zone.label);
          expect(line, `seed ${layout.seed} ${zone.label}`).toBeDefined();
          expect(line!.cells.length).toBeGreaterThanOrEqual(4);
          for (const [c, r] of line!.cells) {
            expect(network.has(cellKey(c, r))).toBe(true);
            const rect = cellRect(grid, c, r);
            for (const corner of [[rect.x0, rect.y0], [rect.x1, rect.y0], [rect.x0, rect.y1], [rect.x1, rect.y1]] as const) expect(pointInPolygon(corner, zone.polygon), `seed ${layout.seed} cell ${c},${r}`).toBe(true);
          }
        }
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
        const all = units(layout);
        for (let i = 0; i < all.length; i++) {
          for (let j = i + 1; j < all.length; j++) expect(dist(all[i]!.rects, all[j]!.rects), `seed ${layout.seed} ${all[i]!.id} vs ${all[j]!.id}`).toBeGreaterThanOrEqual(3 - 1e-9);
        }
        const raised = raisedCells(layout).map((c) => cellRect(grid, c.c, c.r));
        for (const u of all) {
          if (u.pieces.some((p) => onPlateau(layout, p))) continue;
          if (raised.length) expect(dist(u.rects, raised), `seed ${layout.seed} ${u.id}`).toBeGreaterThanOrEqual(3 - 1e-9);
        }
      }
    });

    it("keeps terrain pieces at least 1in from every trench, including one dug into the plateau", () => {
      for (const layout of layouts) {
        const trench = trenchRects(layout);
        for (const u of units(layout)) expect(dist(u.rects, trench), `seed ${layout.seed} ${u.id}`).toBeGreaterThanOrEqual(1 - 1e-9);
      }
    });

    it("keeps every footprint inside the board, free pieces 0.5in in from the edge", () => {
      const board: Rect = { x0: 0, y0: 0, x1: 36, y1: 36 };
      const inset: Rect = { x0: 0.5 - 1e-9, y0: 0.5 - 1e-9, x1: 35.5 + 1e-9, y1: 35.5 + 1e-9 };
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

    it("raises a plateau of 2-6 stacked cells on most boards, reachable by a ramp that climbs onto it from open ground", () => {
      const withPlateau = layouts.filter((l) => l.plateau);
      expect(withPlateau.length).toBeGreaterThanOrEqual(60);
      for (const layout of withPlateau) {
        const plateau = layout.plateau!;
        const inPlateau = (c: number, r: number) => plateau.cells.some(([x, y]) => x === c && y === r);
        expect(plateau.cells.length).toBeGreaterThanOrEqual(2);
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
    });

    it("builds hills from H4x4 blocks on the ground tiles, a stepped one with a second block on top", () => {
      for (const layout of layouts.filter((l) => l.hills.length)) {
        for (const hill of layout.hills) {
          for (const [c, r] of hill.cells) {
            const cell = layout.cells.find((x) => x.c === c && x.r === r)!;
            expect(cell.feature).toBe("hill");
            const blocks = cell.upperPieceIds.map((id) => layout.pieces.find((p) => p.id === id)!).filter((p) => p.paletteId === "h4x4");
            const stepped = hill.stepped.some(([x, y]) => x === c && y === r);
            expect(blocks.map((b) => b.baseIn)).toEqual(stepped ? [2.5, 4.6] : [2.5]);
            expect(cell.topIn).toBeCloseTo(stepped ? 6.7 : 4.6, 6);
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
        if (onPlateau(layout, cover[0]!)) raised++;
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
