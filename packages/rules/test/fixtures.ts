import { resolve } from "node:path";
import { loadRulesData, type RulesData } from "../src/load.js";
import type { Warband, WarbandMember } from "../src/roster.js";
import type { ValidationResult } from "../src/validate.js";

export const repoRoot = resolve(import.meta.dirname, "../../..");

let cached: RulesData | undefined;
export function data(): RulesData {
  cached ??= loadRulesData(repoRoot);
  return cached;
}

let seq = 0;
export function member(unitId: string, equipmentItemIds: string[] = [], upgradeIds?: string[]): WarbandMember {
  const m: WarbandMember = { id: `m${++seq}`, unitId, equipmentItemIds };
  if (upgradeIds) m.upgradeIds = upgradeIds;
  return m;
}

/** Legal starting New Antioch warband: 95 + 4 x 37 + 75 = 318 of 700 ducats (a Yeoman's Bolt-Action Rifle is 5, p30). */
export function newAntioch(overrides: Partial<Warband> = {}): Warband {
  return {
    id: "w1",
    name: "Test warband",
    factionId: "new-antioch",
    gameNumber: 1,
    members: [
      member("new-antioch/lieutenant", ["sword-axe", "pistol", "standard-armour"]),
      member("new-antioch/yeoman", ["bolt-action-rifle", "bayonet"]),
      member("new-antioch/yeoman", ["bolt-action-rifle", "bayonet"]),
      member("new-antioch/yeoman", ["bolt-action-rifle", "bayonet"]),
      member("new-antioch/yeoman", ["bolt-action-rifle", "bayonet"]),
      member("new-antioch/shocktrooper", ["submachine-gun"]),
    ],
    ...overrides,
  };
}

export function warband(factionId: string, members: WarbandMember[], overrides: Partial<Warband> = {}): Warband {
  return { id: "w1", name: "Test warband", factionId, gameNumber: 1, members, ...overrides };
}

export function withMembers(extra: WarbandMember[], overrides: Partial<Warband> = {}): Warband {
  const base = newAntioch(overrides);
  return { ...base, members: [...base.members, ...extra] };
}

export const codes = (r: ValidationResult) => r.errors.map((e) => e.code);
