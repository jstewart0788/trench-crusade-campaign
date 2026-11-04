import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WARBAND_EXPORT_VERSION,
  WarbandExport,
  WarbandExportError,
  renderStatLine,
  renderTtsDescription,
  renderTtsGmNotes,
  toWarbandExport,
} from "../src/export.js";
import type { Warband } from "../src/roster.js";
import { data, member, newAntioch, repoRoot, warband } from "./fixtures.js";

const CODE = "NA-TEST-01";
const NOW = "2026-11-04T12:00:00.000Z";
const FIXTURE = resolve(repoRoot, "mod/fixtures/warband-new-antioch.json");

// member() hands out sequential ids, so pin them: the committed fixture must
// not depend on how many members earlier tests built.
function fixtureWarband(overrides: Partial<Warband> = {}): Warband {
  const base = newAntioch();
  return { ...base, members: base.members.map((m, i) => ({ ...m, id: `m${i + 1}` })), ...overrides };
}
const fixtureExport = () => toWarbandExport(fixtureWarband(), data(), { code: CODE, now: NOW });

describe("toWarbandExport", () => {
  it("produces a payload that round-trips through the WarbandExport schema and JSON unchanged", () => {
    const out = fixtureExport();
    expect(out.version).toBe(WARBAND_EXPORT_VERSION);
    expect(WarbandExport.parse(out)).toEqual(out);
    expect(WarbandExport.parse(JSON.parse(JSON.stringify(out)))).toEqual(out);
  });

  it("is deterministic for a fixed now", () => {
    expect(JSON.stringify(fixtureExport())).toBe(JSON.stringify(fixtureExport()));
    expect(fixtureExport().generatedAt).toBe(NOW);
  });

  it("binds the warband header from the rules data, cost and validation", () => {
    const out = fixtureExport();
    expect(out.code).toBe(CODE);
    expect(out.warband).toEqual({
      id: "w1",
      name: "Test warband",
      gameNumber: 1,
      faction: { id: "new-antioch", name: "New Antioch" },
      variant: null,
      patron: null,
      totals: { ducats: 318, glory: 0 },
      valid: true,
      errorCount: 0,
    });
    expect(out.members.map((m) => m.displayName)).toEqual(["Lieutenant", "Yeoman", "Yeoman", "Yeoman", "Yeoman", "Shocktrooper"]);

    const over = toWarbandExport(fixtureWarband({ variantId: "new-antioch/eire-rangers", patronId: "temporal-lord" }), data(), {
      code: CODE,
      now: NOW,
    });
    expect(over.warband.variant).toEqual({ id: "new-antioch/eire-rangers", name: "Eire Rangers" });
    expect(over.warband.patron).toEqual({ id: "temporal-lord", name: "Temporal Lord" });

    const broke = toWarbandExport(fixtureWarband({ members: [...fixtureWarband().members, member("new-antioch/lieutenant", [])] }), data(), { code: CODE, now: NOW });
    expect(broke.warband.valid).toBe(false);
    expect(broke.warband.errorCount).toBeGreaterThan(0);
  });

  it("reports armour as base plus worn armour and shield, with the breakdown naming the items", () => {
    const out = fixtureExport();
    const lieutenant = out.members[0]!;
    expect(lieutenant.stats.armour).toBe(-1);
    expect(lieutenant.stats.armourBreakdown).toEqual([{ itemId: "standard-armour", name: "Standard Armour", delta: -1 }]);
    expect(out.members[1]!.stats).toMatchObject({ armour: 0, armourBreakdown: [] });

    const shielded = toWarbandExport(warband("new-antioch", [member("new-antioch/yeoman", ["trench-shield", "standard-armour", "sword-axe"])]), data(), { code: CODE, now: NOW });
    expect(shielded.members[0]!.stats.armour).toBe(-2);
    expect(shielded.members[0]!.stats.armourBreakdown.map((b) => b.name)).toEqual(["Trench Shield", "Standard Armour"]);
  });

  it("lists equipment in the member's order at the member's price, and upgrades with their rule text", () => {
    const out = fixtureExport();
    expect(out.members[0]!.equipment.map((e) => [e.id, e.cost.ducats])).toEqual([
      ["sword-axe", 4],
      ["pistol", 6],
      ["standard-armour", 15],
    ]);
    expect(out.members[1]!.equipment.map((e) => [e.name, e.range, e.hands, e.cost.ducats])).toEqual([
      ["Bolt-Action Rifle", '24"', 2, 5],
      ["Bayonet", "Melee", 2, 2],
    ]);
    expect(out.members[5]!.equipment[0]).toMatchObject({ name: "Submachine Gun", category: "ranged", keywords: ["ASSAULT"] });
    expect(out.members[5]!.equipment[0]!.rules).toContain("Quick Bursts");

    const redBrigade = toWarbandExport(
      warband("new-antioch", [member("new-antioch/yeoman", [], ["114b-97a7-6011-55c2"])], { variantId: "new-antioch/the-red-brigade" }),
      data(),
      { code: CODE, now: NOW },
    );
    expect(redBrigade.members[0]!.upgrades).toEqual([
      expect.objectContaining({ name: "Blood Cloak", cost: { ducats: 5, glory: 0 } }),
    ]);
    expect(redBrigade.members[0]!.upgrades[0]!.text).toMatch(/^Blood Cloak: A model wearing a Blood Cloak gains the Keyword SKIRMISHER\nSkirmisher: /);
    expect(redBrigade.members[0]!.displayName).toBe("Yeoman");
  });

  it("includes only the abilities whose variant gate the warband satisfies", () => {
    const names = (variantId?: string) =>
      toWarbandExport(fixtureWarband(variantId ? { variantId } : {}), data(), { code: CODE, now: NOW }).members[0]!.abilities.map((a) => a.name);
    expect(names()).toEqual(["Hold Your Fire!", "Tough", "Leader"]);
    expect(names("new-antioch/eire-rangers")).toEqual(["Skirmisher", "Tough", "Leader"]);
  });

  it("uses the member's own name as displayName when set", () => {
    const named = { ...member("new-antioch/lieutenant", []), name: "Captain Vane" };
    const out = toWarbandExport(warband("new-antioch", [named]), data(), { code: CODE, now: NOW });
    expect(out.members[0]).toMatchObject({ displayName: "Captain Vane", unit: { name: "Lieutenant" }, skills: [], injuries: [], notes: null });
  });

  it("refuses a roster that references units, items or upgrades the data does not have", () => {
    const d = data();
    expect(() => toWarbandExport(warband("new-antioch", [member("new-antioch/nobody", [])]), d, { code: CODE })).toThrow(WarbandExportError);
    expect(() => toWarbandExport(warband("new-antioch", [member("new-antioch/yeoman", ["laser"])]), d, { code: CODE })).toThrow(/Unknown item "laser"/);
    expect(() => toWarbandExport(warband("new-antioch", [member("new-antioch/yeoman", [], ["nope"])]), d, { code: CODE })).toThrow(/Unknown upgrade "nope"/);
    expect(() => toWarbandExport(warband("atlantis", []), d, { code: CODE })).toThrow(/Unknown faction/);
  });
});

describe("renderTtsDescription", () => {
  it("carries the name, stat line, keywords and every equipment name, and fits a tooltip", () => {
    for (const m of fixtureExport().members) {
      const text = renderTtsDescription(m);
      expect(text).toContain(`[b]${m.displayName}[/b]`);
      expect(text).toContain(renderStatLine(m));
      expect(text).toContain(m.unit.keywords.join(", "));
      for (const e of m.equipment) expect(text).toContain(e.name);
      for (const a of m.abilities) {
        expect(text).toContain(a.name);
        expect(text).not.toContain(a.text);
      }
      expect(text.length).toBeLessThan(1000);
    }
  });

  it("renders the stat line as Mov/Rng/Mel/Arm/Base with signed armour", () => {
    const lieutenant = fixtureExport().members[0]!;
    expect(renderStatLine(lieutenant)).toBe('[b]Mov[/b] 6"/Infantry  [b]Rng[/b] +2  [b]Mel[/b] +2  [b]Arm[/b] -1  [b]Base[/b] 32mm');
    expect(renderTtsDescription(lieutenant).split("\n")).toEqual([
      "[d9b352][b]Lieutenant[/b][-]",
      renderStatLine(lieutenant),
      "[i]Elite, Leader, New Antioch, Tough[/i]",
      "Sword/Axe (Melee) CRITICAL",
      'Pistol (12"/Melee) PISTOL',
      "Standard Armour -1 INJURY MODIFIER",
      "[b]Abilities:[/b] Hold Your Fire!, Tough, Leader",
    ]);
  });
});

describe("renderTtsGmNotes", () => {
  it("carries the full ability and equipment rule text", () => {
    const shock = fixtureExport().members[5]!;
    const notes = renderTtsGmNotes(shock);
    expect(notes).toContain("Shocktrooper");
    expect(notes).toContain('Mov 6"/Infantry | Rng +0 | Mel +1 | Arm 0 | Base 25mm');
    for (const a of shock.abilities) expect(notes).toContain(`${a.name}: ${a.text}`);
    expect(notes).toContain(shock.equipment[0]!.rules);
    expect(notes).not.toMatch(/\[b\]|\[i\]/);

    const lieutenant = fixtureExport().members[0]!;
    expect(renderTtsGmNotes(lieutenant)).toContain("Armour: 0 base, Standard Armour -1");
  });
});

describe("mod/fixtures/warband-new-antioch.json", () => {
  it("matches a fresh export of the New Antioch starting warband (WRITE_FIXTURES=1 rewrites it)", () => {
    const fresh = fixtureExport();
    const text = `${JSON.stringify(fresh, null, 2)}\n`;
    if (process.env.WRITE_FIXTURES === "1") {
      mkdirSync(dirname(FIXTURE), { recursive: true });
      writeFileSync(FIXTURE, text);
    }
    expect(existsSync(FIXTURE), `${FIXTURE} is missing; run with WRITE_FIXTURES=1`).toBe(true);
    const committed = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(WarbandExport.parse(committed)).toEqual(fresh);
    expect(committed).toEqual(fresh);
  });
});
