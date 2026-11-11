import { compactBattlefield, DEFAULT_TTS_OPTIONS, generateBattlefield, loadCatalog, loadGeneratorEnv, scenarioArchetype, scenarioBoardIn, selectableArchetypes, type Archetype, type BattlefieldPayload, type Catalog, type GeneratorEnv } from "@tc/battlefield";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const SEEDS_FILE = "data/tts/battlefield-seeds.json";
/** Seeds the mod may ask for; the random-board button picks inside it. */
export const MAX_SEED = 999_999;
/** World height of the table surface the mod spawns boards onto. */
export const MAT_TOP_Y = DEFAULT_TTS_OPTIONS.matTopY;
const CACHE_LIMIT = 64;
export { ARCHETYPES, selectableArchetypes } from "@tc/battlefield";

const SeedsFile = z.object({ scenarios: z.array(z.object({ id: z.string(), seeds: z.array(z.number().int().positive()) })) }).passthrough();

export interface BattlefieldScenario {
  id: string;
  number: number;
  name: string;
  boardIn: number;
  archetype: string;
  /**
   * The archetypes a board may be asked for, the scenario's own first. More than one only
   * where the scenario lets the player setting up the terrain choose ("any battlefield
   * archetype", Great War p195 and From Below) or lists several the generator lays.
   */
  archetypes: Archetype[];
  recommendedSeeds: number[];
}

export class UnknownScenarioError extends Error {}
export class ArchetypeNotSelectableError extends Error {}
export class NoBoardError extends Error {}

export class BattlefieldService {
  private readonly env: GeneratorEnv;
  private readonly catalog: Catalog;
  private readonly scenarios: BattlefieldScenario[];
  // Boards are deterministic per scenario + seed; insertion order makes this an LRU.
  private readonly cache = new Map<string, BattlefieldPayload>();

  constructor(rootDir: string) {
    this.env = loadGeneratorEnv(rootDir);
    this.catalog = loadCatalog(rootDir);
    const recommended = new Map(SeedsFile.parse(JSON.parse(readFileSync(resolve(rootDir, SEEDS_FILE), "utf8"))).scenarios.map((s) => [s.id, s.seeds]));
    this.scenarios = this.env.scenarios.map((s, i) => ({
      id: s.id,
      number: i + 1,
      name: s.name,
      boardIn: scenarioBoardIn(s),
      archetype: scenarioArchetype(s).archetype,
      archetypes: selectableArchetypes(s),
      recommendedSeeds: recommended.get(s.id) ?? [],
    }));
  }

  list(): BattlefieldScenario[] {
    return this.scenarios;
  }

  /** archetype left out lays the scenario's own; given, it must be one the scenario lets the player choose. decor lays decorative scatter too. */
  board(scenarioId: string, seed: number, archetype?: string, decor = false): BattlefieldPayload {
    const scenario = this.scenarios.find((s) => s.id === scenarioId);
    if (!scenario) throw new UnknownScenarioError(scenarioId);
    const chosen = archetype === undefined ? undefined : scenario.archetypes.find((a) => a === archetype);
    if (archetype !== undefined && (scenario.archetypes.length < 2 || !chosen)) throw new ArchetypeNotSelectableError(archetype);
    const key = `${scenarioId}:${seed}:${chosen ?? ""}:${decor ? "decor" : ""}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    let payload: BattlefieldPayload;
    try {
      payload = compactBattlefield(generateBattlefield({ scenarioId, seed, archetype: chosen, options: { decor } }, this.env), this.env.palette, this.catalog, { matTopY: MAT_TOP_Y });
    } catch (err) {
      throw new NoBoardError(err instanceof Error ? err.message : String(err));
    }
    this.cache.set(key, payload);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return payload;
  }

  cached(): number {
    return this.cache.size;
  }
}
