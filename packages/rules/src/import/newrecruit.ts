import { findSubfaction, rosterUnits, rosterVariants, upgradeFor, type RosterScope, type RosterUnit, type RulesData } from "../data.js";
import { normaliseName } from "../limits.js";
import type { Warband, WarbandMember } from "../roster.js";
import type { EquipmentItem } from "../schema.js";
import { patronsForFaction } from "../validate.js";
import { parseXml, XmlError, type XmlElement } from "./xml.js";

// NewRecruit exports a roster either as BattleScribe XML (.ros, or .rosz
// zipped) or as the same tree serialised to JSON. Both are read into one
// RosterTree and mapped onto our Warband by the BattleScribe entry ids the
// converter keeps as bsId / bsIds / bsLinkId, with the entry name as the
// fallback. Whatever cannot be mapped is reported, never dropped.

export const ROSTER_NAMESPACE = "http://www.battlescribe.net/schema/rosterSchema";

export interface RosterCost {
  name: string;
  value: number;
}

export interface RosterSelection {
  name: string;
  entryId?: string;
  entryGroupId?: string;
  number: number;
  type?: string;
  customName?: string;
  costs: RosterCost[];
  categories: string[];
  selections: RosterSelection[];
}

export interface RosterForce {
  name?: string;
  catalogueId?: string;
  catalogueName?: string;
  selections: RosterSelection[];
}

export interface RosterTree {
  name: string;
  gameSystemName?: string;
  generatedBy?: string;
  costs: RosterCost[];
  forces: RosterForce[];
}

export interface UnresolvedSelection {
  /** Where it sat in the roster, e.g. "Lieutenant > Lucky Charm". */
  path: string;
  name: string;
  entryId?: string;
  reason: string;
}

export interface ImportSource {
  format: "ros" | "json";
  rosterName: string;
  gameSystem?: string;
  catalogue?: string;
  generatedBy?: string;
}

export interface ImportResult {
  warband: Warband;
  unresolved: UnresolvedSelection[];
  source: ImportSource;
}

export interface ImportOptions {
  /** Warband id; a random UUID by default. */
  id?: string;
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

// Reading the two serialisations ------------------------------------------

const num = (s: string | undefined, fallback: number) => {
  const v = Number(s);
  return Number.isFinite(v) ? v : fallback;
};

function selectionFromXml(el: XmlElement): RosterSelection {
  const a = el.attributes;
  const child = (name: string) => el.children.find((c) => c.name === name);
  const sel: RosterSelection = {
    name: a.name ?? "",
    number: Math.max(1, Math.round(num(a.number, 1))),
    costs: (child("costs")?.children ?? []).filter((c) => c.name === "cost").map((c) => ({ name: c.attributes.name ?? "", value: num(c.attributes.value, 0) })),
    categories: (child("categories")?.children ?? []).filter((c) => c.name === "category").map((c) => c.attributes.name ?? ""),
    selections: (child("selections")?.children ?? []).filter((c) => c.name === "selection").map(selectionFromXml),
  };
  if (a.entryId) sel.entryId = a.entryId;
  if (a.entryGroupId) sel.entryGroupId = a.entryGroupId;
  if (a.type) sel.type = a.type;
  if (a.customName) sel.customName = a.customName;
  return sel;
}

export function rosterFromXml(xml: string): RosterTree {
  let root: XmlElement;
  try {
    root = parseXml(xml);
  } catch (e) {
    throw new ImportError(`Not well-formed XML: ${e instanceof XmlError ? e.message : String(e)}`);
  }
  if (root.name !== "roster") throw new ImportError(`Expected a <roster> document, found <${root.name}>`);
  const a = root.attributes;
  const child = (name: string) => root.children.find((c) => c.name === name);
  const tree: RosterTree = {
    name: a.name ?? "",
    costs: (child("costs")?.children ?? []).filter((c) => c.name === "cost").map((c) => ({ name: c.attributes.name ?? "", value: num(c.attributes.value, 0) })),
    forces: (child("forces")?.children ?? [])
      .filter((c) => c.name === "force")
      .map((f) => {
        const force: RosterForce = {
          selections: (f.children.find((c) => c.name === "selections")?.children ?? []).filter((c) => c.name === "selection").map(selectionFromXml),
        };
        if (f.attributes.name) force.name = f.attributes.name;
        if (f.attributes.catalogueId) force.catalogueId = f.attributes.catalogueId;
        if (f.attributes.catalogueName) force.catalogueName = f.attributes.catalogueName;
        return force;
      }),
  };
  if (a.gameSystemName) tree.gameSystemName = a.gameSystemName;
  if (a.generatedBy) tree.generatedBy = a.generatedBy;
  return tree;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | undefined => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : typeof v === "number" ? String(v) : undefined);

function costsFromJson(v: unknown): RosterCost[] {
  const container = obj(v);
  const list = Array.isArray(v) ? v : container ? arr(container.cost ?? container.costs) : [];
  return list.flatMap((c) => {
    const o = obj(c);
    return o ? [{ name: str(o.name) ?? "", value: num(str(o.value), 0) }] : [];
  });
}

function listFromJson(v: unknown, key: string): unknown[] {
  if (Array.isArray(v)) return v;
  const o = obj(v);
  return o ? arr(o[key]) : [];
}

function selectionFromJson(v: unknown): RosterSelection | undefined {
  const o = obj(v);
  if (!o) return undefined;
  const sel: RosterSelection = {
    name: str(o.name) ?? "",
    number: Math.max(1, Math.round(num(str(o.number), 1))),
    costs: costsFromJson(o.costs),
    categories: listFromJson(o.categories, "category").flatMap((c) => {
      const co = obj(c);
      return co ? [str(co.name) ?? ""] : [];
    }),
    selections: listFromJson(o.selections, "selection").flatMap((s) => {
      const parsed = selectionFromJson(s);
      return parsed ? [parsed] : [];
    }),
  };
  const entryId = str(o.entryId);
  const entryGroupId = str(o.entryGroupId);
  const type = str(o.type);
  const customName = str(o.customName);
  if (entryId) sel.entryId = entryId;
  if (entryGroupId) sel.entryGroupId = entryGroupId;
  if (type) sel.type = type;
  if (customName) sel.customName = customName;
  return sel;
}

/** NewRecruit's JSON export: `{ roster: {...} }` (or the roster object itself) with the BattleScribe roster tree as plain properties and arrays. */
export function rosterFromJson(input: unknown): RosterTree {
  const outer = obj(input);
  if (!outer) throw new ImportError("Expected a JSON object");
  const roster = obj(outer.roster) ?? outer;
  const forces = listFromJson(roster.forces, "force");
  if (!Array.isArray(roster.forces) && !obj(roster.forces)) throw new ImportError("Not a roster: no forces");
  const tree: RosterTree = {
    name: str(roster.name) ?? str(outer.name) ?? "",
    costs: costsFromJson(roster.costs),
    forces: forces.flatMap((f) => {
      const fo = obj(f);
      if (!fo) return [];
      const force: RosterForce = {
        selections: listFromJson(fo.selections, "selection").flatMap((s) => {
          const parsed = selectionFromJson(s);
          return parsed ? [parsed] : [];
        }),
      };
      const name = str(fo.name);
      const catalogueId = str(fo.catalogueId);
      const catalogueName = str(fo.catalogueName);
      if (name) force.name = name;
      if (catalogueId) force.catalogueId = catalogueId;
      if (catalogueName) force.catalogueName = catalogueName;
      return [force];
    }),
  };
  const gameSystemName = str(roster.gameSystemName);
  const generatedBy = str(roster.generatedBy) ?? str(outer.generatedBy);
  if (gameSystemName) tree.gameSystemName = gameSystemName;
  if (generatedBy) tree.generatedBy = generatedBy;
  return tree;
}

// Mapping onto the Warband --------------------------------------------------

const segments = (entryId: string | undefined): string[] => (entryId ? entryId.split("::").map((s) => s.trim()).filter(Boolean) : []);

const factionNorm = (s: string) => normaliseName(s).replace(/^the/, "").replace(/s$/, "");

// The force's catalogue decides the roster list: its BattleScribe id first
// (each faction and subfaction keeps its catalogue id as bsId), then its name,
// matching a subfaction before the faction names it might contain.
function factionFor(tree: RosterTree, data: RulesData): { force: RosterForce; scope: RosterScope } {
  const force = tree.forces.find((f) => f.catalogueId || f.catalogueName || f.name) ?? tree.forces[0];
  if (!force) throw new ImportError("The roster has no force");
  if (force.catalogueId) {
    for (const faction of data.factions) {
      if (faction.bsId === force.catalogueId) return { force, scope: { factionId: faction.id } };
      const sub = faction.subfactions?.find((s) => s.bsId === force.catalogueId);
      if (sub) return { force, scope: { factionId: faction.id, subfactionId: sub.id } };
    }
  }
  for (const candidate of [force.catalogueName, force.name]) {
    if (!candidate) continue;
    const sub = [...data.subfactionsById.values()].find((s) => factionNorm(s.subfaction.name) === factionNorm(candidate));
    if (sub) return { force, scope: { factionId: sub.faction.id, subfactionId: sub.subfaction.id } };
    const faction = data.factions.find((f) => factionNorm(f.name) === factionNorm(candidate) || factionNorm(candidate).includes(factionNorm(f.name)));
    if (faction) return { force, scope: { factionId: faction.id } };
  }
  const known = data.factions.flatMap((f) => [f.name, ...(f.subfactions ?? []).map((s) => s.name)]);
  throw new ImportError(`Could not tell the faction from "${force.catalogueName ?? force.name ?? "?"}"; expected one of ${known.join(", ")}`);
}

function unitFor(sel: RosterSelection, scope: RosterScope, data: RulesData): RosterUnit | undefined {
  const units = rosterUnits(data, scope);
  for (const seg of segments(sel.entryId)) {
    const byId = units.find((u) => u.bsId === seg || u.bsLinkId === seg);
    if (byId) return byId;
  }
  const key = normaliseName(sel.name);
  return units.find((u) => normaliseName(u.name) === key);
}

function itemFor(sel: RosterSelection, unit: RosterUnit, data: RulesData): string | undefined {
  const ids = segments(sel.entryId);
  // bsId / bsIds are the converter's extra fields on the passthrough item schema.
  const matchesId = (item: EquipmentItem) => {
    const extra = item as Record<string, unknown>;
    const known = [extra.bsId, ...(Array.isArray(extra.bsIds) ? extra.bsIds : [])].filter((x): x is string => typeof x === "string");
    return ids.some((seg) => known.includes(seg));
  };
  const armoury = unit.equipmentAccess.map((a) => data.equipmentById.get(a.itemId)).filter((i): i is NonNullable<typeof i> => i !== undefined);
  const inArmoury = armoury.find(matchesId) ?? armoury.find((i) => normaliseName(i.name) === normaliseName(sel.name));
  if (inArmoury) return inArmoury.id;
  // Known item the unit cannot normally take: keep it and let the validator say so.
  return data.equipment.find(matchesId)?.id;
}

function upgradeIdFor(sel: RosterSelection, unit: RosterUnit): string | undefined {
  for (const seg of segments(sel.entryId)) {
    const g = upgradeFor(unit, seg);
    if (g) return g.bsId;
  }
  const key = normaliseName(sel.name);
  return unit.upgrades?.find((g) => normaliseName(g.name) === key)?.bsId;
}

interface Walk {
  member: WarbandMember;
  unit: RosterUnit;
  /** Models in the selection the kit belongs to: BattleScribe stores a stack's kit counts as totals. */
  stack: number;
  data: RulesData;
  unresolved: UnresolvedSelection[];
}

function walkKit(selections: RosterSelection[], path: string, w: Walk): void {
  for (const sel of selections) {
    const here = `${path} > ${sel.name}`;
    const copies = Math.max(1, Math.round(sel.number / w.stack));
    const itemId = itemFor(sel, w.unit, w.data);
    if (itemId) {
      for (let i = 0; i < copies; i++) w.member.equipmentItemIds.push(itemId);
    } else {
      const upgradeId = upgradeIdFor(sel, w.unit);
      if (upgradeId) {
        for (let i = 0; i < copies; i++) (w.member.upgradeIds ??= []).push(upgradeId);
      } else {
        const entry: UnresolvedSelection = { path: here, name: sel.name, reason: `no item or upgrade of ${w.unit.name} matches it` };
        if (sel.entryId) entry.entryId = sel.entryId;
        w.unresolved.push(entry);
      }
    }
    walkKit(sel.selections, here, w);
  }
}

export function importRoster(tree: RosterTree, data: RulesData, opts: ImportOptions = {}): ImportResult {
  if (tree.gameSystemName && !normaliseName(tree.gameSystemName).includes("trenchcrusade")) {
    throw new ImportError(`This is a "${tree.gameSystemName}" roster, not Trench Crusade`);
  }
  const { force, scope } = factionFor(tree, data);
  const { factionId } = scope;
  const variants = rosterVariants(data, scope);
  const list = findSubfaction(data, scope) ?? data.factionsById.get(factionId)!;
  // The subfaction's "<Name> Rules" entry: it is what makes the roster that subfaction.
  const mandatoryConfig = new Set((list.configuration ?? []).filter((c) => c.mandatory).map((c) => c.bsId));
  const unresolved: UnresolvedSelection[] = [];
  const warband: Warband = {
    id: opts.id ?? crypto.randomUUID(),
    name: tree.name.trim() || "Imported warband",
    factionId,
    gameNumber: 1,
    members: [],
  };
  if (scope.subfactionId) warband.subfactionId = scope.subfactionId;
  const glory = tree.costs.find((c) => /glory/i.test(c.name));
  if (glory && glory.value > 0) warband.glory = Math.round(glory.value);

  let seq = 0;
  const addMember = (sel: RosterSelection, unit: RosterUnit, path: string) => {
    for (let i = 0; i < sel.number; i++) {
      const member: WarbandMember = { id: `m${++seq}`, unitId: unit.id, equipmentItemIds: [] };
      const custom = sel.customName?.trim();
      if (custom) member.name = custom;
      walkKit(sel.selections, path, { member, unit, stack: sel.number, data, unresolved });
      warband.members.push(member);
    }
  };

  const patrons = patronsForFaction(data, factionId);
  const variantFor = (s: RosterSelection) =>
    variants.find((v) => segments(s.entryId).includes(String((v as { bsId?: unknown }).bsId)) || normaliseName(v.name) === normaliseName(s.name));
  for (const sel of force.selections) {
    const path = sel.name;
    if (segments(sel.entryId).some((seg) => mandatoryConfig.has(seg))) continue;
    // NewRecruit nests the chosen variant under a "Warband Variant" selection.
    const variant = variantFor(sel) ?? (sel.selections.length === 1 ? variantFor(sel.selections[0]!) : undefined);
    if (variant) {
      warband.variantId = variant.id;
      continue;
    }
    const patron = patrons.find((p) => normaliseName(p.name) === normaliseName(sel.name)) ?? patrons.find((p) => sel.selections.some((c) => normaliseName(c.name) === normaliseName(p.name)));
    if (patron) {
      warband.patronId = patron.id;
      continue;
    }
    const unit = unitFor(sel, scope, data);
    if (unit) {
      addMember(sel, unit, path);
      continue;
    }
    if (sel.type === "unit") {
      // A wrapper (the deprecated Fireteams): its models are members, the wrapper itself is reported.
      const models = sel.selections.filter((c) => c.type === "model" && unitFor(c, scope, data));
      for (const m of models) addMember(m, unitFor(m, scope, data)!, `${path} > ${m.name}`);
      const entry: UnresolvedSelection = { path, name: sel.name, reason: models.length ? "a wrapper; its models were imported on their own" : "not a unit of this faction" };
      if (sel.entryId) entry.entryId = sel.entryId;
      unresolved.push(entry);
      continue;
    }
    const entry: UnresolvedSelection = { path, name: sel.name, reason: "not a unit, Warband Variant or Patron of this faction" };
    if (sel.entryId) entry.entryId = sel.entryId;
    unresolved.push(entry);
  }

  const source: ImportSource = { format: "ros", rosterName: tree.name };
  if (tree.gameSystemName) source.gameSystem = tree.gameSystemName;
  if (force.catalogueName) source.catalogue = force.catalogueName;
  if (tree.generatedBy) source.generatedBy = tree.generatedBy;
  return { warband, unresolved, source };
}

/** Reads a .ros document or NewRecruit JSON (text or parsed) and maps it. */
export function importNewRecruit(input: string | object, data: RulesData, opts: ImportOptions = {}): ImportResult {
  if (typeof input === "string") {
    const text = input.replace(/^﻿/, "").trimStart();
    if (text.startsWith("<")) return importRoster(rosterFromXml(text), data, opts);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ImportError("Not XML and not JSON: expected a BattleScribe .ros roster or a NewRecruit JSON export");
    }
    const result = importRoster(rosterFromJson(parsed), data, opts);
    result.source.format = "json";
    return result;
  }
  const result = importRoster(rosterFromJson(input), data, opts);
  result.source.format = "json";
  return result;
}
