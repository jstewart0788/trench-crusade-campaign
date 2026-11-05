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
