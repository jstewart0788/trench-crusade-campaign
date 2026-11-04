# Trench Crusade Campaign Platform — Roadmap (draft 1, 2026-11-04)

Status: **proposed** — decisions 1–6 answered 2026-11-04 (see *Decisions*). Phase ordering
reflects them. Ticket work is not approved until Jonathan says go on a phase.

## What we are building

Two halves that share one data model:

1. **Campaign web platform** — register, build and manage a warband, hold a starting base,
   declare a territory move each round, get paired into battles, record results, run the
   rulebook's post-game Campaign Phase, spend ducats and glory, hold territories for ongoing
   benefit.
2. **TTS mod** — one mod that (a) binds a warband exported from the platform onto models
   (ForceOrg / yellowscribe pattern), (b) spawns a generated battlefield for the specific
   encounter the platform paired, and (c) carries the LCT-class table features: tokens,
   counters, auras, dice, save positions, ambiance.

The platform is the brain. The mod is a thin, scripted client that asks the platform
"what am I playing and on what" and renders it.

## Ground truth we already have

### Rulebook (local PDFs, `~/Downloads`)
- `Trench-Crusade-Digital-Rulebook.pdf` (197 pp). Relevant chapters:
  - **Terrain p58–67**: formal terrain piece vocabulary (Open, Landmarks, Area, Hills,
    Linear, Trench Sections, Ruined Buildings, Corner Ruins, Rivers) and three **Battlefield
    Archetypes**: No Man's Land, Decimated Ruins, Trench Lines.
  - **Campaign Rules p87–143**: Patrons, campaign forces, Warband Threshold, Glory Points,
    and the **Campaign Phase** sequence — Trauma → Promotions & Experience → Reinforcements →
    Exploration → Quartermaster → Glory Items.
  - **Scenarios p144–197**: twelve scenarios, each with a Game Map (deployment zones +
    objective positions), archetype, special rules, victory conditions.
- `Warbands-of-Trench-Crusade.pdf` (186 pp): faction rosters, unit profiles, equipment,
  starting warband rules.

This matters: both halves have a *formal* spec to derive from. The map generator does not
invent terrain; it places rulebook terrain-piece types on rulebook archetypes with scenario
Game Map overlays. The campaign manager does not invent progression; it implements the
Campaign Phase steps and adds a territory layer on top.

### Reference TTS mods (all cached locally under `~/Library/Tabletop Simulator/Mods/Workshop`)

| Mod | ID | What we take from it | Measured |
|---|---|---|---|
| LCT | 3710681747 | **Engine base.** Tokens, counters, auras, dice, save positions, HUD. Maps spawn via `spawnObjectJSON` from embedded "Battlemaster" caches — the exact pattern for platform-generated maps. Already references yellowscribe. | 128 KB global Lua, 151 functions, 39 MB of object Lua (embedded map caches) |
| ForceOrg | 3137407072 | Model-library + roster-binding pattern | 3,242 nested objects, binding logic lives in per-object Lua |
| Trench Crusade 1.0.2 Scripted Table | 3603166284 | TC rules references, dice roller, Points/Turn/Glory counters, ambiance, PDFs, model bags | 405 objects, 35 infinite bags |
| Gannel's Model Corner | 3700111403 | Faction model bags, status tokens (ACTIVATED / DOWN / TOUGH) | 16 model bags |
| Trench Crusade: Map | 3427166914 | **Swappable tile system + terrain/object library.** Known defect confirmed: 286 of 335 top-level objects sit below Y=1.0 (min −2.5). | 225 asset bundles, 1.6 MB of per-tile Lua (swap UI) |
| Trenches Square Off / Urban Brawl / Armoured Train #1 | 3321247064 / 3347913885 / 3665398498 | Reference "good density" layouts; all objects at Y ≥ 1.0 (correct rest height) | 285 / 348 / 333 objects |
| Cenotaph / Howitzers | 3450016714 / 3449196567 | Reference layouts, heavier set-piece style | 379 / 298 objects |
| Damji Airbase | 3451328878 | Quality ceiling; too dense to target for generation | 253 top-level objects |

Shared asset vocabulary across the map mods: `Landscape 1x1/1x2/1x4`, `Trench Straight`,
`Trench Corner`, `Trench Straight w/ Ledge`, `Barbed Wire`, `Sandbags`, `Plank Floor`,
`Difficult Terrain` / `Difficult + Dangerous` tokens, plus `ESO_*`, `tw2_5_*`, `Warden *`
model packs. This is the palette the generator draws from.

## Architecture calls (opinions, not yet decisions)

**We do not need yellowscribe.** Yellowscribe exists because BattleScribe rosters live
outside the mod. We own both ends. The platform serves `GET /api/tts/warband/{code}` and the
mod fetches it with `WebRequest`, exactly as ForceOrg does with yellowscribe. Same for maps:
`GET /api/tts/battle/{code}` returns a TTS object-state array the mod spawns. One code per
battle, typed into the mod, pulls warbands *and* map.

**Map generation is tile composition, not object scatter.** The failure mode you named
("weird terrain placement") comes from placing individual crates. The atomic unit must be a
pre-built, known-good tile (a trench run, a corner ruin, a hill ramp, a crater field) with
metadata: footprint, rest height, connectors (trench ends), archetype tags, faction-dressing
tags. The generator:
1. starts from a **territory template** (hand-authored grid of slots + which archetype),
2. overlays the **scenario Game Map** (deployment zones, objective slots — p151–197),
3. fills slots by constraint (trench connectors must chain; objectives need Ruined Building
   pieces per p152; deployment zones stay traversable),
4. applies a **faction dressing pass** (banners, blood/skull props, sandbags/crosses) that
   never affects playability.
Variation comes from 2–4, theme from the template. Tiles come from the TC:Map library with
rest-height corrected.

**Raising the map above the table is a measurement task first.** Asset bundles have their
own pivots, so "add +3.5 to Y" is wrong for some tiles. Phase 0 builds a catalog with the
*measured* rest height per asset, taken from the three mods that already sit correctly.

**Mod base = LCT fork, not the Scripted Table.** The Scripted Table has the TC content but
~0 engine (336 B of global Lua). LCT has the engine. Strip 40k-specific systems (secondaries,
CP, mission decks), port TC content and counters from the Scripted Table, pull models from
ForceOrg + Gannel. Needs author permission before any public workshop upload — see decisions.

**Stack**: TypeScript/Node web app, Postgres, hosted on the existing VPS. The rules data
(warbands, equipment, skills, injury/trauma/exploration tables, scenarios, terrain
archetypes) is extracted once from the PDFs into versioned JSON and is the single source for
the warband builder, campaign phase, and map generator. PDF text extraction is noisy
(`T errain`, `W arband`) — budget a manual review pass.

## Decisions (answered 2026-11-04)

1. **Warband building is in-platform.** NewRecruit import is a convenience, not the source.
2. **Territories add flat income and unlock the Rare/Legendary Exploration tables.**
   Exploration itself stays as written in the rulebook.
3. **Map is a node graph with adjacency.** You attack only from a held neighbour. Edges and
   nodes carry terrain: rivers, passes and ruins act as chokepoints on the greater map and
   set the Battlefield Archetype of the fight that happens there.
4. **GM games are always played, never auto-resolved.** The GM's force scales with the
   territory's **tier**: tier 1 (near the starting bases) is scattered resistance and falls
   easily; higher tiers are held by **named NPC factions** with their own persistent
   warbands that grow between rounds. Named factions are campaign content, authored per
   season.
5. **Private only.** Mod stays unlisted; no upstream permission needed until that changes.
6. **Mod first, campaign second. No timeline.** The immediate need is one-off games between
   Jonathan and friends while learning the rules. Campaign is capped at 4–6 players for
   season 1.

Consequence of 6: the mod needs a roster to import before any campaign exists, so the
**roster builder ships first as a standalone tool** (no auth, no campaign) and is the same
code the campaign platform later wraps. Nothing is built twice.

## Phases

### Phase 0 — Foundations
- Repo layout, TypeScript/Node, Postgres, CI, VPS deploy skeleton.
- Rules data → `data/rules/*.json` from two sources: the NewRecruit / BattleScribe-format
  community Trench Crusade dataset (factions, units, profiles, equipment, costs, roster
  constraints — converted, then diffed against the Warbands PDF; the list builder's bugs
  may be data bugs too) and PDF extraction for what it does not model (campaign tables,
  scenarios + Game Map geometry, terrain archetypes). Every table cites a PDF page.
- TTS asset catalog → `data/tts/catalog.json`: every reusable terrain asset across the
  reference mods, with bundle URL, footprint, **measured rest height**, connector tags,
  archetype tags. Built by script from the workshop JSON; rest heights verified in TTS
  against Square Off / Urban Brawl / Armoured Train.
- **Exit**: catalog spawns in TTS with every tile resting on the table; a starting warband
  for each faction validates against the rules JSON.

### Phase 1 — Mod v1: engine + roster binding (the urgent one)
- **Roster tool** (standalone web page): build a rulebook-valid warband, save it, get a
  code. Import from NewRecruit as a shortcut. This is the seed of the campaign's builder.
- **LCT fork**: strip 40k systems (secondaries, CP, mission decks), keep tokens, counters,
  auras, dice, save positions, HUD. Port Scripted Table content: rules refs, TC dice roller,
  Points / Turn / Glory counters, ambiance. Model library from ForceOrg + Gannel + Scripted
  Table bags.
- **Binding**: mod fetches `/api/tts/warband/{code}` via `WebRequest`, spawns models with
  name, profile, equipment, skills and injuries bound as description/tooltip. Blood,
  Blessing, Down, Activated tokens. Trench Crusade activation/morale flow.
- **Exit**: a one-off game between Jonathan and a friend played start to finish in the mod
  with both warbands imported by code, on any existing map mod.

### Phase 2 — Map generator v1 (one archetype)
- Trench Lines archetype. Scenario overlays for Claim No Man's Land, Trench Warfare, Relic
  Hunt, Supply Raid (the one-off staples). 3–4 templates.
- Generator → TTS object JSON → mod spawns from `/api/tts/battle/{code}`; for one-offs the
  code is produced by picking scenario + archetype + two rosters on the roster tool.
- Density and layout judged against Square Off / Urban Brawl / Armoured Train.
- GM escape hatch: hand-fix in TTS, save back.
- **Exit**: ten generated maps reviewed in TTS; zero floating/sunken pieces; trench chains
  connect; objectives and deployment zones match the scenario Game Map; a one-off played
  on a generated map.

### Phase 3 — Map generator v2
- No Man's Land and Decimated Ruins. All twelve scenarios incl. set pieces (Armoured Train,
  Dragon Hunt). Faction dressing pass. Edge-terrain variants for chokepoint fights (river
  crossing, pass).

### Phase 4 — Campaign platform
- Auth, campaign create/join, GM role, 4–6 players. Roster tool becomes the warband page.
- Territory graph: tiers, terrain-typed nodes and edges, faction starting locations, per-
  round benefit (income, table unlocks, upgrades). Named NPC factions with persistent
  warbands per tier.
- Round loop: declare one adjacent target → conflict resolution → pairings (PvP on contested
  nodes, PvGM otherwise, GM force from tier/faction) → scenario per rulebook p96 → battle
  code → results entry → Campaign Phase walkthrough → ownership and rewards applied.
- Season history, round log, GM overrides.
- **Exit**: one full round run end to end by real players.

### Phase 5 — Scale and texture
- Multiple moves per round as warbands grow; alliances; NPC faction growth model.
- Discord integration (round open/close, pairings, results) via openclaw.
- Spectator map; season recap.

## Backlog — Phase 0 and Phase 1 as tickets

Numbering is provisional. One ticket = one commit on `main`.

**Phase 0 — done 2026-11-04** except the in-TTS half of TC-008. Status per ticket:
TC-001 ✅ · TC-002 ✅ · TC-003 ✅ (174 PDF overrides in `data/rules/pdf-overrides.json`, applied by
the converter on every regeneration; 14 unresolved variant-conditional prices need a `variantCosts`
schema slot) · TC-004 ✅ · TC-005 ✅ (Don't Breathe geometry low-confidence) · TC-006 ✅ (archetype
pages have no diagrams; layout rules come from text) · TC-007 ✅ · TC-008 ◐ (172 assets have rest
heights from the seated reference mods; **64 TC:Map-only assets need measuring with TTS open**; zero
asset overlap at identical scale between TC:Map and the reference mods, so no global offset exists)
· TC-009 ✅ (67 tests, mutation-checked).

**Phase 1 progress 2026-11-04:** TC-012 ✅ export contract + TTS description renderer (fixture in
`mod/fixtures/`) · TC-013 ✅ LCT fork stripped to 2.9 MB with unpack/pack tooling (`pnpm mod:build`,
`pnpm mod:install`; **not yet loaded in TTS — follow `mod/TESTING.md`**) · TC-015 ✅ model map, 92/102
units, defaults only · TC-003b ✅ (744 unavailable rows dropped, overrides 174 → 163; one PDF
disagreement left: Death Commando Binoculars missing upstream). Next: TC-014, TC-016, TC-017, TC-010.

**Follow-ups from the 2026-11-04 adversarial QA pass** (data correctness, not blocking Phase 1 start):
- TC-003b Converter condition handling: "X only" items leak onto every unit as a `conditionNote`
  (Brazen Bull-only weapons on all Sultanate units, Heavy Ballistic Shield on Yeomen, Court
  Misericordia/Halberd-Gun rows, Heretic Trooper Musket); contradictory onlyWith+onlyWithout gates
  (Butcher Bayonet, Viscera Cannon, Black Grail Shield); deprecated fireteam wrappers should be dropped;
  duplicate upgrade names (Janissary Veteran ×2 on Yüzbaşı); upstream page cites on 8 Heretic units are
  from an older document. Fix in the converter, with an override "remove" op for the remainder.
- TC-003c Per-unit battlekit overrides: Amalgam "up to six weapons" (p140), Mamluk Faris polearm+shield
  loadout (p179), Mendelist Ammo Monk hire for New Antioch (p180), Holy Icon Armour on Stigmatic Nun /
  Trench Pilgrim (p62), Knights of Avarice second warlock (p120), Wretched 10-ducat kit cap (p167).
- Rule text: units/equipment/factions JSON carry near-verbatim Warbands ability and rule text inherited
  from upstream. Jonathan's decision 2026-11-04: the Trench Crusade rules are free and publicly
  available, so this is not a blocker for the public repo. Not to be re-raised.
- Engine judgement calls to settle: HELD item + 1H weapon + shield counting (Digital Rulebook p55 reads
  "either a 1-Handed Weapon or a Shield"); mercenary loadout bundles (`bundle` field) not enforced, so
  Greatsword + Pistol on a Mamluk Faris passes; Scripture Guardian's mandatory weapon purchase (p182).
- 22 gate names the engine cannot count (Cadaver Corps, Remnants of Byzantium, Book of Golems, the Goetic
  sins…) emit `unmodelled` warnings on legal rosters; needs a `campaignSelections` field on the roster.

**Phase 0 (original tickets)**
- TC-001 Repo scaffold: pnpm workspace, `apps/web`, `packages/rules`, `packages/tts`,
  `data/`, CI lint+test.
- TC-002 Pull NewRecruit TC dataset; write converter → `data/rules/{factions,units,
  equipment}.json`; record upstream commit SHA.
- TC-003 Diff converted dataset against the Warbands PDF per faction; log every
  disagreement with page cite; fix in our JSON.
- TC-004 PDF extraction: campaign tables (trauma, skills, exploration ×3, glory items) →
  JSON with page cites; manual review pass.
- TC-005 PDF extraction: twelve scenarios → JSON (archetype, deployment geometry,
  objective positions, special rules, game length, victory).
- TC-006 Terrain vocabulary + archetypes → JSON (p58–67).
- TC-007 Asset harvester: walk the reference mod JSON, dedupe by bundle URL, emit catalog
  with footprint and tags.
- TC-008 Rest-height measurement: spawn each catalog asset in TTS, record resting Y,
  write back; verify against the three correctly-seated mods.
- TC-009 Rules engine `packages/rules`: roster validation (threshold, limits, battlekit
  limits, faction constraints) with tests drawn from the PDF's examples.

**Phase 1**
- TC-010 Roster tool UI: pick faction + Patron, add units, equip, validate live, save,
  get code.
- TC-011 NewRecruit import into the roster tool.
- TC-012 `/api/tts/warband/{code}` JSON contract + endpoint.
- TC-013 LCT fork: strip 40k systems; keep engine; document what was removed.
- TC-014 Port Scripted Table content into the fork (rules refs, dice roller, counters,
  ambiance).
- TC-015 Model library: assemble faction bags from ForceOrg + Gannel + Scripted Table;
  map rules-JSON unit IDs → model GUIDs.
- TC-016 In-mod code entry + `WebRequest` fetch + spawn with bound descriptions. The model from
  `data/tts/models.json` is only a default: players bind their own models to roster entries
  (Jonathan, 2026-11-04), so missing mappings are not a defect.
- TC-017 TC tokens (Blood, Blessing, Down, Activated) and activation/morale helpers.
- TC-018 Playtest: one full one-off in the mod; log every friction point as tickets.

## Risks, named

- **Generator quality** is the whole second half. Mitigation: tile-based, one archetype
  first, judged against the three reference maps, GM hand-fix escape hatch.
- **Rules data errors** silently corrupt the roster tool. Mitigation: two sources diffed,
  page cites, tests from the PDF's own examples.
- **Asset bundle rest heights** vary per asset. Mitigation: measure, don't offset.
- **LCT fork drift**: LCT updates often. Mitigation: fork once, document removals, don't
  chase upstream until the mod is stable.
- **Upstream licensing** is deferred by decision 5, not resolved. Revisit before anything
  goes public.
