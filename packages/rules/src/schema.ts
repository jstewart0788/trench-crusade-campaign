import { z } from "zod";

// Shared primitives -------------------------------------------------------

export const Cost = z.object({
  ducats: z.number().int().nonnegative().nullable(),
  glory: z.number().int().nonnegative().nullable(),
});
export type Cost = z.infer<typeof Cost>;

export const Paged = z.object({ page: z.number().int().positive().optional() });

export const Source = z
  .object({
    file: z.string().optional(),
    repo: z.string().optional(),
    commit: z.string().optional(),
    edition: z.string().optional(),
    pages: z.string().optional(),
  })
  .passthrough();

const NamedText = z.object({ name: z.string(), text: z.string() }).passthrough();

// Roster data (from the NewRecruit / BattleScribe dataset) ----------------

export const Movement = z.object({
  inches: z.number().nullable(),
  type: z.string().nullable(),
  raw: z.string(),
});

export const UnitStats = z.object({
  movement: Movement,
  ranged: z.string(),
  melee: z.string(),
  armour: z.number().int(),
  base: z.string(),
});

export const EquipmentAccess = z.object({
  itemId: z.string(),
  group: z.string(),
  cost: Cost.optional(),
  max: z.number().int().positive().nullable().optional(),
  note: z.string().optional(),
});

export const Unit = z
  .object({
    id: z.string(),
    factionId: z.string(),
    name: z.string(),
    kind: z.enum(["model", "fireteam"]),
    elite: z.boolean(),
    keywords: z.array(z.string()),
    stats: UnitStats,
    cost: Cost,
    limits: z.object({
      min: z.number().int().nonnegative().nullable(),
      max: z.number().int().positive().nullable(),
      text: z.string().optional(),
    }),
    abilities: z.array(NamedText),
    equipmentAccess: z.array(EquipmentAccess),
    variantIds: z.array(z.string()).optional(),
    page: z.number().int().positive().optional(),
    notes: z.string().optional(),
  })
  .passthrough();
export type Unit = z.infer<typeof Unit>;

export const EquipmentCategory = z.enum([
  "ranged",
  "melee",
  "grenade",
  "shield",
  "armour",
  "equipment",
  "ammunition",
  "glory-item",
]);

export const StatModifier = z.object({
  stat: z.enum(["armour", "movement", "ranged", "melee"]),
  delta: z.number().int(),
  condition: z.string().optional(),
});

export const EquipmentItem = z
  .object({
    id: z.string(),
    name: z.string(),
    category: EquipmentCategory,
    hands: z.union([z.literal(1), z.literal(2)]).nullable(),
    cost: Cost,
    range: z.string().nullable(),
    keywords: z.array(z.string()),
    rules: z.string(),
    modifiers: z.array(StatModifier),
    limits: z.string().nullable(),
    page: z.number().int().positive().optional(),
  })
  .passthrough();
export type EquipmentItem = z.infer<typeof EquipmentItem>;

export const Faction = z
  .object({
    id: z.string(),
    name: z.string(),
    keywords: z.array(z.string()),
    rules: z.array(NamedText),
    variants: z.array(
      z.object({ id: z.string(), name: z.string(), text: z.string(), rules: z.array(NamedText) }).passthrough(),
    ),
    unitIds: z.array(z.string()),
    page: z.number().int().positive().optional(),
  })
  .passthrough();
export type Faction = z.infer<typeof Faction>;

export const FactionsFile = z.object({
  $schema: z.literal("tc-rules-factions-v1"),
  source: Source,
  factions: z.array(Faction),
});
export const UnitsFile = z.object({
  $schema: z.literal("tc-rules-units-v1"),
  source: Source,
  units: z.array(Unit),
});
export const EquipmentFile = z.object({
  $schema: z.literal("tc-rules-equipment-v1"),
  source: Source,
  items: z.array(EquipmentItem),
});

// Rulebook extractions ----------------------------------------------------

const Row = z.object({ roll: z.string() }).passthrough();
const RollTable = z.object({ dice: z.string().optional(), rows: z.array(Row) }).merge(Paged).passthrough();

export const CampaignFile = z
  .object({
    $schema: z.literal("tc-rules-campaign-v1"),
    source: Source,
    patrons: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        page: z.number().int(),
        factions: z.array(z.string()),
        skills: z.array(NamedText),
      }).passthrough(),
    ),
    warbandThreshold: z.object({ table: z.array(z.object({}).passthrough()) }).merge(Paged).passthrough(),
    campaignPhase: z.object({
      steps: z.array(z.object({ order: z.number().int(), id: z.string(), name: z.string() }).passthrough()),
    }).merge(Paged).passthrough(),
    traumaTable: RollTable,
    skillTables: z.array(RollTable.extend({ id: z.string(), name: z.string() })),
    exploration: z.object({ tables: z.array(RollTable.extend({ id: z.string(), name: z.string() })) }).merge(Paged).passthrough(),
    gloryItems: z.object({
      tables: z.array(RollTable.extend({ id: z.string(), name: z.string() })),
      cartulary: z.array(z.object({ id: z.string(), name: z.string(), cost: Cost }).passthrough()),
    }).merge(Paged).passthrough(),
  })
  .passthrough();

export const Archetype = z.enum(["no-mans-land", "decimated-ruins", "trench-lines", "any"]);
const Point = z.tuple([z.number(), z.number()]);

export const Scenario = z
  .object({
    id: z.string(),
    number: z.number().int().positive(),
    name: z.string(),
    page: z.number().int().positive(),
    archetypes: z.array(Archetype),
    deployment: z.object({
      text: z.string(),
      zones: z.array(z.object({ player: z.string(), label: z.string(), polygon: z.array(Point) }).passthrough()),
    }).passthrough(),
    objectives: z.array(z.object({ id: z.string(), position: Point }).passthrough()),
    specialRules: z.array(NamedText),
    gameLength: z.object({ minTurns: z.number().int().nullable(), maxTurns: z.number().int().nullable() }).passthrough(),
    victory: z.object({ text: z.string() }).passthrough(),
    geometryConfidence: z.enum(["high", "medium", "low"]),
  })
  .passthrough();
export type Scenario = z.infer<typeof Scenario>;

export const ScenariosFile = z
  .object({
    $schema: z.literal("tc-rules-scenarios-v1"),
    source: Source,
    battlefield: z.object({ widthIn: z.number(), depthIn: z.number() }).merge(Paged),
    scenarios: z.array(Scenario).min(12),
  })
  .passthrough();

export const TerrainTraits = z.object({
  difficult: z.union([z.boolean(), z.literal("partial")]),
  dangerous: z.boolean(),
  cover: z.union([z.boolean(), z.literal("partial")]),
  blocksLoS: z.union([z.boolean(), z.literal("partial")]),
  climbable: z.boolean(),
  impassable: z.boolean(),
  elevated: z.union([z.boolean(), z.literal("partial")]),
});

export const TerrainFile = z
  .object({
    $schema: z.literal("tc-rules-terrain-v1"),
    source: Source,
    battlefield: z.object({ widthIn: z.number(), depthIn: z.number() }).merge(Paged).passthrough(),
    types: z.array(z.object({ id: z.string(), name: z.string(), page: z.number().int(), traits: TerrainTraits }).passthrough()),
    archetypes: z.array(
      z.object({
        id: Archetype,
        name: z.string(),
        page: z.number().int(),
        composition: z.array(z.object({ typeId: z.string(), required: z.boolean() }).passthrough()),
        density: z.enum(["sparse", "medium", "dense"]),
      }).passthrough(),
    ),
  })
  .passthrough();

// Registry of every data file and the schema that governs it -------------

export const DATA_FILES = {
  "data/rules/factions.json": FactionsFile,
  "data/rules/units.json": UnitsFile,
  "data/rules/equipment.json": EquipmentFile,
  "data/rules/campaign.json": CampaignFile,
  "data/rules/scenarios.json": ScenariosFile,
  "data/rules/terrain.json": TerrainFile,
} as const;
