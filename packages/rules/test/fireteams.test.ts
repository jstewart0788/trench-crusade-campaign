import { describe, expect, it } from "vitest";
import { warbandCost } from "../src/cost.js";
import { toWarbandExport } from "../src/export.js";
import { fireteamOffers, fireteamRules, pruneFireteams } from "../src/fireteams.js";
import { importRoster, type RosterSelection } from "../src/import/newrecruit.js";
import type { Fireteam, Warband, WarbandMember } from "../src/roster.js";
import { validateWarband } from "../src/validate.js";
import { codes, data, warband } from "./fixtures.js";

// TC-003k: Fireteams (Warbands p17) as a roster mechanic, against the real data.

const m = (id: string, unitId: string, items: string[] = [], upgradeIds?: string[]): WarbandMember => ({ id, unitId, equipmentItemIds: items, ...(upgradeIds ? { upgradeIds } : {}) });
const team = (rule: string, a: string, b: string): Fireteam => ({ rule, memberIds: [a, b] });
const errorsOf = (w: Warband) => codes(validateWarband(w, data()));
const NA = "new-antioch-fireteams";
const antioch = (fireteams: Fireteam[], extra: Partial<Warband> = {}, more: WarbandMember[] = []) =>
  warband(
    "new-antioch",
    [m("lt", "new-antioch/lieutenant", ["sword-axe"]), m("y1", "new-antioch/yeoman", ["bolt-action-rifle"]), m("y2", "new-antioch/yeoman", ["bolt-action-rifle"]), m("y3", "new-antioch/yeoman", ["bolt-action-rifle"]), m("y4", "new-antioch/yeoman", ["bolt-action-rifle"]), m("st", "new-antioch/shocktrooper", ["sword-axe"]), m("sp", "new-antioch/sniper-priest", ["sniper-rifle"]), ...more],
    { fireteams, ...extra },
  );

describe("New Antioch Fireteams (p23) and Expert Fireteams (p41)", () => {
  it("up to 2 teams of any two models; a third is refused", () => {
    expect(errorsOf(antioch([team(NA, "y1", "y2"), team(NA, "lt", "st")]))).toEqual([]);
    const three = validateWarband(antioch([team(NA, "y1", "y2"), team(NA, "lt", "st"), team(NA, "y3", "y4")]), data());
    expect(three.errors.map((e) => [e.code, e.message])).toEqual([["fireteam-limit", "New Antioch Fireteams: up to 2 Fireteams, not 3 (p23)"]]);
  });

  it("a Stosstruppen warband may have 3", () => {
    const stoss = { variantId: "new-antioch/stosstruppen-of-the-free-state-of-prussia" };
    expect(fireteamRules(data(), { factionId: "new-antioch", ...stoss }).find((r) => r.rule.id === NA)!.max).toBe(3);
    expect(errorsOf(antioch([team(NA, "y1", "y2"), team(NA, "lt", "st"), team(NA, "y3", "y4")], stoss))).not.toContain("fireteam-limit");
  });

  it("a model in a team has FIRETEAM, and the export names its partner and Concentrated Attack", () => {
    const out = toWarbandExport(antioch([team(NA, "y1", "y2")]), data(), { code: "T" });
    const y1 = out.members.find((x) => x.id === "y1")!;
    expect(y1.unit.keywords).toContain("Fireteam");
    expect(out.members.find((x) => x.id === "y3")!.unit.keywords).not.toContain("Fireteam");
    expect(y1.fireteam).toMatchObject({ partnerId: "y2", partner: "Yeoman", rule: "New Antioch Fireteams", teamRule: { name: "Concentrated Attack" } });
    expect(y1.ttsDescription).toContain("[b]Fireteam:[/b] with Yeoman");
    expect(y1.ttsGmNotes).toContain("Fireteam (New Antioch Fireteams): with Yeoman.");
    expect(y1.ttsGmNotes).toContain("Concentrated Attack: If a model from a Fireteam hits");
  });

  it("a model cannot be in two teams, and a team needs two different models on the roster", () => {
    expect(errorsOf(antioch([team(NA, "y1", "y2"), team(NA, "y2", "y3")]))).toContain("fireteam-invalid");
    expect(errorsOf(antioch([team(NA, "y1", "y1")]))).toContain("fireteam-invalid");
    expect(errorsOf(antioch([team(NA, "y1", "ghost")]))).toContain("fireteam-invalid");
  });

  it("another list's rule is refused: an Iron Sultanate core list has no general Fireteams", () => {
    const w = warband("iron-sultanate", [m("y", "iron-sultanate/yuzbasi-captain"), m("a", "iron-sultanate/azeb"), m("b", "iron-sultanate/azeb")], { fireteams: [team(NA, "a", "b")] });
    expect(validateWarband(w, data()).errors.find((e) => e.code === "fireteam-invalid")!.message).toBe("New Antioch Fireteams: this list cannot form that Fireteam (p23)");
  });
});

describe("Sworn Brethren (p179): the Mamluk Faris's own team, with an ELITE model, beyond the list's allowance", () => {
  const faris = (partner: string, fireteams: Fireteam[] = []) => antioch([...fireteams, team("mamluk-faris-sworn-brethren", "mf", partner)], { glory: 4 }, [m("mf", "new-antioch/mamluk-faris", ["great-sword-axe"])]);
  it("with the Lieutenant (ELITE) it is legal, even beside two New Antioch teams", () => {
    expect(errorsOf(faris("lt"))).toEqual([]);
    expect(errorsOf(faris("lt", [team(NA, "y1", "y2"), team(NA, "y3", "y4")]))).toEqual([]);
  });
  it("with a Yeoman (not ELITE) it is refused, in plain words", () => {
    expect(validateWarband(faris("y1"), data()).errors.find((e) => e.code === "fireteam-partner")!.message).toBe("Sworn Brethren: Yeoman must have the ELITE Keyword (p179)");
  });
  it("in a New Antioch warband the partner keeps Concentrated Attack, the Faris does not (p179)", () => {
    const out = toWarbandExport(faris("lt"), data(), { code: "T" });
    expect(out.members.find((x) => x.id === "lt")!.fireteam).toMatchObject({ partner: "Mamluk Faris", rule: "Sworn Brethren", teamRule: { name: "Concentrated Attack" } });
    expect(out.members.find((x) => x.id === "mf")!.fireteam).toEqual({ partnerId: "lt", partner: "Lieutenant", rule: "Sworn Brethren" });
  });

  it("needs the Faris in it", () => {
    expect(validateWarband(antioch([team("mamluk-faris-sworn-brethren", "lt", "sp")]), data()).errors.find((e) => e.code === "fireteam-partner")!.message).toMatch(/^Sworn Brethren: one of the two must be Mamluk Faris/);
  });
});

describe("Enslaved Mind (p96): a Takwin Homunculus and one other model", () => {
  const T = "iron-sultanate/takwin-homunculus";
  const enslaved = data().unitsById.get(T)!.upgrades!.find((g) => g.name === "Enslaved Mind")!.bsId;
  const human = data().unitsById.get(T)!.upgrades!.find((g) => g.name === "Human Hands")!.bsId;
  const wisdom = (upgrades: string[], fireteams: Fireteam[]) =>
    warband("iron-sultanate", [m("al", "iron-sultanate/jabirean-alchemist"), m("t", T, [], [human, ...upgrades]), m("a1", "iron-sultanate/azeb"), m("a2", "iron-sultanate/azeb")], { variantId: "iron-sultanate/the-house-of-wisdom", fireteams });
  it("with the formula it pairs with anyone; without it, refused; its partner can be in no other team", () => {
    expect(errorsOf(wisdom([enslaved], [team("takwin-enslaved-mind", "t", "a1")]))).toEqual([]);
    expect(validateWarband(wisdom([], [team("takwin-enslaved-mind", "t", "a1")]), data()).errors.find((e) => e.code === "fireteam-partner")!.message).toBe("Enslaved Mind: one of the two must be a model with Enslaved Mind (p96)");
    expect(errorsOf(wisdom([enslaved], [team("takwin-enslaved-mind", "t", "a1"), team("takwin-enslaved-mind", "t", "a2")]))).toContain("fireteam-invalid");
  });
});

describe("Loyal Hound (Digital Rulebook p142): a model and its Trench Dog, for 1 glory", () => {
  const hound = (carrier: string) => antioch([team("trench-dog-loyal-hound", "dog", carrier)], { glory: 3 }, [m("dog", "new-antioch/trench-dog")]).members;
  it("the dog with the model that carries its Dog Food; the team costs 1 glory", () => {
    const members = hound("y1").map((x) => (x.id === "y1" ? { ...x, equipmentItemIds: [...x.equipmentItemIds, "dog-food"] } : x));
    const w = antioch([team("trench-dog-loyal-hound", "dog", "y1")], { glory: 3 }, []);
    const fed = { ...w, members };
    expect(errorsOf(fed)).toEqual([]);
    expect(warbandCost(fed, data())).toMatchObject({ fireteams: [{ id: "trench-dog-loyal-hound", ducats: 0, glory: 1 }] });
    expect(warbandCost(fed, data()).glory).toBe(warbandCost({ ...fed, fireteams: undefined }, data()).glory + 1);
    const wrong = { ...fed, fireteams: [team("trench-dog-loyal-hound", "dog", "y2")] };
    expect(validateWarband(wrong, data()).errors.find((e) => e.code === "fireteam-partner")!.message).toBe("Loyal Hound: Yeoman must carry the Dog Food (p142)");
  });
});

describe("forming, dissolving, importing", () => {
  it("offers only pairs the rule allows, and only while it has room", () => {
    const none = antioch([]);
    const offers = fireteamOffers(data(), none);
    expect(offers.map((o) => o.rule.id)).toEqual([NA]);
    expect(offers[0]!.pairs).toContainEqual(["lt", "y1"]);
    expect(fireteamOffers(data(), antioch([team(NA, "y1", "y2"), team(NA, "lt", "st")]))).toEqual([]);
    // No Faris, no dog, no Homunculus: their rules offer nothing.
    const withFaris = antioch([], { glory: 4 }, [m("mf", "new-antioch/mamluk-faris")]);
    const sworn = fireteamOffers(data(), withFaris).find((o) => o.rule.id === "mamluk-faris-sworn-brethren")!;
    expect(sworn.pairs.every((p) => p.includes("mf"))).toBe(true);
    expect(sworn.pairs.map((p) => p.find((id) => id !== "mf")).sort()).toEqual(["lt", "sp"]);
  });

  it("a team goes when one of its models leaves the roster", () => {
    const w = antioch([team(NA, "y1", "y2"), team(NA, "lt", "st")]);
    const left = pruneFireteams({ ...w, members: w.members.filter((x) => x.id !== "y2") });
    expect(left.fireteams).toEqual([team(NA, "lt", "st")]);
    expect("fireteams" in pruneFireteams({ ...w, fireteams: [team(NA, "y1", "y2")], members: w.members.filter((x) => x.id !== "y1") })).toBe(false);
  });

  it("reads upstream's Fireteam wrapper from a NewRecruit roster as a team", () => {
    const sel = (name: string, type: string, selections: RosterSelection[] = []): RosterSelection => ({ name, type, number: 1, costs: [], categories: [], selections });
    const { warband: w } = importRoster(
      { name: "na", gameSystemName: "Trench Crusade", costs: [], forces: [{ catalogueName: "New Antioch", selections: [sel("Lieutenant", "model"), sel("Fireteam", "unit", [sel("Yeoman", "model"), sel("Yeoman", "model")])] }] },
      data(),
      { id: "w" },
    );
    expect(w.members.map((x) => x.unitId)).toEqual(["new-antioch/lieutenant", "new-antioch/yeoman", "new-antioch/yeoman"]);
    expect(w.fireteams).toEqual([team(NA, "m2", "m3")]);
  });
});
