import { WarbandExport, type Warband } from "@tc/rules";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { newAntioch } from "../../../packages/rules/test/fixtures.js";
import { createApp } from "../src/app.js";
import { CODE_ALPHABET, generateCode, parseCode } from "../src/codes.js";
import { configFromEnv } from "../src/config.js";
import { openDatabase } from "../src/db/client.js";
import { WarbandStore } from "../src/db/warbands.js";
import { loadRules, type LoadedRules } from "../src/rules.js";

const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

let rules: LoadedRules;
beforeAll(() => {
  rules = loadRules(configFromEnv({}).rulesDir);
});

function makeApp(now = () => new Date("2026-11-04T12:00:00Z")) {
  const clock = { now };
  const store = new WarbandStore(openDatabase(":memory:"), () => clock.now());
  return { app: createApp({ rules, store, now: () => clock.now() }), clock };
}

describe("GET /api/rules", () => {
  it("serves the six files with cache headers", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/rules");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.headers["etag"]).toMatch(/^"[0-9a-f]{32}"$/);
    expect(Object.keys(res.body).sort()).toEqual(["campaign", "equipment", "factions", "scenarios", "terrain", "units"]);
    expect(res.body.units.units).toHaveLength(rules.data.units.length);
  });

  it("answers 304 to a matching If-None-Match and gzips when accepted", async () => {
    const { app } = makeApp();
    const first = await request(app).get("/api/rules");
    const again = await request(app).get("/api/rules").set("If-None-Match", first.headers["etag"]!);
    expect(again.status).toBe(304);
    const gz = await request(app).get("/api/rules").set("Accept-Encoding", "gzip");
    expect(gz.headers["content-encoding"]).toBe("gzip");
    expect(gz.body.factions.factions).toHaveLength(6);
    const plain = await request(app).get("/api/rules").set("Accept-Encoding", "identity");
    expect(plain.headers["content-encoding"]).toBeUndefined();
  });
});

describe("warbands", () => {
  it("round-trips create → get → tts export for the New Antioch starting warband", async () => {
    const { app } = makeApp();
    const roster = newAntioch();

    const created = await request(app).post("/api/warbands").send(roster);
    expect(created.status).toBe(201);
    expect(created.body.code).toMatch(CODE_RE);
    expect(created.body.warband).toEqual(roster);
    expect(created.body.validation).toMatchObject({ ok: true, errors: [] });
    expect(created.body.cost).toMatchObject({ ducats: 318, glory: 0 });
    expect(created.body.cost.perMember).toHaveLength(6);
    const code: string = created.body.code;

    const fetched = await request(app).get(`/api/warbands/${code}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toMatchObject({ code, warband: roster, updatedAt: "2026-11-04T12:00:00.000Z" });
    expect(fetched.body.validation.ok).toBe(true);
    expect(fetched.headers["cache-control"]).toBe("no-store");

    const tts = await request(app).get(`/api/tts/warband/${code.toLowerCase()}`);
    expect(tts.status).toBe(200);
    expect(tts.headers["access-control-allow-origin"]).toBe("*");
    expect(tts.headers["content-type"]).toMatch(/^application\/json/);
    const payload = WarbandExport.parse(tts.body);
    expect(payload.code).toBe(code);
    expect(payload.generatedAt).toBe("2026-11-04T12:00:00.000Z");
    expect(payload.warband).toMatchObject({ name: "Test warband", faction: { id: "new-antioch", name: "New Antioch" }, totals: { ducats: 318, glory: 0 }, valid: true, errorCount: 0 });
    expect(payload.members.map((m) => m.displayName)).toEqual(["Lieutenant", "Yeoman", "Yeoman", "Yeoman", "Yeoman", "Shocktrooper"]);
    expect(payload.members[0]!.equipment.map((e) => e.name)).toEqual(["Sword/Axe", "Pistol", "Standard Armour"]);
  });

  it("replaces on PUT and bumps updatedAt", async () => {
    const { app, clock } = makeApp();
    const created = await request(app).post("/api/warbands").send(newAntioch());
    const code: string = created.body.code;

    clock.now = () => new Date("2026-11-05T09:30:00Z");
    const renamed: Warband = { ...newAntioch(), name: "The Fifth Lantern", members: newAntioch().members.slice(0, 2) };
    const put = await request(app).put(`/api/warbands/${code}`).send(renamed);
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ code, warband: renamed, createdAt: "2026-11-04T12:00:00.000Z", updatedAt: "2026-11-05T09:30:00.000Z" });
    expect(put.body.cost.ducats).toBe(95 + 37);

    const fetched = await request(app).get(`/api/warbands/${code}`);
    expect(fetched.body.warband.name).toBe("The Fifth Lantern");
    expect(fetched.body.warband.members).toHaveLength(2);
    expect(fetched.body).toMatchObject({ createdAt: "2026-11-04T12:00:00.000Z", updatedAt: "2026-11-05T09:30:00.000Z" });
  });

  it("stores an illegal roster and reports the errors rather than refusing it", async () => {
    const { app } = makeApp();
    const twoLeaders = newAntioch({ members: [...newAntioch().members, { id: "m7", unitId: "new-antioch/lieutenant", equipmentItemIds: [] }] });
    const res = await request(app).post("/api/warbands").send(twoLeaders);
    expect(res.status).toBe(201);
    expect(res.body.validation.ok).toBe(false);
    expect(res.body.validation.errors.map((e: { code: string }) => e.code)).toContain("unit-max");
    const tts = await request(app).get(`/api/tts/warband/${res.body.code}`);
    expect(tts.body.warband).toMatchObject({ valid: false, errorCount: 1 });
  });

  it("rejects a body that is not a Warband with 400 and the issues", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/warbands").send({ name: "x", members: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid-body");
    const paths = res.body.error.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(["id", "factionId", "gameNumber", "members"]));
  });

  it("rejects malformed JSON with 400", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/warbands").set("Content-Type", "application/json").send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid-json");
  });

  it("rejects a roster naming things the rules data does not have with 422", async () => {
    const { app } = makeApp();
    const res = await request(app).post("/api/warbands").send(newAntioch({ members: [{ id: "m1", unitId: "new-antioch/dragon", equipmentItemIds: [] }] }));
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: "unresolvable", message: expect.stringContaining("new-antioch/dragon") });
  });

  it("answers 404 for an unknown code and 400 for a malformed one", async () => {
    const { app } = makeApp();
    for (const path of ["/api/warbands/ABCDEF", "/api/tts/warband/ABCDEF"]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(404);
      expect(res.body.error).toMatchObject({ code: "not-found", message: "No warband with code ABCDEF" });
    }
    const put = await request(app).put("/api/warbands/ABCDEF").send(newAntioch());
    expect(put.status).toBe(404);
    const bad = await request(app).get("/api/warbands/O0I1");
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("invalid-code");
    const route = await request(app).get("/api/nothing");
    expect(route.status).toBe(404);
  });
});

describe("codes", () => {
  it("draws six characters from the unambiguous alphabet", () => {
    expect(CODE_ALPHABET).not.toMatch(/[01OI]/);
    for (let i = 0; i < 200; i++) expect(generateCode()).toMatch(CODE_RE);
    expect(generateCode(() => 0)).toBe("AAAAAA");
    expect(generateCode((max) => max - 1)).toBe("999999");
  });

  it("parses what a person types", () => {
    expect(parseCode("ab-cd ef")).toBe("ABCDEF");
    expect(parseCode("ABCDEF")).toBe("ABCDEF");
    expect(parseCode("ABCDE")).toBeUndefined();
    expect(parseCode("ABCD0F")).toBeUndefined();
    expect(parseCode("")).toBeUndefined();
  });
});
