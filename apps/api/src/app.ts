import { toWarbandExport, validateWarband, warbandCost, Warband as WarbandSchema, WarbandExportError, type Warband } from "@tc/rules";
import cors from "cors";
import express, { type Request, type Response } from "express";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { generateCode, parseCode } from "./codes.js";
import type { StoredWarband, WarbandStore } from "./db/warbands.js";
import { ApiError, errorHandler } from "./errors.js";
import { ArchetypeNotSelectableError, MAX_SEED, NoBoardError, UnknownScenarioError, type BattlefieldService } from "./battlefields.js";
import type { LoadedRules } from "./rules.js";

export interface AppDeps {
  rules: LoadedRules;
  store: WarbandStore;
  now?: () => Date;
  /** Built web app to serve at / (production only); unset in dev where Vite serves it. */
  staticDir?: string;
  /** Requests per minute per client IP on /api before 429; 0 disables. */
  rateLimitPerMinute?: number;
  /** Generated battlefields for the mod's Battlefield panel; unset = those routes answer 404. */
  battlefields?: BattlefieldService;
}

// Enough for a table of players building rosters; it exists so an unauthenticated
// public endpoint cannot be hammered for free, not as a security boundary.
function rateLimiter(perMinute: number): express.RequestHandler {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const b = buckets.get(key) ?? { tokens: perMinute, at: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
    b.at = now;
    if (b.tokens < 1) {
      buckets.set(key, b);
      res.status(429).json({ error: { code: "rate-limited", message: "Too many requests; try again in a minute" } });
      return;
    }
    b.tokens -= 1;
    buckets.set(key, b);
    if (buckets.size > 10_000) buckets.clear();
    next();
  };
}

export function createApp({ rules, store, now = () => new Date(), staticDir, rateLimitPerMinute = 0, battlefields }: AppDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  if (rateLimitPerMinute > 0) app.use("/api", rateLimiter(rateLimitPerMinute));
  // No auth and nothing private: the TTS mod fetches from inside Tabletop Simulator.
  app.use("/api", cors());
  app.use(express.json({ limit: "1mb" }));

  const describe = (stored: StoredWarband) => ({
    code: stored.code,
    warband: stored.warband,
    validation: validateWarband(stored.warband, rules.data),
    cost: warbandCost(stored.warband, rules.data),
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  });

  const codeParam = (req: Request): string => {
    const code = parseCode(String(req.params.code ?? ""));
    if (!code) throw new ApiError(400, "invalid-code", `"${req.params.code}" is not a warband code`);
    return code;
  };

  const find = async (req: Request): Promise<StoredWarband> => {
    const code = codeParam(req);
    const stored = await store.get(code);
    if (!stored) throw new ApiError(404, "not-found", `No warband with code ${code}`);
    return stored;
  };

  // The body must be a Warband and every faction/unit/item/upgrade it names
  // must exist in the rules data; anything else (over threshold, battlekit
  // breaches) is reported in `validation`, not refused, so drafts can be saved.
  const parseBody = (body: unknown): Warband => {
    const parsed = WarbandSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid-body",
        "Body is not a Warband",
        parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      );
    }
    try {
      toWarbandExport(parsed.data, rules.data, { code: "PENDING" });
    } catch (e) {
      if (e instanceof WarbandExportError) throw new ApiError(422, "unresolvable", e.message);
      throw e;
    }
    return parsed.data;
  };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, rules: { dir: rules.dir, factions: rules.data.factions.length, units: rules.data.units.length, equipment: rules.data.equipment.length } });
  });

  // Express answers a matching If-None-Match with 304 on its own once ETag is set.
  const sendPayload = (req: Request, res: Response, body: { json: Buffer; gzip: Buffer; etag: string }) => {
    res.set("Cache-Control", "public, max-age=300");
    res.set("ETag", body.etag);
    res.set("Vary", "Accept-Encoding");
    res.type("application/json");
    if (req.acceptsEncodings("gzip")) {
      res.set("Content-Encoding", "gzip");
      res.send(body.gzip);
    } else {
      res.send(body.json);
    }
  };

  app.get("/api/rules", (req, res) => sendPayload(req, res, rules));

  app.get("/api/tts/models", (req, res) => {
    if (!rules.models) throw new ApiError(404, "not-found", "This server has no TTS model map");
    sendPayload(req, res, rules.models);
  });

  app.post("/api/warbands", async (req, res) => {
    const warband = parseBody(req.body);
    const stored = await store.create(warband, generateCode);
    res.status(201).json(describe(stored));
  });

  app.get("/api/warbands/:code", async (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json(describe(await find(req)));
  });

  app.put("/api/warbands/:code", async (req, res) => {
    const code = codeParam(req);
    const warband = parseBody(req.body);
    const stored = await store.replace(code, warband);
    if (!stored) throw new ApiError(404, "not-found", `No warband with code ${code}`);
    res.json(describe(stored));
  });

  app.get("/api/tts/warband/:code", async (req, res) => {
    const stored = await find(req);
    res.set("Cache-Control", "no-store");
    res.json(toWarbandExport(stored.warband, rules.data, { code: stored.code, now: now() }));
  });

  if (battlefields) {
    app.get("/api/battlefields", (_req, res) => {
      res.set("Cache-Control", "public, max-age=300");
      res.json({ maxSeed: MAX_SEED, scenarios: battlefields.list() });
    });

    app.get("/api/battlefields/:scenario/:seed", (req, res) => {
      const scenario = String(req.params.scenario);
      const seedRaw = String(req.params.seed);
      if (!/^[a-z0-9-]{1,40}$/.test(scenario)) throw new ApiError(400, "invalid-scenario", "Scenario ids are lower-case words joined by hyphens");
      if (!/^[0-9]{1,6}$/.test(seedRaw) || Number(seedRaw) < 1 || Number(seedRaw) > MAX_SEED) {
        throw new ApiError(400, "invalid-seed", `Seed must be a whole number from 1 to ${MAX_SEED}`);
      }
      const archetypeRaw = req.query.archetype;
      if (archetypeRaw !== undefined && typeof archetypeRaw !== "string") throw new ApiError(400, "invalid-archetype", "Give one archetype");
      try {
        const payload = battlefields.board(scenario, Number(seedRaw), archetypeRaw);
        res.set("Cache-Control", "public, max-age=86400");
        res.json(payload);
      } catch (err) {
        if (err instanceof UnknownScenarioError) throw new ApiError(404, "not-found", `No scenario ${scenario}`);
        if (err instanceof ArchetypeNotSelectableError) {
          const allowed = battlefields.list().find((s) => s.id === scenario)?.archetypes ?? [];
          throw new ApiError(400, "invalid-archetype", allowed.length > 1 ? `${scenario} can be laid as ${allowed.join(" or ")}` : `${scenario} is always laid as ${allowed[0]}; leave out archetype`);
        }
        if (err instanceof NoBoardError) throw new ApiError(422, "no-board", `The generator could not lay ${scenario} seed ${seedRaw}; try another seed`);
        throw err;
      }
    });
  }

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "not-found", message: "No such route" } });
  });

  if (staticDir && existsSync(staticDir)) {
    app.use(express.static(staticDir, { index: "index.html", maxAge: "1h" }));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(staticDir, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
