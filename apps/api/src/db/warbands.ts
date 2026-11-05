import type { Warband } from "@tc/rules";
import { eq } from "drizzle-orm";
import type { Db } from "./client.js";
import { warbands } from "./schema.js";

export interface StoredWarband {
  code: string;
  warband: Warband;
  createdAt: string;
  updatedAt: string;
}

// Async throughout even though better-sqlite3 is synchronous: the Postgres
// driver is not, and the routes should not change when it arrives.
export class WarbandStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(code: string): Promise<StoredWarband | undefined> {
    const rows = await this.db.select().from(warbands).where(eq(warbands.code, code)).limit(1);
    const row = rows[0];
    if (!row) return undefined;
    return { code: row.code, warband: JSON.parse(row.document) as Warband, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  /** Stores the roster under a fresh code from `nextCode`, drawing again on the rare collision. */
  async create(warband: Warband, nextCode: () => string): Promise<StoredWarband> {
    const at = this.now().toISOString();
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = nextCode();
      if (await this.get(code)) continue;
      await this.db.insert(warbands).values({
        code,
        name: warband.name,
        factionId: warband.factionId,
        document: JSON.stringify(warband),
        createdAt: at,
        updatedAt: at,
      });
      return { code, warband, createdAt: at, updatedAt: at };
    }
    throw new Error("Could not allocate an unused warband code");
  }

  async replace(code: string, warband: Warband): Promise<StoredWarband | undefined> {
    const existing = await this.get(code);
    if (!existing) return undefined;
    const at = this.now().toISOString();
    await this.db
      .update(warbands)
      .set({ name: warband.name, factionId: warband.factionId, document: JSON.stringify(warband), updatedAt: at })
      .where(eq(warbands.code, code));
    return { code, warband, createdAt: existing.createdAt, updatedAt: at };
  }
}
