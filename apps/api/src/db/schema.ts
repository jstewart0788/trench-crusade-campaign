import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// One row per saved roster. The Warband itself is stored as its JSON document
// (the @tc/rules roster model is plain JSON by design); name and faction are
// lifted out for listing later. Only portable column types are used so the
// Postgres version of this table is the same shape under pgTable.
export const warbands = sqliteTable("warbands", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  factionId: text("faction_id").notNull(),
  document: text("document").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
