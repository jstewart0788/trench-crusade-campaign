import { z } from "zod";
import { itemCost, warbandCost } from "./cost.js";
import { normaliseName } from "./limits.js";
import { findUnit, upgradeFor, type RosterAbility, type RulesData } from "./load.js";
import type { Warband, WarbandMember } from "./roster.js";
import { EquipmentCategory, Movement } from "./schema.js";
import { validateWarband } from "./validate.js";

// The warband payload the TTS mod fetches from /api/tts/warband/{code}
// (ROADMAP Phase 1, TC-012/TC-016). Everything the mod needs to spawn a model
// and bind its loadout is resolved here, so the mod never reads the rules data.

export const WARBAND_EXPORT_VERSION = "tc-warband-export-v1";

const Named = z.object({ id: z.string(), name: z.string() });
const ExportCost = z.object({ ducats: z.number().int(), glory: z.number().int() });

export const ExportEquipment = z.object({
  id: z.string(),
  name: z.string(),
  category: EquipmentCategory,
  hands: z.union([z.literal(1), z.literal(2)]).nullable(),
  range: z.string().nullable(),
  keywords: z.array(z.string()),
  rules: z.string(),
  cost: ExportCost,
});
export type ExportEquipment = z.infer<typeof ExportEquipment>;

export const ExportMember = z.object({
  id: z.string(),
  displayName: z.string(),
  unit: z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(["model", "fireteam"]),
    elite: z.boolean(),
    keywords: z.array(z.string()),
  }),
  stats: z.object({
    movement: Movement,
    ranged: z.string(),
    melee: z.string(),
    armour: z.number().int(),
    armourBreakdown: z.array(z.object({ itemId: z.string(), name: z.string(), delta: z.number().int() })),
    base: z.string(),
  }),
  abilities: z.array(z.object({ name: z.string(), text: z.string() })),
  equipment: z.array(ExportEquipment),
  upgrades: z.array(z.object({ name: z.string(), text: z.string(), cost: ExportCost })),
  // Campaign progression is not modelled yet; the fields exist so the mod's
  // binding code does not change when it is.
  skills: z.array(z.object({ name: z.string(), text: z.string() })),
  injuries: z.array(z.object({ name: z.string(), text: z.string() })),
  notes: z.string().nullable(),
});
export type ExportMember = z.infer<typeof ExportMember>;

export const WarbandExport = z.object({
  version: z.literal(WARBAND_EXPORT_VERSION),
  code: z.string().min(1),
  generatedAt: z.string().datetime(),
  warband: z.object({
    id: z.string(),
    name: z.string(),
    gameNumber: z.number().int().positive(),
    faction: Named,
    variant: Named.nullable(),
    patron: Named.nullable(),
    totals: ExportCost,
    valid: z.boolean(),
    errorCount: z.number().int().nonnegative(),
  }),
  members: z.array(ExportMember),
});
export type WarbandExport = z.infer<typeof WarbandExport>;

export interface ExportOptions {
  code: string;
  now?: Date | string;
}

export class WarbandExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WarbandExportError";
  }
}

export function toWarbandExport(warband: Warband, data: RulesData, opts: ExportOptions): WarbandExport {
  const faction = data.factionsById.get(warband.factionId);
  if (!faction) throw new WarbandExportError(`Unknown faction "${warband.factionId}"`);
  const variant = faction.variants.find((v) => v.id === warband.variantId);
  if (warband.variantId !== undefined && !variant) throw new WarbandExportError(`Unknown variant "${warband.variantId}"`);
  const patron = data.campaign.patrons.find((p) => p.id === warband.patronId);
  if (warband.patronId !== undefined && !patron) throw new WarbandExportError(`Unknown patron "${warband.patronId}"`);

  const cost = warbandCost(warband, data);
  const validation = validateWarband(warband, data);
  const now = opts.now === undefined ? new Date() : new Date(opts.now);

  return {
    version: WARBAND_EXPORT_VERSION,
    code: opts.code,
    generatedAt: now.toISOString(),
    warband: {
      id: warband.id,
      name: warband.name,
      gameNumber: warband.gameNumber,
      faction: { id: faction.id, name: faction.name },
      variant: variant ? { id: variant.id, name: variant.name } : null,
      patron: patron ? { id: patron.id, name: patron.name } : null,
      totals: { ducats: cost.ducats, glory: cost.glory },
      valid: validation.ok,
      errorCount: validation.errors.length,
    },
    members: warband.members.map((m) => exportMember(m, warband, data, variant?.name)),
  };
}

function exportMember(member: WarbandMember, warband: Warband, data: RulesData, variantName: string | undefined): ExportMember {
  const unit = findUnit(data, warband.factionId, member.unitId);
  if (!unit) throw new WarbandExportError(`Unknown unit "${member.unitId}" on member ${member.id}`);

  const equipment: ExportEquipment[] = member.equipmentItemIds.map((itemId) => {
    const item = data.equipmentById.get(itemId);
    if (!item) throw new WarbandExportError(`Unknown item "${itemId}" on member ${member.id}`);
    const { ducats, glory } = itemCost(data, warband.factionId, member.unitId, itemId);
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      hands: item.hands,
      range: item.range,
      keywords: item.keywords,
      rules: item.rules,
      cost: { ducats, glory },
    };
  });

  // Armour is the profile value plus whatever the worn armour and shield
  // grant. Conditional modifiers (none in the data today) are not applied.
  const armourBreakdown = equipment.flatMap((e) => {
    if (e.category !== "armour" && e.category !== "shield") return [];
    const delta = data.equipmentById
      .get(e.id)!
      .modifiers.filter((m) => m.stat === "armour" && m.condition === undefined)
      .reduce((n, m) => n + m.delta, 0);
    return delta === 0 ? [] : [{ itemId: e.id, name: e.name, delta }];
  });

  const upgrades = (member.upgradeIds ?? []).map((id) => {
    const upgrade = upgradeFor(unit, id);
    if (!upgrade) throw new WarbandExportError(`Unknown upgrade "${id}" for ${unit.name} on member ${member.id}`);
    return {
      name: upgrade.name,
      text: (upgrade.rules ?? []).map((r) => `${r.name}: ${r.text}`).join("\n"),
      cost: { ducats: upgrade.cost?.ducats ?? 0, glory: upgrade.cost?.glory ?? 0 },
    };
  });

  return {
    id: member.id,
    displayName: member.name ?? unit.name,
    unit: { id: unit.id, name: unit.name, kind: unit.kind, elite: unit.elite, keywords: unit.keywords },
    stats: {
      movement: unit.stats.movement,
      ranged: unit.stats.ranged,
      melee: unit.stats.melee,
      armour: unit.stats.armour + armourBreakdown.reduce((n, b) => n + b.delta, 0),
      armourBreakdown,
      base: unit.stats.base,
    },
    abilities: unit.abilities.filter((a) => abilityApplies(a, warband.variantId, variantName)).map((a) => ({ name: a.name, text: a.text })),
    equipment,
    upgrades,
    skills: [],
    injuries: [],
    notes: null,
  };
}

// Ability gates name a variant by id or by "Name [Catalogue]"; anything else
// (campaign selections such as the Goetic sins) is unmodelled, so a gate that
// needs one is treated as closed and a gate that excludes one as open.
function abilityApplies(ability: RosterAbility, variantId: string | undefined, variantName: string | undefined): boolean {
  const matches = (v: string) => v === variantId || (variantName !== undefined && normaliseName(v) === normaliseName(variantName));
  if (ability.onlyWith?.length && !ability.onlyWith.some(matches)) return false;
  if (ability.onlyWithout?.some(matches)) return false;
  return true;
}

// TTS object text: Description shows on hover, so it stays short and uses the
// bbcode-style tags TTS renders ([b], [i], [RRGGBB]…[-]). GM Notes is plain
// text and carries the full rule text.

const HEADER_COLOUR = "d9b352";

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function renderStatLine(member: ExportMember): string {
  const s = member.stats;
  return `[b]Mov[/b] ${s.movement.raw}  [b]Rng[/b] ${s.ranged}  [b]Mel[/b] ${s.melee}  [b]Arm[/b] ${signed(s.armour)}  [b]Base[/b] ${s.base}`;
}

function equipmentLabel(e: ExportEquipment): string {
  const parts = [e.name];
  if (e.range) parts.push(`(${e.range})`);
  if (e.keywords.length) parts.push(e.keywords.join(", "));
  return parts.join(" ");
}

export function renderTtsDescription(member: ExportMember): string {
  const title = member.displayName === member.unit.name ? member.displayName : `${member.displayName} — ${member.unit.name}`;
  const lines = [`[${HEADER_COLOUR}][b]${title}[/b][-]`, renderStatLine(member)];
  if (member.unit.keywords.length) lines.push(`[i]${member.unit.keywords.join(", ")}[/i]`);
  for (const e of member.equipment) lines.push(equipmentLabel(e));
  if (member.abilities.length) lines.push(`[b]Abilities:[/b] ${member.abilities.map((a) => a.name).join(", ")}`);
  if (member.upgrades.length) lines.push(`[b]Upgrades:[/b] ${member.upgrades.map((u) => u.name).join(", ")}`);
  if (member.skills.length) lines.push(`[b]Skills:[/b] ${member.skills.map((s) => s.name).join(", ")}`);
  if (member.injuries.length) lines.push(`[b]Injuries:[/b] ${member.injuries.map((i) => i.name).join(", ")}`);
  return lines.join("\n");
}

export function renderTtsGmNotes(member: ExportMember): string {
  const s = member.stats;
  const lines = [
    member.displayName === member.unit.name ? member.displayName : `${member.displayName} (${member.unit.name})`,
    `Mov ${s.movement.raw} | Rng ${s.ranged} | Mel ${s.melee} | Arm ${signed(s.armour)} | Base ${s.base}`,
  ];
  if (s.armourBreakdown.length) lines.push(`Armour: ${signed(s.armour - s.armourBreakdown.reduce((n, b) => n + b.delta, 0))} base, ${s.armourBreakdown.map((b) => `${b.name} ${signed(b.delta)}`).join(", ")}`);
  if (member.unit.keywords.length) lines.push(`Keywords: ${member.unit.keywords.join(", ")}`);
  const section = (heading: string, entries: { name: string; text: string }[]) => {
    if (!entries.length) return;
    lines.push("", heading);
    for (const e of entries) lines.push(e.text ? `${e.name}: ${e.text}` : e.name);
  };
  section("Equipment", member.equipment.map((e) => ({ name: equipmentLabel(e), text: e.rules })));
  section("Abilities", member.abilities);
  section("Upgrades", member.upgrades);
  section("Skills", member.skills);
  section("Injuries", member.injuries);
  if (member.notes) lines.push("", `Notes: ${member.notes}`);
  return lines.join("\n");
}
