import { rotateOffset } from "../src/tts.js";
import { describe, expect, it } from "vitest";
import { generateBattlefield, layoutToObjectStates, TERRAIN_TAG } from "../src/index.js";
import { fixtureCatalog, fixtureEnv } from "./fixtures.js";

const env = fixtureEnv();
const catalog = fixtureCatalog();
const layout = generateBattlefield({ scenarioId: "claim-no-mans-land", archetype: "trench-lines", seed: 7 }, env);
const states = layoutToObjectStates(layout, env.palette, catalog, { matTopY: 0.95, matCenter: [0, 0] });
const urlToAsset = new Map(catalog.assets.map((a) => [a.urls.primary, a]));

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
      expect(s.Tags).toContain("tc-battlefield:7");
      expect(s.Tags).toContain(TERRAIN_TAG);
      expect(s.Tags.some((t) => t.startsWith("tc-role:"))).toBe(true);
      expect(["Custom_Assetbundle", "Custom_Model", "Custom_Token", "Custom_Tile", "Custom_Board"]).toContain(s.Name);
      expect(Number.isFinite(s.Transform.posX) && Number.isFinite(s.Transform.posY) && Number.isFinite(s.Transform.posZ)).toBe(true);
    }
  });

  it("spawns ground-layer pieces before surface pieces", () => {
    const firstSurface = states.findIndex((s) => s.Tags.some((t) => ["tc-role:ruin", "tc-role:landmark", "tc-role:wire", "tc-role:dangerous", "tc-role:difficult"].includes(t)));
    const lastGround = states.map((s) => s.Tags.includes("tc-role:ground")).lastIndexOf(true);
    expect(lastGround).toBeLessThan(firstSurface);
  });

  it("stands trench pieces and ground tiles on the mat and dressing on the tile tops", () => {
    const byId = new Map(states.map((s) => [s.Description.split(" ")[1], s]));
    const trench = layout.pieces.find((p) => p.role === "trench-corner")!;
    expect(byId.get(trench.id)!.Transform.posY).toBeCloseTo(0.95 + 1.5, 3);
    const tile = layout.pieces.find((p) => p.paletteId === "landscape-1x1")!;
    expect(byId.get(tile.id)!.Transform.posY).toBeCloseTo(0.95 + 1.0, 3);
    const cover = layout.pieces.find((p) => p.objectiveId === "obj-1")!;
    const entry = env.palette.pieces.find((p) => p.id === cover.paletteId)!;
    expect(byId.get(cover.id)!.Transform.posY).toBeCloseTo(0.95 + 2.5 + entry.restHeightIn, 3);
  });

  it("converts board inches to world units about the mat centre and corrects for off-centre pivots", () => {
    const byId = new Map(states.map((s) => [s.Description.split(" ")[1], s]));
    const cover = layout.pieces.find((p) => p.objectiveId === "obj-3")!;
    expect(cover.position).toEqual([18, 18]);
    expect(byId.get(cover.id)!.Transform.posX).toBe(0);
    expect(byId.get(cover.id)!.Transform.posZ).toBe(0);
    const along = layout.pieces.find((p) => p.paletteId === "landscape-1x2" && p.rotY === 90)!;
    // Measured live (2026-11-04): a Landscape 1x2 at rotY 90 has its bounds centre 2in toward -x of its
    // pivot, so the pivot must sit 2in toward +x of the footprint centre for the tile to cover its cells.
    const entry = env.palette.pieces.find((p) => p.id === along.paletteId)!;
    const [ox, oz] = rotateOffset(entry.pivotOffsetIn, along.rotY, env.palette.rotation.rotYSense);
    expect([ox, oz].map((v) => Math.round(v) + 0)).toEqual([-2, 0]);
    expect(byId.get(along.id)!.Transform.posX + ox).toBeCloseTo(along.position[0] - 18, 3);
    expect(byId.get(along.id)!.Transform.posZ + oz).toBeCloseTo(along.position[1] - 18, 3);
    const shifted = layoutToObjectStates(layout, env.palette, catalog, { matTopY: 2, matCenter: [10, -5] });
    expect(shifted.find((s) => s.Description.includes(cover.id))!.Transform).toMatchObject({ posX: 10, posZ: -5 });
  });
});
