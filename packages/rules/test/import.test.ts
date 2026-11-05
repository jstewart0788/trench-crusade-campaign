import { deflateRawSync, inflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ImportError, importNewRecruit, importRoster, rosterFromJson, rosterFromXml, type RosterSelection, type RosterTree } from "../src/import/newrecruit.js";
import { parseXml, XmlError } from "../src/import/xml.js";
import { readZipEntries, unzipRoster, ZipError } from "../src/import/zip.js";
import { validateWarband } from "../src/validate.js";
import { data } from "./fixtures.js";

const FIXTURE = readFileSync(resolve(import.meta.dirname, "fixtures/new-antioch.ros"), "utf8");

describe("parseXml", () => {
  it("reads elements, attributes, text, entities, CDATA, comments and prefixes", () => {
    const root = parseXml('<?xml version="1.0"?><!-- c --><bs:a x="1 &amp; 2" y=\'q"q\'><b/><c>t &lt; &#65; &#x42; <![CDATA[<raw>]]></c></bs:a>');
    expect(root.name).toBe("a");
    expect(root.attributes).toEqual({ x: "1 & 2", y: 'q"q' });
    expect(root.children.map((c) => c.name)).toEqual(["b", "c"]);
    expect(root.children[1]!.text).toBe("t < A B <raw>");
  });

  it("rejects malformed documents", () => {
    expect(() => parseXml("<a><b></a>")).toThrow(XmlError);
    expect(() => parseXml("<a x=1/>")).toThrow(XmlError);
    expect(() => parseXml("<a>")).toThrow(XmlError);
    expect(() => parseXml("")).toThrow(XmlError);
  });
});

// A one-file zip, as a .rosz is: local header, data, central directory, end record.
function zipSingle(name: string, content: Uint8Array, method: 0 | 8): Uint8Array {
  const body = method === 8 ? new Uint8Array(deflateRawSync(content)) : content;
  const nameBytes = new TextEncoder().encode(name);
  const local = new Uint8Array(30 + nameBytes.length);
  const lv = new DataView(local.buffer);
  lv.setUint32(0, 0x04034b50, true);
  lv.setUint16(8, method, true);
  lv.setUint32(18, body.length, true);
  lv.setUint32(22, content.length, true);
  lv.setUint16(26, nameBytes.length, true);
  local.set(nameBytes, 30);
  const central = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true);
  cv.setUint16(10, method, true);
  cv.setUint32(20, body.length, true);
  cv.setUint32(24, content.length, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint32(42, 0, true);
  central.set(nameBytes, 46);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, 1, true);
  ev.setUint16(10, 1, true);
  ev.setUint32(12, central.length, true);
  ev.setUint32(16, local.length + body.length, true);
  const out = new Uint8Array(local.length + body.length + central.length + end.length);
  out.set(local, 0);
  out.set(body, local.length);
  out.set(central, local.length + body.length);
  out.set(end, local.length + body.length + central.length);
  return out;
}

describe("unzipRoster", () => {
  const xml = new TextEncoder().encode(FIXTURE);
  const inflate = (d: Uint8Array) => new Uint8Array(inflateRawSync(d));

  it("opens a deflated .rosz and a stored one", async () => {
    const deflated = zipSingle("The Fifth Lantern.ros", xml, 8);
    expect(readZipEntries(deflated).map((e) => [e.name, e.method, e.size])).toEqual([["The Fifth Lantern.ros", 8, xml.length]]);
    expect(await unzipRoster(deflated, inflate)).toBe(FIXTURE);
    expect(await unzipRoster(zipSingle("roster.ros", xml, 0), inflate)).toBe(FIXTURE);
    expect(await unzipRoster(zipSingle("whatever.xml", xml, 8), inflate)).toBe(FIXTURE);
  });

  it("refuses what is not a zip", async () => {
    expect(() => readZipEntries(xml)).toThrow(ZipError);
    await expect(unzipRoster(new Uint8Array(10), inflate)).rejects.toThrow(ZipError);
  });
});

const expectedMembers = [
  { id: "m1", unitId: "new-antioch/lieutenant", name: "Captain Vane", equipmentItemIds: ["sword-axe", "pistol", "standard-armour"] },
  { id: "m2", unitId: "new-antioch/yeoman", equipmentItemIds: ["bolt-action-rifle", "bayonet"] },
];

describe("importNewRecruit (.ros)", () => {
  const result = () => importNewRecruit(FIXTURE, data(), { id: "w-import" });

  it("maps faction, patron, members, custom names, kit by entry id or name, upgrades and the roster name", () => {
    const { warband, source } = result();
    expect(source).toEqual({ format: "ros", rosterName: "The Fifth Lantern", gameSystem: "Trench Crusade", catalogue: "New Antioch", generatedBy: "https://www.newrecruit.eu" });
    expect(warband.id).toBe("w-import");
    expect(warband.name).toBe("The Fifth Lantern");
    expect(warband.factionId).toBe("new-antioch");
    expect(warband.patronId).toBe("temporal-lord");
    expect(warband.variantId).toBeUndefined();
    expect(warband.gameNumber).toBe(1);
    expect(warband.glory).toBeUndefined();
    expect(warband.members.map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6"]);
    expect(warband.members[0]).toEqual(expectedMembers[0]);
    // number="3" on the model with number="3" rifles and bayonets under it: a stack of three, one of each per model.
    expect(warband.members[1]).toEqual(expectedMembers[1]);
    expect(warband.members[2]).toEqual({ ...expectedMembers[1], id: "m3" });
    expect(warband.members[3]).toEqual({ ...expectedMembers[1], id: "m4" });
    expect(warband.members[4]).toEqual({ id: "m5", unitId: "new-antioch/yeoman", name: "Old Tom", equipmentItemIds: ["bolt-action-rifle", "bayonet"], upgradeIds: ["9886-5b15-fa46-8d84"] });
    expect(warband.members[5]).toEqual({ id: "m6", unitId: "new-antioch/shocktrooper", equipmentItemIds: ["submachine-gun"] });
  });

  it("reports every selection it could not map, with its path, and never drops one silently", () => {
    const { unresolved } = result();
    expect(unresolved).toEqual([
      { path: "Allow Third-Party Mercenaries?", name: "Allow Third-Party Mercenaries?", entryId: "campaign-allow-mercs", reason: "not a unit, Warband Variant or Patron of this faction" },
      { path: "Lieutenant > Lucky Charm", name: "Lucky Charm", entryId: "dead-beef-0000-0000", reason: "no item or upgrade of Lieutenant matches it" },
    ]);
  });

  it("maps a Warband Variant selection and the roster's Glory Points", () => {
    const tree = rosterFromXml(FIXTURE);
    tree.forces[0]!.selections.unshift({ name: "Eire Rangers", entryId: "link-variant::6aa4-b38b-5146-4106", number: 1, type: "upgrade", costs: [], categories: [], selections: [] });
    tree.costs = [{ name: "Glory Points", value: 3 }];
    const { warband } = importRoster(tree, data(), { id: "w" });
    expect(warband.variantId).toBe("new-antioch/eire-rangers");
    expect(warband.glory).toBe(3);
    const byName: RosterTree = { ...tree, forces: [{ ...tree.forces[0]!, selections: [{ name: "The Red Brigade", number: 1, costs: [], categories: [], selections: [] }] }] };
    expect(importRoster(byName, data(), { id: "w" }).warband.variantId).toBe("new-antioch/the-red-brigade");
  });

  it("refuses rosters that are not Trench Crusade, not a known faction, or not a roster at all", () => {
    expect(() => importNewRecruit(FIXTURE.replace('gameSystemName="Trench Crusade"', 'gameSystemName="Warhammer 40,000"'), data())).toThrow(/not Trench Crusade/);
    expect(() => importNewRecruit(FIXTURE.replace('catalogueId="707d-5bdf-586e-f704" catalogueRevision="13" catalogueName="New Antioch"', 'catalogueId="0000" catalogueName="Space Marines"'), data())).toThrow(/Could not tell the faction/);
    expect(() => importNewRecruit("<catalogue/>", data())).toThrow(/Expected a <roster>/);
    expect(() => importNewRecruit("<roster><forces><force>", data())).toThrow(ImportError);
    expect(() => importNewRecruit("hello", data())).toThrow(/Not XML and not JSON/);
    expect(() => importNewRecruit("{}", data())).toThrow(ImportError);
  });
});

describe("importNewRecruit (NewRecruit JSON)", () => {
  // The same tree as NewRecruit serialises it: plain properties, arrays for forces/selections/costs/categories.
  const toJson = (s: RosterSelection): unknown => ({
    name: s.name,
    entryId: s.entryId,
    number: s.number,
    type: s.type,
    customName: s.customName,
    costs: s.costs.map((c) => ({ name: c.name, value: c.value })),
    categories: s.categories.map((name) => ({ name })),
    selections: s.selections.map(toJson),
  });
  const asNewRecruit = (tree: RosterTree) => ({
    roster: {
      xmlns: "http://www.battlescribe.net/schema/rosterSchema",
      name: tree.name,
      gameSystemName: tree.gameSystemName,
      generatedBy: "https://www.newrecruit.eu",
      costs: tree.costs.map((c) => ({ name: c.name, value: c.value })),
      forces: tree.forces.map((f) => ({ name: f.name, catalogueName: f.catalogueName, selections: f.selections.map(toJson) })),
    },
  });

  it("gives the same warband as the XML, flagged as json", () => {
    const fromXml = importNewRecruit(FIXTURE, data(), { id: "w" });
    const json = asNewRecruit(rosterFromXml(FIXTURE));
    const fromText = importNewRecruit(JSON.stringify(json), data(), { id: "w" });
    const fromObject = importNewRecruit(json, data(), { id: "w" });
    expect(fromText.warband).toEqual(fromXml.warband);
    expect(fromText.unresolved).toEqual(fromXml.unresolved);
    expect(fromText.source).toEqual({ ...fromXml.source, format: "json" });
    expect(fromObject.warband).toEqual(fromXml.warband);
    expect(rosterFromJson(json.roster).forces[0]!.selections.length).toBe(rosterFromXml(FIXTURE).forces[0]!.selections.length);
  });

  it("also reads the BattleScribe-style wrapper shape (forces.force, costs.cost)", () => {
    const tree = rosterFromXml(FIXTURE);
    const wrapped = {
      roster: {
        name: tree.name,
        costs: { cost: tree.costs },
        forces: { force: [{ catalogueName: "New Antioch", selections: { selection: tree.forces[0]!.selections.map(toJson) } }] },
      },
    };
    expect(importNewRecruit(wrapped, data(), { id: "w" }).warband.members).toHaveLength(6);
  });
});

// A synthetic NewRecruit JSON export of a Heretic Naval Raiders roster, shaped
// like NewRecruit's (force catalogueId/catalogueName, the mandatory Rules
// entry, the variant nested under "Warband Variant", "::"-chained entryIds).
describe("importNewRecruit (subfaction catalogue)", () => {
  const sel = (name: string, entryId: string, selections: unknown[] = [], extra: Record<string, unknown> = {}) => ({ name, entryId, number: 1, type: "upgrade", selections, ...extra });
  const model = (name: string, entryId: string, kit: unknown[]) => sel(name, entryId, kit, { type: "model" });
  const navalRaiders = (force: Record<string, unknown> = { catalogueId: "6497-8a39-4f5c-9873", catalogueName: "Heretic Naval Raiders" }) => ({
    roster: {
      name: "Synthetic Raiders",
      gameSystemName: "Trench Crusade",
      generatedBy: "https://newrecruit.eu",
      costs: [{ name: "Ducats", value: 300 }],
      forces: [
        {
          name: "Warband",
          ...force,
          selections: [
            sel("Campaign Rules", "7346-84e3-dbbb-296d", [sel("Disabled", "7131-4bf6-d01a-d823")]),
            sel("Heretic Naval Raiders Rules", "4d05-603e-4b5a-aed4"),
            sel("Warband Variant", "ecbd39c5-1f66-4239-bf08-dcb6f322048a", [sel("The Leviathan Shoal", "e41075bf-7b42-4a2f-9bf0-4318e6faa459")]),
            model("Heretic Captain", "2d34-a87b-bf44-89e9", [
              sel("Submachine Gun", "x1::8f2f-2c59-b0bc-34fd::ae63-55f4-b047-9820::f350-1594-69d3-e36b::0754-f896-3f97-65c7"),
              sel("Wrecker's Torch", "x2::0f47-b87e-7616-314e"),
            ]),
            model("Anointed Heretic Raider", "ebc6b73a-88a3-5e84-bee8-1298d812f419", [sel("Unseen Infiltrator", "x3::4d671f6e-5a78-4d0d-bbaa-ef0ce90e9cd7"), sel("Reinforced Armour", "x4::a535-4fb6-c587-691a")]),
            { ...model("Heretic Raider", "18e1caca-219b-504d-aac1-d911715cc86c", [sel("Boarding Axe", "x5::23f8-2b1b-2d77-f13b", [], { number: 2 })]), number: 2 },
            model("Sin Eater", "e4c97085-1d74-49d0-bc04-82b1f3c813cf::4703-d968-d52d-46b5", [sel("Tenderizer Maul", "e4c97085-1d74-49d0-bc04-82b1f3c813cf::4d1c-67e3-95cf-1169")]),
          ],
        },
      ],
    },
  });

  it("resolves the force by catalogueId to the subfaction, nested under its faction, with every model mapped", () => {
    const { warband, unresolved, source } = importNewRecruit(navalRaiders(), data(), { id: "w" });
    expect(warband.factionId).toBe("heretic-legion");
    expect(warband.subfactionId).toBe("heretic-naval-raiders");
    expect(warband.variantId).toBe("heretic-naval-raiders/the-leviathan-shoal");
    expect(warband.members.map((m) => m.unitId)).toEqual([
      "heretic-naval-raiders/heretic-captain",
      "heretic-naval-raiders/anointed-heretic-raider",
      "heretic-naval-raiders/heretic-raider",
      "heretic-naval-raiders/heretic-raider",
      "heretic-naval-raiders/sin-eater",
    ]);
    expect(warband.members[0]!.equipmentItemIds).toEqual(["submachine-gun", "wrecker-s-torch"]);
    expect(warband.members[1]).toMatchObject({ equipmentItemIds: ["reinforced-armour"], upgradeIds: ["4d671f6e-5a78-4d0d-bbaa-ef0ce90e9cd7"] });
    expect(warband.members[2]!.equipmentItemIds).toEqual(["boarding-axe"]);
    expect(source.catalogue).toBe("Heretic Naval Raiders");
    // The Rules entry and the variant are consumed; only the campaign toggle is left over.
    expect(unresolved.map((u) => u.path)).toEqual(["Campaign Rules"]);
  });

  it("falls back to the catalogue name, then to the parent faction", () => {
    const idWins = importNewRecruit(navalRaiders({ catalogueId: "6497-8a39-4f5c-9873", catalogueName: "Heretic Legion" }), data(), { id: "w" }).warband;
    expect(idWins).toMatchObject({ factionId: "heretic-legion", subfactionId: "heretic-naval-raiders" });
    const byName = importNewRecruit(navalRaiders({ catalogueName: "Heretic Naval Raiders" }), data(), { id: "w" }).warband;
    expect(byName).toMatchObject({ factionId: "heretic-legion", subfactionId: "heretic-naval-raiders" });
    const parent = importNewRecruit(navalRaiders({ catalogueId: "6941-ec54-3001-8288", catalogueName: "Heretic Legion" }), data(), { id: "w" });
    expect(parent.warband.factionId).toBe("heretic-legion");
    expect(parent.warband.subfactionId).toBeUndefined();
    expect(parent.warband.members.map((m) => m.unitId)).toEqual(["heretic-legion/sin-eater"]);
  });

  it("validates the mapped warband against the subfaction's list", () => {
    const { warband } = importNewRecruit(navalRaiders(), data(), { id: "w" });
    expect(validateWarband(warband, data()).errors.map((e) => e.code)).not.toContain("unit-faction");
  });
});

describe("the imported warband", () => {
  it("validates as a legal starting warband", () => {
    const { warband } = importNewRecruit(FIXTURE, data(), { id: "w" });
    const v = validateWarband(warband, data());
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("divides a stack's kit counts by the stack, never below one each", () => {
    const tree = rosterFromXml(FIXTURE);
    const stack = tree.forces[0]!.selections.find((s) => s.name === "Yeoman" && s.number === 3)!;
    stack.selections[0]!.number = 2;
    const { warband } = importRoster(tree, data(), { id: "w" });
    for (const id of ["m2", "m3", "m4"]) expect(warband.members.find((m) => m.id === id)!.equipmentItemIds).toEqual(["bolt-action-rifle", "bayonet"]);
    stack.selections[0]!.number = 6;
    const doubled = importRoster(tree, data(), { id: "w" });
    expect(doubled.warband.members[1]!.equipmentItemIds).toEqual(["bolt-action-rifle", "bolt-action-rifle", "bayonet"]);
  });
});
