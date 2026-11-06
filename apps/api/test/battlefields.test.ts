import { expandBattlefield, generateBattlefield, layoutToObjectStates, loadCatalog, loadGeneratorEnv, objectiveMarkers, recommendSeeds, type BattlefieldPayload } from "@tc/battlefield";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { BattlefieldService, MAT_TOP_Y, MAX_SEED, NoBoardError, SEEDS_FILE } from "../src/battlefields.js";
import { configFromEnv, repoRoot } from "../src/config.js";
import { openDatabase } from "../src/db/client.js";
import { WarbandStore } from "../src/db/warbands.js";
import { loadRules, type LoadedRules } from "../src/rules.js";

let rules: LoadedRules;
let battlefields: BattlefieldService;
const env = loadGeneratorEnv(repoRoot);
const catalog = loadCatalog(repoRoot);
const seedsFile = JSON.parse(readFileSync(resolve(repoRoot, SEEDS_FILE), "utf8")) as { scenarios: { id: string; seeds: number[] }[] };

beforeAll(() => {
  rules = loadRules(configFromEnv({}).rulesDir);
  battlefields = new BattlefieldService(repoRoot);
}, 60_000);

const appWith = (service: BattlefieldService) => createApp({ rules, store: new WarbandStore(openDatabase(":memory:")), battlefields: service });

describe("GET /api/battlefields", () => {
  it("lists every scenario with its board, archetype and the recommended seeds", async () => {
    const res = await request(appWith(battlefields)).get("/api/battlefields");
    expect(res.status).toBe(200);
    expect(res.body.maxSeed).toBe(MAX_SEED);
    expect(res.body.scenarios.map((s: { id: string }) => s.id)).toEqual(env.scenarios.map((s) => s.id));
    for (const [i, s] of (res.body.scenarios as { id: string; number: number; name: string; boardIn: number; archetype: string; recommendedSeeds: number[] }[]).entries()) {
      expect(s.number).toBe(i + 1);
      expect(s.name).toBe(env.scenarios[i]!.name);
      expect([36, 48]).toContain(s.boardIn);
      expect(["trench-lines", "no-mans-land"]).toContain(s.archetype);
      expect(s.recommendedSeeds).toEqual(seedsFile.scenarios.find((f) => f.id === s.id)!.seeds);
      expect(s.recommendedSeeds.length).toBeGreaterThan(0);
      // A 36in and a 48in scenario: the list agrees with what the generator lays.
      if (s.id === "claim-no-mans-land" || s.id === "armoured-train") {
        const board = generateBattlefield({ scenarioId: s.id, seed: s.recommendedSeeds[0]! }, env);
        expect([s.boardIn, s.archetype]).toEqual([board.boardIn, board.archetype]);
      }
    }
  }, 60_000);

  it("keeps the shipped seed list in step with the generator", () => {
    const listed = seedsFile.scenarios.find((s) => s.id === "dragon-hunt")!.seeds;
    expect(recommendSeeds(env, "dragon-hunt", Array.from({ length: 30 }, (_, i) => i + 1), listed.length).map((q) => q.seed)).toEqual(listed);
  }, 60_000);
});

describe("GET /api/battlefields/:scenario/:seed", () => {
  it("returns a board the mod rebuilds into exactly the generator's object states, with its objectives", async () => {
    const seed = seedsFile.scenarios.find((s) => s.id === "claim-no-mans-land")!.seeds[0]!;
    const res = await request(appWith(battlefields)).get(`/api/battlefields/claim-no-mans-land/${seed}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json; charset=utf-8/);
    const body = res.body as BattlefieldPayload;
    const layout = generateBattlefield({ scenarioId: "claim-no-mans-land", seed }, env);
    expect(expandBattlefield(body)).toEqual(layoutToObjectStates(layout, env.palette, catalog, { matTopY: MAT_TOP_Y }));
    expect(expandBattlefield(body)).toEqual(layoutToObjectStates(layout, env.palette, catalog));
    expect(body.objectives).toEqual(objectiveMarkers(layout, env.palette, catalog, { matTopY: MAT_TOP_Y }));
    expect(body.objectives.length).toBeGreaterThan(0);
  });

  it("writes names as raw UTF-8, never \\u escapes the mod's JSON.decode would mangle", async () => {
    const res = await request(appWith(battlefields)).get("/api/battlefields/claim-no-mans-land/1");
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/\\u[0-9a-fA-F]{4}/);
    const body = res.body as BattlefieldPayload;
    const nonAscii = body.texts.filter((t) => /[^\x00-\x7f]/.test(t));
    expect(nonAscii.length).toBeGreaterThan(0);
    for (const t of nonAscii) expect(res.text).toContain(JSON.stringify(t).slice(1, -1));
  });

  it("is deterministic and generates each board once", async () => {
    const service = new BattlefieldService(repoRoot);
    const app = appWith(service);
    const before = service.cached();
    const a = await request(app).get("/api/battlefields/relic-hunt/4242");
    const b = await request(app).get("/api/battlefields/relic-hunt/4242");
    expect(a.status).toBe(200);
    expect(b.text).toBe(a.text);
    expect(service.cached()).toBe(before + 1);
  }, 60_000);

  it("refuses bad seeds and unknown scenarios", async () => {
    const app = appWith(battlefields);
    for (const seed of ["0", "abc", String(MAX_SEED + 1), "1.5", "-3", "0x10", "1e3"]) {
      const res = await request(app).get(`/api/battlefields/relic-hunt/${seed}`);
      expect(res.status, seed).toBe(400);
      expect(res.body.error.code).toBe("invalid-seed");
    }
    expect((await request(app).get("/api/battlefields/no-such-scenario/1")).status).toBe(404);
    expect((await request(app).get("/api/battlefields/Relic_Hunt/1")).body.error.code).toBe("invalid-scenario");
    expect((await request(app).get("/api/battlefields/..%2F..%2Fetc/1")).status).toBe(400);
  });

  it("answers 422 when the generator cannot lay a seed", async () => {
    const failing = Object.create(battlefields) as BattlefieldService;
    failing.board = () => {
      throw new NoBoardError("no trench network");
    };
    const res = await request(appWith(failing)).get("/api/battlefields/relic-hunt/7");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("no-board");
  });
});
