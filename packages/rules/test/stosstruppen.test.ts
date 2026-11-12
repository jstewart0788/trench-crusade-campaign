import { describe, expect, it } from "vitest";
import { rosterUnits } from "../src/data.js";
import { warbandCost, unitCost } from "../src/cost.js";
import { toWarbandExport } from "../src/export.js";
import { fireteamRules } from "../src/fireteams.js";
import { memberKeywords } from "../src/grants.js";
import { importRoster, type RosterSelection, type RosterTree } from "../src/import/newrecruit.js";
import { itemRange, unitDisplayName } from "../src/presentation.js";
import type { Warband, WarbandMember } from "../src/roster.js";
import { evaluateGates, limitContext, unitLimits, validateWarband, warbandThreshold } from "../src/validate.js";
import { codes, data, member, warband } from "./fixtures.js";

// The Prussian Stosstruppen book (Prussian-Stosstruppen-Warband.pdf 1.0.2) is the
// Stosstruppen of the Free State of Prussia variant of New Antioch (p7) restated
// as one list (p11). Pages are the booklet's unless marked Warbands.

const V = "new-antioch/stosstruppen-of-the-free-state-of-prussia";
const NA = (id: string) => `new-antioch/${id}`;
const unit = (id: string) => data().unitsById.get(NA(id))!;
const up = (id: string, name: string) => unit(id).upgrades!.find((g) => g.name === name)!.bsId;
const m = (id: string, items: string[] = [], upgrades: string[] = []): WarbandMember => member(NA(id), items, upgrades.length ? upgrades.map((u) => up(id, u)) : undefined);
const stoss = (members: WarbandMember[]): Warband => warband("new-antioch", members, { variantId: V });
const core = () => [m("lieutenant"), m("shocktrooper"), m("shocktrooper")];
const errorsOf = (w: Warband) => codes(validateWarband(w, data()));

describe("the booklet's list (pp20-31)", () => {
  // name under the variant, unit id, ducats, min, max, page
  const ENTRIES: [string, string, number, number | null, number | null, number][] = [
    ["Hauptmann", "lieutenant", 70, 1, 1, 20],
    ["Sniper Priest", "sniper-priest", 50, null, 1, 21],
    ["Feldkaplan", "trench-cleric", 60, 0, 1, 23],
    ["Yeoman", "yeoman", 30, null, null, 25],
    ["Stosstruppen", "shocktrooper", 45, 2, 8, 27],
    ["Combat Engineer", "combat-engineer", 80, null, 2, 28],
    ["Mechanized Heavy Infantry", "mechanized-heavy-infantry", 85, null, 1, 30],
    ["Combat Medic", "combat-medic", 65, null, 1, 31],
  ];

  it.each(ENTRIES)("%s (%s): %i ducats, %s-%s (p%i)", (name, id, ducats, min, max) => {
    const w = stoss([]);
    expect(unitDisplayName(data(), w, unit(id))).toBe(name);
    expect(unitCost(data(), w, unit(id)).ducats).toBe(ducats);
    expect(unitLimits(unit(id), limitContext(w, data()))).toEqual({ min, max });
  });

  it("offers exactly those eight entries, plus the Mercenaries and the campaign's Homunculus; no Trench Moles (Warbands p42)", () => {
    const w = stoss([]);
    const ctx = limitContext(w, data());
    const open = rosterUnits(data(), w)
      .filter((u) => u.kind !== "fireteam" && !u.mercenary && unitLimits(u, ctx).max !== 0)
      .filter((u) => evaluateGates(u.onlyWith, u.onlyWithout, w, data(), ctx).open || evaluateGates(u.onlyWith, u.onlyWithout, w, data(), ctx).unresolved.length > 0)
      .map((u) => u.id)
      .sort();
    expect(open).toEqual([...ENTRIES.map(([, id]) => NA(id)), NA("homunculus")].sort());
  });

  it("starts with 700 ducats (p11)", () => {
    expect(warbandThreshold(stoss([]), data()).value).toBe(700);
  });
});

describe("the booklet's names (p11): Hauptmann = Lieutenant, Feldkaplan = Trench Cleric, Stosstruppen = Shock Troopers", () => {
  it("apply only under the variant; ids, models and rules stay the New Antioch entries'", () => {
    const plain = warband("new-antioch", []);
    expect(unitDisplayName(data(), plain, unit("lieutenant"))).toBe("Lieutenant");
    expect(unitDisplayName(data(), plain, unit("trench-cleric"))).toBe("Trench Cleric");
    expect(unitDisplayName(data(), plain, unit("shocktrooper"))).toBe("Shocktrooper");
    const w = stoss([...core(), m("trench-cleric")]);
    const out = toWarbandExport(w, data(), { code: "T" });
    expect(out.members.map((x) => x.displayName)).toEqual(["Hauptmann", "Stosstruppen", "Stosstruppen", "Feldkaplan"]);
    expect(out.members[0]!.unit.id).toBe(NA("lieutenant"));
    expect(out.members[0]!.model?.nickname).toBe(toWarbandExport(warband("new-antioch", [m("lieutenant")]), data(), { code: "T" }).members[0]!.model?.nickname);
    expect(validateWarband(stoss([m("lieutenant"), m("shocktrooper")]), data()).errors.find((e) => e.code === "unit-min")!.message).toBe("1 x Stosstruppen; at least 2 required");
  });

  it("a NewRecruit roster that uses them imports onto the New Antioch entries", () => {
    const sel = (name: string, type: string, selections: RosterSelection[] = []): RosterSelection => ({ name, type, number: 1, costs: [], categories: [], selections });
    const tree: RosterTree = {
      name: "6th Gardekorps",
      gameSystemName: "Trench Crusade",
      costs: [],
      forces: [
        {
          catalogueName: "New Antioch",
          selections: [
            sel("Stoßtruppen of the Free State of Prussia", "upgrade"),
            sel("Hauptmann", "model", [sel("Tank-Splitter Sword", "upgrade"), sel("Rapid Assault", "upgrade")]),
            sel("Feldkaplan", "model", [sel("Holy Smoke", "upgrade")]),
            sel("Stosstruppen", "model", [sel("Forward Positions", "upgrade")]),
            sel("Shock Trooper", "model"),
          ],
        },
      ],
    };
    const { warband: w, unresolved } = importRoster(tree, data(), { id: "w" });
    expect(w.variantId).toBe(V);
    expect(w.members.map((x) => [x.unitId, x.equipmentItemIds])).toEqual([
      [NA("lieutenant"), ["tank-splitter-sword"]],
      [NA("trench-cleric"), ["holy-smoke"]],
      [NA("shocktrooper"), []],
      [NA("shocktrooper"), []],
    ]);
    expect(w.members[0]!.upgradeIds).toEqual([up("lieutenant", "Rapid Assault")]);
    expect(w.members[2]!.upgradeIds).toEqual([up("shocktrooper", "Forward Positions")]);
    expect(unresolved).toEqual([]);
    expect(errorsOf(w)).toEqual([]);
  });
});

describe("the variant's special rules (p12, Warbands p41-42)", () => {
  it("Expert Fireteams: up to 3, with Concentrated Attack", () => {
    const [na] = fireteamRules(data(), stoss([])).filter((r) => r.rule.id === "new-antioch-fireteams");
    expect(na!.max).toBe(3);
    expect(na!.rule.teamRule?.name).toBe("Concentrated Attack");
    expect(fireteamRules(data(), warband("new-antioch", [])).find((r) => r.rule.id === "new-antioch-fireteams")!.max).toBe(2);
  });

  it("Masters of the Grenade: +4\" to every Grenade the warband's models use, and nothing else", () => {
    const kit = ["frag-grenades", "pistol"];
    const range = (w: Warband) => toWarbandExport(w, data(), { code: "T" }).members[0]!.equipment.map((e) => e.range);
    expect(range(stoss([m("yeoman", kit)]))).toEqual(['12"', '12"/Melee']);
    expect(range(warband("new-antioch", [m("yeoman", kit)]))).toEqual(['8"', '12"/Melee']);
    expect(itemRange(data(), stoss([]), data().equipmentById.get("satchel-charge")!)).toBe('10"');
    expect(toWarbandExport(stoss([m("yeoman", ["incendiary-grenades"])]), data(), { code: "T" }).members[0]!.ttsDescription).toContain('Incendiary Grenades (12")');
  });

  it("Light Melee: Stosstruppen have Shock Charge and not Assault Drill (p27)", () => {
    const abilities = (w: Warband) => toWarbandExport(w, data(), { code: "T" }).members[0]!.abilities.map((a) => a.name);
    expect(abilities(stoss([m("shocktrooper")]))).toEqual(["Shock Charge"]);
    expect(abilities(warband("new-antioch", [m("shocktrooper")]))).toContain("Assault Drill");
  });

  it("Athleticism: Rapid Assault for +5 on the Hauptmann and Stosstruppen only (p20, p27)", () => {
    const w = stoss([m("lieutenant", [], ["Rapid Assault"]), m("shocktrooper", [], ["Rapid Assault"]), m("shocktrooper")]);
    expect(warbandCost(w, data()).ducats).toBe(70 + 45 + 45 + 10);
    expect(errorsOf(w)).toEqual([]);
    expect((unit("yeoman").upgrades ?? []).some((g) => g.name === "Rapid Assault")).toBe(false);
    expect(errorsOf(warband("new-antioch", [m("lieutenant", [], ["Rapid Assault"])]))).toContain("upgrade-variant-locked");
  });

  it("Forward Positions: up to 2 Stosstruppen gain INFILTRATOR for +10 each (p27)", () => {
    const fp = () => m("shocktrooper", [], ["Forward Positions"]);
    const two = stoss([m("lieutenant"), fp(), fp()]);
    expect(errorsOf(two)).toEqual([]);
    expect(warbandCost(two, data()).ducats).toBe(70 + 2 * 55);
    expect(memberKeywords(two.members[1]!, unit("shocktrooper"), data(), two)).toContain("Infiltrator");
    expect(errorsOf(stoss([m("lieutenant"), fp(), fp(), fp()]))).toContain("upgrade-max-per-warband");
  });
});

describe("the book's wording where upstream's differs (pdf-overrides)", () => {
  it("Light Melee names Shock Troopers (Warbands p41); the Tank-Splitter Sword's Melt Armour reads as printed (Warbands p42, p18)", () => {
    const variant = data().factionsById.get("new-antioch")!.variants.find((v) => v.id === V)!;
    expect(variant.rules.find((r) => r.name === "Light Melee")!.text).toMatch(/^Shock Troopers in a Stosstruppen/);
    expect(variant.text).toContain("Light Melee: Shock Troopers");
    const melt = data().equipmentById.get("tank-splitter-sword")!.rules;
    expect(melt).toMatch(/^Melt Armour: /);
    expect(melt).toContain("before rolling the dice for the Success Roll");
  });
});

describe("the Stosstruppen Armoury (pp13-15)", () => {
  it("Sniper Rifle Limit: 2 (p13); New Antioch elsewhere keeps 3 (Warbands p24)", () => {
    const snipers = (n: number) => Array.from({ length: n }, () => m("yeoman", ["sniper-rifle"]));
    expect(errorsOf(stoss([...core(), ...snipers(2)]))).toEqual([]);
    expect(errorsOf(stoss([...core(), ...snipers(3)]))).toContain("item-max-per-warband");
    expect(errorsOf(warband("new-antioch", [m("lieutenant"), ...snipers(3)]))).not.toContain("item-max-per-warband");
  });

  it("Submachine Gun Limit: 4, Machine Gun Limit: 1, no Grenade Launchers or Martyrdom Pills (p13-15)", () => {
    const smg = Array.from({ length: 4 }, () => m("shocktrooper", ["submachine-gun"]));
    expect(errorsOf(stoss([m("lieutenant"), ...smg]))).toEqual([]);
    expect(errorsOf(stoss([m("lieutenant"), ...smg, m("yeoman", ["submachine-gun"])]))).toContain("item-max-per-warband");
    expect(errorsOf(stoss([...core(), m("yeoman", ["machine-gun"]), m("yeoman", ["machine-gun"])]))).toContain("item-max-per-warband");
    expect(errorsOf(stoss([...core(), m("yeoman", ["grenade-launcher"])])).some((c) => c === "item-variant-locked" || c === "item-not-available")).toBe(true);
    expect(errorsOf(stoss([...core(), m("sniper-priest", ["martyrdom-pills"])])).some((c) => c === "item-variant-locked" || c === "item-not-available")).toBe(true);
  });

  it("Automatic Pistol for 20 on any model, ELITE or not (p13)", () => {
    const w = stoss([...core(), m("yeoman", ["automatic-pistol"])]);
    expect(errorsOf(w)).toEqual([]);
    expect(warbandCost(w, data()).perMember[3]!.items[0]!.ducats).toBe(20);
    expect(errorsOf(warband("new-antioch", [m("lieutenant"), m("yeoman", ["automatic-pistol"])]))).not.toEqual([]);
  });

  it("Reinforced and Machine Armour: Hauptmann and Mechanized Heavy Infantry only (p14)", () => {
    expect(errorsOf(stoss([m("lieutenant", ["reinforced-armour"]), m("shocktrooper"), m("shocktrooper")]))).toEqual([]);
    expect(errorsOf(stoss([m("lieutenant", ["machine-armour"]), m("shocktrooper"), m("shocktrooper")]))).toEqual([]);
    expect(errorsOf(stoss([...core(), m("trench-cleric", ["reinforced-armour"])]))).not.toEqual([]);
    expect(errorsOf(stoss([...core(), m("mechanized-heavy-infantry", ["machine-armour"])]))).toEqual([]);
  });

  it("Holy Smoke, 15: the Feldkaplan only, and only in this list (p15, p17)", () => {
    const w = stoss([...core(), m("trench-cleric", ["holy-smoke"])]);
    expect(errorsOf(w)).toEqual([]);
    expect(warbandCost(w, data()).perMember[3]!.items[0]!.ducats).toBe(15);
    expect(errorsOf(stoss([...core(), m("yeoman", ["holy-smoke"])]))).not.toEqual([]);
    expect(errorsOf(warband("new-antioch", [m("lieutenant"), m("trench-cleric", ["holy-smoke"])]))).not.toEqual([]);
  });

  it("Tank-Splitter Sword, 15, Limit: 2 (p14, p18); a Yeoman's Bolt-Action Rifle is 5 (p25)", () => {
    const tss = () => m("shocktrooper", ["tank-splitter-sword"]);
    const w = stoss([m("lieutenant"), tss(), tss(), m("yeoman", ["bolt-action-rifle"])]);
    expect(errorsOf(w)).toEqual([]);
    expect(warbandCost(w, data()).ducats).toBe(70 + 2 * 60 + 35);
    expect(errorsOf(stoss([m("lieutenant", ["tank-splitter-sword"]), tss(), tss()]))).toContain("item-max-per-warband");
  });
});

describe("the booklet's sample lists price as printed", () => {
  // The 6th Gardekorps of Königsberg, Guards Cuirassiers Oblique Order Formation (p35-36) and Blitzkrieg Formation (p38-39).
  const oblique = () =>
    stoss([
      m("lieutenant", ["tank-splitter-sword", "frag-grenades", "reinforced-armour", "combat-helmet", "gas-mask"], ["Rapid Assault"]),
      m("trench-cleric", ["tank-splitter-sword", "frag-grenades", "standard-armour", "combat-helmet", "gas-mask", "holy-smoke"]),
      m("shocktrooper", ["sword-axe", "trench-club", "frag-grenades", "standard-armour", "combat-helmet"], ["Rapid Assault"]),
      m("shocktrooper", ["sword-axe", "trench-club", "frag-grenades", "standard-armour", "gas-mask"], ["Forward Positions", "Rapid Assault"]),
      m("shocktrooper", ["trench-club", "frag-grenades", "standard-armour", "combat-helmet"], ["Rapid Assault"]),
      m("yeoman", ["pistol", "combat-helmet", "musical-instrument"]),
      m("yeoman", ["bolt-action-rifle", "bayonet", "trench-club", "combat-helmet"]),
      m("yeoman", ["flamethrower", "combat-helmet", "medikit"]),
    ]);
  const blitz = () =>
    stoss([
      m("lieutenant", ["automatic-rifle", "tank-splitter-sword", "frag-grenades", "standard-armour"], ["Rapid Assault"]),
      m("trench-cleric", ["pistol", "submachine-gun", "sword-axe", "standard-armour", "combat-helmet"]),
      m("shocktrooper", ["submachine-gun", "frag-grenades"], ["Rapid Assault"]),
      m("shocktrooper", ["flamethrower", "combat-helmet"], ["Forward Positions", "Rapid Assault"]),
      m("shocktrooper", ["submachine-gun", "frag-grenades", "combat-helmet"], ["Rapid Assault"]),
      m("yeoman", ["pistol", "musical-instrument"]),
      m("yeoman", ["bolt-action-rifle", "bayonet", "frag-grenades", "combat-helmet"]),
      m("yeoman", ["shotgun", "bayonet", "combat-helmet", "medikit"]),
    ]);

  it("Oblique Order: 147 + 122 + 84 + 94 + 80 + 56 + 45 + 70 = 698 (p35-36)", () => {
    const c = warbandCost(oblique(), data());
    expect(c.perMember.map((x) => x.ducats)).toEqual([147, 122, 84, 94, 80, 56, 45, 70]);
    expect(c.ducats).toBe(698);
  });

  it("Blitzkrieg: 152 + 120 + 87 + 95 + 92 + 51 + 49 + 52 = 698 (p38-39)", () => {
    const c = warbandCost(blitz(), data());
    expect(c.perMember.map((x) => x.ducats)).toEqual([152, 120, 87, 95, 92, 51, 49, 52]);
    expect(c.ducats).toBe(698);
  });

  it("each breaks one core Battlekit limit as printed, and nothing else", () => {
    // Yeoman Hugo carries a Bayonet (a 2-Handed Melee Weapon, Digital Rulebook p75) and a Trench Club;
    // Feldkaplan Leopold a Submachine Gun (2-Handed, p74) and a Pistol, read as his second Ranged Weapon (p69).
    const at = (w: Warband) => validateWarband(w, data()).errors.map((e) => [w.members.findIndex((x) => x.id === e.memberId), e.code]);
    expect(at(oblique())).toEqual([[6, "battlekit-melee"]]);
    expect(at(blitz())).toEqual([[1, "battlekit-ranged"]]);
  });
});

describe("full sweep: every entry the list offers", () => {
  it("recruits alone with only the list's own minimums missing, and validates clean beside a Hauptmann and two Stosstruppen", () => {
    const w0 = stoss([]);
    const ctx = limitContext(w0, data());
    const offered = rosterUnits(data(), w0).filter((u) => u.kind !== "fireteam" && unitLimits(u, ctx).max !== 0 && evaluateGates(u.onlyWith, u.onlyWithout, w0, data(), ctx).open);
    expect(offered.length).toBeGreaterThanOrEqual(8);
    // As the Barracks recruits it: with its fixed kit, and glory in hand for a Mercenary.
    const recruit = (u: (typeof offered)[number]) => member(u.id, u.equipmentAccess.filter((a) => a.fixed || a.replaceableDefault).map((a) => a.itemId));
    for (const u of offered) {
      const alone = validateWarband(warband("new-antioch", [recruit(u)], { variantId: V, glory: 10 }), data()).errors;
      const allowed = u.id === NA("lieutenant") ? ["0 x Stosstruppen"] : u.id === NA("shocktrooper") ? ["0 x Hauptmann", "1 x Stosstruppen"] : ["0 x Hauptmann", "0 x Stosstruppen"];
      expect(alone.map((e) => e.code), u.id).toEqual(allowed.map(() => "unit-min"));
      expect(alone.map((e) => e.message.split(";")[0]), u.id).toEqual(allowed);
      const beside = u.id === NA("lieutenant") ? core() : [...core(), recruit(u)];
      expect(errorsOf({ ...stoss(beside), glory: 10 }), u.id).toEqual([]);
    }
  });
});
