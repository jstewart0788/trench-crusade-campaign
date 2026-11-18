import type { Layout } from "./layout.js";
import { pieceById, STRUCTURAL_ROLES, type Palette } from "./palette.js";
import { mapPoint, sideOf, type Parity } from "./parity.js";

// Whether the two halves are worth the same to the players who deploy in
// them (matched parity places each half's pieces on their own, so this is
// what keeps the board fair): per half, the footprint area that gives cover,
// the pieces tall enough to block a line of sight, and the difficult and
// dangerous ground; and for each pair of twin objectives, how alike their
// covers are. A piece that is its own twin (on the line between the halves,
// or covering the objective there) counts for neither.

/** Tall enough to stand over a model and block sight past it (TALL_MIN_HEIGHT_IN in dressing.ts). */
const TALL_IN = 6;

/**
 * How far apart the halves may be and still count as fair. Rough ground is held
 * to what twin pieces are held to (TWIN_AREA_RATIO in dressing.ts: every pair
 * within it keeps the totals within it); cover, which the objectives add to
 * on both halves alike, closer.
 */
export const FAIR_COVER_RATIO = 0.85;
export const FAIR_ROUGH_RATIO = 0.75;
export const FAIR_TALL_DIFF = 1;

export interface HalfTotals {
  /** Square inches of footprint that give cover. */
  coverArea: number;
  /** Pieces at least TALL_IN tall. */
  tall: number;
  /** Square inches of difficult or dangerous ground. */
  roughArea: number;
}

export interface CoverPair {
  objectives: [string, string];
  /** Heights of the two covers, in inches. */
  heightsIn: [number, number];
  /** The taller less the shorter, in inches. */
  heightDiff: number;
  /** Smaller footprint area over the larger: 1 when alike. */
  areaRatio: number;
}

export interface Fairness {
  A: HalfTotals;
  B: HalfTotals;
  covers: CoverPair[];
}

const parityOf = (layout: Layout): Parity => ({ kind: layout.parity.kind, boardIn: layout.boardIn, objectivesMatch: layout.parity.objectivesMatch, matched: layout.parity.matched });

export function fairness(layout: Layout, palette: Palette): Fairness {
  const parity = parityOf(layout);
  const totals = (): HalfTotals => ({ coverArea: 0, tall: 0, roughArea: 0 });
  const out: Fairness = { A: totals(), B: totals(), covers: [] };
  for (const p of layout.pieces) {
    if (STRUCTURAL_ROLES.includes(p.role)) continue;
    // A slot's own side, so a heap straddling the line counts once and a piece that is its own twin for neither.
    const side = p.slot ? p.slot.side : sideOf(parity, p.position[0], p.position[1]);
    if (side === "centre") continue;
    const entry = pieceById(palette, p.paletteId);
    const half = out[side];
    const area = p.sizeIn[0] * p.sizeIn[1];
    if (entry.terrain.cover) half.coverArea += area;
    if (entry.heightIn >= TALL_IN) half.tall++;
    if (entry.terrain.types.some((t) => t === "difficult" || t === "dangerous")) half.roughArea += area;
  }
  const coverOf = (id: string | null) => (id ? layout.pieces.find((p) => p.id === id) : undefined);
  for (const o of layout.objectives) {
    if (sideOf(parity, o.position[0], o.position[1]) !== "A") continue;
    const [x, y] = mapPoint(parity, o.position[0], o.position[1]);
    const twin = layout.objectives.find((t) => Math.abs(t.position[0] - x) < 1e-6 && Math.abs(t.position[1] - y) < 1e-6);
    const [a, b] = [coverOf(o.coverPieceId), coverOf(twin?.coverPieceId ?? null)];
    if (!twin || !a || !b) continue;
    const [ha, hb] = [pieceById(palette, a.paletteId).heightIn, pieceById(palette, b.paletteId).heightIn];
    const [aa, ab] = [a.sizeIn[0] * a.sizeIn[1], b.sizeIn[0] * b.sizeIn[1]];
    out.covers.push({ objectives: [o.id, twin.id], heightsIn: [ha, hb], heightDiff: Math.abs(ha - hb), areaRatio: Math.min(aa, ab) / Math.max(aa, ab) });
  }
  return out;
}
