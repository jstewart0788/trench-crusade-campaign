import { z } from "zod";
import type { Role } from "./palette.js";

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

const DEFAULT_COVER_ROLES: Role[] = ["ruin", "landmark", "difficult"];

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
      preferredRoles: /tallest/i.test(rule) ? ["ruin", "landmark"] : DEFAULT_COVER_ROLES,
      allowsTrench: /trench section/i.test(rule),
      keepOutIn: keepOut ? Number(keepOut[1]) : 0,
    });
  }
  return { zones, objectives };
}
