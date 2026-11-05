import { describe, expect, it } from "vitest";
import { cellAt, cellCentre, cellRect, createGrid, Mask, pointInPolygon, rectArea, rectContains, rectDistance, rectOverlapArea, rectPointDistance, rectsOverlap, rectsWithin, rotateDir, turnedRect } from "../src/index.js";

describe("grid", () => {
  const grid = createGrid(36, 4);

  it("is 9x9 for a 36in board of 4in cells and rejects boards that do not divide", () => {
    expect(grid.cols).toBe(9);
    expect(grid.rows).toBe(9);
    expect(() => createGrid(30, 4)).toThrow(/whole number/);
  });

  it("maps board points to cells with the far edge in the last cell", () => {
    expect(cellAt(grid, 12, 30)).toEqual({ c: 3, r: 7 });
    expect(cellAt(grid, 18, 18)).toEqual({ c: 4, r: 4 });
    expect(cellAt(grid, 36, 36)).toEqual({ c: 8, r: 8 });
    expect(cellAt(grid, -1, 0)).toBeNull();
    expect(cellCentre(grid, 0, 0)).toEqual([2, 2]);
    expect(cellRect(grid, 8, 0)).toEqual({ x0: 32, y0: 0, x1: 36, y1: 4 });
  });

  it("rotates sides clockwise from above", () => {
    expect(rotateDir("N", 1)).toBe("E");
    expect(rotateDir("E", 1)).toBe("S");
    expect(rotateDir("N", -1)).toBe("W");
    expect(rotateDir("W", 2)).toBe("E");
  });

  it("treats the polygon boundary as inside, so a 6in strip covers the cells whose centres sit on x=6", () => {
    const strip: [number, number][] = [
      [0, 0],
      [6, 0],
      [6, 36],
      [0, 36],
    ];
    expect(pointInPolygon([2, 2], strip)).toBe(true);
    expect(pointInPolygon([6, 18], strip)).toBe(true);
    expect(pointInPolygon([10, 18], strip)).toBe(false);
    const mask = Mask.fromPolygon(grid, strip);
    expect(mask.count()).toBe(18);
    expect(mask.get(0, 4)).toBe(true);
    expect(mask.get(1, 4)).toBe(true);
    expect(mask.get(2, 4)).toBe(false);
  });

  it("builds objective masks from points", () => {
    const mask = Mask.fromPoints(grid, [
      [12, 30],
      [18, 18],
    ]);
    expect(mask.cells()).toEqual([
      { c: 4, r: 4 },
      { c: 3, r: 7 },
    ]);
  });

  it("measures the gap between rectangles", () => {
    const a = { x0: 0, y0: 0, x1: 4, y1: 4 };
    expect(rectDistance(a, { x0: 4, y0: 0, x1: 8, y1: 4 })).toBe(0);
    expect(rectDistance(a, { x0: 7, y0: 0, x1: 8, y1: 4 })).toBe(3);
    expect(rectDistance(a, { x0: 7, y0: 8, x1: 8, y1: 9 })).toBe(5);
    expect(rectDistance(a, { x0: 1, y0: 1, x1: 2, y1: 2 })).toBe(0);
  });

  it("measures a box turned off the axes by its outline, not by the bounds round it", () => {
    // A 4x1 plank turned 45 degrees clockwise lies from north-west to south-east; its bounds fill the north-east corner it never reaches.
    const plank = turnedRect(0, 0, { footprintIn: [4, 1] }, 45, "cw");
    const corner = { x0: 1, y0: 1, x1: 1.5, y1: 1.5 };
    expect(rectDistance({ x0: plank.x0, y0: plank.y0, x1: plank.x1, y1: plank.y1 }, corner)).toBe(0);
    expect(rectDistance(plank, corner)).toBeCloseTo(Math.SQRT2 - 0.5, 6);
    expect(rectsOverlap(plank, corner)).toBe(false);
    expect(rectsWithin(plank, corner, 1)).toBe(true);
    expect(rectsWithin(plank, corner, 0.9)).toBe(false);
    expect(rectPointDistance(plank, 1, 1)).toBeCloseTo(Math.SQRT2 - 0.5, 6);
    expect(rectContains(plank, 1, 1)).toBe(false);
    expect(rectContains(plank, 1, -1)).toBe(true);
    expect(rectArea(plank)).toBeCloseTo(4, 6);
    expect(rectOverlapArea(plank, plank)).toBeCloseTo(4, 6);
    // Its south-east half, less the two corners of it the axes cut off at the middle.
    expect(rectOverlapArea(plank, { x0: 0, y0: -2, x1: 2, y1: 0 })).toBeCloseTo(1.75, 6);
    // Turned the other way it crosses that corner.
    expect(rectDistance(turnedRect(0, 0, { footprintIn: [4, 1] }, 45, "ccw"), corner)).toBe(0);
    // On a quarter turn the bounds are the box.
    expect(turnedRect(0, 0, { footprintIn: [4, 1] }, 90, "cw")).toEqual({ x0: -0.5, y0: -2, x1: 0.5, y1: 2 });
  });
});
