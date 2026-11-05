import { describe, expect, it } from "vitest";
import { decoratedSides, loadPalette, parsePalette, placeablesIn, piecesByRole, STRUCTURAL_ROLES, resolvePalette, rotateOffset, rotateOpenings, rotYForOpenings, rotYTurning, type Palette } from "../src/index.js";
import { fixtureCatalog, ROOT } from "./fixtures.js";

const palette = loadPalette(ROOT);

const piece = (id: string) => {
  const p = palette.pieces.find((x) => x.id === id);
  if (!p) throw new Error(`no palette piece ${id}`);
  return p;
};

const clone = (): { pieces: Record<string, unknown>[]; [k: string]: unknown } => JSON.parse(JSON.stringify(palette));

describe("palette", () => {
  it("loads, resolves every piece against the catalog and keeps the live-measured heights", () => {
    const resolved = resolvePalette(palette, fixtureCatalog());
    expect(resolved.pieces.length).toBe(palette.pieces.length);
    for (const p of resolved.pieces) expect(p.asset.id).toBe(p.assetId);
    expect(piece("trench-corner").restHeightIn).toBe(1.5);
    expect(piece("landscape-1x1").topIn).toBe(2.5);
    expect(piece("h4x4").topIn).toBe(2.1);
    expect(piece("hill-ramp").restHeightIn).toBe(1.28);
    expect(piece("trench-straight-plain").channelFloorIn).toBe(0.5);
    expect(piece("ruins-corner").heightIn).toBeGreaterThan(4);
  });

  it("has an enabled straight, corner and T, and no Entrance while its opening side is unconfirmed", () => {
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

  it("rejects a trench piece whose opening count does not match its role, or a lined wall that is an opening", () => {
    const raw = clone();
    raw.pieces.find((p) => p.id === "trench-corner")!.openings = { rotY0: ["N"], verified: true };
    expect(() => parsePalette(raw)).toThrow(/trench-corner has 1 openings, expected 2/);
    const raw2 = clone();
    (raw2.pieces.find((p) => p.id === "trench-straight-ledge")!.decoratedWalls as { rotY0: string[] }).rotY0 = ["N"];
    expect(() => parsePalette(raw2)).toThrow(/decorated wall cannot be an opening/);
  });

  it("rejects a role outside the list, a ground piece without cells, a ramp without an uphill side and a missing revetment piece", () => {
    const raw = clone();
    raw.pieces[0]!.role = "swamp";
    expect(() => parsePalette(raw)).toThrow(/role/);
    const raw2 = clone();
    raw2.pieces.find((p) => p.id === "landscape-1x1")!.cells = null;
    expect(() => parsePalette(raw2)).toThrow(/need cells/);
    const raw3 = clone();
    delete raw3.pieces.find((p) => p.id === "hill-ramp")!.uphill;
    expect(() => parsePalette(raw3)).toThrow(/uphill/);
    const raw4 = clone();
    (raw4.revetment as { pieceId: string }).pieceId = "nope";
    expect(() => parsePalette(raw4)).toThrow(/revetment piece nope/);
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

  it("turns lined walls with the piece and treats an assumed table as bare", () => {
    expect(decoratedSides(piece("trench-straight-ledge"), 0, "cw")).toEqual(["W"]);
    expect(decoratedSides(piece("trench-straight-ledge"), 180, "cw")).toEqual(["E"]);
    expect(decoratedSides(piece("trench-t"), 90, "cw")).toEqual(["S"]);
    expect(piece("trench-straight-logs").decoratedWalls?.source).toBe("assumed");
    expect(decoratedSides(piece("trench-straight-logs"), 0, "cw")).toEqual([]);
    expect(decoratedSides(piece("trench-corner"), 0, "cw")).toEqual([]);
  });

  it("turns the log fence from the -x wall it lines at rotY 0 onto any wall", () => {
    expect(rotYTurning("W", "W", "cw")).toBe(0);
    expect(rotYTurning("W", "N", "cw")).toBe(90);
    expect(rotYTurning("W", "E", "cw")).toBe(180);
    expect(rotYTurning("W", "S", "cw")).toBe(270);
    expect(rotYTurning(piece("hill-ramp").uphill!.rotY0, "N", "cw")).toBe(270);
  });

  it("rotates pivot offsets with the same convention", () => {
    expect(rotateOffset([0, 2], 90, "cw")).toEqual([2, 0]);
    expect(rotateOffset([0, 2], 180, "cw")).toEqual([0, -2]);
    expect(rotateOffset([0, 2], 90, "ccw")).toEqual([-2, 0]);
    expect(rotateOffset([2, 2], 0, "cw")).toEqual([2, 2]);
    // Between quarter turns it turns the same way (checked live on Ruins Large A at 30 and 330).
    const at = (v: [number, number]) => v.map((x) => +x.toFixed(3));
    expect(at(rotateOffset([0, 2], 30, "cw"))).toEqual([1, 1.732]);
    expect(at(rotateOffset([0, 2], 89.999, "cw"))).toEqual([2, 0]);
    expect(at(rotateOffset([0, 2], 30, "ccw"))).toEqual([-1, 1.732]);
  });

  it("builds a group's footprint from its members and centres them on it", () => {
    const wire = placeablesIn(palette, "wire-line").find((p) => p.key === "wire-line")!;
    const segment = piece("difficult-dangerous").footprintIn;
    expect(wire.members).toHaveLength(3);
    expect(wire.footprintIn[0]).toBeCloseTo(2 * 2.3 + segment[0], 6);
    expect(wire.footprintIn[1]).toBeCloseTo(segment[1], 6);
    expect(wire.members.map((m) => m.at[0])).toEqual([-2.3, 0, 2.3]);
    const barrels = placeablesIn(palette, "scatter-barrel");
    expect(barrels.every((p) => p.members.length === 1 && p.scatter && p.role === "scatter")).toBe(true);
    expect(barrels.some((p) => p.key === "barrel")).toBe(true);
  });

  it("gives every placeable piece and group one category and aesthetic tags from the palette's own lists", () => {
    const looks = new Set([...palette.aesthetics, "any"]);
    for (const p of palette.pieces.filter((x) => x.enabled && !STRUCTURAL_ROLES.includes(x.role))) {
      expect(palette.categories[p.category ?? ""], p.id).toBeDefined();
      expect(p.aesthetics?.length, p.id).toBeGreaterThan(0);
      for (const a of p.aesthetics!) expect(looks.has(a), `${p.id} ${a}`).toBe(true);
      expect(p.role === "scatter", p.id).toBe(palette.categories[p.category!]!.scatter);
    }
    for (const g of palette.groups) expect(palette.categories[g.category], g.id).toBeDefined();
    for (const [id, c] of Object.entries(palette.categories)) {
      expect(c.scatter, id).toBe(c.type === "scattered-terrain");
      expect(palette.pieces.some((p) => p.enabled && p.category === id) || palette.groups.some((g) => g.category === id), `${id} is empty`).toBe(true);
    }
    expect(palette.aesthetics).toEqual(["urban-ruin", "field-fortification", "industrial", "ecclesiastic"]);
  });

  it("rejects a placeable piece without a category, and a category or aesthetic the palette does not list", () => {
    const raw = JSON.parse(JSON.stringify(palette)) as Palette;
    const statue = raw.pieces.find((p) => p.id === "statue")!;
    delete statue.category;
    expect(() => parsePalette(raw)).toThrow(/category/);
    statue.category = "no-such-category";
    expect(() => parsePalette(raw)).toThrow(/category/);
    statue.category = "landmark";
    statue.aesthetics = ["baroque"];
    expect(() => parsePalette(raw)).toThrow(/aesthetic/);
  });
});
