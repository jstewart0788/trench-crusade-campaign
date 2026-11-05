import type { Cell, Dir, Grid, Rect } from "./grid.js";
import type { ScenarioOverlay } from "./scenario.js";

// Parity between the two players' halves (Jonathan's review, TC-021c): the
// board is built so that every feature on one side has a twin on the other.
// Point symmetry about the centre turns each player's half into the other's
// exactly (a 180-degree turn, so pieces stay real pieces); a mirror across the
// centre line reflects positions and facings. The transform is chosen per
// scenario so its objectives and deployment zones land on themselves.

export type ParityKind = "point" | "mirror-x" | "mirror-y" | "none";

export interface Parity {
  kind: ParityKind;
  boardIn: number;
  /** True when every positioned objective lands on an objective. */
  objectivesMatch: boolean;
}

const EPS = 1e-6;

export function mapPoint(p: Parity, x: number, y: number): [number, number] {
  const b = p.boardIn;
  switch (p.kind) {
    case "point":
      return [b - x, b - y];
    case "mirror-x":
      return [b - x, y];
    case "mirror-y":
      return [x, b - y];
    default:
      return [x, y];
  }
}

export function mapRect(p: Parity, r: Rect): Rect {
  const [ax, ay] = mapPoint(p, r.x0, r.y0);
  const [bx, by] = mapPoint(p, r.x1, r.y1);
  const out: Rect = { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
  return r.poly ? { ...out, poly: r.poly.map(([x, y]) => mapPoint(p, x, y)) } : out;
}

export function mapCell(p: Parity, g: Grid, cell: Cell): Cell {
  switch (p.kind) {
    case "point":
      return { c: g.cols - 1 - cell.c, r: g.rows - 1 - cell.r };
    case "mirror-x":
      return { c: g.cols - 1 - cell.c, r: cell.r };
    case "mirror-y":
      return { c: cell.c, r: g.rows - 1 - cell.r };
    default:
      return { ...cell };
  }
}

const FLIP: Record<ParityKind, Record<Dir, Dir>> = {
  point: { N: "S", S: "N", E: "W", W: "E" },
  "mirror-x": { N: "N", S: "S", E: "W", W: "E" },
  "mirror-y": { N: "S", S: "N", E: "E", W: "W" },
  none: { N: "N", S: "S", E: "E", W: "W" },
};

export const mapDir = (p: Parity, d: Dir): Dir => FLIP[p.kind][d];

/**
 * The twin's rotY. A point turn adds 180 degrees, so the twin is the same piece
 * seen from the other seat; a mirror reflects the facing, which keeps the
 * footprint but not a chiral piece's handedness.
 */
export function mapRotY(p: Parity, rotY: number): number {
  const n = (v: number) => ((v % 360) + 360) % 360;
  switch (p.kind) {
    case "point":
      return n(rotY + 180);
    case "mirror-x":
      return n(360 - rotY);
    case "mirror-y":
      return n(180 - rotY);
    default:
      return n(rotY);
  }
}

/** Which half a point lies in: A (the first zone's), B, or the centre where a feature is its own twin. */
export function sideOf(p: Parity, x: number, y: number): "A" | "B" | "centre" {
  const mid = p.boardIn / 2;
  if (p.kind === "none") return "A";
  const [u, v] = p.kind === "mirror-y" ? [y, x] : [x, y];
  if (Math.abs(u - mid) > EPS) return u < mid ? "A" : "B";
  if (p.kind !== "point" || Math.abs(v - mid) <= EPS) return "centre";
  return v < mid ? "A" : "B";
}

const samePoint = (a: readonly [number, number], b: readonly [number, number]) => Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS;

function mapsOnto(p: Parity, points: readonly (readonly [number, number])[]): boolean {
  return points.every((pt) => {
    const q = mapPoint(p, pt[0], pt[1]);
    return points.some((x) => samePoint(x, q));
  });
}

function polygonsSwap(p: Parity, a: readonly (readonly [number, number])[], b: readonly (readonly [number, number])[]): boolean {
  return mapsOnto({ ...p }, [...a, ...b]) && a.every((pt) => b.some((x) => samePoint(x, mapPoint(p, pt[0], pt[1]))));
}

/**
 * The mirror across the centre line between the deployment zones when it maps
 * the zones onto each other and the objectives onto themselves: a cross trench
 * running between the zones is then its own twin, which a 36in board needs the
 * room of. Otherwise point symmetry, otherwise whichever transform maps the
 * zones (the objectives then stand alone).
 */
export function chooseParity(overlay: ScenarioOverlay, boardIn: number, prefer: ParityKind | "auto" = "auto"): Parity {
  const zones = overlay.zones.filter((z) => z.isDeployment);
  const points = overlay.objectives.map((o) => o.position);
  const kinds: ParityKind[] = prefer === "auto" ? ["mirror-x", "mirror-y", "point"] : [prefer];
  const zonesOk = (p: Parity) => zones.length !== 2 || polygonsSwap(p, zones[0]!.polygon, zones[1]!.polygon);
  for (const kind of kinds) {
    const p: Parity = { kind, boardIn, objectivesMatch: false };
    if (zonesOk(p) && mapsOnto(p, points)) return { ...p, objectivesMatch: true };
  }
  for (const kind of kinds) {
    const p: Parity = { kind, boardIn, objectivesMatch: false };
    if (kind !== "none" && zonesOk(p)) return p;
  }
  return { kind: "none", boardIn, objectivesMatch: false };
}
