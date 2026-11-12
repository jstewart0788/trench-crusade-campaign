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

/** One piece of Battlekit bought for a member, and the game it was bought for (game 1: when the warband was created). */
export const Purchase = z.object({
  itemId: z.string().min(1),
  memberId: z.string().min(1),
  game: z.number().int().positive(),
});
export type Purchase = z.infer<typeof Purchase>;

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
  /** Glory Points the warband may spend, set for it (a campaign's or a house rule's), in place of the pool the rules give (the variant's starting glory at game 1). Glory-priced models and items are checked against it. */
  glory: z.number().int().nonnegative().optional(),
  /**
   * A ducat limit agreed for this warband (a campaign's or a house rule's), in
   * place of the Threshold Value the rules compute. Absent: the rules' value.
   */
  ducatLimit: z.number().int().nonnegative().optional(),
  /** Choices made before each game, keyed as in unit-rules.json preGameChoices (brokenOnTheWheel: the victim's member id). */
  preGame: z.record(z.string(), z.string().nullable()).optional(),
  /**
   * Battlekit purchases in the order they were made. Rules that depend on what
   * was bought when (Cold Steel, Supreme Blessing, Corrupt Merchants) read it.
   * Kit with no entry here was bought before this was kept and counts as bought
   * when the warband was created.
   */
  purchases: z.array(Purchase).optional(),
  /** Choices made when the warband is created, keyed as in unit-rules.json rosterChoices (court-sins: "Wrath"). */
  choices: z.record(z.string(), z.string()).optional(),
  /** Battlekit the warband holds rather than a model (a Grand Cannon gun battery, Warbands p99), by item id. */
  armoury: z.array(z.string().min(1)).optional(),
});
export type Warband = z.infer<typeof Warband>;

export function parseWarband(input: unknown): Warband {
  return Warband.parse(input);
}
