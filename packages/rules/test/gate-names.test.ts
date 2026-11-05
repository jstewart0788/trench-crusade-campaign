import { describe, expect, it } from "vitest";
import { importRoster, type RosterSelection } from "../src/import/newrecruit.js";
import { warbandCost } from "../src/cost.js";
import { rosterUnits } from "../src/data.js";
import type { Warband } from "../src/roster.js";
import { evaluateGates, limitContext, unitLimits, validateWarband } from "../src/validate.js";
import { codes, data, member, warband } from "./fixtures.js";

// Every name a gate or limit can count resolves, except campaign state the
// roster does not keep yet (TC-003i).

describe("names no list here can have resolve to 'not taken'", () => {
  it("a War Prophet in a plain Trench Pilgrims list raises no warning (Children of Yggdrasil is upstream-only)", () => {
    const w = warband("trench-pilgrims", [member("trench-pilgrims/war-prophet", ["sword-axe", "pistol"]), member("trench-pilgrims/trench-pilgrim", ["bolt-action-rifle"])]);
    const r = validateWarband(w, data());
    expect(r.warnings).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("a gate naming an excluded variant is closed when required and open when excluded, with nothing unresolved", () => {
    const w = warband("trench-pilgrims", []);
    const ctx = limitContext(w, data());
    expect(evaluateGates(["Children of Yggdrasil [Trench Pilgrims]"], undefined, w, data(), ctx)).toEqual({ open: false, blockedBy: [{ gate: "Children of Yggdrasil [Trench Pilgrims]", list: "onlyWith" }], unresolved: [] });
    expect(evaluateGates(undefined, ["Children of Yggdrasil [Trench Pilgrims]"], w, data(), ctx)).toEqual({ open: true, blockedBy: [], unresolved: [] });
    expect(codes(validateWarband(warband("trench-pilgrims", [member("trench-pilgrims/war-prophet", []), member("trench-pilgrims/huscarl", [])]), data()))).toContain("variant-locked");
  });

  it("another faction's variant counts as not taken: two Goetic Warlocks in a Court list break its 0-1, with no warning about Knights of Avarice", () => {
    const GW = "court-of-the-seven-headed-serpent/goetic-warlock";
    const court = warband("court-of-the-seven-headed-serpent", [member("court-of-the-seven-headed-serpent/praetor", ["sword-axe"]), member(GW), member(GW)], { choices: { "court-sins": "Wrath" }, glory: 8 });
    const r = validateWarband(court, data());
    expect(codes(r)).toContain("mercenary-limit");
    expect(r.warnings).toEqual([]);
  });

  it("Stoßtruppen raise the Shock Trooper limit to 8 (p41-42)", () => {
    const stoss = warband("new-antioch", [], { variantId: "new-antioch/stosstruppen-of-the-free-state-of-prussia" });
    expect(unitLimits(data().unitsById.get("new-antioch/shocktrooper")!, limitContext(stoss, data()))).toEqual({ min: 2, max: 8 });
    expect(unitLimits(data().unitsById.get("new-antioch/shocktrooper")!, limitContext(warband("new-antioch", []), data()))).toEqual({ min: 0, max: 5 });
  });

  it("the warband's value counts: a third Trench Mole once the warband is worth 1,000 ducats (p30)", () => {
    const mole = data().unitsById.get("new-antioch/yeoman")!.upgrades!.find((g) => g.name === "Trench Mole")!.bsId;
    const moles = (extra: number) =>
      warband("new-antioch", [member("new-antioch/lieutenant"), ...Array.from({ length: 3 }, () => member("new-antioch/yeoman", [], [mole])), ...Array.from({ length: extra }, () => member("new-antioch/mechanized-heavy-infantry", ["machine-armour"]))]);
    expect(codes(validateWarband(moles(0), data()))).toContain("upgrade-max-per-warband");
    const rich = moles(14); // 70 + 3 x 40 + 14 x 60 = 1,030 ducats
    expect(warbandCost(rich, data()).ducats).toBeGreaterThanOrEqual(1000);
    expect(codes(validateWarband(rich, data()))).not.toContain("upgrade-max-per-warband");
    // The 14 Mechanized Heavy Infantry break their own 0-3; the Trench Mole limit is decided, not reported.
    expect(validateWarband(rich, data()).warnings.filter((x) => x.unitId === "new-antioch/yeoman")).toEqual([]);
  });

  it("a keyword counts: the Court's Wretched need a DEMONIC model to follow (none without one)", () => {
    const WR = "court-of-the-seven-headed-serpent/wretched";
    const wretched = data().unitsById.get(WR)!;
    const sin = { choices: { "court-sins": "Wrath" } };
    expect(unitLimits(wretched, limitContext(warband("court-of-the-seven-headed-serpent", [member(WR)], sin), data())).max).toBe(0);
    expect(unitLimits(wretched, limitContext(warband("court-of-the-seven-headed-serpent", [member("court-of-the-seven-headed-serpent/hell-knight"), member(WR)], sin), data())).max).toBeNull();
  });
});

describe("the Court's Seven Deadly Sins (p147): a choice made at creation", () => {
  const PR = "court-of-the-seven-headed-serpent/praetor";
  const envious = () => data().unitsById.get(PR)!.upgrades!.find((g) => g.name === "Envious Eyes")!.bsId;
  const court = (choices?: Record<string, string>) => warband("court-of-the-seven-headed-serpent", [member(PR, ["sword-axe"], [envious()])], choices ? { choices } : {});

  it("must be made, must be one of the seven, and opens that Sin's options only", () => {
    expect(codes(validateWarband(court(), data()))).toContain("choice-missing");
    expect(codes(validateWarband(court({ "court-sins": "Avarice" }), data()))).toContain("choice-invalid");
    expect(codes(validateWarband(court({ "court-sins": "Envy" }), data()))).toEqual([]);
    expect(codes(validateWarband(court({ "court-sins": "Wrath" }), data()))).toEqual(["upgrade-variant-locked"]);
    expect(validateWarband(court({ "court-sins": "Wrath" }), data()).warnings).toEqual([]);
  });

  it("imports from a NewRecruit roster that names the Sin", () => {
    const sel = (name: string, type: string, selections: RosterSelection[] = []): RosterSelection => ({ name, type, number: 1, costs: [], categories: [], selections });
    const { warband: w } = importRoster({ name: "c", gameSystemName: "Trench Crusade", costs: [], forces: [{ catalogueName: "Court of the Seven-Headed Serpent", selections: [sel("Seven Deadly Sins", "upgrade", [sel("Envy", "upgrade")]), sel("Praetor", "model")] }] }, data(), { id: "w" });
    expect(w.choices).toEqual({ "court-sins": "Envy" });
  });
});

describe("sweep: every list, every recruitable model, every option it is offered", () => {
  // The only warnings left are campaign state this roster does not keep yet:
  // the Book of Golems is an Exploration find (Digital Rulebook p118).
  const campaignState = [/needs Book of Golems, which this tool can't check yet$/];

  it("raises no warning about something a list can never have", () => {
    const d = data();
    const scopes: Partial<Warband>[] = [];
    for (const f of d.factions) {
      const base = { factionId: f.id, ...(f.id === "court-of-the-seven-headed-serpent" ? { choices: { "court-sins": "Wrath" } } : {}) };
      scopes.push(base, ...f.variants.map((v) => ({ ...base, variantId: v.id })));
      for (const s of f.subfactions ?? []) scopes.push({ ...base, subfactionId: s.id }, ...s.variants.map((v) => ({ ...base, subfactionId: s.id, variantId: v.id })));
    }
    const stray = new Set<string>();
    let rosters = 0;
    for (const sc of scopes) {
      const units = rosterUnits(d, { factionId: sc.factionId!, subfactionId: sc.subfactionId }).filter((u) => u.kind === "model");
      const members = units.map((u, i) => ({ id: `m${i}`, unitId: u.id, equipmentItemIds: [] as string[] }));
      const w = { ...warband(sc.factionId!, members), ...sc } as Warband;
      const all = [w, ...units.map((u, i) => ({ ...w, members: members.map((m, j) => (j === i ? { ...m, equipmentItemIds: u.equipmentAccess.map((a) => a.itemId), upgradeIds: (u.upgrades ?? []).map((g) => g.bsId) } : m)) }))];
      for (const r of all) {
        rosters++;
        for (const x of validateWarband(r, d).warnings) if (!campaignState.some((p) => p.test(x.message))) stray.add(x.message);
      }
    }
    expect(rosters).toBeGreaterThan(400);
    expect([...stray]).toEqual([]);
  });
});
