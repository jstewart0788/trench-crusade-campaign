import type { Layout } from "./layout.js";
import { STRUCTURAL_ROLES, turnedRect, type Palette } from "./palette.js";
import { sideOf, type Parity } from "./parity.js";

// What makes a board look generated (Jonathan, Claim seed 25 live): standing
// pieces lined up, whatever they are. A unit is one thing on the table: a piece,
// a group (a wire line, a crate stack) or a heap of scatter, at the centre of
// its bounds. Tiles (ground, trench, hill, ramp, crater tiles) are the grid.

/** How close to a line three units may stand: the middle one within `band` of the line through the outer two, each within `step` of the next. */
export interface LineMeasure {
  band: number;
  step: number;
}

/**
 * The measure a line of three is held to, by how many of the three are terrain
 * pieces. Measured over 1,200 boards of about 38 units, three units within 1in
 * of a line and 10in apart stand on every board, a uniform random scatter's as
 * much as the generator's, so that measure is kept for terrain pieces alone (13
 * a board, which carry the eye). Any other line, scatter alone included, is
 * held to half an inch and 6in, which still catches the seed 25 line and the
 * rubble dressed along a hill's face (at single-file spacing it let 97 of 240
 * boards keep one; with decorative scatter off, holding it costs 0.6 pieces a board).
 */
export const TERRAIN_LINE: LineMeasure = { band: 1, step: 10 };
export const MIXED_LINE: LineMeasure = { band: 0.5, step: 6 };
export const SCATTER_LINE: LineMeasure = { band: 0.5, step: 6 };
/** Two centres closer than this on x or on y read as lined up on that axis. */
export const COINCIDE_IN = 0.25;

export type Pt = readonly [number, number];

/** A unit's centre and whether it is a terrain piece. */
export interface LinePt {
  at: Pt;
  terrain: boolean;
}

export function measureFor(terrainPieces: number): LineMeasure {
  return terrainPieces === 3 ? TERRAIN_LINE : terrainPieces > 0 ? MIXED_LINE : SCATTER_LINE;
}

const REACH_IN = Math.max(TERRAIN_LINE.step, MIXED_LINE.step, SCATTER_LINE.step);

/** Whether b, between a and c, makes a line of the three. */
export function lineOfThree(a: Pt, b: Pt, c: Pt, band: number, step: number): boolean {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) > step || Math.hypot(c[0] - b[0], c[1] - b[1]) > step) return false;
  const [dx, dy] = [c[0] - a[0], c[1] - a[1]];
  const len = Math.hypot(dx, dy);
  if (len === 0) return false;
  const t = ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / len;
  if (t <= 0 || t >= len) return false;
  return Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / len <= band;
}

/** Whether three units (outer, middle, outer) make a line at the measure their kinds call for, or at `only` when given; `slack` widens it. */
function lined(a: LinePt, b: LinePt, c: LinePt, slack: number, only?: LineMeasure): boolean {
  const m = only ?? measureFor(Number(a.terrain) + Number(b.terrain) + Number(c.terrain));
  return lineOfThree(a.at, b.at, c.at, m.band + slack, m.step + slack);
}

/** Every line of three among the units, as index triples (outer, middle, outer). */
export function linesAmong(points: readonly LinePt[], only?: LineMeasure): [number, number, number][] {
  const out: [number, number, number][] = [];
  const reach = only?.step ?? REACH_IN;
  for (let m = 0; m < points.length; m++) {
    const near: number[] = [];
    for (let i = 0; i < points.length; i++) if (i !== m && Math.hypot(points[i]!.at[0] - points[m]!.at[0], points[i]!.at[1] - points[m]!.at[1]) <= reach) near.push(i);
    for (let x = 0; x < near.length; x++) for (let y = x + 1; y < near.length; y++) if (lined(points[near[x]!]!, points[m]!, points[near[y]!]!, 0, only)) out.push([near[x]!, m, near[y]!]);
  }
  return out;
}

/** Whether adding units placed together (a slot and its twin) to those already down makes a line of three that uses at least one of them. */
export function makesLine(existing: readonly LinePt[], added: readonly LinePt[], slack = 0): boolean {
  const all = [...existing, ...added];
  const reach = 2 * REACH_IN + slack;
  for (let k = existing.length; k < all.length; k++) {
    const q = all[k]!;
    const near: number[] = [];
    for (let i = 0; i < all.length; i++) if (i !== k && Math.abs(all[i]!.at[0] - q.at[0]) <= reach && Math.abs(all[i]!.at[1] - q.at[1]) <= reach) near.push(i);
    for (let x = 0; x < near.length; x++) {
      const a = all[near[x]!]!;
      for (let y = x + 1; y < near.length; y++) {
        const b = all[near[y]!]!;
        // The new unit in the middle, or at either end.
        if (lined(a, q, b, slack) || lined(q, a, b, slack) || lined(q, b, a, slack)) return true;
      }
    }
  }
  return false;
}

/**
 * The longest single file among points (single scatter pieces): through any two
 * within `step` of each other, those within `band` of the line, each within
 * `step` of the next along it. The generator keeps it under three (extendsRow).
 */
export function longestSingleFile(points: readonly Pt[], band = 1, step = 3.5): number {
  let best = Math.min(points.length, 2);
  for (const a of points) {
    for (const b of points) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len === 0 || len > step) continue;
      const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      const along = points.filter((p) => Math.abs((p[1] - a[1]) * ux - (p[0] - a[0]) * uy) <= band).map((p) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy).sort((x, y) => x - y);
      const from = along.indexOf(0);
      let [lo, hi] = [from, from];
      while (lo > 0 && along[lo]! - along[lo - 1]! <= step) lo--;
      while (hi < along.length - 1 && along[hi + 1]! - along[hi]! <= step) hi++;
      best = Math.max(best, hi - lo + 1);
    }
  }
  return best;
}

export interface AlignUnit {
  id: string;
  at: [number, number];
  /** The unit's twin under the board's parity, or null. */
  twin: string | null;
  /** Its own twin: on the line (or point) the halves mirror across. */
  centre: boolean;
  /** A terrain piece rather than scattered terrain. */
  terrain: boolean;
}

/** The units on a finished board: every free piece that is not part of the grid, a group or heap counted once. */
export function layoutUnits(layout: Layout, palette: Palette): AlignUnit[] {
  const sense = palette.rotation.rotYSense;
  const byUnit = new Map<string, { x0: number; y0: number; x1: number; y1: number; twin: string | null; side: string | null; terrain: boolean }>();
  for (const p of layout.pieces) {
    if (p.cells || STRUCTURAL_ROLES.includes(p.role)) continue;
    const id = p.groupId ?? p.id;
    const r = turnedRect(p.position[0], p.position[1], { footprintIn: p.sizeIn }, p.rotY, sense);
    const terrain = !(p.slot ? palette.categories[p.slot.category]?.scatter : p.role === "scatter");
    const b = byUnit.get(id) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, twin: p.slot?.twin ?? null, side: p.slot?.side ?? null, terrain };
    byUnit.set(id, { ...b, x0: Math.min(b.x0, r.x0), y0: Math.min(b.y0, r.y0), x1: Math.max(b.x1, r.x1), y1: Math.max(b.y1, r.y1) });
  }
  return [...byUnit].map(([id, b]) => ({ id, at: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2], twin: b.twin, centre: b.side === "centre", terrain: b.terrain }));
}

export interface AlignmentReport {
  units: number;
  terrainUnits: number;
  /** Lines of three at the measure their kinds call for, by unit ids (outer, middle, outer). */
  lines: [string, string, string][];
  /** Those made of three terrain pieces. */
  terrainLines: [string, string, string][];
  /** Share of units, and of terrain pieces among themselves, whose centre shares an x or y (within COINCIDE_IN) with another's or with a cell line. */
  share: number;
  terrainShare: number;
}

/**
 * Lines of three, and the share of units lined up on an axis. A twin pair shares
 * the coordinate its mirror keeps, and a unit on the mirror line stands on it,
 * so those coordinates are the parity's, not a coincidence, and are not counted.
 */
export function alignmentReport(units: readonly AlignUnit[], parity: Parity, cellIn: number, coincide = COINCIDE_IN): AlignmentReport {
  const lines = linesAmong(units).map(([x, y, z]): [string, string, string] => [units[x]!.id, units[y]!.id, units[z]!.id]);
  const terrainIds = new Set(units.filter((u) => u.terrain).map((u) => u.id));
  return {
    units: units.length,
    terrainUnits: terrainIds.size,
    lines,
    terrainLines: lines.filter((l) => l.every((id) => terrainIds.has(id))),
    share: coincidentShare(units, parity, cellIn, coincide),
    terrainShare: coincidentShare(units.filter((u) => u.terrain), parity, cellIn, coincide),
  };
}

export function coincidentShare(units: readonly AlignUnit[], parity: Parity, cellIn: number, coincide = COINCIDE_IN): number {
  // The axis a mirror keeps: y under mirror-x, x under mirror-y.
  const kept = parity.kind === "mirror-x" ? 1 : parity.kind === "mirror-y" ? 0 : -1;
  const onMirror = (u: AlignUnit, axis: number) => u.centre && (parity.kind === "point" || (sideOf(parity, ...u.at) === "centre" && axis === 1 - kept));
  let coincident = 0;
  for (const u of units) {
    const hit = [0, 1].some((axis) => {
      if (onMirror(u, axis)) return false;
      const v = u.at[axis]!;
      if (Math.abs(v / cellIn - Math.round(v / cellIn)) * cellIn <= coincide) return true;
      return units.some((w) => w !== u && !(axis === kept && (w.id === u.twin || w.twin === u.id)) && !onMirror(w, axis) && Math.abs(w.at[axis]! - v) <= coincide);
    });
    if (hit) coincident++;
  }
  return units.length ? coincident / units.length : 0;
}
