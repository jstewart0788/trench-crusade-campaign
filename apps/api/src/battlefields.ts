import { compactBattlefield, generateBattlefield, loadCatalog, loadGeneratorEnv, scenarioArchetype, scenarioBoardIn, type BattlefieldPayload, type Catalog, type GeneratorEnv } from "@tc/battlefield";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

export const SEEDS_FILE = "data/tts/battlefield-seeds.json";
/** Seeds the mod may ask for; the random-board button picks inside it. */
export const MAX_SEED = 999_999;
/** World height of the mat's top surface the mod spawns onto (the emitter's default). */
export const MAT_TOP_Y = 0.95;
const CACHE_LIMIT = 64;

const SeedsFile = z.object({ scenarios: z.array(z.object({ id: z.string(), seeds: z.array(z.number().int().positive()) })) }).passthrough();

export interface BattlefieldScenario {
  id: string;
  number: number;
  name: string;
  boardIn: number;
  archetype: string;
  recommendedSeeds: number[];
}

export class UnknownScenarioError extends Error {}
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
      recommendedSeeds: recommended.get(s.id) ?? [],
    }));
  }

  list(): BattlefieldScenario[] {
    return this.scenarios;
  }

  board(scenarioId: string, seed: number): BattlefieldPayload {
    if (!this.scenarios.some((s) => s.id === scenarioId)) throw new UnknownScenarioError(scenarioId);
    const key = `${scenarioId}:${seed}`;
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    let payload: BattlefieldPayload;
    try {
      payload = compactBattlefield(generateBattlefield({ scenarioId, seed }, this.env), this.env.palette, this.catalog, { matTopY: MAT_TOP_Y });
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
