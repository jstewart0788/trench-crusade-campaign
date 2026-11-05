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
import { loadModelMap } from "../src/load.js";
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
      subfaction: null,
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

  it("names the subfaction next to the faction and takes its variant from the subfaction", () => {
    const raiders = warband("heretic-legion", [member("heretic-naval-raiders/heretic-captain", ["submachine-gun"])], {
      subfactionId: "heretic-naval-raiders",
      variantId: "heretic-naval-raiders/the-leviathan-shoal",
    });
    const out = toWarbandExport(raiders, data(), { code: CODE, now: NOW });
    expect(out.warband.faction).toEqual({ id: "heretic-legion", name: "Heretic Legion" });
    expect(out.warband.subfaction).toEqual({ id: "heretic-naval-raiders", name: "Heretic Naval Raiders" });
    expect(out.warband.variant).toEqual({ id: "heretic-naval-raiders/the-leviathan-shoal", name: "The Leviathan Shoal" });
    expect(out.members[0]!.equipment[0]!.cost).toEqual({ ducats: 25, glory: 0 });
    expect(WarbandExport.parse(out)).toEqual(out);
    expect(() => toWarbandExport({ ...raiders, subfactionId: "atlantis" }, data(), { code: CODE })).toThrow(/Unknown subfaction/);
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

describe("member.model and prebuilt TTS text", () => {
  it("carries the default model from data/tts/models.json for every mapped unit, the Lieutenant's being Gannel's 15e05f", () => {
    const out = fixtureExport();
    const map = loadModelMap(repoRoot);
    for (const m of out.members) {
      expect(m.model !== null, `${m.displayName} (${m.unit.id})`).toBe(map.byUnitId.has(m.unit.id));
    }
    expect(out.members.every((m) => m.model !== null)).toBe(true);

    const lieutenant = out.members[0]!.model!;
    expect(lieutenant).toMatchObject({ source: "default", modId: "3700111403", guid: "15e05f", nickname: "Lieutenant" });
    expect(lieutenant.base.meshUrl).toMatch(/^https:\/\//);
    expect(lieutenant.base.scale).toEqual([1, 1, 1]);
    expect(lieutenant.parts).toHaveLength(1);
    expect(lieutenant.parts[0]).toMatchObject({ kind: "Custom_Model", assetBundleUrl: null });
    expect(lieutenant.parts[0]!.meshUrl).toMatch(/^https:\/\//);
    expect(lieutenant.parts[0]!.meshUrl).not.toBe(lieutenant.base.meshUrl);
    expect(lieutenant.parts[0]!.diffuseUrl).toMatch(/^https:\/\//);
    expect(lieutenant.parts[0]!.position[1]).toBeGreaterThan(0);
  });

  it("is null for every member when no model map is loaded", () => {
    const out = toWarbandExport(fixtureWarband(), { ...data(), models: undefined }, { code: CODE, now: NOW });
    expect(out.members.every((m) => m.model === null)).toBe(true);
    expect(WarbandExport.parse(out)).toEqual(out);
  });

  it("prebuilds ttsDescription and ttsGmNotes from the renderers", () => {
    for (const m of fixtureExport().members) {
      expect(m.ttsDescription).toBe(renderTtsDescription(m));
      expect(m.ttsGmNotes).toBe(renderTtsGmNotes(m));
    }
  });
});

describe("built-in kit in the export", () => {
  it("adds card kit as equipment flagged builtIn, card abilities and spells as abilities, and flags fixed armoury kit", () => {
    const d = data();
    const burner = d.unitsById.get("new-antioch/witchburner")!;
    const fixed = burner.equipmentAccess.filter((a) => a.fixed).map((a) => a.itemId);
    const out = toWarbandExport(warband("new-antioch", [member(burner.id, fixed)]), d, { code: CODE, now: NOW });
    expect(WarbandExport.parse(out)).toEqual(out);
    const m = out.members[0]!;
    expect(m.equipment.filter((e) => e.builtIn).map((e) => e.id)).toEqual([...fixed, "profile/gavel-of-justice"]);
    expect(m.equipment.find((e) => e.id === "profile/gavel-of-justice")).toMatchObject({ name: "Gavel of Justice", category: "melee", hands: 1, range: "Melee", cost: { ducats: 0, glory: 0 }, builtIn: true });
    expect(m.abilities.map((a) => a.name)).toEqual(expect.arrayContaining(["Dignified Conduct", "Divine Judgement"]));
    expect(m.equipment.map((e) => e.name)).not.toContain("Dignified Conduct");
    expect(m.ttsDescription).toContain("Gavel of Justice");
    expect(m.ttsGmNotes).toContain("Gavel of Justice");
    expect(m.ttsGmNotes).toContain("Dignified Conduct");
  });

  it("keeps a spell's cost with its text, types card weapons by range, and leaves card armour out of the armour breakdown", () => {
    const d = data();
    const hunter = d.unitsById.get("court-of-the-seven-headed-serpent/hunter-of-the-left-hand-path")!;
    const out = toWarbandExport(warband("court-of-the-seven-headed-serpent", [member(hunter.id, hunter.equipmentAccess.filter((a) => a.fixed).map((a) => a.itemId))]), d, { code: CODE, now: NOW });
    const m = out.members[0]!;
    expect(m.equipment.find((e) => e.name === "Bow of Lethe")).toMatchObject({ category: "ranged", hands: 1, range: '24"', builtIn: true });
    expect(m.abilities.find((a) => a.name === "Oracle Beast Cloak")!.text).toMatch(/^Spell \(Cost 3\): You can cast this spell/);

    const knight = d.unitsById.get("court-of-the-seven-headed-serpent/hell-knight")!;
    const k = toWarbandExport(warband("court-of-the-seven-headed-serpent", [member(knight.id, knight.equipmentAccess.filter((a) => a.fixed).map((a) => a.itemId))]), d, { code: CODE, now: NOW }).members[0]!;
    expect(k.equipment.find((e) => e.name === "Infernal Iron Armour")).toMatchObject({ category: "armour", builtIn: true });
    expect(k.stats.armourBreakdown.map((b) => b.name)).not.toContain("Infernal Iron Armour");
  });

  it("leaves bought kit unflagged", () => {
    for (const e of fixtureExport().members.flatMap((m) => m.equipment)) expect("builtIn" in e).toBe(false);
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

describe("built-in armour is not counted twice", () => {
  it("exports a Witchburner at its printed Armour, not printed plus its built-in Reinforced Armour", async () => {
    const { loadRulesData } = await import("../src/load.js");
    const { toWarbandExport } = await import("../src/export.js");
    const { resolve } = await import("node:path");
    const data = loadRulesData(resolve(import.meta.dirname, "../../.."));
    const unit = data.units.find((u) => u.name === "Witchburner" && u.factionId === "new-antioch")!;
    const fixed = unit.equipmentAccess.filter((a) => a.fixed).map((a) => a.itemId);
    const warband = {
      id: "w", name: "w", factionId: "new-antioch", gameNumber: 1, glory: 10,
      members: [{ id: "m1", unitId: unit.id, equipmentItemIds: fixed }],
    };
    const out = toWarbandExport(warband as never, data, { code: "T", now: "2026-11-04T00:00:00.000Z" });
    expect(unit.stats.armour).toBe(-2);
    expect(out.members[0]!.stats.armour).toBe(-2);
    expect(out.members[0]!.stats.armourBreakdown).toEqual([]);
  });
});
