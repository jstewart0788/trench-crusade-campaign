import { expandBattlefield, generateBattlefield, isDecor, layoutToObjectStates, loadCatalog, loadGeneratorEnv, objectiveMarkers, recommendSeeds, type BattlefieldPayload } from "@tc/battlefield";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ARCHETYPES, BattlefieldService, MAT_TOP_Y, MAX_SEED, NoBoardError, SEEDS_FILE } from "../src/battlefields.js";
import { configFromEnv, repoRoot } from "../src/config.js";
import { openDatabase } from "../src/db/client.js";
import { WarbandStore } from "../src/db/warbands.js";
import { loadRules, type LoadedRules } from "../src/rules.js";

let rules: LoadedRules;
let battlefields: BattlefieldService;
const env = loadGeneratorEnv(repoRoot);
const catalog = loadCatalog(repoRoot);
const seedsFile = JSON.parse(readFileSync(resolve(repoRoot, SEEDS_FILE), "utf8")) as { candidates: string; scenarios: { id: string; archetypes: string[]; seeds: number[] }[] };

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
    for (const [i, s] of (res.body.scenarios as { id: string; number: number; name: string; boardIn: number; archetype: string; archetypes: string[]; recommendedSeeds: number[] }[]).entries()) {
      expect(s.number).toBe(i + 1);
      expect(s.archetypes[0]).toBe(s.archetype);
      for (const a of s.archetypes) expect(ARCHETYPES).toContain(a);
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

  it("offers a choice of archetype only where the scenario lets the player pick", async () => {
    const res = await request(appWith(battlefields)).get("/api/battlefields");
    const by = new Map((res.body.scenarios as { id: string; archetypes: string[] }[]).map((s) => [s.id, s.archetypes]));
    // "can use any battlefield archetype (the player setting up the terrain decides which one to use)": Great War p195, From Below.
    expect(by.get("great-war")).toEqual(["trench-lines", "no-mans-land"]);
    expect(by.get("from-below")).toEqual(["trench-lines", "no-mans-land"]);
    expect(by.get("dragon-hunt")).toEqual(["no-mans-land", "trench-lines"]);
    expect(by.get("claim-no-mans-land")).toEqual(["no-mans-land"]);
    expect(by.get("fields-of-glory")).toEqual(["trench-lines"]);
    // Lists Decimated Ruins too, which the generator does not lay.
    expect(by.get("supply-raid")).toEqual(["no-mans-land"]);
  });

  it("keeps the shipped seed list in step with the generator, judged as every archetype the panel offers", async () => {
    const res = await request(appWith(battlefields)).get("/api/battlefields");
    for (const s of res.body.scenarios as { id: string; archetypes: string[] }[]) expect(seedsFile.scenarios.find((f) => f.id === s.id)!.archetypes, s.id).toEqual(s.archetypes);
    const [first, last] = seedsFile.candidates.split("-").map(Number) as [number, number];
    const listed = seedsFile.scenarios.find((s) => s.id === "supply-raid")!.seeds;
    expect(recommendSeeds(env, "supply-raid", Array.from({ length: last - first + 1 }, (_, i) => first + i), listed.length).map((q) => q.seed)).toEqual(listed);
  }, 180_000);
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

  it("lays a board in the archetype asked for, where the scenario allows the choice", async () => {
    const app = appWith(battlefields);
    for (const archetype of ["no-mans-land", "trench-lines"] as const) {
      const res = await request(app).get(`/api/battlefields/great-war/3?archetype=${archetype}`);
      expect(res.status, archetype).toBe(200);
      const body = res.body as BattlefieldPayload;
      expect(body.archetype).toBe(archetype);
      const layout = generateBattlefield({ scenarioId: "great-war", seed: 3, archetype }, env);
      expect(expandBattlefield(body)).toEqual(layoutToObjectStates(layout, env.palette, catalog, { matTopY: MAT_TOP_Y }));
    }
    const own = await request(app).get("/api/battlefields/great-war/3");
    expect(own.body.archetype).toBe("trench-lines");
    expect(own.text).toBe((await request(app).get("/api/battlefields/great-war/3?archetype=trench-lines")).text);
    const other = await request(app).get("/api/battlefields/great-war/3?archetype=no-mans-land");
    expect(other.text).not.toBe(own.text);
    expect((await request(app).get("/api/battlefields/dragon-hunt/1?archetype=trench-lines")).body.archetype).toBe("trench-lines");
    expect((await request(app).get("/api/battlefields/claim-no-mans-land/25")).body.archetype).toBe("no-mans-land");
  }, 60_000);

  it("refuses an archetype the scenario does not let the player choose", async () => {
    const app = appWith(battlefields);
    for (const path of [
      "claim-no-mans-land/25?archetype=trench-lines",
      "claim-no-mans-land/25?archetype=no-mans-land",
      "supply-raid/3?archetype=no-mans-land",
      "great-war/3?archetype=decimated-ruins",
      "great-war/3?archetype=",
      "great-war/3?archetype=Trench-Lines",
      "great-war/3?archetype=trench-lines&archetype=no-mans-land",
    ]) {
      const res = await request(app).get(`/api/battlefields/${path}`);
      expect(res.status, path).toBe(400);
      expect(res.body.error.code, path).toBe("invalid-archetype");
    }
    expect((await request(app).get("/api/battlefields/claim-no-mans-land/25?archetype=trench-lines")).body.error.message).toMatch(/always laid as no-mans-land/);
    expect((await request(app).get("/api/battlefields/great-war/3?archetype=x")).body.error.message).toMatch(/trench-lines or no-mans-land/);
    expect((await request(app).get("/api/battlefields/no-such-scenario/1?archetype=trench-lines")).status).toBe(404);
  });

  it("leaves decorative scatter off unless asked for, and refuses a decor flag that is not true or false", async () => {
    const app = appWith(battlefields);
    const decorative = new Set(env.palette.pieces.filter((p) => isDecor(p)).map((p) => p.id));
    const plain = (await request(app).get("/api/battlefields/claim-no-mans-land/1")).body as BattlefieldPayload;
    const dressed = (await request(app).get("/api/battlefields/claim-no-mans-land/1?decor=true")).body as BattlefieldPayload;
    // Scattered terrain only: a barrel in a crate stack (a terrain piece, slot d-) is part of a cover piece.
    expect(plain.pieces.filter(([id, , , , pieceId]) => decorative.has(id) && pieceId.startsWith("x-"))).toEqual([]);
    expect(dressed.pieces.filter(([id]) => decorative.has(id)).length).toBeGreaterThan(10);
    expect((await request(app).get("/api/battlefields/claim-no-mans-land/1?decor=false")).body).toEqual(plain);
    const bad = await request(app).get("/api/battlefields/claim-no-mans-land/1?decor=yes");
    expect([bad.status, bad.body.error.code]).toEqual([400, "invalid-decor"]);
  });

  it("sends open objectives the 1in control ring and no band, covered ones the band", async () => {
    const res = await request(appWith(battlefields)).get("/api/battlefields/from-below/3");
    const open = (res.body as BattlefieldPayload).objectives.filter((o) => o.band.length === 0);
    expect(open.length).toBeGreaterThan(0);
    for (const o of open) expect(o.ringIn).toBe(1.787);
    const covered = (await request(appWith(battlefields)).get("/api/battlefields/claim-no-mans-land/25")).body as BattlefieldPayload;
    expect(covered.objectives.every((o) => o.band.length > 1)).toBe(true);
    for (const o of covered.objectives) expect(covered.pieces.filter((row) => row[5] === o.id)).toHaveLength(1);
  }, 60_000);

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

describe("mod images", () => {
  const publicDir = resolve(repoRoot, "apps/web/public");
  const modRefs = (): string[] => {
    const texts = [readFileSync(resolve(repoRoot, "mod/save.json"), "utf8"), ...readdirSync(resolve(repoRoot, "mod/scripts")).map((f) => readFileSync(resolve(repoRoot, "mod/scripts", f), "utf8"))];
    return [...new Set(texts.flatMap((t) => [...t.matchAll(/https:\/\/tc\.rynfin\.org(\/tts\/[^"'\s]+\.png)/g)].map((m) => m[1]!)))];
  };

  it("every image the mod loads from our host is in the web app's public folder and served as a PNG", async () => {
    const refs = modRefs();
    expect(refs.sort()).toEqual([
      "/tts/dice-tray-blue.png",
      "/tts/dice-tray-red.png",
      "/tts/measure-panel.png",
      "/tts/objective-marker.png",
      "/tts/objective-symbol.png",
      "/tts/roll-board-blue.png",
      "/tts/roll-board-red.png",
    ]);
    const app = createApp({ rules, store: new WarbandStore(openDatabase(":memory:")), staticDir: publicDir });
    for (const ref of refs) {
      const res = await request(app).get(ref).buffer(true);
      expect(res.status, ref).toBe(200);
      expect(res.headers["content-type"], ref).toBe("image/png");
      const png = res.body as Buffer;
      expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
      if (ref.startsWith("/tts/objective-")) {
        // IHDR: 512 x 512, 8-bit RGBA, so the symbol keeps its transparency.
        expect([png.readUInt32BE(16), png.readUInt32BE(20), png[24], png[25]]).toEqual([512, 512, 8, 6]);
      } else {
        // The tile faces are opaque 8-bit RGB.
        expect([png[24], png[25]], ref).toEqual([8, 2]);
      }
    }
  });
});
