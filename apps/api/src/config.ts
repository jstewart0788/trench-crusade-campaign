import { resolve } from "node:path";

/** apps/api/src (or apps/api/dist) → repository root. */
export const repoRoot = resolve(import.meta.dirname, "../../..");

export interface Config {
  /** Interface to bind. Loopback by default so a stray second listener on the port fails loudly; 0.0.0.0 to expose. */
  host: string;
  port: number;
  /** Directory holding the six rules JSON files. */
  rulesDir: string;
  /** SQLite file; ":memory:" for a throwaway database. */
  databaseFile: string;
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 3001),
    rulesDir: env.RULES_DIR ? resolve(env.RULES_DIR) : resolve(repoRoot, "data/rules"),
    databaseFile: env.DATABASE_FILE ? resolve(env.DATABASE_FILE) : resolve(repoRoot, "apps/api/data/roster.sqlite"),
  };
}
