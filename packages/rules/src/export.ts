import { z } from "zod";
import { memberCost, warbandCost } from "./cost.js";
import { isEliteMember, memberKeywords } from "./grants.js";
import { unitDisplayName } from "./presentation.js";
import { normaliseName } from "./limits.js";
import { modelFor, accessFor, findSubfaction, findUnit, rosterVariants, upgradeFor, type ModelCandidate, type ModelMap, type RosterAbility, type RulesData } from "./data.js";
import { profileAbilities, profileKit } from "./profile.js";
import type { Warband, WarbandMember } from "./roster.js";
import { EquipmentCategory, Movement } from "./schema.js";
import { validateWarband, effectiveStats, preGameChoices } from "./validate.js";
import type { PreGameChoice } from "./unit-rules.js";

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
  /** The model always has it: armoury kit marked fixed, or kit printed on the unit card (id "profile/…"). Absent on bought kit. */
  builtIn: z.literal(true).optional(),
});
export type ExportEquipment = z.infer<typeof ExportEquipment>;

// The default TTS model for a member, lifted from data/tts/models.json. The
// mod spawns a Custom_Model from `base` with one ChildObject per part, the
// shape Gannel's Model Corner uses (base mesh on top, figure attached).
const Vec3 = z.tuple([z.number(), z.number(), z.number()]);

export const ExportModelPart = z.object({
  kind: z.enum(["Custom_Model", "Custom_Assetbundle"]),
  meshUrl: z.string().nullable(),
  diffuseUrl: z.string().nullable(),
  colliderUrl: z.string().nullable(),
  assetBundleUrl: z.string().nullable(),
  position: Vec3,
  rotation: Vec3,
  scale: Vec3,
});
export type ExportModelPart = z.infer<typeof ExportModelPart>;

export const ExportModel = z.object({
  source: z.enum(["default", "pick"]),
  modId: z.string(),
  guid: z.string(),
  nickname: z.string(),
  base: z.object({
    meshUrl: z.string(),
    diffuseUrl: z.string().nullable(),
    colliderUrl: z.string().nullable(),
    scale: Vec3,
  }),
  parts: z.array(ExportModelPart),
});
export type ExportModel = z.infer<typeof ExportModel>;

const ExportMemberCore = z.object({
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
  /** Pre-game choices this model carries for the game (Broken on the Wheel: the Shrine's protected state). */
  preGame: z.array(z.object({ name: z.string(), victim: z.string(), summary: z.string(), effect: z.string() })).optional(),
  /** Chosen away before the game (the Shrine's victim): the mod does not spawn it. */
  removedForGame: z.literal(true).optional(),
});
/** Everything the TTS text renderers need; an ExportMember is a superset. */
export type ExportMemberCore = z.infer<typeof ExportMemberCore>;

export const ExportMember = ExportMemberCore.extend({
  // null when the unit has no default in data/tts/models.json; the mod then
  // spawns a plain base. Players bind their own models either way.
  model: ExportModel.nullable(),
  // Prebuilt object text so the mod does no formatting of its own.
  ttsDescription: z.string(),
  ttsGmNotes: z.string(),
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
    subfaction: Named.nullable(),
    variant: Named.nullable(),
    patron: Named.nullable(),
    totals: ExportCost,
    valid: z.boolean(),
    errorCount: z.number().int().nonnegative(),
    /**
     * Battlekit the warband holds rather than a model (a Grand Cannon gun battery,
     * p99): a terrain piece on the table, not kit on a figure, so it is listed here
     * and not under any member. Absent when the warband holds nothing.
     */
    armoury: z.array(ExportEquipment).optional(),
  }),
  members: z.array(ExportMember),
});
export type WarbandExport = z.infer<typeof WarbandExport>;

export interface ExportOptions {
  code: string;
  now?: Date | string;
  /** Overrides the model map loaded with the rules data. */
  models?: ModelMap;
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
  const subfaction = findSubfaction(data, warband);
  if (warband.subfactionId !== undefined && !subfaction) throw new WarbandExportError(`Unknown subfaction "${warband.subfactionId}"`);
  const variant = rosterVariants(data, warband).find((v) => v.id === warband.variantId);
  if (warband.variantId !== undefined && !variant) throw new WarbandExportError(`Unknown variant "${warband.variantId}"`);
  const patron = data.campaign.patrons.find((p) => p.id === warband.patronId);
  if (warband.patronId !== undefined && !patron) throw new WarbandExportError(`Unknown patron "${warband.patronId}"`);

  const cost = warbandCost(warband, data);
  const validation = validateWarband(warband, data);

  // Pre-game choices count only when the validator would accept them.
  const extras: ExportExtras = { removed: new Set(), preGame: [] };
  for (const p of preGameChoices(warband, data)) {
    const victim = p.available ? p.candidates.find((m) => m.id === p.chosen) : undefined;
    if (!victim) continue;
    extras.removed.add(victim.id);
    extras.preGame.push({ rule: p.rule, victim: victim.name ?? findUnit(data, warband, victim.unitId)?.name ?? victim.unitId });
  }
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
      subfaction: subfaction ? { id: subfaction.id, name: subfaction.name } : null,
      variant: variant ? { id: variant.id, name: variant.name } : null,
      patron: patron ? { id: patron.id, name: patron.name } : null,
      totals: { ducats: cost.ducats, glory: cost.glory },
      valid: validation.ok,
      errorCount: validation.errors.length,
      ...(warband.armoury?.length ? { armoury: warband.armoury.map((id, i) => heldEquipment(data, id, cost.armoury[i]!)) } : {}),
    },
    members: warband.members.map((m) => exportMember(m, warband, data, variant?.name, opts.models ?? data.models, extras)),
  };
}

function heldEquipment(data: RulesData, itemId: string, cost: { ducats: number; glory: number }): ExportEquipment {
  const item = data.equipmentById.get(itemId);
  if (!item) throw new WarbandExportError(`Unknown item "${itemId}" in the warband's Armoury`);
  return { id: item.id, name: item.name, category: item.category, hands: item.hands, range: item.range, keywords: item.keywords, rules: item.rules, cost: { ducats: cost.ducats, glory: cost.glory } };
}

interface ExportExtras {
  removed: Set<string>;
  preGame: { rule: PreGameChoice; victim: string }[];
}

function exportMember(member: WarbandMember, warband: Warband, data: RulesData, variantName: string | undefined, models: ModelMap | undefined, extras: ExportExtras): ExportMember {
  const core = exportMemberCore(member, warband, data, variantName, extras);
  // An entry built from another's profile (the Sipahi) spawns that unit's model until it has one of its own.
  const profileOf = data.unitsById.get(core.unit.id)?.substituteOf;
  return {
    ...core,
    model: exportModel(modelFor(models, core.unit.id, member.equipmentItemIds) ?? (profileOf ? modelFor(models, profileOf, member.equipmentItemIds) : undefined)),
    ttsDescription: renderTtsDescription(core),
    ttsGmNotes: renderTtsGmNotes(core),
  };
}

// models.json carries Python's -0.0, which JSON.stringify flattens to 0; emit
// the canonical form so the payload survives a JSON round-trip unchanged.
const vec3 = (v: [number, number, number]): [number, number, number] => [v[0] + 0, v[1] + 0, v[2] + 0];

function exportModel(chosen: { candidate: ModelCandidate; picked: boolean } | undefined): ExportModel | null {
  if (!chosen) return null;
  const candidate = chosen.candidate;
  return {
    source: chosen.picked ? "pick" : "default",
    modId: candidate.modId,
    guid: candidate.guid,
    nickname: candidate.nickname,
    base: { meshUrl: candidate.meshUrl, diffuseUrl: candidate.diffuseUrl, colliderUrl: candidate.colliderUrl, scale: vec3(candidate.scale) },
    parts: candidate.parts.map((p) => ({
      kind: p.kind,
      meshUrl: p.meshUrl ?? null,
      diffuseUrl: p.diffuseUrl ?? null,
      colliderUrl: p.colliderUrl ?? null,
      assetBundleUrl: p.assetBundleUrl ?? null,
      position: vec3(p.position),
      rotation: vec3(p.rotation),
      scale: vec3(p.scale),
    })),
  };
}

function exportMemberCore(member: WarbandMember, warband: Warband, data: RulesData, variantName: string | undefined, extras: ExportExtras = { removed: new Set(), preGame: [] }): ExportMemberCore {
  const unit = findUnit(data, warband, member.unitId);
  if (!unit) throw new WarbandExportError(`Unknown unit "${member.unitId}" on member ${member.id}`);
  const card = effectiveStats(unit, warband, data, undefined, member);
  const shownName = unitDisplayName(data, warband, unit, member);
  const priced = memberCost(data, warband, member);

  const equipment: ExportEquipment[] = member.equipmentItemIds.map((itemId, i) => {
    const item = data.equipmentById.get(itemId);
    if (!item) throw new WarbandExportError(`Unknown item "${itemId}" on member ${member.id}`);
    const { ducats, glory } = priced.items[i]!;
    const row = accessFor(unit, itemId);
    const entry: ExportEquipment = {
      id: item.id,
      name: item.name,
      category: item.category,
      hands: row?.hands ?? item.hands,
      range: item.range,
      keywords: item.keywords,
      rules: item.rules,
      cost: { ducats, glory },
    };
    if (row?.fixed || row?.replaceableDefault) entry.builtIn = true;
    return entry;
  });

  // Armour is the profile value plus whatever bought armour and shields grant.
  // Built-in armour is already in the printed profile (Warbands of Trench Crusade:
  // "The Injury Modifier for the Armour is included in the model's Profile"), so
  // it is not added again. Conditional modifiers (none today) are not applied.
  const armourBreakdown = equipment.flatMap((e) => {
    if (e.builtIn) return [];
    if (e.category !== "armour" && e.category !== "shield") return [];
    const delta = data.equipmentById
      .get(e.id)!
      .modifiers.filter((m) => m.stat === "armour" && m.condition === undefined)
      .reduce((n, m) => n + m.delta, 0);
    return delta === 0 ? [] : [{ itemId: e.id, name: e.name, delta }];
  });

  // Card kit comes after the armour breakdown: the profile's Armour value already includes it.
  for (const k of profileKit(unit)) equipment.push({ ...k, cost: { ducats: 0, glory: 0 }, builtIn: true });

  const upgrades = (member.upgradeIds ?? []).map((id, i) => {
    const upgrade = upgradeFor(unit, id);
    if (!upgrade) throw new WarbandExportError(`Unknown upgrade "${id}" for ${unit.name} on member ${member.id}`);
    const { ducats, glory } = priced.upgrades[i]!;
    return {
      name: upgrade.name,
      text: (upgrade.rules ?? []).map((r) => `${r.name}: ${r.text}`).join("\n"),
      cost: { ducats, glory },
    };
  });

  return {
    id: member.id,
    displayName: member.name ?? shownName,
    unit: { id: unit.id, name: shownName, kind: unit.kind, elite: isEliteMember(member, unit, data, warband), keywords: memberKeywords(member, unit, data, warband) },
    stats: {
      movement: card.movement,
      ranged: card.ranged,
      melee: card.melee,
      armour: card.armour + armourBreakdown.reduce((n, b) => n + b.delta, 0),
      armourBreakdown,
      base: card.base,
    },
    abilities: [...unit.abilities.filter((a) => abilityApplies(a, warband.variantId, variantName)).map((a) => ({ name: a.name, text: a.text })), ...profileAbilities(unit)],
    equipment,
    upgrades,
    skills: [],
    injuries: [],
    notes: null,
    ...(() => {
      const preGame = extras.preGame.filter((p) => p.rule.unitIds.includes(unit.id)).map((p) => ({ name: p.rule.name, victim: p.victim, summary: p.rule.summary, effect: p.rule.effect }));
      return preGame.length ? { preGame } : {};
    })(),
    ...(extras.removed.has(member.id) ? { removedForGame: true as const } : {}),
  };
}

// Ability gates name a variant by id or by "Name [Catalogue]"; anything else
// (campaign selections such as the Goetic sins) is unmodelled, so a gate that
// needs one is treated as closed and a gate that excludes one as open.
export function abilityApplies(ability: RosterAbility, variantId: string | undefined, variantName: string | undefined): boolean {
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

export function renderStatLine(member: ExportMemberCore): string {
  const s = member.stats;
  return `[b]Mov[/b] ${s.movement.raw}  [b]Rng[/b] ${s.ranged}  [b]Mel[/b] ${s.melee}  [b]Arm[/b] ${signed(s.armour)}  [b]Base[/b] ${s.base}`;
}

function equipmentLabel(e: ExportEquipment): string {
  const parts = [e.name];
  if (e.range) parts.push(`(${e.range})`);
  if (e.keywords.length) parts.push(e.keywords.join(", "));
  return parts.join(" ");
}

export function renderTtsDescription(member: ExportMemberCore): string {
  const title = member.displayName === member.unit.name ? member.displayName : `${member.displayName} — ${member.unit.name}`;
  const lines = [`[${HEADER_COLOUR}][b]${title}[/b][-]`, renderStatLine(member)];
  if (member.unit.keywords.length) lines.push(`[i]${member.unit.keywords.join(", ")}[/i]`);
  for (const e of member.equipment) lines.push(equipmentLabel(e));
  if (member.abilities.length) lines.push(`[b]Abilities:[/b] ${member.abilities.map((a) => a.name).join(", ")}`);
  if (member.upgrades.length) lines.push(`[b]Upgrades:[/b] ${member.upgrades.map((u) => u.name).join(", ")}`);
  if (member.skills.length) lines.push(`[b]Skills:[/b] ${member.skills.map((s) => s.name).join(", ")}`);
  if (member.injuries.length) lines.push(`[b]Injuries:[/b] ${member.injuries.map((i) => i.name).join(", ")}`);
  for (const p of member.preGame ?? []) lines.push(`[b]${p.name}:[/b] ${p.victim}. ${p.summary}`);
  return lines.join("\n");
}

export function renderTtsGmNotes(member: ExportMemberCore): string {
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
  section("Before this game", (member.preGame ?? []).map((p) => ({ name: `${p.name} (${p.victim})`, text: p.effect })));
  if (member.notes) lines.push("", `Notes: ${member.notes}`);
  return lines.join("\n");
}
