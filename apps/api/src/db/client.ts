import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as schema from "./schema.js";

export type Db = BetterSQLite3Database<typeof schema>;

// apps/api/src/db (or apps/api/dist/db) → apps/api/drizzle, where drizzle-kit writes migrations.
const migrationsFolder = resolve(import.meta.dirname, "../../drizzle");

/** Opens the SQLite file (creating it and its directory) and applies pending migrations. ":memory:" gives a throwaway database. */
export function openDatabase(file: string): Db {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  if (file !== ":memory:") sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder });
  return db;
}
