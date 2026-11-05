import { toWarbandExport, validateWarband, warbandCost, Warband as WarbandSchema, WarbandExportError, type Warband } from "@tc/rules";
import cors from "cors";
import express, { type Request } from "express";
import { generateCode, parseCode } from "./codes.js";
import type { StoredWarband, WarbandStore } from "./db/warbands.js";
import { ApiError, errorHandler } from "./errors.js";
import type { LoadedRules } from "./rules.js";

export interface AppDeps {
  rules: LoadedRules;
  store: WarbandStore;
  now?: () => Date;
}

export function createApp({ rules, store, now = () => new Date() }: AppDeps): express.Express {
  const app = express();
  app.disable("x-powered-by");
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
  app.get("/api/rules", (req, res) => {
    res.set("Cache-Control", "public, max-age=300");
    res.set("ETag", rules.etag);
    res.set("Vary", "Accept-Encoding");
    res.type("application/json");
    if (req.acceptsEncodings("gzip")) {
      res.set("Content-Encoding", "gzip");
      res.send(rules.gzip);
    } else {
      res.send(rules.json);
    }
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

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "not-found", message: "No such route" } });
  });

  app.use(errorHandler);
  return app;
}
