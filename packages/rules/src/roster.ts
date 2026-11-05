import { z } from "zod";

// Roster model. Plain JSON: every field is a string, number, boolean or an
// array of those, so a Warband round-trips through JSON.stringify unchanged.

export const WarbandMember = z.object({
  id: z.string().min(1),
  unitId: z.string().min(1),
  name: z.string().optional(),
  equipmentItemIds: z.array(z.string()),
  // Upgrade ids are the converter's `bsId` on the unit's `upgrades` entries.
  upgradeIds: z.array(z.string()).optional(),
});
export type WarbandMember = z.infer<typeof WarbandMember>;

export const Warband = z.object({
  id: z.string().min(1),
  name: z.string(),
  factionId: z.string().min(1),
  /** A subfaction of factionId; its roster list replaces the faction's. */
  subfactionId: z.string().optional(),
  variantId: z.string().optional(),
  patronId: z.string().optional(),
  gameNumber: z.number().int().positive(),
  members: z.array(WarbandMember),
  /** Unspent ducats (Warbands of Trench Crusade p10). Informational; not part of the threshold check. */
  strongboxDucats: z.number().int().nonnegative().optional(),
  /** Glory Points available to spend. When set, glory-priced models and items are checked against it. */
  glory: z.number().int().nonnegative().optional(),
});
export type Warband = z.infer<typeof Warband>;

export function parseWarband(input: unknown): Warband {
  return Warband.parse(input);
}
