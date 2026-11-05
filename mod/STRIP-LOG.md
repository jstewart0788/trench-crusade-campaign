# Strip log - LCT v1.12.1 to Trench Crusade Table (dev)

What was removed from the unpacked LCT save to produce `mod/`, and how it was validated.
`mod/ANATOMY.md` has the classification of every top-level object and of global.lua's
functions; this file records the cut.

The strip was done once, by script, against an unpack of
`~/Library/Tabletop Simulator/Mods/Workshop/3710681747.json` (`scripts/tts_unpack.py`).
Every edit asserted its anchor matched exactly once. `mod/` is the result; the diff of
`mod/` against a fresh unpack of the workshop file is the authoritative record.

## Numbers

| | LCT | stripped |
|---|---|---|
| packed save | 48,104,565 bytes | 2,945,902 bytes |
| top-level objects | 218 | 108 |
| objects incl. nested | 1,774 | 1,100 |
| scripted objects | 425 | 47 |
| global.lua | 128,527 bytes / 2,437 lines | 33,536 bytes / 919 lines |
| Start Menu `738804` | 252,615 bytes / 6,090 lines | 117,164 bytes / 2,966 lines |
| XmlUI | 110,218 bytes / 932 lines | 34,706 bytes / 335 lines |

## Objects removed (110 top-level, with everything nested in them)

- 15 mission-matrix bags (`Take and Hold vs ...`, `Purge the Foe vs ...` etc.), 24 map cards
  each (390 cards, ~39 MB of embedded layout JSON), and their 15 art tiles.
- `Combat Patrol Maps` bag (3 cards), `11e Layouts` deck (45 cards), the printed mission
  matrix billboard `9c6ce8`.
- Mission card decks: `Primary mission cards`, `Leviathan secondary mission cards`,
  `Leviathan fixed secondary cards`, `CA 2025 Fixed Secondary Cards`, `Pariah Nexus
  deployment cards`, `Red/Blue Primary Cards`, `Red/Blue Secondary Mission Cards`, two loose
  `Tactical Objectives` cards.
- The secondary-card machinery: 16 slot zones `RedSec1-8` / `BlueSec1-8`, 6 primary /
  deployment / twist slot zones, 10 `*SecName*` 3D labels, 2 card holder boards, `Mission
  Manager Red/Blue`, `10e Score Sheet`.
- CP: `Command Points` x2, `Gain CP Red/Blue`.
- 40k reference material: `11e Core Rules`, `Tournament Companion 1.0`, `Warhammer Open FAQ`
  PDFs; Core Stratagems billboard `251e3c`; 2D6 charge-odds chart `531758`; ITC round
  scoring table `838115`; `Deep Strike / Strategic Reserves / Transports` boards x2; six
  `40K ITC` / `KT Dep` shelf labels; `Marked for Death` token; `40K items` bag; `Red/Blue WH
  Stats Helper` (parses 40k weapon profiles).
- LCT community tiles: the LCT logo/Discord tile, `discord.gg/tts40k`, the Battlemaster
  layout-editor link and four workshop link tiles.
- Save-level: the 4 global `SnapPoints` tagged `secondaryCard`/`gambitCard`; `SaveName` and
  `GameMode` renamed to `Trench Crusade Table (dev)`; the "Gaming instructions" notebook tab
  rewritten (the "Credits" tab is kept verbatim - it is the upstream attribution);
  `LuaScriptState` of Global, the Start Menu and the theme overlay reset so the table loads
  fresh (no stale `packSelected` / disposition / creator-filter state). `ComponentTags` still
  lists the card tag labels; harmless metadata, left alone.

## global.lua

Removed: the CP block (`cpCounterForColor` ... `hudUseCP`, `cpGainRoundUsed`), the whole
scoring-overlay section (`hudToggleLock` ... `refreshScoringOverlay`, the
`SCORING_OVERLAY_*` constants, `scoringContext`, `scoringHudCache`, `discardedCardTurns`,
`DISCARD_NAME_IGNORE`), the secondary-slot section (`getSecondaryCardZones` ...
`recycleSecondarySlot`, including the `onObjectEnterScriptingZone` /
`onObjectLeaveScriptingZone` handlers that only served it), the mission-pack functions
(`hideMissionDeckUntilSelected`, `activateMissionDeck`, `setMissionPack`,
`useEdition11SecondaryDecks`, `placeToGray`), the seven Battlemaster debug functions and
their `BATTLEMASTER_*` / `LCT_PACK_1_*` constants, `announceThemeVote` (LCT Discord vote
banner) and its timer, and the data: `missionPackData`, `missionMatchups`,
`PLACEHOLDER_MISSION`, `MAP_INDEX`, `LOCKED_IN_SECONDARIES`, `packSelected`, the secondary
zone / name GUID tables, every mission / CP / score-sheet / card-zone GUID constant, the
primary-card GUID comment block.

Edited in place: `playerHudSettings` defaults lose `scoringOverlayOpen` /
`scoringOverlayMinimalist`; `applyHudPreferencesForColor` no longer writes the scoring
overlay or the Lock button; `hudToggleHelp` no longer closes the scoreboard;
`applyMinimalistForColor` no longer toggles `Row3`, and `HUD_FULL` becomes height 155 /
controls 143 (the Row3-less geometry the spectator panel already used); the yellowscribe
sweep no longer invalidates the scoring cache; `onSave`/`onLoad` drop the pack and deck
state, the mission-deck hiding, the secondary-name refresh and the stats-helper
repositioning; `onPlayerChangeColor` no longer syncs score-sheet titles; version banner and
`GAME_CHANGELOG` retitled (`GAME_VERSION = "dev"`, `GAME_PATCH` keeps the LCT base
`v1.12.1`).

## Start Menu `738804`

Removed subsystems: dispositions (values, selectors, HUD badges, `missionMatchups` lookup);
mission generation and dealing (`generateMissionWorldX` through `dealCombatPatrolMapCard`:
primary / deployment / layout-art card handling, `missionSlots`, the 15-bag deployment
card table, Battlemaster generation, Combat Patrol dealing, SET MISSIONS, lock-in buttons);
mission-matrix props (`GAME_MODE_OBJECTS`, `STARTUP_MAP_CARDS`, Combat Patrol bag, force
disposition token, legacy primary deck, `gameModeUsesMatrixProps`, the printed game-mode mat
art); the restore point / "Back to Selection" flow and the DEBUG map-tag tool; Battlemaster
mat pools and randomizer, `onMapCardLoaded` (`BM_MAT_PIVOT_Y` ... `loadedMapCardDestroyTimerId`,
`CITY_MAT_*`, `BTTF_RUINS_MAT_*`, `LCT_PACK_1_MAT_*`); the mission-manager section
(`selectPariahNexus`, `selectMissionPack`); secondary lock-in at game start
(`getMissionManagerForColor` ... `announceSecondarySelections`); CP on turn pass
(`updateCpHUD`, the local `counterIncrement`, `cpEveryTurn`, `markBaseline` calls);
`matrixPropsDisabled` / `combatPatrolMode` flags and their save fields.

Edited: the six mode buttons now only pick a size and deploy mode and call `confirmSizeMat`
(via `loadGameWithoutMapContainers`); `confirmSizeMat` always applies the default mat art;
`applyOnslaughtButtonLayout` only relocates buttons; `clearMat` no longer returns layout
cards or destroys the Discord tile, and its keep-list only names objects that exist
(`28865a`, `4ee1f2`); `writeMenus` / `writeDeployMenu` / `writeIngameMenu` no longer write
the disposition, Generate, Set Missions or Back to Selection buttons nor auto-select a
mission pack; `startGame` keeps the seat and deployment-zone checks, `recordPlayers`,
overlay hide, objectives, custom turns, activation reset and HUD update; `passTurn` flips
the turn and increments the turn counters only; `updateGameStateHUD` no longer paints
disposition badges; stale comments in the edited regions reworded.

Kept as UNSURE (see ANATOMY): the 40k deployment-zone geometry tables and their drawing
primitives, `selectDeployZoneByName` (the hook a platform-driven battle load will want),
the objectives manager and 9" lines, the 40k phase strip (`phases`, `hudPhase*`,
`updatePhaseHUD`), Onslaught/Colosseum/Boarding Action size names, `missionSetupControlsVisible`
(now just "setup controls visible"; not renamed to avoid a refactor).

## Other scripts

- `369707` Map Creator Filter -> **Table Theme overlay**: rewritten to keep only the theme
  swatch grid (the only UI for table themes). Creator filter, category toggles,
  `activeMapCreators` publishing, `battlemasterMode`, and the Mat Randomizer forwarders are
  gone. Panel is now centred on its anchor block instead of offset beside a filter panel.
- `acae21` / `839fcc` Custom Dice Table: the "Show Scoreboard" hotkey registration removed;
  everything else untouched (including the 40k sustained/lethal hits features).
- `ee92cf` Game Rounds: no longer looks up `scoreSheet_GUID`; the never-shown `gameOver`
  button handler just announces GAME OVER instead of comparing score-sheet totals.

## XmlUI

Removed the three `*_ScoringOverlay` panels (527 lines), the "Battlemaster cache" section of
`DebugTools`, and in each HUD panel the `*_LockBtn`, `*_DispBadge1/2` + `*_DispSpacer1/2`,
`*_VPWatch1/2`, `*_CPWatch1/2` and (Red/Blue) the `*_Row3` Scoreboard / Gain CP / Use CP row.
Red/Blue panel height 228 -> 155, `MainPanel` preferred/min height 228 -> 155, round badge
button 143 -> 155 and the controls column 172 -> 143, copying the spectator panel that never
had the CP row. Splash title `LCT 40K TABLE` -> `TRENCH CRUSADE TABLE`; the default patch
notes text replaced (overwritten at load from `GAME_CHANGELOG` anyway).

## Dangling references

Found by scanning every 6-hex-digit string literal in the remaining Lua/XML against
`save.json`:

- Introduced by the strip and fixed: `7c7c20` / `b7ac7a` (stats helpers) in global
  `onLoad`; `8f2be2` (Discord tile) in the Start Menu's clear/onslaught code; `6012bf`,
  `948ce5`, `e7ca6e` entries of the Start Menu's mat-wipe keep-list (never existed; the
  list now names only live objects); the unused `redControlBoard_GUID` / `blueControlBoard_GUID`
  / `templateObjective_Hutber_GUID` / `purpleCPCounter_GUID` constants (never existed).
- `redDiceMat_GUID` / `blueDiceMat_GUID` pointed at `c57d70` / `a84ed2`, which do not exist in
  LCT either; retargeted to the custom dice mats `acae21` / `839fcc` (only read by
  `setViewForPlayer`, whose call site is commented out upstream).
- Left as in LCT, justified: `table_GUID = "948ce5"` (TTS's own table has no object; `Extract
  terrain` and `Flex Table Control` read it through `Global.getVar` and nil-check);
  `7abc5a` in the four token-bag scripts (nil-checked `destroyObject` of a helper that no
  longer exists upstream; those scripts left with the second cut below, so `948ce5` is now
  the only dangling literal); `b4d10a` (Battlemaster spawner) was dangling upstream and is
  now gone with its callers.
- Pre-existing dangling calls, not GUIDs: `Extract terrain` calls `Global.call("openTerrain")`
  which LCT never defined; global `onScriptingButtonDown` calls the dice mat's
  `changeSustainedHitsThreshold`, which no mat script defines; the inactive `redirect` XML
  panel's `closeRedir` handler is undefined. All three are upstream defects left untouched.

## Validation

- `luac -p` (Lua 5.5.1) and `luaparser` on all 48 scripts: 45 pass; `738804.lua`, `acae21.lua`
  and `839fcc.lua` fail on `!=`, which MoonSharp (TTS's Lua) accepts as `~=` and which is
  present at the same places in the unmodified LCT scripts. With `!=` rewritten to `~=` in a
  throwaway copy all 48 parse. luac 5.5 accepting a file is a sanity check only; TTS runs
  MoonSharp (~Lua 5.2).
- `pnpm mod:build` packs deterministically (two builds byte-identical); `scripts/tts_unpack.py
  --verify` on the build is JSON-equal, and unpacking the build reproduces `mod/` exactly
  (`diff -r`, excluding `build/` and the Markdown).
- Round trip of the untouched LCT save (`tts_unpack.py --verify`): JSON-equal.
- Cross-references: no `Global.getVar/getTable/call` target used by a kept object script is
  missing from global.lua except the pre-existing `openTerrain`; every XML handler resolves
  (except the pre-existing `closeRedir`); no HUD id written from Lua is missing from the
  XML; no name whose definition was removed is referenced from kept code (the audit's
  remaining hits are unrelated locals of the same name).
- Not validated: anything in TTS. `mod/TESTING.md` is the in-TTS sign-off.

## Second cut - TC-014 / TC-017 (Trench Crusade content port)

Done by a one-off script against the signed-off `mod/` (commit "Record the TTS sign-off of
the stripped table and the importer landing"), every text edit asserting its anchor matched
exactly once. What came in is in `mod/ANATOMY.md` (*Added: Trench Crusade content*); this
records what went out.

| | stripped (TC-013) | after TC-014/017 |
|---|---|---|
| packed save | 2,975,325 bytes | 1,221,247 bytes |
| top-level objects | 109 | 127 |
| objects incl. nested | 1,101 | 219 |
| scripted objects | 48 | 54 |
| global.lua | 33,536 bytes / 919 lines | unchanged size (one constant edited) |
| Start Menu `738804` | 117,164 bytes / 2,966 lines | 116,792 bytes / 2,962 lines |
| XmlUI | 34,706 bytes / 335 lines | 33,308 bytes / 323 lines |

### Objects removed (10 top-level, 924 nested)

The ten token bags ANATOMY classed UNSURE on content only, now REPLACED:

- Infinite bags `Battle Shocked` x2 (`3f45f1`, `e51f0c`) and `Objective Secured` x2
  (`04d13e`, `e87880`) - 40k rule names; their four slots now hold the Blood and Blessing
  Marker bags.
- Memory bags `Legacy Tokens (Blue/Red) by Trashpanda` (`10a26a`, `7aca71`; 27 + 29 40k
  modifier tokens), `Mission & Utility Tokens Red` x2 (`3f26fa`, `58d30b`; 29 40k mission
  tokens each) and `Tokens by Mothmy Titania (Blue/Red)` (`9d6b2f`, `446a11`; 89 tokens
  each, 289 nested objects each). Inspected before removal: every token is a 40k stat,
  mission or CP/OC/LD marker apart from a few blank "General Token" tiles in the Mothmy
  bags, which did not justify keeping a 289-object bag; the memory-bag engine itself
  (place / recall) had nothing Trench Crusade to place. Their scripts and saved
  `memoryList` state (`mod/scripts/*.lua`, `mod/state/*.json` for the six GUIDs) went
  with them, which also removes the `7abc5a` dangling literal the first cut had justified.

### Edited

- Start Menu `738804`: `phases` is now `Initiative Phase / Activation Phase / Morale
  Phase`; `_phaseIds` / `_phaseToId` shrink to three; the ten `hudPhase{Cmd,Mov,Sht,Chr,Fgt}
  {Blue,Red}` handlers become six `hudPhase{Ini,Act,Mor}{Blue,Red}`. Nothing else in the
  turn/phase machinery changed, so `nextPhase` now wraps after Morale and `passTurn` is
  unchanged.
- XmlUI: in both rows of the Red, Blue and Grey HUD panels the `Ph4`/`Ph5` buttons are
  removed and `Ph1`-`Ph3` get the new glyphs and tooltips (handlers on Red/Blue; the Grey
  buttons stay `onClick=""` as in LCT); `*Hud_VPScores` width 1280 -> 1200 and
  `*Hud_MainPanel` preferred/min width 1224 -> 1144 on all three (two 38-wide buttons and
  two 2-wide gaps). `global.lua` `HUD_FULL` follows (1280/1224 -> 1200/1144); `HUD_MIN` is
  untouched.
- Save level: a third notebook tab "Trench Crusade content"; the "Gaming instructions" tab
  gains a line pointing at it. `ComponentTags` still lists the card labels, as before.

### Validation

- `pnpm mod:build` / `pnpm mod:verify`: packs, and the round trip of the build is JSON-equal;
  unpacking the build reproduces `mod/` exactly (`diff -r` on scripts/, ui/, state/ and
  save.json), and `mod/manifest.json` is that unpack's manifest.
- `pnpm mod:test`: `importer_test` 88 checks, `tracker_test` 146 checks, `luac -p` 54 ok /
  3 allowed (`!=`, the three LCT files) / 0 failed. The tracker test was proven
  load-bearing by breaking the script three ways (Success Roll threshold, tie result,
  missing phase reset) and watching it go red each time before restoring it byte-identical.
- Dangling references: every 6-hex-digit string literal in `mod/scripts/*.lua` and
  `mod/ui/*.xml` resolves to an object in `save.json` except `948ce5` (`table_GUID`,
  justified above). Every new GUID is absent from the Scripted Table, Gannel's and LCT
  saves as well as from this one. Every XML `onClick` target in the edited rows exists in
  the Start Menu script.
- Not validated: anything in TTS. `mod/TESTING.md` step 9 is the in-TTS sign-off for this
  cut.

## Second strip - TC-023s (40k setup flow and table toggles)

Jonathan, looking at the live table: "There are still a lot of 40k artifacts, like the game
modes and the deployment zone selects." Done by `strip_023s.py` (kept outside the repo, like
the first two) against commit `637fd5a`, every text edit asserting its anchor count; the
save was checked to round-trip byte-identically through `tts_save` before it was edited.

| | before (TC-017) | after TC-023s |
|---|---|---|
| packed save | 1,231,409 bytes | 1,008,549 bytes |
| top-level objects | 127 | 104 |
| objects incl. nested | 219 | 154 |
| scripted objects | 54 | 47 |
| global.lua | 33,536 bytes / 919 lines | 33,212 bytes / 908 lines |
| Start Menu `738804` | 116,792 bytes / 2,962 lines | 23,312 bytes / 592 lines |
| Table Theme `369707` | 182 lines | 139 lines |
| XmlUI | 33,308 bytes / 323 lines | unchanged |

### Inventory: what is on or around the table, read from the code

| Object / feature | GUID | Where it shows | Verdict | Reason |
|---|---|---|---|---|
| "GAME MODES" header + 1v1 / Solo / Combat Patrol / Onslaught / Colosseum / Boarding Action | `738804` buttons | Start Menu, world x≈31-38 by the mat's +x edge | removed | each picks a 40k battlefield size and deployment-preset family, rescales the mat, then shows the picker |
| Battlefield sizes (`sizeData`), Onslaught menu relocation | `738804` | mat scale | removed | 40k sizes. The mat keeps its saved 60" x 44" (`4ee1f2` scale 1.667 / 1.222); nothing rescales it now |
| Deployment-zone picker (`<-` "No Deployment Zone" `->`) and the five preset tables (Strike Force, Combat Patrol x2, Colosseum, Edition 11), overlay drawing (`drawLine` ... `spawnLine`) | `738804` | Start Menu row at world x≈45 | removed | every preset is a 40k deployment map; TC-022/023 brings Trench Crusade deployment from the Battle code |
| START GAME / greyed START GAME / "Red player first" toggle | `738804` | Start Menu, world x≈49 | removed | refused to start without a 40k deployment zone, then turned on the 40k objectives; the first-player toggle is 40k first turn (TC decides it per Turn by roll-off on the Turn Tracker) |
| Clear Table | `738804` | left of the picker | removed | see below: it destroys our importer, Turn Tracker, generated terrain and models |
| 9" from DZ lines, territory divider | `738804` | overlays | removed | 40k |
| Objectives manager (`placeObjectives` on `obj_*`-tagged 40k map terrain) + templates | `738804`, `e6b8fb` `3c9b57` `7fd7df` | templates under the table at x≈80, z≈-90 | removed | 40k objective markers; our generator does not tag `obj_*` and TC has its own Objective bags |
| Interactive Buttons: Deployment Zone, Table Quarters, Territory Line, Strat Reserves, Area Denial, Show Objectives | `8aba11` `59decf` `7e7711` `7b7ab8` `8c71ab` `15d652` | six tokens in a column at x=45.3 | removed | all six draw 40k geometry or call the removed Start Menu code |
| Full circle / Quarter-circle templates | `51ee2f` `51ee3f` | under the table at x=80 | removed | only the Start Menu overlays and Area Denial cloned `51ee2f`; `51ee3f` had no reader |
| 40k token bags: Action, Objective, Home Objective, Hidden, Marked Terrain, Marked Unit (x2 each) | `e6d3ec` `db0a07` `d1100e` `4d85d9` `312600` `f26331` `972ea3` `9abea4` `b3dab3` `70566d` `2914e3` `513c30` | beside each dice mat, x≈±31.6-33.5 | removed | 40k mission / secondary tokens; nothing references them |
| Next Phase / Pass Turn button, HUD ROUND badge, per-player Turn readouts, phase strip | `738804`, XmlUI | Start Menu at world x≈48.5; HUD top right | kept | the LCT turn engine TC-014 relabelled; drives the HUD and the chess-clock follow. Now runs from load (no START GAME) |
| Game Rounds, Red Turns, Blue Turns counters | `ee92cf` `055302` `7e4111` | row at x=51 by the Start Menu | kept | feed the HUD ROUND / Turn readouts and are incremented by pass-turn; removing them is removing the turn engine (open question below) |
| Stopwatch / chess clock (the two player timers) | `f4ee71` | x≈89 and the HUD clock rows | kept | generic |
| Turn Tracker, Warband Importer, TC dice rollers, Points / Turn / Glory counters, TC token bags, rules shelf | `4ac9e3` `b91983` ... | as before | kept | ours |
| Dice mats, dice rollers, d6 / d3 bags, loose d6s, trash bins and counters, LOS markers, selection highlighters, banners | `acae21` `839fcc` `17ca2b` `927ca1` ... | either side of the mat | kept | generic. Inside the mats the Lethal Hits / Sustained Hits / Sustained & Lethal buttons are 40k (see below) |
| +1 / -1 to Rolls, Reroll 1s, Reroll All bags | `988659` `450445` `c54686` `d1c6dd` `adae2a` `389ff7` `404fe0` `af7071` | beside the dice mats | kept, UNSURE | modifier reminders are not obviously 40k-only (their child icon is a 40k Battle-shocked token); a rules call for Jonathan |
| Lethal Hit Zone tiles | `7ac8ba` `71ab21` | strips at z=±23.6 | kept, UNSURE | 40k, but wired into the dice mat's import / roll / clear code; removing them is dice-mat surgery |
| Table Theme panel | `369707` | x=-38.5, z=8, left of the mat | kept | the only table-theme UI; now always shown |
| Advanced Features panel (Disable Terrain Colliders) | `ed17d0` | x=83, z=20 | kept | generic, but its tag list (`CO`, `EF`, `Tower` ...) is LCT map tags: it does nothing to `tc-terrain` pieces |
| Spawn game tools, Squad activation / Wounds trackers, Army Placer, Flex Table Control, Mat url, Extract terrain | `a76485` `229946`... `8b7aa6` `bd69bd` `c5e288` `70b9f6` | under / beside the table | kept | generic engine (Extract terrain shows no buttons until its own are pressed) |
| Injection Detector | `5c328f` | under the table | kept (security) | TTS virus scanner; caught "tcejbo gninwapS" live on 2026-11-05 |
| Go pieces | `138b05` `6f0823` | under the table at x=68 | kept, UNSURE | unscripted, unreferenced, not visible |

### Clear Table, read from the code

`clearMat` set the surface diffuse to the default, hid the setup controls, then spawned a
ScriptingTrigger centred at (0, 26, 0) scaled 60.12 x 73 x 44.04 and, two frames later,
`destruct()`ed every object it overlapped except `28865a`, `4ee1f2`, the Start Menu itself
and anything with GM Notes exactly `MapExclude`. Locking does not protect an object from
`destruct()`. The box spans x ±30.06, z ±22.02, y -10.5 to 62.5, so it would have
destroyed every `tc-terrain` piece (the generator centres a 36" board on the mat), every
imported model, the Warband Importer `b91983` (x=-22, z=0) and the Turn Tracker `4ac9e3`
(x=-22, z=15), and very probably the table-side asset `9f95fd` at (-29.9, -9.5, 0)
(inference: it depends on that asset's bounds, not measured). It was a 40k map-card wipe,
not safe here, so it went with the setup flow. A tag-scoped "Clear battlefield"
(`getObjectsWithTag("tc-terrain")`) is the replacement to propose for TC-022.

### Start Menu `738804`

Removed: battlefield sizes and the six mode buttons with their header, the Onslaught
relocation, the deployment-zone manager (preset tables, picker, every overlay drawing
primitive, overlay tracking and re-adoption), Clear Table, the objectives manager, START
GAME / first-player toggle / `startGame` / `startCustomTurns`, the territory divider and
9" lines, `recallAll`, the setup-overlay hooks for `369707`, `initGlobalRefs` / `mat` /
`refreshMat`, and the `inGame`, `singlesMode`, `simulation`, `gameMode`, `sizeConfirmed`,
`deploy*`, `missionSetupControlsVisible` state and their save fields.

Edited: the table is in play from load. `onLoad` restores only turn, phase, theme and the
pass-through state (an LCT-era state with the removed fields is ignored), pushes the HUD
unconditionally and draws the one remaining on-table button. `writeMenus` draws only the
Next Phase / Pass Turn button. Turn control behaves as every LCT mode did (all six set
`singlesMode = "singles"`): any player may pass, a HUD phase glyph only works on the active
side's row. That removed the `!=` line, so `738804.lua` now passes `luac` and left the lint
allow-list. `passTurn` now calls Global `recordPlayers` when both Red and Blue are seated:
auto-seat on reconnect used to be armed by START GAME and would otherwise never arm.

### Other scripts and save

- `369707` Table Theme: builds its panel on every load; the hide / show hooks and
  `menuHidden` state are gone.
- `70b9f6` Extract terrain: no longer calls the removed `recallAll` before extracting or
  deleting terrain.
- `4ee1f2` mat surface: no longer calls the removed `refreshMat`.
- `global.lua`: `centerCircle_GUID`, `quarterCircle_GUID` and the seven
  `interactiveButton*` state globals removed. XmlUI unchanged: every `738804/...` handler
  it names still exists.
- `save.json`: 23 top-level objects removed (42 nested with them); the "Gaming
  instructions" tab says the table has no setup flow and lists what went. Scripts and state
  files of the removed objects trashed (`8aba11`, `59decf`, `7e7711`, `7b7ab8`, `8c71ab`,
  `15d652`, `51ee2f`, state `15d652`). `mod/manifest.json` regenerated from the build.
- `scripts/tts_lint.py`: also scans every Lua file and every LuaScript of a save `.json`
  (Global and all objects, nested ones included) for the "tcejbo gninwapS" virus markers
  and for a WebRequest that can reach a host other than `tc.rynfin.org`; `pnpm mod:test`
  now passes `mod/save.json` too.

### Kept on purpose, open

- **The LCT turn engine** (Next Phase button, HUD ROUND / Turn / phase strip, Game Rounds,
  Red / Blue Turns) is 40k-shaped: it alternates player turns with a phase sequence each,
  while a Trench Crusade Turn is shared by both sides. It runs beside the Turn Tracker and
  they will disagree (HUD "Red Turn 1, Initiative" vs Tracker "Turn 1 - Initiative" moving
  independently). Keeping both or stripping the LCT engine (with an HUD rework) is
  Jonathan's call.
- **Dice-mat 40k buttons** (Lethal Hits, Sustained Hits, Sustained & Lethal) and the Lethal
  Hit Zone tiles: the zones are read by the mat's opposite-dice import, dice scan, re-roll
  and clear paths, and `modifyMenu` recolours buttons by fixed index (35-37 are the lethal
  buttons). Removal is a scoped follow-up with a live check of the mat.
- **Disable Terrain Colliders** ignores `tc-terrain`; adding the tag to
  `TERRAIN_PASS_THROUGH_TAGS` is a one-line proposal for TC-022.

### Dangling references

- Every function and variable removed from `738804`, `369707` and the seven removed
  object scripts (215 names) was searched across `mod/scripts`, `mod/ui`, `mod/test` and
  `save.json`: no remaining code calls one. The only quoted hits are `mat_GUID` (Global's
  own variable, still defined) and other objects' own `none` functions.
- Every `.call("...")` target in the remaining scripts resolves to a function in some
  script except the two pre-existing ones (`openTerrain`, `changeSustainedHitsThreshold`).
- `luac -l` on the four edited object scripts: no global is read that is never assigned
  (the check was proven by turning `writeIngameMenu` local and seeing it reported).
- None of the 23 removed GUIDs appears anywhere in the mod; every 6-hex literal resolves
  except `948ce5` (`table_GUID`, justified in the first strip).

### Validation

- `scripts/tts_lint.py mod/scripts mod/test mod/save.json`: luac 48 ok / 2 allowed / 0
  failed, malware scan 205 scripts / 0 findings, exit 0; on the packed build: 155 scripts,
  0 findings, exit 0. The scan went red (exit 1) on each of five planted infections: the
  virus marker after 400 spaces, `--[[Object base code]]`, a literal
  `WebRequest.get("https://obje.glitch.me/")`, a computed WebRequest in a script quoting a
  foreign host, and the marker appended to one object's LuaScript in a packed save.
- `luac -p` (5.5.1) on each edited script: exit 0. `importer_test` 311 checks and
  `tracker_test` 233 checks, exit 0.
- Pack: 1,008,549 bytes, parses as JSON, two packs byte-identical; unpacking it with
  `--verify` is JSON-equal and reproduces `mod/scripts`, `ui`, `state` and `save.json`
  exactly. Semantically the new `save.json` is the old one minus the 23 objects (the 104
  kept objects identical and in order) plus the one notebook-tab edit.
- An offline harness drove the stripped Start Menu and Table Theme under plain Lua with a
  stubbed TTS API (35 checks): a fresh load draws only the phase button, no GAME / START /
  Deploy / Clear button; the HUD is pushed at load; HUD phase jumps, Next Phase, pass turn,
  right-click skip and the counter increments work without a START GAME; players are
  recorded only with both seats filled; onSave / onLoad keep turn, phase and theme and
  tolerate an LCT-era state; the theme panel builds with the selected swatch lit. A mutant
  without the seat guard failed it. The harness is a stub, not TTS.
- Not validated: anything in TTS (`mod/TESTING.md` step 10 is the sign-off for this strip).

## Third strip - TC-023t (turn engine, 40k dice features, remaining 40k tokens)

Jonathan's answers to the TC-023s open questions: strip the LCT turn engine, remove the dice
mats' 40k features and the +1/-1 / Reroll bags, and "really anything that is mostly only
useful for 40k we should remove ... The dice tray should be maybe half the size and an
alternative to using the TC native dice roller." Done by `strip_023t.py` (outside the repo)
against `2b4144b`, every text edit asserting its anchor count.

| | before (TC-023s) | after TC-023t |
|---|---|---|
| packed save | 1,008,549 bytes | 735,980 bytes |
| top-level objects | 104 | 82 |
| objects incl. nested | 154 | 116 |
| scripted objects | 47 | 37 |
| global.lua | 33,212 bytes / 908 lines | 29,438 bytes / 834 lines |
| Start Menu `738804` | 23,312 bytes / 592 lines | 14,550 bytes / 361 lines |
| dice tray `acae21` / `839fcc` (each) | 138,251 bytes / 3,481 lines | 62,948 bytes / 1,703 lines |
| Stopwatch `f4ee71` | 42,585 bytes | 41,723 bytes |
| XmlUI | 33,308 bytes / 323 lines | 25,315 bytes / 252 lines |

### Inventory and verdicts

| Object / feature | GUID | Verdict | Reason |
|---|---|---|---|
| Start Menu game manager: Next Phase / Pass Turn button, `passTurn` / `nextPhase` / `jumpToPhase`, HUD handlers `hudPassTurn` / `hudTurnWatch*` / `hudPhase*`, `updateGameStateHUD`, `resetActivationTokens`, auto-seat hook | `738804` | removed | LCT player-turn engine; the Turn Tracker `4ac9e3` is the turn engine |
| Game Rounds, Red Turns, Blue Turns | `ee92cf` `055302` `7e4111` | removed | only fed the removed engine and HUD |
| HUD ROUND badge, per-player Turn readouts, phase strips, minimalist `-` button and mode | XmlUI, `global.lua` | removed | showed / drove the removed engine; minimalist mode only hid the phase strips and clock (the clock toggle still hides the clock) |
| Chess clock follow-the-turn (`SyncClockToTurn`) | `f4ee71` | removed | only caller was `passTurn`; the clock now stands alone |
| Dice mat: Lethal Hits, Sustained Hits, Sustained & Lethal, lethal tracking and 3D-text counter | `acae21` `839fcc` | removed | 40k weapon abilities |
| Lethal Hit Zone tiles | `7ac8ba` `71ab21` | removed | parking zones of that feature |
| Dice mat: Del / Roll by face rows with the lower / upper toggle | `acae21` `839fcc` | removed | 40k hit / wound / save sequencing (keep the 3+s, re-roll the 1s ...) |
| Dice mat: Ordered roll, In 2s / In 3s, Copy opponent's dice, +5 / +10 / +25 d6, Dice+ extra colours, the empty "NO FAST REPETITIONS" label | `acae21` `839fcc` | removed | mass-dice and 40k attacker / defender affordances; Trench Crusade rolls 2-10 dice |
| Dice mat: Coherency, Engagement (2"), 1" / 2" Gap arrange, their hotkeys and object-event monitors | `acae21` `839fcc` | removed | 40k unit coherency and engagement; Trench Crusade models act alone |
| Dice mat: "Cumulative" (3+ / 4+ ... running counts) display mode | `acae21` `839fcc` | removed | 40k threshold counting |
| Dice mat stats-helper hooks (`spawnStatsDice`, `getStatsHelperDiceConfig`) | `acae21` `839fcc` | removed | callers (WH Stats Helper) left in the first strip |
| Global `onScriptingButtonDown` (scripting keys 1/2 -> `changeSustainedHitsThreshold`) | Global | removed | 40k and calling a function that never existed |
| +1 / -1 to Rolls, Reroll 1s, Reroll All bags | `988659` `450445` `c54686` `d1c6dd` `adae2a` `389ff7` `404fe0` `af7071` | removed | 40k modifiers; TC modifies with +/-DICE |
| Spawn game tools + Squad activation / Wounds Remaining tracker masters | `a76485`, `229946` `37e995` `bcf2a4`, `ad63ba` `5fd19f` `2e4f26` | removed | 40k squad and multi-wound tracking; TC has Activated / Down / Blood tokens |
| Hide-army fog zones | `28419e` `e1e91a` | removed | used only by `a76485`'s HIDE / SHOW ARMY; warbands are open information |
| Dice tray itself: 1-4 d6 and d3 spawns, roll all, clear, revert, last 5 rolls, colours, pips, custom dice, show / hide HUD | `acae21` `839fcc` | kept, resized | TC-sized alternative to the TC roller (below) |
| Measuring bubbles (1/2/3/6/8/9/12/15" and custom), clear bubbles / lines, highlight paint, save / restore position, their hotkeys | `acae21` `839fcc` | kept | generic table tools that happen to live on the tray |
| LCT dice roller bowls | `17ca2b` `927ca1` | kept | the tray rolls through them; their ordered / grouped display code is now unreachable (no button sets it) and left as is |
| Stopwatch (both player timers) | `f4ee71` | kept | stands alone |
| Banners (Red / Blue) | `0dd964` `0dd965` | kept, UNSURE | a team-coloured banner model, not a 40k rule token; Jonathan's call |
| Army Placer | `8b7aa6` | kept, UNSURE | moves a staged army from off-table onto the mat; generic, superseded in practice by the importer |
| LOS markers, selection highlighters, trash bins and counters, d6 / d3 bags, loose d6s, table assets, theme panel, Advanced Features, Flex Table, Mat url, Extract terrain | | kept | generic |
| Injection Detector | `5c328f` | kept (security) | |
| Go pieces | `138b05` `6f0823` | kept, UNSURE | unscripted, unreferenced, under the table edge; purpose unknown, may be physical stops |

### The dice tray

Measured live (read-only `tts_exec` probe, 2026-11-05): `acae21` at (0, 0.87, 29), scale
3.75, bounds centre (2.88, 0.93, 27.97), size **57.11 x 11.15**; `839fcc` mirrored at z=-29.
Both trays are now scale **1.875**, so the footprint scales about the same pivot to **28.56 x
5.58** (a quarter of the area): Red spans x -12.8..15.7, z 25.7..31.3, directly in front of the
Red TC roller `25b3ac` (12, 39) and the Points / Turn / Glory counters (z=38); Blue mirrored.
The two loose d6 (`ae1f5b`, `c1aaa4`) moved with it to (±9.69, ±30.42). The after-footprint
is computed from the measured one, not measured.

- Every button is in tray-local coordinates and TTS scales world buttons with the object, so
  the remaining buttons keep their layout and shrink to half size, with gaps where removed
  buttons were. Whether the half-size labels read from the seats is the first thing to check
  live; relaying the buttons out is a follow-up.
- The dice-area margins in `getDice` / `checkDice` were world units measured on the 3.75 mat;
  they now scale with the tray (`trayMarginScale`).
- Max dice **10** (`MAX_TRAY_DICE`): a Success or Injury Roll is 2 dice plus one per +/-DICE
  or +/-INJURY DICE, keeping the two highest or two lowest (rulebook p15, p18); a model holds at
  most 6 BLOOD MARKERS, each spendable for -1 DICE / +1 INJURY DICE (p19); a Bloodbath Roll is
  3 dice (p19); D3 is a halved D6 (p23). 2 + 6 + 2 other modifiers = 10 covers every roll in
  the book. The 128-dice LCT cap is gone.
- The readout keeps face counts and the total and adds `High 2: a  Low 2: b` whenever two or
  more dice are on the tray: the Success / Injury Roll result for +DICE and -DICE alike. No
  hit / wound / save step remains anywhere in the tray.
- `modifyMenu` recoloured buttons by fixed index (7-12, 33-37: the spawn buttons, and by
  accident the lethal buttons' borders). It now recolours by click function: exactly the five
  spawn buttons.
- Hotkeys: Coherency, Engagement Range and the 1" / 2" Gap hotkeys removed; "6. Roll All
  Dice" became "4. Roll All Dice" (a player who bound the old label rebinds it).

### What the HUD shows now

Red and Blue panels: the `?` help and `◴` clock-toggle column, then two clock rows (blue row
on top, red below) each with play / pause, the readout and +/-, and the `X` hide button.
Grey: the same without the help/clock buttons' per-player effect. Width 1200 -> 416, main
1144 -> 360, height unchanged (155) - computed from the element widths, to tune live. The
row colours are now the static XML ones (the active-turn highlight came from the removed
engine).

### Other edits

- Start Menu `738804`: only table theme and terrain pass-through remain. It no longer clears
  the Notes panel on every load (that was the game manager's `Notes.setNotes("")`).
- Auto-seat: `recordPlayers` lost its trigger again (TC-023s had moved it from START GAME to
  `passTurn`). Reconnecting players get the seat picker; re-arming auto-seat from the Turn
  Tracker is a proposal, not done.
- `global.lua`: minimalist HUD, the turn-counter / activation / wounds / hidden-zone / lethal
  GUID constants and `onScriptingButtonDown` removed.
- `save.json`: 22 top-level objects removed, the two trays rescaled, the two loose d6 moved,
  the "Gaming instructions" and "Trench Crusade content" tabs updated. Scripts and state of the
  removed objects trashed; `mod/manifest.json` regenerated from the build.
- The highlight painter's `SELECTION_HIGHLIGHTER_GUID` lived in the removed coherency section;
  the undefined-global check caught it and it is now declared above the painter.

### Validation

- `tts_lint.py mod/scripts mod/test mod/save.json`: luac 38 ok / 2 allowed / 0 failed,
  malware scan 157 scripts / 0 findings, exit 0; packed build 117 scripts / 0 findings, exit 0.
  `luac -p` on each edited script exits 0 (the trays with `!=` rewritten in a throwaway copy).
- `importer_test` 311 and `tracker_test` 233 checks, exit 0.
- Pack 735,980 bytes, deterministic; `--verify` round trip JSON-equal and reproduces
  `scripts/`, `ui/`, `state/`, `save.json`. The new save is the old one minus the 22 objects,
  with only the two tray scales, two loose-die positions and two notebook tabs changed.
- Dangling references: every name removed from the edited scripts searched across scripts,
  UI and tests (the hits are unrelated locals of the same name in other scripts); no Lua
  writes a removed HUD id; every global.xml handler resolves except the upstream `closeRedir`,
  and no XML handler routes to `738804` any more; every `.call` target resolves except the
  upstream `openTerrain` (`changeSustainedHitsThreshold` is gone with its caller); none of the
  22 GUIDs appears anywhere; every 6-hex literal resolves except `948ce5`. An undefined-global
  check over the luac listing (definitions read from source, since the trays' main chunk has
  more than 255 constants) reports only `savePositionTip`, nil upstream as well.
- Offline harness `harness_023t.lua` (stubbed TTS, 67 checks, exit 0): no 40k button or hotkey
  on the tray, every kept tool still has its button, the colour swatch recolours exactly the
  five spawn buttons, spawning stops at 10 and every die lands inside the half-size tray's dice
  area, the readout shows counts, total and `High 2: 12  Low 2: 2`, the Start Menu draws no
  buttons and saves three fields, the turn functions are gone, the Global HUD preferences touch
  no removed id. It went red on the pre-strip scripts and on a mutant with the 128 cap restored.
- Not validated: anything in TTS (`mod/TESTING.md` step 11).
