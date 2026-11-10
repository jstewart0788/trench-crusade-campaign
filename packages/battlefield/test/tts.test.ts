import { describe, expect, it } from "vitest";
import { generateBattlefield, layoutToObjectStates, objectiveMarkers, OBJECTIVE_CONTROL_IN, OBJECTIVE_MARKER_IN, turnedRect, pieceById, pieceToObjectState, resolvePalette, rotatedFootprint, rotateOffset, TERRAIN_TAG, terrainName, terrainOf, terrainReminder, type Catalog, type Layout, type TtsObjectState } from "../src/index.js";
import { fixtureCatalog, fixtureEnv } from "./fixtures.js";

const env = fixtureEnv();
const catalog = fixtureCatalog();
const palette = env.palette;
const sense = palette.rotation.rotYSense;
const MAT_TOP = 0.95;
const boards: Layout[] = [1, 2, 7, 11, 23].map((seed) => generateBattlefield({ scenarioId: "claim-no-mans-land", archetype: "trench-lines", seed }, env));
const layout = boards.find((l) => l.plateaus.length && l.pieces.some((p) => p.groupId))!;
const statesOf = (l: Layout) => layoutToObjectStates(l, palette, catalog, { matTopY: MAT_TOP, matCenter: [0, 0] });
const states = statesOf(layout);
const urlToAsset = new Map(catalog.assets.map((a) => [a.urls.primary, a]));
/** The generator's ids, on the Description's last line: role, piece id, (palette id). */
const idsLine = (s: TtsObjectState) => s.Description.split("\n").at(-1)!;
const idsOf = (s: TtsObjectState) => idsLine(s).split(" ");
const byPiece = (states: TtsObjectState[]) => new Map(states.map((s) => [idsOf(s)[1]!, s]));

describe("layoutToObjectStates", () => {
  it("emits one locked, tagged object per piece with a known asset, quarter turns for cell-aligned pieces", () => {
    expect(states.length).toBe(layout.pieces.length);
    for (const s of states) {
      const url = s.CustomAssetbundle?.AssetbundleURL ?? s.CustomMesh?.MeshURL ?? s.CustomImage?.ImageURL;
      expect(url, s.Nickname).toBeDefined();
      expect(urlToAsset.has(url!), `${s.Nickname} url unknown`).toBe(true);
      // Cell-aligned pieces turn by quarters; free pieces stand at any yaw.
      const piece = layout.pieces.find((p) => p.id === idsOf(s)[1])!;
      if (piece.cells) expect([0, 90, 180, 270]).toContain(s.Transform.rotY);
      else expect(s.Transform.rotY >= 0 && s.Transform.rotY < 360).toBe(true);
      expect(s.Transform.rotX).toBe(0);
      expect(s.Transform.rotZ).toBe(0);
      expect(s.Locked).toBe(true);
      expect(s.Tags).toContain(`tc-battlefield:${layout.seed}`);
      expect(s.Tags).toContain(TERRAIN_TAG);
      expect(s.Tags.some((t) => t.startsWith("tc-role:"))).toBe(true);
      expect(["Custom_Assetbundle", "Custom_Model", "Custom_Token", "Custom_Tile", "Custom_Board"]).toContain(s.Name);
      expect(Number.isFinite(s.Transform.posX) && Number.isFinite(s.Transform.posY) && Number.isFinite(s.Transform.posZ)).toBe(true);
    }
    expect(states.some((s) => s.Tags.includes("tc-role:revetment"))).toBe(true);
  });

  it("names every object for the players from the palette's terrain rules, a tile stacked on another as a hill, with the rules on hover", () => {
    let hills = 0;
    for (const board of boards) {
      const pieces = new Map(board.pieces.map((p) => [p.id, p]));
      for (const s of statesOf(board)) {
        const piece = pieces.get(idsOf(s)[1]!)!;
        const terrain = terrainOf(pieceById(palette, piece.paletteId), piece.baseIn);
        expect(s.Nickname, piece.id).toBe(terrainName(terrain));
        expect(s.Description.split("\n")[0], piece.id).toBe(terrainReminder(terrain, palette));
        if (piece.role === "ground" && piece.baseIn > 0) {
          expect(s.Nickname, piece.id).toBe('Hill · 3" · Elevated · Climb');
          hills++;
        }
      }
    }
    expect(hills).toBeGreaterThan(0);
  });

  it("spawns in stack order: everything a piece rests on comes before it", () => {
    for (const board of boards) {
      const order = statesOf(board).map((s) => idsOf(s)[1]!);
      const index = new Map(order.map((id, i) => [id, i]));
      for (const p of board.pieces) for (const s of p.supportIds) expect(index.get(s)!, `${p.id} before ${s}`).toBeLessThan(index.get(p.id)!);
    }
  });

  it("puts every pivot at the mat top plus the height of what the piece rests on plus its own rest height", () => {
    for (const board of boards) {
      const byId = byPiece(statesOf(board));
      for (const p of board.pieces) {
        const entry = pieceById(palette, p.paletteId);
        expect(byId.get(p.id)!.Transform.posY, `seed ${board.seed} ${p.id}`).toBeCloseTo(MAT_TOP + p.baseIn + entry.restHeightIn, 3);
      }
    }
    const byId = byPiece(states);
    const stacked = layout.pieces.find((p) => p.id.startsWith("s-"))!;
    expect(byId.get(stacked.id)!.Transform.posY).toBeCloseTo(MAT_TOP + 2.5 + 1.0, 3);
    const ramp = layout.pieces.find((p) => p.role === "ramp")!;
    expect(byId.get(ramp.id)!.Transform.posY).toBeCloseTo(MAT_TOP + 2.5 + 1.28, 3);
    const trench = layout.pieces.find((p) => p.role.startsWith("trench-"))!;
    expect(byId.get(trench.id)!.Transform.posY).toBeCloseTo(MAT_TOP + 1.5, 3);
    const fence = layout.pieces.find((p) => p.role === "revetment" && p.baseIn < 1)!;
    expect(byId.get(fence.id)!.Transform.posY).toBeCloseTo(MAT_TOP + 0.2 + 1.2, 3);
  });

  it("keeps every object's visual footprint inside the board in world space", () => {
    for (const board of boards) {
      const byId = byPiece(statesOf(board));
      for (const p of board.pieces) {
        const entry = pieceById(palette, p.paletteId);
        const s = byId.get(p.id)!;
        const [ox, oz] = rotateOffset(entry.pivotOffsetIn, p.rotY, sense);
        const [w, d] = rotatedFootprint(entry, p.rotY);
        const cx = s.Transform.posX + ox;
        const cz = s.Transform.posZ + oz;
        const slack = p.cells ? 0.05 : 0;
        expect(cx - w / 2, `seed ${board.seed} ${p.id}`).toBeGreaterThanOrEqual(-18 - slack - 1e-6);
        expect(cx + w / 2, `seed ${board.seed} ${p.id}`).toBeLessThanOrEqual(18 + slack + 1e-6);
        expect(cz - d / 2, `seed ${board.seed} ${p.id}`).toBeGreaterThanOrEqual(-18 - slack - 1e-6);
        expect(cz + d / 2, `seed ${board.seed} ${p.id}`).toBeLessThanOrEqual(18 + slack + 1e-6);
      }
    }
  });

  it("stands a log fence 1.35in in from the cell centre against the wall it lines, turned to face the channel", () => {
    const byId = byPiece(states);
    const inset = palette.revetment.insetIn;
    const rotFor = { W: 0, N: 90, E: 180, S: 270 } as const;
    let checked = 0;
    for (const fence of layout.pieces.filter((p) => p.role === "revetment")) {
      const side = fence.id.split("-").pop() as keyof typeof rotFor;
      const [, c, r] = fence.id.split("-").map(Number);
      const [cx, cy] = [c! * 4 + 2, r! * 4 + 2];
      const delta = { N: [0, 1], E: [1, 0], S: [0, -1], W: [-1, 0] }[side];
      expect(fence.position[0]).toBeCloseTo(cx + delta[0]! * inset, 6);
      expect(fence.position[1]).toBeCloseTo(cy + delta[1]! * inset, 6);
      expect(fence.rotY).toBe(rotFor[side]);
      const s = byId.get(fence.id)!;
      const [ox, oz] = rotateOffset(pieceById(palette, "log-fence").pivotOffsetIn, fence.rotY, sense);
      expect(s.Transform.posX + ox).toBeCloseTo(fence.position[0] - 18, 3);
      expect(s.Transform.posZ + oz).toBeCloseTo(fence.position[1] - 18, 3);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("converts board inches to world units about the mat centre and corrects for off-centre pivots", () => {
    const byId = byPiece(states);
    // Measured live (2026-11-04): a Landscape 1x2 at rotY 90 has its bounds centre 2in toward -x of its
    // pivot, so the pivot must sit 2in toward +x of the footprint centre for the tile to cover its cells.
    const along = boards.flatMap((b) => b.pieces).find((p) => p.paletteId === "landscape-1x2" && p.rotY === 90)!;
    const board = boards.find((b) => b.pieces.includes(along))!;
    const s = byPiece(statesOf(board)).get(along.id)!;
    const entry = pieceById(palette, along.paletteId);
    const [ox, oz] = rotateOffset(entry.pivotOffsetIn, along.rotY, sense);
    expect([ox, oz].map((v) => Math.round(v) + 0)).toEqual([-2, 0]);
    expect(s.Transform.posX + ox).toBeCloseTo(along.position[0] - 18, 3);
    expect(s.Transform.posZ + oz).toBeCloseTo(along.position[1] - 18, 3);
    const tile = layout.pieces.find((p) => p.paletteId === "landscape-1x1")!;
    const shifted = byPiece(layoutToObjectStates(layout, palette, catalog, { matTopY: 2, matCenter: [10, -5] }));
    expect(shifted.get(tile.id)!.Transform.posX).toBeCloseTo(byId.get(tile.id)!.Transform.posX + 10, 6);
    expect(shifted.get(tile.id)!.Transform.posZ).toBeCloseTo(byId.get(tile.id)!.Transform.posZ - 5, 6);
    expect(shifted.get(tile.id)!.Transform.posY).toBeCloseTo(2 + 1.0, 6);
  });

  it("spawns each asset as its source saves do: material, type and collider from the catalog, TTS's defaults where it has none", () => {
    const emitter = (cat: Catalog) => {
      const resolved = resolvePalette(palette, cat);
      const template = layout.pieces.find((p) => p.cells === null)!;
      return (paletteId: string) => pieceToObjectState({ ...template, paletteId, assetId: resolved.byId.get(paletteId)!.assetId }, layout, resolved, { matTopY: MAT_TOP, matCenter: [0, 0] });
    };
    const emit = emitter(catalog);
    // As the reference saves spawn them: sandbags and crate heaps cardboard, the heap colliding on its own mesh; a ruined building wood, typed a figurine.
    expect(emit("sandbags-corner").CustomMesh).toMatchObject({ MaterialIndex: 3, TypeIndex: 0, Convex: true });
    expect(emit("crates-group").CustomMesh).toMatchObject({ MaterialIndex: 3, TypeIndex: 0, Convex: false });
    expect(emit("ruins-medium-b").CustomAssetbundle).toMatchObject({ MaterialIndex: 1, TypeIndex: 1 });
    const resolved = resolvePalette(palette, catalog);
    let models = 0;
    for (const board of boards) {
      for (const s of statesOf(board)) {
        const spawn = resolved.byId.get(/\(([^)]+)\)/.exec(idsLine(s))![1]!)!.asset.spawn!;
        expect(spawn, s.Description).toBeDefined();
        const block = s.CustomAssetbundle ?? s.CustomMesh!;
        expect([block.MaterialIndex, block.TypeIndex], s.Description).toEqual([spawn.materialIndex, spawn.typeIndex]);
        if (s.CustomMesh) {
          models++;
          expect(s.CustomMesh.Convex, s.Description).toBe(spawn.convex);
        }
      }
    }
    expect(models).toBeGreaterThan(0);
    const bare = emitter({ ...catalog, assets: catalog.assets.map(({ spawn: _spawn, ...a }) => a) });
    expect(bare("crates-group").CustomMesh).toMatchObject({ MaterialIndex: 0, TypeIndex: 0, Convex: true });
    expect(bare("ruins-medium-b").CustomAssetbundle).toMatchObject({ MaterialIndex: 0, TypeIndex: 0 });
  });
});

describe("objectiveMarkers", () => {
  const withObjectives = boards.filter((l) => l.objectives.length);
  it("gives every scenario objective one marker on the board, in the same world frame as the terrain", () => {
    expect(withObjectives.length).toBeGreaterThan(0);
    for (const l of withObjectives) {
      const markers = objectiveMarkers(l, palette, catalog, { matTopY: MAT_TOP, matCenter: [0, 0] });
      expect(markers.map((m) => m.id)).toEqual(l.objectives.map((o) => o.id));
      for (const [i, m] of markers.entries()) {
        const o = l.objectives[i]!;
        expect(m.posX).toBeCloseTo(o.position[0] - l.boardIn / 2, 3);
        expect(m.posZ).toBeCloseTo(o.position[1] - l.boardIn / 2, 3);
        expect(Math.abs(m.posX) <= l.boardIn / 2 && Math.abs(m.posZ) <= l.boardIn / 2).toBe(true);
      }
      const shifted = objectiveMarkers(l, palette, catalog, { matTopY: MAT_TOP, matCenter: [5, -3] });
      expect(shifted[0]!.posX - markers[0]!.posX).toBeCloseTo(5, 3);
      expect(shifted[0]!.posZ - markers[0]!.posZ).toBeCloseTo(-3, 3);
    }
  });

  it("rings an open objective 1in beyond its 40mm marker and a covered one 1in beyond every corner of its piece", () => {
    let covered = 0;
    for (const l of withObjectives) {
      const resolved = resolvePalette(palette, catalog);
      for (const [i, m] of objectiveMarkers(l, palette, catalog).entries()) {
        const o = l.objectives[i]!;
        if (!o.coverPieceId) {
          expect(m.ringIn).toBeCloseTo(OBJECTIVE_MARKER_IN / 2 + OBJECTIVE_CONTROL_IN, 3);
          expect(m.band).toEqual([]);
          continue;
        }
        covered++;
        const piece = l.pieces.find((p) => p.id === o.coverPieceId)!;
        const r = turnedRect(piece.position[0], piece.position[1], resolved.byId.get(piece.paletteId)!, piece.rotY, sense);
        const corners = r.poly ?? [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]];
        const far = Math.max(...corners.map(([x, y]) => Math.hypot(x - o.position[0], y - o.position[1])));
        expect(m.ringIn).toBeGreaterThanOrEqual(far + OBJECTIVE_CONTROL_IN - 0.001);
        expect(m.ringIn).toBeLessThanOrEqual(far + OBJECTIVE_CONTROL_IN + 0.001);
        expect(m.ringIn).toBeGreaterThan(OBJECTIVE_MARKER_IN / 2 + OBJECTIVE_CONTROL_IN);
        // The band is the piece grown by exactly 1in: every point 1in from the footprint, closed.
        expect(m.band.length).toBeGreaterThan(8);
        expect(m.band[0]).toEqual(m.band.at(-1));
        const world = corners.map(([x, y]) => [x - l.boardIn / 2, y - l.boardIn / 2] as [number, number]);
        for (const [bx, bz] of m.band) {
          const d = Math.min(...world.map((c, k) => segmentDistance([bx, bz], c, world[(k + 1) % world.length]!)));
          expect(d).toBeCloseTo(OBJECTIVE_CONTROL_IN, 2);
        }
      }
    }
    expect(covered).toBeGreaterThan(0);
  });

  it("gives a covered objective the surface its piece stands on, a hill top where the piece is on a hill", () => {
    const resolved = resolvePalette(palette, catalog);
    // The top of every piece others stand on under the objective point: the ground tile, or the tile stacked on it as a hill.
    const groundTop = (l: Layout, x: number, y: number): number =>
      Math.max(...l.pieces.filter((p) => resolved.byId.get(p.paletteId)!.topIn !== undefined && p.role === "ground").filter((p) => {
        const r = turnedRect(p.position[0], p.position[1], resolved.byId.get(p.paletteId)!, p.rotY, sense);
        return x >= r.x0 - 1e-9 && x <= r.x1 + 1e-9 && y >= r.y0 - 1e-9 && y <= r.y1 + 1e-9;
      }).map((p) => p.baseIn + resolved.byId.get(p.paletteId)!.topIn!));
    let flat = 0;
    let raised = 0;
    let open = 0;
    const own = [1, 2, 3, 4, 5, 25].map((seed) => generateBattlefield({ scenarioId: "claim-no-mans-land", seed }, env));
    const openBoards = [1, 2].map((seed) => generateBattlefield({ scenarioId: "from-below", seed }, env));
    for (const l of [...withObjectives, ...own, ...openBoards]) {
      for (const [i, m] of objectiveMarkers(l, palette, catalog, { matTopY: MAT_TOP, matCenter: [0, 0] }).entries()) {
        const o = l.objectives[i]!;
        if (!o.coverPieceId) {
          expect(m).not.toHaveProperty("surfaceY");
          open++;
          continue;
        }
        const piece = l.pieces.find((p) => p.id === o.coverPieceId)!;
        expect(m.surfaceY).toBeCloseTo(MAT_TOP + piece.baseIn, 3);
        const under = groundTop(l, o.position[0], o.position[1]);
        expect(piece.baseIn).toBeGreaterThanOrEqual(under - 0.001);
        expect(piece.baseIn).toBeLessThanOrEqual(under + 0.1);
        if (under > 3) raised++;
        else flat++;
      }
    }
    expect(flat).toBeGreaterThan(0);
    expect(raised).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(0);
  });
});

function segmentDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
