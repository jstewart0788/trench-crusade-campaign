import { z } from "zod";
import { cellRect, OPPOSITE, pointInPolygon, type Cell, type Dir, type Grid } from "./grid.js";
import type { Role } from "./palette.js";
import type { DeploymentTrack } from "./trench.js";

// The geometry the generator reads from a scenario: deployment polygons and
// objective points in board inches, plus the handful of placement rules the
// rulebook states in prose. The prose is read with narrow patterns and the
// result is recorded on the layout, so a wrong reading is visible rather than
// silent.

const Point = z.tuple([z.number(), z.number()]);

export const ScenarioGeometry = z
  .object({
    id: z.string(),
    name: z.string(),
    archetypes: z.array(z.string()),
    battlefield: z.object({ widthIn: z.number(), depthIn: z.number() }).passthrough(),
    deployment: z.object({ zones: z.array(z.object({ player: z.string(), label: z.string(), polygon: z.array(Point).min(3), note: z.string().optional() }).passthrough()) }).passthrough(),
    objectives: z.array(z.object({ id: z.string(), label: z.string().optional(), position: Point.nullable(), placementRule: z.string().optional() }).passthrough()),
    terrainRequirements: z.string().optional(),
  })
  .passthrough();
export type ScenarioGeometry = z.infer<typeof ScenarioGeometry>;

export interface ZoneSpec {
  player: string;
  label: string;
  polygon: [number, number][];
  /** False for areas the map draws that are not deployment zones (mine placement bands). */
  isDeployment: boolean;
  /** The scenario forbids terrain in this zone (Trench Warfare, Don't Breathe). */
  noTerrain: boolean;
}

export interface ObjectiveSpec {
  id: string;
  label: string;
  position: [number, number];
  /** The marker must be covered by a terrain piece, which the generator places first. */
  requiresCover: boolean;
  /** Roles to try for the covering piece, best first. */
  preferredRoles: Role[];
  /** The scenario wants a trench section here, so the network may run through the cell. */
  allowsTrench: boolean;
  /** No terrain within this many inches of the point (From Below's ichor pits). */
  keepOutIn: number;
}

export interface ScenarioOverlay {
  zones: ZoneSpec[];
  objectives: ObjectiveSpec[];
}

const RUINED_BUILDING_ROLES: Role[] = ["building", "ruin", "cover", "landmark", "difficult"];
const TALL_ROLES: Role[] = ["building", "tower", "ruin", "landmark"];
const DEFAULT_COVER_ROLES: Role[] = ["ruin", "cover", "landmark", "difficult"];

export function scenarioOverlay(scenario: ScenarioGeometry): ScenarioOverlay {
  const zones: ZoneSpec[] = scenario.deployment.zones.map((z) => ({
    player: z.player,
    label: z.label,
    polygon: z.polygon.map(([x, y]) => [x, y] as [number, number]),
    isDeployment: /deployment/i.test(z.label),
    noTerrain: /no terrain/i.test(z.note ?? ""),
  }));
  const objectives: ObjectiveSpec[] = [];
  for (const o of scenario.objectives) {
    if (!o.position) continue;
    const rule = o.placementRule ?? "";
    const keepOut = /no terrain within (\d+(?:\.\d+)?)"/i.exec(rule);
    objectives.push({
      id: o.id,
      label: o.label ?? o.id,
      position: [o.position[0], o.position[1]],
      requiresCover: /covered by/i.test(rule),
      preferredRoles: /tall/i.test(rule) ? TALL_ROLES : /ruined building/i.test(rule) ? RUINED_BUILDING_ROLES : DEFAULT_COVER_ROLES,
      allowsTrench: /trench section/i.test(rule),
      keepOutIn: keepOut ? Number(keepOut[1]) : 0,
    });
  }
  return { zones, objectives };
}

/** The board edge a zone polygon runs along, when it is an edge strip. */
export function zoneSide(zone: ZoneSpec, boardIn: number): Dir | null {
  const xs = zone.polygon.map((p) => p[0]);
  const ys = zone.polygon.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const fullHeight = y0 <= 0 && y1 >= boardIn;
  const fullWidth = x0 <= 0 && x1 >= boardIn;
  if (fullHeight && x0 <= 0 && x1 < boardIn) return "W";
  if (fullHeight && x1 >= boardIn && x0 > 0) return "E";
  if (fullWidth && y0 <= 0 && y1 < boardIn) return "S";
  if (fullWidth && y1 >= boardIn && y0 > 0) return "N";
  return null;
}

const cellInside = (grid: Grid, cell: Cell, polygon: readonly [number, number][]): boolean => {
  const r = cellRect(grid, cell.c, cell.r);
  return [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x0, r.y1],
    [r.x1, r.y1],
  ].every((p) => pointInPolygon(p as [number, number], polygon));
};

/**
 * One track per deployment zone that is a board-edge strip: the row or column
 * of cells along that edge, kept only where the cell lies wholly inside the
 * zone, so models deployed in the trench are wholly within their zone.
 */
export function deploymentTracks(grid: Grid, zones: readonly ZoneSpec[], warnings: string[]): DeploymentTrack[] {
  const tracks: DeploymentTrack[] = [];
  for (const zone of zones) {
    if (!zone.isDeployment) continue;
    if (zone.noTerrain) {
      warnings.push(`no deployment trench in ${zone.label}: the scenario bans terrain there`);
      continue;
    }
    const side = zoneSide(zone, grid.boardIn);
    if (!side) {
      warnings.push(`no deployment trench in ${zone.label}: not a board-edge strip`);
      continue;
    }
    const along = side === "W" || side === "E" ? "y" : "x";
    const cells: Cell[] = [];
    const n = along === "y" ? grid.rows : grid.cols;
    for (let i = 0; i < n; i++) {
      const cell = side === "W" ? { c: 0, r: i } : side === "E" ? { c: grid.cols - 1, r: i } : side === "S" ? { c: i, r: 0 } : { c: i, r: grid.rows - 1 };
      if (cellInside(grid, cell, zone.polygon)) cells.push(cell);
    }
    if (cells.length < n) {
      warnings.push(`no deployment trench in ${zone.label}: the zone is narrower than one ${grid.cellIn}in cell`);
      continue;
    }
    tracks.push({ zoneLabel: zone.label, player: zone.player, side, along, cells });
  }
  return tracks;
}

/**
 * The side facing the enemy from a cell: with two deployment zones on opposite
 * edges, the half of the board nearer one zone faces the other. Cells on the
 * centre line take a seeded side. Null when the zones are not opposed strips.
 */
export function enemyFacing(grid: Grid, zones: readonly ZoneSpec[], pickCentre: () => boolean): (cell: Cell) => Dir | null {
  const sides = zones.filter((z) => z.isDeployment).map((z) => zoneSide(z, grid.boardIn));
  const opposed = sides.length === 2 && sides[0] && sides[1] && OPPOSITE[sides[0]] === sides[1];
  if (!opposed) return () => null;
  const axisX = sides[0] === "W" || sides[0] === "E";
  const centre = new Map<string, Dir>();
  return (cell) => {
    const [x, y] = [cell.c * grid.cellIn + grid.cellIn / 2, cell.r * grid.cellIn + grid.cellIn / 2];
    const v = axisX ? x : y;
    const mid = grid.boardIn / 2;
    const [low, high]: [Dir, Dir] = axisX ? ["W", "E"] : ["S", "N"];
    if (v < mid) return high;
    if (v > mid) return low;
    const key = `${cell.c},${cell.r}`;
    if (!centre.has(key)) centre.set(key, pickCentre() ? high : low);
    return centre.get(key)!;
  };
}
