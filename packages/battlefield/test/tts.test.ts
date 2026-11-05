import { describe, expect, it } from "vitest";
import { generateBattlefield, layoutToObjectStates, pieceById, rotatedFootprint, rotateOffset, TERRAIN_TAG, type Layout, type TtsObjectState } from "../src/index.js";
import { fixtureCatalog, fixtureEnv } from "./fixtures.js";

const env = fixtureEnv();
const catalog = fixtureCatalog();
const palette = env.palette;
const sense = palette.rotation.rotYSense;
const MAT_TOP = 0.95;
const boards: Layout[] = [1, 2, 7, 11, 23].map((seed) => generateBattlefield({ scenarioId: "claim-no-mans-land", archetype: "trench-lines", seed }, env));
const layout = boards.find((l) => l.plateau)!;
const statesOf = (l: Layout) => layoutToObjectStates(l, palette, catalog, { matTopY: MAT_TOP, matCenter: [0, 0] });
const states = statesOf(layout);
const urlToAsset = new Map(catalog.assets.map((a) => [a.urls.primary, a]));
const byPiece = (states: TtsObjectState[]) => new Map(states.map((s) => [s.Description.split(" ")[1]!, s]));

describe("layoutToObjectStates", () => {
  it("emits one locked, tagged object per piece with a known asset and a quarter-turn rotation", () => {
    expect(states.length).toBe(layout.pieces.length);
    for (const s of states) {
      const url = s.CustomAssetbundle?.AssetbundleURL ?? s.CustomMesh?.MeshURL ?? s.CustomImage?.ImageURL;
      expect(url, s.Nickname).toBeDefined();
      expect(urlToAsset.has(url!), `${s.Nickname} url unknown`).toBe(true);
      expect([0, 90, 180, 270]).toContain(s.Transform.rotY);
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

  it("spawns in stack order: everything a piece rests on comes before it", () => {
    for (const board of boards) {
      const order = statesOf(board).map((s) => s.Description.split(" ")[1]!);
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
    const trench = layout.pieces.find((p) => p.role === "trench-corner")!;
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
});
