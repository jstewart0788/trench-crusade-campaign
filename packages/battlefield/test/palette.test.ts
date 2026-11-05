import { describe, expect, it } from "vitest";
import { loadPalette, parsePalette, piecesByRole, resolvePalette, rotateOffset, rotateOpenings, rotYForOpenings, type Palette } from "../src/index.js";
import { fixtureCatalog, ROOT } from "./fixtures.js";

const palette = loadPalette(ROOT);

const piece = (id: string) => {
  const p = palette.pieces.find((x) => x.id === id);
  if (!p) throw new Error(`no palette piece ${id}`);
  return p;
};

describe("palette", () => {
  it("loads, resolves every piece against the catalog and keeps the measured trench rest height", () => {
    const resolved = resolvePalette(palette, fixtureCatalog());
    expect(resolved.pieces.length).toBe(palette.pieces.length);
    for (const p of resolved.pieces) expect(p.asset.id).toBe(p.assetId);
    expect(piece("trench-corner").restHeightIn).toBe(1.5);
    expect(piece("landscape-1x1").cells).toEqual([1, 1]);
    expect(palette.groundTopIn).toBe(2.5);
  });

  it("has an enabled straight, corner and T so the network can always be resolved, and no Entrance in v1", () => {
    expect(piecesByRole(palette, "trench-straight").length).toBeGreaterThan(0);
    expect(piecesByRole(palette, "trench-corner").length).toBe(1);
    expect(piecesByRole(palette, "trench-t").length).toBe(1);
    expect(piecesByRole(palette, "trench-entrance").length).toBe(0);
    expect(piece("trench-entrance").openings?.verified).toBe(false);
  });

  it("rejects an unknown catalog asset", () => {
    const broken: Palette = { ...palette, pieces: palette.pieces.map((p) => (p.id === "statue" ? { ...p, assetId: "ffffffffffff" } : p)) };
    expect(() => resolvePalette(broken, fixtureCatalog())).toThrow(/unknown catalog asset/);
  });

  it("rejects a trench piece whose opening count does not match its role", () => {
    const raw = JSON.parse(JSON.stringify(palette)) as { pieces: { id: string; openings?: { rotY0: string[]; verified: boolean } }[] };
    raw.pieces.find((p) => p.id === "trench-corner")!.openings = { rotY0: ["N"], verified: true };
    expect(() => parsePalette(raw)).toThrow(/trench-corner has 1 openings, expected 2/);
  });

  it("rejects a role outside the list and a ground piece without cells", () => {
    const raw = JSON.parse(JSON.stringify(palette)) as { pieces: { id: string; role: string; cells: unknown }[] };
    raw.pieces[0]!.role = "swamp";
    expect(() => parsePalette(raw)).toThrow(/role/);
    const raw2 = JSON.parse(JSON.stringify(palette)) as { pieces: { id: string; cells: unknown }[] };
    raw2.pieces.find((p) => p.id === "landscape-1x1")!.cells = null;
    expect(() => parsePalette(raw2)).toThrow(/need cells/);
  });

  // The verified rotY-0 sides (2026-11-04 capture): Corner opens -z/+x, T
  // opens +z/-z/-x. Positive rotY turns clockwise from above, +z toward +x.
  it("turns the Corner's openings clockwise: 90 takes +x to -z and -z to -x", () => {
    const corner = piece("trench-corner");
    expect(corner.openings!.rotY0).toEqual(["S", "E"]);
    expect(rotateOpenings(corner.openings!.rotY0, 90, "cw")).toEqual(["S", "W"]);
    expect(rotateOpenings(corner.openings!.rotY0, 180, "cw")).toEqual(["N", "W"]);
    expect(rotateOpenings(corner.openings!.rotY0, 270, "cw")).toEqual(["N", "E"]);
    expect(rotateOpenings(corner.openings!.rotY0, 90, "ccw")).toEqual(["N", "E"]);
  });

  it("turns the T consistently with the Corner", () => {
    const tee = piece("trench-t");
    expect(tee.openings!.rotY0).toEqual(["N", "S", "W"]);
    expect(rotateOpenings(tee.openings!.rotY0, 90, "cw")).toEqual(["N", "E", "W"]);
  });

  it("finds the rotation that produces a required opening set, smallest first", () => {
    expect(rotYForOpenings(piece("trench-straight-ledge"), ["N", "S"], "cw")).toBe(0);
    expect(rotYForOpenings(piece("trench-straight-ledge"), ["E", "W"], "cw")).toBe(90);
    expect(rotYForOpenings(piece("trench-corner"), ["N", "E"], "cw")).toBe(270);
    expect(rotYForOpenings(piece("trench-corner"), ["N", "E"], "ccw")).toBe(90);
    expect(rotYForOpenings(piece("trench-t"), ["E", "S", "W"], "cw")).toBe(270);
    expect(rotYForOpenings(piece("trench-t"), ["N", "E", "S", "W"], "cw")).toBeNull();
  });

  it("rotates pivot offsets with the same convention", () => {
    expect(rotateOffset([0, 2], 90, "cw")).toEqual([2, 0]);
    expect(rotateOffset([0, 2], 180, "cw")).toEqual([0, -2]);
    expect(rotateOffset([0, 2], 90, "ccw")).toEqual([-2, 0]);
    expect(rotateOffset([2, 2], 0, "cw")).toEqual([2, 2]);
  });
});
