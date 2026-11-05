import { createApp } from "./app.js";
import { configFromEnv } from "./config.js";
import { openDatabase } from "./db/client.js";
import { WarbandStore } from "./db/warbands.js";
import { loadRules } from "./rules.js";

const config = configFromEnv();
const rules = loadRules(config.rulesDir);
const db = openDatabase(config.databaseFile);
const app = createApp({ rules, store: new WarbandStore(db), staticDir: config.staticDir, rateLimitPerMinute: config.rateLimitPerMinute });

const server = app.listen(config.port, config.host, () => {
  console.log(`tc-api listening on http://${config.host}:${config.port}`);
  console.log(`  rules: ${config.rulesDir} (${rules.data.units.length} units, ${rules.data.equipment.length} items)`);
  console.log(`  db:    ${config.databaseFile}`);
  if (config.staticDir) console.log(`  web:   ${config.staticDir}`);
});

// The TTS mod fetches from 127.0.0.1:3001, which is also where the fixture
// server (pnpm mod:serve) sits while the mod is developed against canned
// rosters. Only one of them can own the port, and it must be obvious which.
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`tc-api: ${config.host}:${config.port} is already taken (another tc-api, or the TTS fixture server from pnpm mod:serve). Stop it or set PORT.`);
    process.exit(1);
  }
  throw err;
});
