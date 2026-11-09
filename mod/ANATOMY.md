# LCT anatomy and strip classification

Source: Steam Workshop mod 3710681747 "LCT" v1.12.1 (`LCT  - v1.12.1`), 48,104,565 bytes,
218 top-level objects, 1,774 objects in all (1,176 contained, 61 alternate states, 319
attached children), 425 of them scripted. ~39 MB of the file is per-card Lua on the 390
map cards inside the fifteen mission-matrix bags (each card embeds a full terrain layout as
JSON for `spawnObjectJSON` - the Battlemaster / T5S2 / LCT Ice Colony / LCT Mars Base
caches). That spawn-from-embedded-JSON pattern is the one the campaign platform will drive
over `WebRequest` later; the data itself is 40k and goes.

Classification used here:

- **KEEP** - generic table engine (tokens, counters, auras/bubbles, dice, save positions,
  HUD, seating, themes, measurement, text, terrain tools). Behaviour preserved as-is.
- **STRIP** - exists only for Warhammer 40k play (missions, secondaries, CP, 40k scoring,
  map caches, 40k reference material and community links). Removed in `mod/`.
- **UNSURE** - kept, because it is either an engine piece with 40k-flavoured data, or a
  controller that carries both. Each one is listed with what would resolve it.
- **REPLACED** - was UNSURE on content only; removed by TC-017 and its slot now holds a
  Trench Crusade object (the ten 40k token bags).
- **STRIP-2** - kept by the first strip, removed by the second (TC-023s): the 40k table toggles
  and objectives manager, their templates, and the 40k mission / secondary token bags.
- **STRIP-3** - removed by the third strip (TC-023t): the LCT turn engine counters, the dice
  mat's Lethal Hit Zones, the 40k modifier / re-roll bags, squad activation and wound trackers
  and their spawner, the hide-army fog zones.
- **ADDED** - objects this repo adds on top of the fork: the Warband Importer (TC-016) and
  the Trench Crusade content port (TC-014 / TC-017, see *Added: Trench Crusade content*).

Counts over the 218 top-level objects: **KEEP 48, UNSURE 5, REPLACED 10, STRIP 110,
STRIP-2 23, STRIP-3 22**. Every nested object follows its top-level parent. The table now has
82 top-level / 116 total objects (53 kept from LCT, 29 added) and packs to about 0.74 MB; the
ten replaced bags carried 924 nested 40k tokens, which is where the other 1.7 MB went.

## Top-level objects

Script bytes include the Lua of nested objects (which is why the matrix bags dominate).

| Class | Nickname | GUID | Kind | Script bytes (incl. nested) | Nested | Reasoning |
|---|---|---|---|---:|---:|---|
| KEEP | (no nickname) | `12c65e` | Custom_Assetbundle | 0 | 0 | table leg / side asset bundle positioned by Flex Table Control |
| KEEP | (no nickname) | `28865a` | Custom_Tile | 0 | 0 | map mat (mapMat_GUID) whose image is the selected table theme |
| KEEP | (no nickname) | `309cea` | HandTrigger | 0 | 0 | hand zone (seating) |
| KEEP | (no nickname) | `35b95f` | Custom_Assetbundle | 0 | 0 | table leg / side asset bundle positioned by Flex Table Control |
| KEEP | (no nickname) | `393bf7` | Custom_Assetbundle | 0 | 0 | table leg / side asset bundle positioned by Flex Table Control |
| KEEP | (no nickname) | `5af8f2` | Custom_Assetbundle | 0 | 0 | table leg / side asset bundle positioned by Flex Table Control |
| KEEP | (no nickname) | `731345` | HandTrigger | 0 | 0 | hand zone (seating) |
| KEEP | (no nickname) | `9f95fd` | Custom_Assetbundle | 0 | 0 | table leg / side asset bundle positioned by Flex Table Control |
| KEEP | (no nickname) | `a47132` | HandTrigger | 0 | 0 | hand zone (seating) |
| KEEP | (no nickname) | `ae1f5b` | Die_6_Rounded | 0 | 0 | loose d6 on the dice mat |
| KEEP | (no nickname) | `afc863` | Custom_Assetbundle | 0 | 0 | table leg / side asset bundle positioned by Flex Table Control |
| KEEP | (no nickname) | `c1aaa4` | Die_6_Rounded | 0 | 0 | loose d6 on the dice mat |
| KEEP | (no nickname) | `c8edca` | Custom_Assetbundle | 0 | 0 | table leg / side asset bundle positioned by Flex Table Control |
| KEEP | (no nickname) | `f7cd38` | HandTrigger | 0 | 0 | hand zone (seating) |
| KEEP | (no nickname) | `f7d85a` | HandTrigger | 0 | 0 | hand zone (seating) |
| KEEP | (no nickname) | `f938a2` | Custom_Assetbundle | 0 | 0 | table leg / side asset bundle positioned by Flex Table Control |
| KEEP | (no nickname) | `f9d618` | HandTrigger | 0 | 0 | hand zone (seating) |
| STRIP-3 | +1 to Rolls | `450445` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023t: 40k modifier / re-roll reminder bag (its icon is a 40k Battle-shocked token); Trench Crusade modifies rolls with +/-DICE |
| STRIP-3 | +1 to Rolls | `988659` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023t: 40k modifier / re-roll reminder bag (its icon is a 40k Battle-shocked token); Trench Crusade modifies rolls with +/-DICE |
| STRIP-3 | -1 to Rolls | `c54686` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023t: 40k modifier / re-roll reminder bag (its icon is a 40k Battle-shocked token); Trench Crusade modifies rolls with +/-DICE |
| STRIP-3 | -1 to Rolls | `d1c6dd` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023t: 40k modifier / re-roll reminder bag (its icon is a 40k Battle-shocked token); Trench Crusade modifies rolls with +/-DICE |
| STRIP-2 | Action | `db0a07` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| STRIP-2 | Action | `e6d3ec` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| KEEP | Advanced Features Panel | `ed17d0` | BlockSquare | 3,009 | 0 | terrain collider toggle panel (forwards to the Start Menu) |
| KEEP | Banner (Blue) | `0dd965` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Banner (Red) | `0dd964` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Blue Custom Dice Table | `839fcc` | Custom_Tile | 138,402 | 0 | dice tray. TC-023t: 40k roll features stripped (Lethal / Sustained Hits, select / delete by face, ordered and grouped rolls, copy opponent's dice, 5/10/25-dice buttons, extra colours, coherency, engagement range, 1"/2" gap arrange), at most 10 dice, two-highest / two-lowest readout. TC-023v: half the length only (scale (1.875, 1, 3.75), 28.6 x 11.15), widgets counter-scaled to their old world size, at the end of its player's row (see *Table layout*) |
| KEEP | Blue dice cam | `96a319` | Custom_Assetbundle | 0 | 0 | dice camera asset for the dice mats |
| KEEP | Blue dice camera | `c09349` | Custom_Assetbundle | 0 | 0 | dice camera asset for the dice mats |
| KEEP | Blue Dice Roller | `927ca1` | Custom_Model_Bag | 33,778 | 0 | dice roller with seeded RNG and result printing |
| KEEP | Blue LOS Marker | `1b3488` | Custom_Tile | 3,676 | 0 | line-of-sight marker |
| KEEP | Blue LOS Marker | `b1625c` | Custom_Tile | 3,676 | 0 | line-of-sight marker |
| KEEP | Blue Selection Highligher | `84c3a4` | Quarter | 4,513 | 0 | generic table furniture |
| KEEP | Blue Trash bin | `4b1a7b` | Custom_Assetbundle_Bag | 1,050 | 0 | vortex trash bin |
| STRIP-3 | Blue Turns | `7e4111` | Custom_Token | 5,490 | 0 | TC-023t: the LCT player-turn / round counters behind the HUD ROUND badge and Turn readouts; the Turn Tracker `4ac9e3` and its TC Turn counters are the turn engine |
| STRIP-3 | BlueHiddenZone | `e1e91a` | FogOfWarTrigger | 0 | 0 | TC-023t: hide-army fog zone used only by `a76485` |
| KEEP | Counter | `42c161` | Custom_Token | 5,146 | 0 | token counter beside each trash bin |
| KEEP | Counter | `42c164` | Custom_Token | 5,146 | 0 | token counter beside each trash bin |
| KEEP | d3 | `2d9705` | Infinite_Bag | 0 | 1 | infinite dice bag |
| KEEP | d3 | `4c054e` | Infinite_Bag | 0 | 1 | infinite dice bag |
| KEEP | d6 | `176bc4` | Infinite_Bag | 0 | 1 | infinite dice bag |
| KEEP | d6 | `714214` | Infinite_Bag | 0 | 1 | infinite dice bag |
| KEEP | Extract terrain | `70b9f6` | Custom_Model_Bag | 13,123 | 0 | terrain extraction / mirroring tool |
| KEEP | Flex Table Control | `bd69bd` | Chinese_Checkers_Piece | 20,270 | 0 | table size / surface controls |
| STRIP-2 | Full circle | `51ee2f` | Custom_Model | 47 | 0 | TC-023s: circle template cloned only by the Start Menu overlays and Area Denial; no caller left |
| STRIP-3 | Game Rounds | `ee92cf` | Custom_Token | 6,588 | 0 | TC-023t: the LCT player-turn / round counters behind the HUD ROUND badge and Turn readouts; the Turn Tracker `4ac9e3` and its TC Turn counters are the turn engine |
| STRIP-2 | Hidden | `972ea3` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| STRIP-2 | Hidden | `9abea4` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| STRIP-2 | Home Objective | `312600` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| STRIP-2 | Home Objective | `f26331` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| KEEP (security) | Injection Detector | `5c328f` | go_game_piece_white | 2,058 | 2 | TTS virus scanner polled by global.lua; state 2 is `899f22` "Malicious Scripts Detected!" (child `6fb2cf`). Caught the self-replicating "tcejbo gninwapS" virus in a live session on 2026-11-05; never strip. `scripts/tts_lint.py` scans the mod for the same virus |
| STRIP-2 | Interactive Buttons - Deployment Zone | `8aba11` | Custom_Token | 1,069 | 0 | TC-023s: toggled the 40k deployment overlay drawn by the Start Menu picker; picker and presets removed |
| STRIP-2 | Interactive Buttons - Table Quarters | `59decf` | Custom_Token | 2,726 | 0 | TC-023s: drew 40k table-quarter lines; removed |
| STRIP-2 | Interactive Buttons - Territory Line | `7e7711` | Custom_Token | 1,071 | 0 | TC-023s: drew the 40k territory divider derived from the 40k deployment preset; removed |
| STRIP-2 | Marked Terrain | `70566d` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| STRIP-2 | Marked Terrain | `b3dab3` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| STRIP-2 | Marked Unit | `2914e3` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| STRIP-2 | Marked Unit | `513c30` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| KEEP | Mat url | `c5e288` | BlockRectangle | 9,279 | 0 | table mat URL setter |
| KEEP | matObjSurface | `4ee1f2` | Custom_Model | 3,293 | 0 | table surface mat (mat_GUID) with lighting presets. TC-023v: parked under the felt `28865a` (posY -9.52 -> -9.80), kept as the importer's anchor; boards stand on the felt |
| STRIP-2 | Objective | `4d85d9` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| STRIP-2 | Objective | `d1100e` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023s: 40k mission / secondary token bag (Action, Objective, Home Objective, Hidden, Marked Terrain/Unit); the TC Objective bags `70d18f` / `2d4b7e` cover objectives |
| STRIP-2 | Quarter-circle | `51ee3f` | Custom_Model | 0 | 0 | TC-023s: quarter-circle template, read by nothing (`quarterCircle_GUID` had no reader); removed |
| KEEP | Red Custom Dice Table | `acae21` | Custom_Tile | 138,402 | 0 | dice tray. TC-023t: 40k roll features stripped (Lethal / Sustained Hits, select / delete by face, ordered and grouped rolls, copy opponent's dice, 5/10/25-dice buttons, extra colours, coherency, engagement range, 1"/2" gap arrange), at most 10 dice, two-highest / two-lowest readout. TC-023v: half the length only (scale (1.875, 1, 3.75), 28.6 x 11.15), widgets counter-scaled to their old world size, at the end of its player's row (see *Table layout*) |
| KEEP | Red dice cam | `48dcae` | Custom_Assetbundle | 0 | 0 | dice camera asset for the dice mats |
| KEEP | Red dice camera | `19b9bf` | Custom_Assetbundle | 0 | 0 | dice camera asset for the dice mats |
| KEEP | Red Dice Roller | `17ca2b` | Custom_Model_Bag | 33,778 | 0 | dice roller with seeded RNG and result printing |
| KEEP | Red LOS Marker | `546598` | Custom_Tile | 3,676 | 0 | line-of-sight marker |
| KEEP | Red LOS Marker | `ca16c5` | Custom_Tile | 3,676 | 0 | line-of-sight marker |
| KEEP | Red Selection Highlighter | `27de4f` | Quarter | 4,513 | 0 | selection highlighter |
| KEEP | Red Trash bin | `be2cdb` | Custom_Assetbundle_Bag | 1,050 | 0 | vortex trash bin |
| STRIP-3 | Red Turns | `055302` | Custom_Token | 5,490 | 0 | TC-023t: the LCT player-turn / round counters behind the HUD ROUND badge and Turn readouts; the Turn Tracker `4ac9e3` and its TC Turn counters are the turn engine |
| STRIP-3 | RedHiddenZone | `28419e` | FogOfWarTrigger | 0 | 0 | TC-023t: hide-army fog zone used only by `a76485` |
| STRIP-3 | Reroll 1s | `389ff7` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023t: 40k modifier / re-roll reminder bag (its icon is a 40k Battle-shocked token); Trench Crusade modifies rolls with +/-DICE |
| STRIP-3 | Reroll 1s | `adae2a` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023t: 40k modifier / re-roll reminder bag (its icon is a 40k Battle-shocked token); Trench Crusade modifies rolls with +/-DICE |
| STRIP-3 | Reroll All | `404fe0` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023t: 40k modifier / re-roll reminder bag (its icon is a 40k Battle-shocked token); Trench Crusade modifies rolls with +/-DICE |
| STRIP-3 | Reroll All | `af7071` | Custom_Model_Infinite_Bag | 0 | 2 | TC-023t: 40k modifier / re-roll reminder bag (its icon is a 40k Battle-shocked token); Trench Crusade modifies rolls with +/-DICE |
| STRIP-3 | Spawn game tools | `a76485` | BlockRectangle | 7,901 | 0 | TC-023t: spawned 40k squad activation / wound trackers and hid armies in fog zones; Trench Crusade tracks Activated / Down / Blood with its own tokens |
| STRIP-3 | Squad activation | `229946` | BlockSquare | 2,062 | 0 | TC-023t: 40k squad activation tracker master (cloned by `a76485`) |
| STRIP-3 | Squad activation | `37e995` | BlockSquare | 2,062 | 0 | TC-023t: 40k squad activation tracker master (cloned by `a76485`) |
| STRIP-3 | Squad activation | `bcf2a4` | BlockSquare | 2,062 | 0 | TC-023t: 40k squad activation tracker master (cloned by `a76485`) |
| KEEP | Stopwatch | `f4ee71` | Custom_Model | 42,585 | 0 | chess clock driving the HUD clock rows; stands alone (TC-023t removed `SyncClockToTurn`, its only link to the LCT turn engine) |
| STRIP-3 | Wounds Remaining | `2e4f26` | BlockSquare | 1,968 | 0 | TC-023t: 40k multi-wound tracker master (cloned by `a76485`); TC uses Blood markers |
| STRIP-3 | Wounds Remaining | `5fd19f` | BlockSquare | 1,968 | 0 | TC-023t: 40k multi-wound tracker master (cloned by `a76485`); TC uses Blood markers |
| STRIP-3 | Wounds Remaining | `ad63ba` | BlockSquare | 1,968 | 0 | TC-023t: 40k multi-wound tracker master (cloned by `a76485`); TC uses Blood markers |
| UNSURE | (no nickname) | `138b05` | go_game_piece_black | 0 | 0 | unscripted go piece hidden under the table at x=68; purpose unknown |
| UNSURE | (no nickname) | `6f0823` | go_game_piece_black | 0 | 0 | unscripted go piece hidden under the table at x=68; purpose unknown |
| UNSURE | Army Placer | `8b7aa6` | BlockSquare | 4,358 | 0 | Army Placer: moves a staged army onto the table for Red/Blue; generic but untested here |
| REPLACED | Battle Shocked | `3f45f1` | Custom_Model_Infinite_Bag | 0 | 2 | 40k 'Battle-shocked' bag; its slot now holds the Blue Blood Marker bag `061bfb` (TC-017) |
| REPLACED | Battle Shocked | `e51f0c` | Custom_Model_Infinite_Bag | 0 | 2 | 40k 'Battle-shocked' bag; its slot now holds the Red Blood Marker bag `3b0f1d` (TC-017) |
| STRIP-3 | Blue Lethal Hit Zone | `71ab21` | Custom_Tile | 0 | 0 | TC-023t: parking zone of the dice mat's 40k Lethal Hits feature, removed with it |
| STRIP-2 | Center Objective | `3c9b57` | Custom_Model | 0 | 6 | TC-023s: 40k objective-marker template, only the removed objectives manager cloned it |
| STRIP-2 | Expansion Objective | `7fd7df` | Custom_Model | 0 | 6 | TC-023s: 40k objective-marker template, only the removed objectives manager cloned it |
| STRIP-2 | Home Objective | `e6b8fb` | Custom_Model | 0 | 6 | TC-023s: 40k objective-marker template, only the removed objectives manager cloned it |
| STRIP-2 | Interactive Buttons - Area Denial | `8c71ab` | Custom_Token | 2,225 | 0 | TC-023s: drew 3"/6" circles for the 40k Area Denial secondary; removed |
| STRIP-2 | Interactive Buttons - Show Objectives | `15d652` | Custom_Token | 2,343 | 0 | TC-023s: toggled the objectives manager (40k markers on `obj_*`-tagged 40k map terrain); removed with it |
| STRIP-2 | Interactive Buttons - Strat Reserves | `7b7ab8` | Custom_Token | 3,029 | 0 | TC-023s: drew 40k strategic-reserves lines 6" from each edge; removed |
| REPLACED | Legacy Tokens (Blue) by Trashpanda | `10a26a` | Bag | 16,208 | 79 | memory bag of 40k status tokens (hit/wound/strength/toughness modifiers, Stealth, Fell Back); nothing in it applies to Trench Crusade, removed with its script and state (TC-017) |
| REPLACED | Legacy Tokens (Red) by Trashpanda | `7aca71` | Bag | 16,208 | 85 | memory bag of 40k status tokens; removed with its script and state (TC-017) |
| UNSURE | Map Creator Filter | `369707` | BlockSquare | 23,109 | 0 | was the map-creator filter + Battlemaster mat randomizer + Table Theme swatches; rewritten to keep only the theme swatches (the only UI for table themes). TC-023s: the panel is always shown (it used to appear only between choosing a game mode and START GAME) |
| REPLACED | Mission & Utility Tokens Red | `3f26fa` | Bag | 36,861 | 87 | memory bag of 40k mission tokens (Beacon, Cleanse, Sensor Sweep, Vital Link...); removed with its script and state (TC-017) |
| REPLACED | Mission & Utility Tokens Red | `58d30b` | Bag | 36,861 | 87 | memory bag of 40k mission tokens; removed with its script and state (TC-017) |
| REPLACED | Objective Secured Blue | `04d13e` | Custom_Model_Infinite_Bag | 0 | 2 | 40k 'Objective Secured' bag; its slot now holds the Blue Blessing Marker bag `c30c00` (TC-017) |
| REPLACED | Objective Secured Red | `e87880` | Custom_Model_Infinite_Bag | 0 | 2 | 40k 'Objective Secured' bag; its slot now holds the Red Blessing Marker bag `6cecd8` (TC-017) |
| STRIP-3 | Red Lethal Hit Zone | `7ac8ba` | Custom_Tile | 0 | 0 | TC-023t: parking zone of the dice mat's 40k Lethal Hits feature, removed with it |
| UNSURE | Start Menu | `738804` | BlockRectangle | 252,625 | 0 | was the LCT game controller. After TC-023t only the table-theme swatch targets and terrain pass-through remain (14.5 KB, no buttons): its turn / phase / round engine went with the HUD strip it drove. A rename / move to Global is the open question |
| REPLACED | Tokens by Mothmy Titania (Blue) | `9d6b2f` | Bag | 16,208 | 289 | memory bag of 89 Mothmy tokens (40k stat modifiers, CP/OC/LD, Battle-Shock, plus a few generic 'General Token' blanks); removed whole rather than curated - the handful of generic blanks did not justify keeping a 289-object bag (TC-017) |
| REPLACED | Tokens by Mothmy Titania (Red) | `446a11` | Bag | 16,208 | 289 | memory bag of 89 Mothmy tokens; removed whole (TC-017) |
| STRIP | (no nickname) | `066fd3` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `251e3c` | Custom_Tile | 0 | 0 | printed 40k Core Stratagems billboard |
| STRIP | (no nickname) | `2aef7f` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `3e4433` | 3DText | 0 | 0 | 3D text shelf label for 40K/Kill Team deployment storage under the table |
| STRIP | (no nickname) | `3f56e1` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `41bf2c` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `444551` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `4a1bbd` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `531758` | CardCustom | 0 | 0 | printed 2D6 charge-odds chart (40k charge rules) |
| STRIP | (no nickname) | `642d0d` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `65439e` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `66def7` | Custom_Model | 0 | 0 | secondary-card holder board driven by the score sheet |
| STRIP | (no nickname) | `6a1d02` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `6c101e` | 3DText | 0 | 0 | 3D text shelf label for 40K/Kill Team deployment storage under the table |
| STRIP | (no nickname) | `703a8c` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `76200a` | Custom_Model | 0 | 0 | secondary-card holder board driven by the score sheet |
| STRIP | (no nickname) | `769e81` | 3DText | 0 | 0 | 3D text shelf label for 40K/Kill Team deployment storage under the table |
| STRIP | (no nickname) | `80eda8` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `835251` | 3DText | 0 | 0 | 3D text shelf label for 40K/Kill Team deployment storage under the table |
| STRIP | (no nickname) | `838115` | CardCustom | 0 | 0 | printed ITC round-scoring table |
| STRIP | (no nickname) | `888613` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `97d33f` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `9a274c` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | (no nickname) | `9c6ce8` | Custom_Tile | 0 | 0 | printed 40k disposition/mission matrix billboard |
| STRIP | (no nickname) | `a90146` | 3DText | 0 | 0 | 3D text shelf label for 40K/Kill Team deployment storage under the table |
| STRIP | (no nickname) | `dbfb5c` | 3DText | 0 | 0 | 3D text shelf label for 40K/Kill Team deployment storage under the table |
| STRIP | (no nickname) | `e88089` | Custom_Tile | 0 | 0 | art tile paired with a mission-matrix bag (GAME_MODE_OBJECTS in the Start Menu) |
| STRIP | 10e Score Sheet | `06d627` | Custom_Model | 43,141 | 0 | 10e Score Sheet: PRI/SEC per-round VP with 40k caps; feeds the scoring overlay |
| STRIP | 11e Core Rules | `90cbe7` | Custom_PDF | 5,296 | 0 | 40k rules PDF (Core Rules / Tournament Companion / Warhammer Open FAQ) with a generic bookmark script |
| STRIP | 11e Layouts | `fb4b5d` | Deck | 0 | 45 | 11e deployment-layout art deck dealt beside the map cards |
| STRIP | 40K items | `5549a7` | Bag | 8,645 | 5 | '40K items' memory bag (Take Prisoners models) |
| STRIP | Blue Primary Cards | `e64441` | Deck | 0 | 38 | 40k mission / secondary / primary / deployment card deck |
| STRIP | Blue Secondary Mission Cards | `994347` | Deck | 0 | 18 | 40k mission / secondary / primary / deployment card deck |
| STRIP | Blue WH Stats Helper | `b7ac7a` | Chip_100 | 32,227 | 0 | WH Stats Helper: parses 40k weapon profiles (A/BS/S/AP/D) from model descriptions and spawns attack dice |
| STRIP | BluePrimary1 | `d1e003` | ScriptingTrigger | 0 | 0 | scripting zone for a primary / deployment / twist mission card slot |
| STRIP | BluePrimary2 | `d1e004` | ScriptingTrigger | 0 | 0 | scripting zone for a primary / deployment / twist mission card slot |
| STRIP | BlueSec1 | `b1e001` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | BlueSec2 | `b1e002` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | BlueSec3 | `b1e003` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | BlueSec4 | `b1e004` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | BlueSec5 | `b1e005` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | BlueSec6 | `b1e006` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | BlueSec7 | `b1e007` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | BlueSec8 | `b1e008` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | BlueSecName1 | `5423a5` | 3DText | 0 | 0 | 3D text label naming an active secondary card |
| STRIP | BlueSecName2 | `5423a6` | 3DText | 0 | 0 | 3D text label naming an active secondary card |
| STRIP | BlueSecName3 | `5423a7` | 3DText | 0 | 0 | 3D text label naming an active secondary card |
| STRIP | BlueSecName4 | `5423a8` | 3DText | 0 | 0 | 3D text label naming an active secondary card |
| STRIP | BlueSecName5 | `5423a9` | 3DText | 0 | 0 | 3D text label naming an active secondary card |
| STRIP | CA 2025 Fixed Secondary Cards | `b55459` | Deck | 0 | 8 | 40k mission / secondary / primary / deployment card deck |
| STRIP | Combat Patrol Maps | `fdf6e7` | Bag | 197,165 | 3 | Combat Patrol map bag (3 embedded 40k map cards) |
| STRIP | Command Points | `deb9f2` | Custom_Token | 6,454 | 0 | Command Point counter token (polls value into the HUD CP watch) |
| STRIP | Command Points | `e446f7` | Custom_Token | 6,454 | 0 | Command Point counter token (polls value into the HUD CP watch) |
| STRIP | DeploymentSlot | `d1e005` | ScriptingTrigger | 0 | 0 | scripting zone for a primary / deployment / twist mission card slot |
| STRIP | discord.gg/tts40k | `546244` | Custom_Tile | 0 | 0 | LCT community link tile (tts40k discord, Battlemaster layout editor, workshop items) |
| STRIP | Disruption vs Disruption | `4409ba` | Bag | 2,539,575 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Disruption vs Priority Assets | `f1e22b` | Bag | 2,543,951 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Disruption vs Reconnaissance | `2c7cd1` | Bag | 2,545,178 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Gain CP Blue | `5e882b` | Custom_Token | 1,458 | 0 | Gain CP token (once-per-round CP gain via global gainCPForColor) |
| STRIP | Gain CP Red | `af8032` | Custom_Token | 1,458 | 0 | Gain CP token (once-per-round CP gain via global gainCPForColor) |
| STRIP | https://battlemaster.online/layout-editor | `757317` | Custom_Tile | 0 | 0 | LCT community link tile (tts40k discord, Battlemaster layout editor, workshop items) |
| STRIP | https://discord.gg/EWCchNjqwG | `8f2be2` | Custom_Tile | 0 | 0 | LCT logo / discord link tile (referenced by the Start Menu's clear/onslaught code, now removed) |
| STRIP | https://steamcommunity.com/sharedfiles/filedetails/?id=3728735953 | `60dd5c` | Custom_Tile | 0 | 0 | LCT community link tile (tts40k discord, Battlemaster layout editor, workshop items) |
| STRIP | https://steamcommunity.com/sharedfiles/filedetails/?id=3744155300 | `e89f4b` | Custom_Tile | 0 | 0 | LCT community link tile (tts40k discord, Battlemaster layout editor, workshop items) |
| STRIP | https://steamcommunity.com/sharedfiles/filedetails/?id=3749561956 | `7dbaa0` | Custom_Tile | 0 | 0 | LCT community link tile (tts40k discord, Battlemaster layout editor, workshop items) |
| STRIP | https://steamcommunity.com/sharedfiles/filedetails/?id=3753014527 | `4fcd1f` | Custom_Tile | 0 | 0 | LCT community link tile (tts40k discord, Battlemaster layout editor, workshop items) |
| STRIP | Leviathan fixed secondary cards | `30c8fe` | Deck | 0 | 7 | 40k mission / secondary / primary / deployment card deck |
| STRIP | Leviathan secondary mission cards | `2c6243` | Deck | 0 | 9 | 40k mission / secondary / primary / deployment card deck |
| STRIP | Marked for Death | `cda0b3` | Custom_Token | 0 | 0 | 'Marked for Death' token (40k secondary marker), unscripted, hidden under the table |
| STRIP | Mission Manager Blue | `471de1` | BlockRectangle | 15,118 | 0 | per-player Mission Manager: secondary deck selection, fixed/tactical validation, lock-in |
| STRIP | Mission Manager Red | `cff35b` | BlockRectangle | 15,118 | 0 | per-player Mission Manager: secondary deck selection, fixed/tactical validation, lock-in |
| STRIP | Pariah Nexus deployment cards | `2dc2e8` | Deck | 0 | 5 | 40k mission / secondary / primary / deployment card deck |
| STRIP | Primary mission cards | `d26e9c` | Deck | 0 | 10 | 40k mission / secondary / primary / deployment card deck |
| STRIP | Priority Assets vs Priority Assets | `7b5ba7` | Bag | 2,544,621 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Priority Assets vs Reconnaissance | `32e34a` | Bag | 2,539,368 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Purge the Foe vs Disruption | `9ac38f` | Bag | 2,544,732 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Purge the Foe vs Priority Assets | `dc8738` | Bag | 2,544,471 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Purge the Foe vs Purge the Foe | `3ebbd6` | Bag | 2,544,486 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Purge the Foe vs Reconnaissance | `a22c33` | Bag | 2,545,154 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Reconnaissance vs Reconnaissance | `793bc0` | Bag | 2,545,461 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Red Primary Cards | `25c0d8` | Deck | 0 | 38 | 40k mission / secondary / primary / deployment card deck |
| STRIP | Red Secondary Mission Cards | `8104e1` | Deck | 0 | 18 | 40k mission / secondary / primary / deployment card deck |
| STRIP | Red WH Stats Helper | `7c7c20` | Chip_100 | 32,227 | 0 | WH Stats Helper: parses 40k weapon profiles (A/BS/S/AP/D) from model descriptions and spawns attack dice |
| STRIP | RedPrimary1 | `d1e001` | ScriptingTrigger | 0 | 0 | scripting zone for a primary / deployment / twist mission card slot |
| STRIP | RedPrimary2 | `d1e002` | ScriptingTrigger | 0 | 0 | scripting zone for a primary / deployment / twist mission card slot |
| STRIP | RedSec1 | `c1e001` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | RedSec2 | `c1e002` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | RedSec3 | `c1e003` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | RedSec4 | `c1e004` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | RedSec5 | `c1e005` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | RedSec6 | `c1e006` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | RedSec7 | `c1e007` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | RedSec8 | `c1e008` | ScriptingTrigger | 0 | 0 | scripting zone for one secondary-card slot (global.lua secondary slot machinery) |
| STRIP | RedSecName1 | `5423ba` | 3DText | 0 | 0 | 3D text label naming an active secondary card |
| STRIP | RedSecName2 | `5423bb` | 3DText | 0 | 0 | 3D text label naming an active secondary card |
| STRIP | RedSecName3 | `5423bc` | 3DText | 0 | 0 | 3D text label naming an active secondary card |
| STRIP | RedSecName4 | `5423bd` | 3DText | 0 | 0 | 3D text label naming an active secondary card |
| STRIP | RedSecName5 | `5423be` | 3DText | 0 | 0 | 3D text label naming an active secondary card |
| STRIP | Reinforcements and Reserves Board | `85f0cf` | Custom_Token | 1,301 | 0 | Deep Strike / Strategic Reserves / Transports board |
| STRIP | Reinforcements and Reserves Board | `fe7926` | Custom_Token | 1,301 | 0 | Deep Strike / Strategic Reserves / Transports board |
| STRIP | Tactical Objectives | `838a9b` | CardCustom | 0 | 0 | loose 'Tactical Objectives' helper card for the secondary system |
| STRIP | Tactical Objectives | `a847c1` | CardCustom | 0 | 0 | loose 'Tactical Objectives' helper card for the secondary system |
| STRIP | Take and Hold vs Disruption | `cfeba5` | Bag | 2,539,604 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Take and Hold vs Priority Assets | `eae80b` | Bag | 2,545,085 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Take and Hold vs Purge the Foe | `1e6711` | Bag | 2,545,608 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Take and Hold vs Reconnaissance | `109a6b` | Bag | 2,539,831 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Take and Hold vs Take and Hold | `6e0d78` | Bag | 2,541,910 | 24 | 40k mission-matrix bag: 24 map cards each carrying a ~150 KB embedded terrain layout (the Battlemaster/T5S2/LCT caches) |
| STRIP | Tournament Companion 1.0 | `5ac9e2` | Custom_PDF | 5,296 | 0 | 40k rules PDF (Core Rules / Tournament Companion / Warhammer Open FAQ) with a generic bookmark script |
| STRIP | TwistSlot | `d1e006` | ScriptingTrigger | 0 | 0 | scripting zone for a primary / deployment / twist mission card slot |
| STRIP | Warhammer Open FAQ | `47587b` | Custom_PDF | 5,296 | 0 | 40k rules PDF (Core Rules / Tournament Companion / Warhammer Open FAQ) with a generic bookmark script |
| ADDED | Warband Importer | `b91983` | Custom_Tile | 32,082 | 0 | TC-016: code entry, `WebRequest` fetch of `/api/tts/warband/{code}`, spawn of bound models, Bind mode, re-import; see below |
| ADDED | Trench Crusade Digital Rulebook 1.0.2 | `6b081d` | Custom_PDF | 6,297 | 0 | TC-014 rules shelf, from Scripted Table `70e736`; section-jump buttons (Core Rules p13 ... Scenarios p142) |
| ADDED | Warbands of Trench Crusade 1.0.2 | `a55c7e` | Custom_PDF | 6,238 | 0 | TC-014 rules shelf, from Scripted Table `a00f4d`; faction-jump buttons |
| ADDED | Trench Crusade FAQ 1.0.1 | `ff5f5a` | Custom_PDF | 0 | 0 | TC-014 rules shelf, from Scripted Table `bb1029` |
| ADDED | TC Tactics Guide (community) | `bddb43` | Custom_PDF | 3,438 | 0 | TC-014 rules shelf, from Scripted Table `972d47`; faction-jump buttons |
| ADDED | Red Brigade (warband supplement) | `0a5af1` | Custom_PDF | 0 | 0 | TC-014 rules shelf, from Scripted Table `485143` |
| ADDED | The Great Hunger (playtest summary) | `74c1e6` | Custom_PDF | 0 | 0 | TC-014 rules shelf, from Scripted Table `e18cdb` |
| ADDED | Rules shelf label | `c650dd` | 3DText | 0 | 0 | TC-014 "RULES SHELF" 3D text at the end of the shelf (shape copied from Scripted Table `3b98b9`) |
| ADDED | Trench Crusade Dice Roller | `25b3ac` | Custom_Token | 10,760 | 0 | TC-014 Red +/-DICE Success Roll pad, from Scripted Table `e3a6d5` without its 26 art states |
| ADDED | Trench Crusade Dice Roller | `ea3160` | Custom_Token | 10,760 | 0 | TC-014 Blue +/-DICE Success Roll pad, from Scripted Table `63dad0` without its 26 art states |
| ADDED | Points | `c0530b` | Custom_Token | 3,653 | 0 | TC-014 Red Points counter, from Scripted Table `bf846e` (+ `getValue`/`setValue`) |
| ADDED | Turn | `0e8265` | Custom_Token | 3,653 | 0 | TC-014 Red Turn counter, from Scripted Table `5114af`; the Turn Tracker sets it |
| ADDED | Glory | `e58368` | Custom_Token | 3,653 | 0 | TC-014 Red Glory counter, from Scripted Table `cdcfd8` |
| ADDED | Points | `520a95` | Custom_Token | 3,653 | 0 | TC-014 Blue Points counter, from Scripted Table `58b28d` |
| ADDED | Turn | `f14264` | Custom_Token | 3,653 | 0 | TC-014 Blue Turn counter, from Scripted Table `025fa8`; the Turn Tracker sets it |
| ADDED | Glory | `7a87e9` | Custom_Token | 3,653 | 0 | TC-014 Blue Glory counter, from Scripted Table `9458e0` |
| ADDED | Blood Marker | `3b0f1d` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Red bag; content `924f1f` = Scripted Table die `a4e6d3`, tag `tc-token:blood` |
| ADDED | Blessing Marker | `6cecd8` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Red bag; content `38e2c8` = Scripted Table die `719992`, tag `tc-token:blessing` |
| ADDED | Activated | `fef40e` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Red bag; content `fc9f6c` = Gannel's `7c7f58`, tag `tc-token:activated` |
| ADDED | Down | `e75c71` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Red bag; content `a045d1` = Gannel's `4f22ce`, tag `tc-token:down` |
| ADDED | Tough | `d51618` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Red bag; content `6c10a1` = Gannel's `03604e`, tag `tc-token:tough` |
| ADDED | Objective | `70d18f` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Red bag; content `a18feb` = Scripted Table objective bundle `ba7eaf`, tag `tc-token:objective` |
| ADDED | Blood Marker | `061bfb` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Blue bag; content `b3f4eb`, tag `tc-token:blood` |
| ADDED | Blessing Marker | `c30c00` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Blue bag; content `dff3f3`, tag `tc-token:blessing` |
| ADDED | Activated | `0659ae` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Blue bag; content `eb723c`, tag `tc-token:activated` |
| ADDED | Down | `9eb271` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Blue bag; content `dff860`, tag `tc-token:down` |
| ADDED | Tough | `359c8c` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Blue bag; content `afb1c2`, tag `tc-token:tough` |
| ADDED | Objective | `2d4b7e` | Custom_Model_Infinite_Bag | 0 | 2 | TC-017 Blue bag; content `8f0c3a`, tag `tc-token:objective` |
| ADDED | Turn Tracker | `4ac9e3` | Custom_Tile | 14,076 | 0 | TC-017 turn helpers: initiative roll-off, Start turn, Morale reminder, Next turn, Shaken flags, rules-shelf camera; see below |
| ADDED | Battlefield | `47de64` | Custom_Tile | ~14,000 | 0 | TC-022a: scenario / board chooser that fetches a generated battlefield from the API and spawns it with its objective markers; see below |


## global.lua (128,527 bytes, 151 functions) by system

| System | Class | Functions |
|---|---|---|
| HUD (overlay panels, preferences, splash; minimalist mode removed by TC-023t) | KEEP | `setHudAttribute`, `setHudValue`, `getDefaultHudSettings`, `ensureHudSettings`, `getHudColorFromCallback`, `setHudAttributeForColor`, `applyHudPreferencesForColor`, `applyHudPreferences`, `hudToggleHelp`, `hudCloseHelp`, `hudToggleClock`, `toggleHudOverlayForColor`, `hudHideOverlay`, `updateSplashOverlay`, `announceVersion`, `patchNumber` |
| CP (command points) | STRIP | `cpCounterForColor`, `counterValue`, `counterSetValue`, `counterIncrement`, `counterDecrement`, `currentBattleRound`, `gainCPForColor`, `hudGainCP`, `hudUseCP` (the counter helpers were generic but had no remaining caller) |
| 40k scoring overlay (scoreboard fed by the 10e score sheet and the secondary slots) | STRIP | `hudToggleLock`, `hudCloseScoringOverlay`, `hudToggleScoringMinimalist`, `hotkeyToggleScoringOverlay`, `formatSecondaryListColumns`, `isAnyScoringOverlayOpen`, `scheduleScoringOverlayRefreshLoop`, `getActiveSecondaryNames`, `getRemainingDeckSecondaryNames`, `recordDiscardTurn`, `getDiscardedSecondaryNames` (+ local `addName`), `setScoringContext`, `invalidateScoringCache`, `scoringTargetColors`, `setScoringHudValue`, `setScoringHudAttribute`, `setScoringListColumns`, `formatScoringPlayerHeader`, `formatScoringPrimaryMission`, `applyScoringContextToOverlay`, `hudAdjustRoundScore`, `refreshScoringOverlay` (+ locals `applyRoundRows`, `sectionH`) |
| Secondary card slots (zones, labels, draw/sort/discard/recycle) | STRIP | `getSecondaryCardZones`, `getCardsInSecondarySlot` (+ local `add`), `getSecondaryCardZoneByIndex`, `getSecondarySlotCardPosition`, `getSecondaryDeckByColor`, `getSecondaryDiscardPosition`, `refreshSecondaryNamesForColor`, `isSecondaryCardZone`, `isBlueSecondaryCardZone`, `isRedSecondaryCardZone`, `getSecondaryCardName`, `getSecondaryCardNameForColor`, `setSecondaryName`, `setBlueSecondaryName`, `setRedSecondaryName`, `refreshSecondaryNames`, `refreshBlueSecondaryNames`, `refreshRedSecondaryNames`, `refreshBlueSecondaryNamesSoon`, `refreshRedSecondaryNamesSoon`, `getSecondaryZoneColorAndIndex`, `onObjectEnterScriptingZone`, `onObjectLeaveScriptingZone`, `isSecondaryCardObject`, `addUniqueSecondaryCard`, `assignSecondarySlotCard`, `clearSecondarySlotAssignment`, `getAssignedSecondarySlotCard`, `getCardsInSecondarySlotForColor`, `clearSecondarySlotAssignmentsForColor`, `drawSecondaryToFirstOpenSlot`, `drawBlueSecondaryToFirstOpenSlot`, `drawRedSecondaryToFirstOpenSlot`, `drawBlueSecondaryToFirstOpenSlotSingle`, `drawRedSecondaryToFirstOpenSlotSingle`, `sortSecondarySlots`, `discardSecondarySlot`, `recycleSecondarySlot` |
| Missions / mission packs | STRIP | `hideMissionDeckUntilSelected`, `activateMissionDeck`, `setMissionPack`, `useEdition11SecondaryDecks`, `placeToGray` (seat-to-Grey variant that also selected the Pariah Nexus pack; unreferenced by the XML) |
| Battlemaster caches (debug panel) | STRIP | `debugPopulateBattlemasterCache`, `debugPopulateBattlemasterBttfRuinsCache`, `debugPopulateBattlemasterBttfCache`, `debugPopulateBattlemasterArmageddonRuinsCache`, `debugPopulateBattlemasterAllCache`, `debugPopulateBattlemasterLctPack1Cache`, `debugCheckBattlemasterCache` |
| Auras / bubbles (screen-space size input for the dice mats) | KEEP | `diceMatForColor`, `openBubbleInput`, `cacheBubbleInput`, `closeBubbleInput`, `closeBubbleOverlay`, `submitBubbleInput` |
| Seating / players | KEEP | `autoSeatPerson`, `autoSeatGroup`, `autoSeatAll`, `recordPlayers`, `onPlayerChangeColor`, `onPlayerConnect`, `promotePlayers`, `demotePlayers`, `showHideRedBlueBtn`, `setViewForPlayer`, `placeToColor`, `placeToRed`, `placeToBlue`, `placeToSpectator`, `closeMenu` |
| Theme / branding | KEEP (`announceVersion`, `updateSplashOverlay` retitled) / STRIP (`announceThemeVote`: LCT Discord theme-vote banner) | |
| Team tagging (GM-notes team for LOS markers) | KEEP | `updateTeamModel`, `tagSelectedAsRed`, `tagSelectedAsBlue` |
| Injection detector | KEEP | `checkForMonitoredID`, `startPolling`, `stopPolling` |
| Debug tools (generic) | KEEP | `cacheDebugMatUrl`, `onDebugMatApply`, `minimizeDebugTools`, `debugPerfScanRed`, `debugPerfScanBlue`, `debugRngTest`, `debugDumpSelectedGuids` (+ spawn callback) |
| Persistence / lifecycle | KEEP (edited) | `onSave`, `onLoad`, `onObjectDestroy` |
| Yellowscribe UI clean-up (`ymc-` cards in Global UI) | UNSURE, kept | `isYellowscribeGlobalCard`, `xmlElementHasCallbackGuid`, `removeYellowscribeGlobalCards`. Roster import will not use yellowscribe (ROADMAP), but these only sweep foreign XML and are harmless; TC-016 can delete them. |
| Feedback form callbacks (no panel in the XML) | UNSURE, kept | `onNameChanged`, `onEmailChanged`, `onTypeChanged`, `onLikeChanged`, `onMessageChanged` - dead code in LCT too. |
| Dice hotkeys | STRIP-3 | `onScriptingButtonDown` called the dice mat's `changeSustainedHitsThreshold` (40k sustained hits, never defined); removed by TC-023t. |
| Misc | KEEP | `destroyObjectByGUID` |

Data in global.lua: the GUID constant block (KEEP, minus mission/CP/zone constants),
`missionPackData`, `missionMatchups`, the secondary zone/label GUID tables, `MAP_INDEX`
(per-map creator metadata), the primary/deployment card GUID comment block (all STRIP),
`teamModels`, `nonPlaying`, `allowMenu`/`allowAutoSeat`, `*DiceSpawnTime`, version /
changelog constants (KEEP). TC-023s removed `centerCircle_GUID`, `quarterCircle_GUID` and the
seven `interactiveButton*` toggle-state globals with the objects they served.

## XmlUI (110,218 bytes) by panel

| Panel id | System | Class |
|---|---|---|
| `redirect` | "please wait" redirect warning; its `closeRedir` handler never existed in LCT; inactive | UNSURE, kept |
| `main` | splash + seat picker (Red / Spectator / Blue), patch notes | KEEP (retitled) |
| `bubbleOverlay_Red` / `bubbleOverlay_Blue` | aura/bubble size input | KEEP |
| `DebugTools` | shared debug panel (DEBUG builds only): diagnostics, custom mat URL | KEEP; its "Battlemaster cache" section STRIP |
| `RedHud_VPScores` / `BlueHud_VPScores` / `GreyHud_VPScores` | per-colour HUD: controls column, ROUND badge, per-player Turn readout, phase strip, clock | KEEP; inside it `*_LockBtn` (open scoreboard), `*_DispBadge*` + `*_DispSpacer*` (disposition glyph), `*_VPWatch*`, `*_CPWatch*`, `*_Row3` (Scoreboard / Gain CP / Use CP) STRIP; `*_PhaseRow*` relabelled by TC-014 from the five 40k phases to Initiative / Activation / Morale (`Ph1`-`Ph3`, the `Ph4`/`Ph5` buttons removed, panel 80 narrower). TC-023t: ROUND badge, Turn readouts, phase strips and the minimalist `-` button removed; the panel is now the `?` help and clock toggle plus the two chess-clock rows (width 1200 -> 416, main 1144 -> 360) |
| `*_HelpOverlay` | help overlay (background + close) | KEEP |
| `RedHud_ScoringOverlay` / `Blue...` / `Grey...` | 40k scoreboard (PRI/SEC per round, active/discard/remaining secondaries) | STRIP |

## Per-object scripts worth knowing

- **Start Menu `738804`** (252 KB, 6,090 lines in LCT; 23 KB, 592 lines after TC-023s,
  which removed everything below except mat themes, terrain pass-through and the
  turn/phase/round HUD) - size changer, deploy-zone manager,
  objectives manager, mission manager, game manager. Subsystems: sizes/modes and mat themes
  (KEEP); deploy-zone data and overlay drawing primitives (UNSURE kept - 40k zone geometry,
  generic drawing); objectives manager (UNSURE kept); dispositions, mission generation,
  deployment/primary/layout cards, Combat Patrol dealing, restore point ("Back to
  Selection"), Battlemaster mat reskins and map-card loading, mission-pack selection,
  secondary lock-in at game start, CP on turn pass (all STRIP); turn/phase/round HUD, chess
  clock sync, territory line, 9" lines, terrain pass-through (KEEP).
- **Map Creator Filter `369707`** - creator filter + Battlemaster mat randomizer (STRIP) and
  the Table Theme swatches (KEEP); rewritten to only the swatches.
- **Custom Dice Table `acae21` / `839fcc`** (138 KB each in LCT, identical; 63 KB after
  TC-023t) - now a small Trench Crusade dice tray: spawn 1-4 d6 or a d3 (10 dice at most),
  roll all through the LCT dice roller, revert / last 5 rolls, colours and pips, face counts
  with total and the two highest / two lowest. It still hosts the generic table tools: save /
  restore positions, measuring bubbles and custom bubble, clear bubbles / lines, highlight
  paint, hotkeys. The 40k features listed in its row above are gone (STRIP-LOG, *Third strip*).
- **Game Rounds `ee92cf`**, **Red/Blue Turns `055302`/`7e4111`** - LCT turn counters; removed
  by TC-023t with the turn engine.
- **Mission Manager `cff35b`/`471de1`**, **10e Score Sheet `06d627`**, **Command Points
  `e446f7`/`deb9f2`**, **Gain CP `af8032`/`5e882b`**, **WH Stats Helper `7c7c20`/`b7ac7a`**
  - STRIP, see the table.
- Token bags (`7aca71`, `10a26a`, `446a11`, `9d6b2f`, `3f26fa`, `58d30b`, `5549a7`) shared
  the memory-bag script family (place / recall / setup). `5549a7` ("40K items") went with
  the strip; the other six went with TC-017 (REPLACED above) - their only contents were 40k
  tokens, so the generic engine had nothing left to place. The memory-bag script is no
  longer in the save.

## Added: Warband Importer `b91983` (TC-016)

A locked Custom_Tile at (-33.5, 1, 0) in the side column (TC-023v; it was at (-22, 1, 0)),
between the two hand zones, turned to `rotY: 270` so its widgets read upright from the seats (every seat faces
+x: the hand zones sit at x=-42 with rotY 270 and `CameraStates[0]` loads looking along +x;
the LCT Start Menu at x=52 uses the same rotY 270). The face is the Scripted Table's plain
charcoal board image (3603166284, Custom_Boards `199749` / `f1195f`, 2272x1704); measured
live it is 16x12 units at scale 6 (the tile keeps the image's 4:3 despite `Stretch: true`)
with the mesh from local y 0 to 0.2, pivot on the bottom face. The panel is classic 3D
widgets created from the script (`self.createInput` for the API base URL and the warband
code, `self.createButton` for everything else: title and status as width-0 / full-width
label buttons with a no-op click, Colour cycle, Bind, Import or the Replace / Cancel pair
while a re-import is pending, and one 60-tall button per member down the right half) -
ForceOrg's Yellow Machine pattern for on-object buttons, with the LCT's `rotation {0,0,0}`
/ label-top-at-local-`-z` convention. At load (and on `call("relayout")`) the script
measures `getVisualBoundsNormalized` / `getBoundsNormalized` / `getScale`, stretches the
layout written for the measured reference face to whatever the object reports, lifts it
0.1 above the collider top, and prints one geometry line to the host chat. Widgets are
rebuilt with `clearButtons` on every state change; the inputs are created once and read
through their `input_function` callback (stored on every call, trimmed when `stillEditing`
is false) and again via `self.getInputs()` when Import is pressed. There is no XML UI on the
object. `mod/state/b91983.json` persists the base URL, code and colour choice through
`onSave`/`onLoad`.

Geometry (`LAYOUT`, local units on the measured face x -1.333..1.333, z -1..1; width /
height / font in widget units, 500 per local unit of width - read off the screen, the API
names no unit - and about 650 per local unit of height, bracketed from two observations;
the API's 60 floor on width/height is why rows are 60 tall): controls down the viewer's
left at col -0.56 (local x +0.56), 760 wide - title font 80 at row -0.91; API input row
-0.72, 85 tall, font 55; code input row -0.47, 115 tall, font 85; Colour row -0.22 and
Bind row 0.0, 90 tall; Import row 0.24, 110 tall, font 80 (Replace / Cancel 370 wide at
+-0.39 around it); status row 0.62, 170 tall, font 32, wrapped at 40 characters - and the
member list down the right at col 0.80 (local x -0.80), 500 wide, 60 tall, font 28, pitch
0.14 from row -0.91, fourteen rows (MAX_ROWS). Screen right is local -x, screen down is
local +z (`screenToLocal`). The widget y is the measured top + 0.1 (0.40 here). The anchors
for the spawned models come from the mat at import time: `findMat` reads `4ee1f2`'s
`getBounds` (live: centre (0, -0.5, 0), size (60, 2.9, 44)), or the first flat 50-70 x
34-54 object, else `DEFAULT_MAT`; Red's rows start 3" inside the +z edge and grow toward
the centre, Blue mirrored, both centred on the mat's x, one unit above the mat top. Since
TC-023v the mat sits under the felt, so that is about 0.67 + 1 and models drop onto the felt
(or the board) from there; x / z are unchanged.

`mod/scripts/b91983.lua` is split in two. Above the `TTS glue` line nothing touches a TTS
global, so `mod/test/importer_test.lua` runs it under plain Lua (`pnpm mod:test`):

- `validatePayload` accepts only `version == "tc-warband-export-v1"` payloads with a code,
  a warband and members with ids (`packages/rules/src/export.ts` is the contract).
- `buildSpawnSpecs` turns the payload into one object-state table per member, laid out by
  `gridPosition` on the colour's anchor (`anchorsFromMat`: Red starts at (centre - 6.25,
  top edge - 3) and grows +x then toward the centre, Blue mirrored from the -z edge, six per
  row 2.5" apart; any other colour gets a grid 8" in front of the tile). Each state mirrors a Gannel's Model Corner miniature
  (3700111403, Lieutenant `15e05f`): a base `Custom_Model` (TypeIndex 1, the candidate's
  `base` mesh/collider, `ColorDiffuse` tinted 60% from Gannel's dark grey toward the player
  colour) with the figure parts as `ChildObjects` carrying their own `CustomMesh` (Gannel's)
  or `CustomAssetbundle` (Scripted Table) and child `Transform`. Nickname is the display
  name, Description and GMNotes are the payload's prebuilt `ttsDescription` / `ttsGmNotes`,
  Tags are `tc-warband:<code>`, `tc-member:<id>`, `tc-spawned`. A member with `model ==
  null` gets Gannel's bare 32mm base with the same binding.
- `mergeTags` / `memberTags` / `memberIdFromTags` keep foreign tags and replace the
  importer's own.
- `geomFromBounds` / `widgetLayout` / `inputLayout` / `widgetExtent` / `screenToLocal` /
  `describeGeometry` build the button and input parameter tables from a view of the state
  and the measured face; `nextColourChoice` / `colourButtonLabel` drive the Colour cycle,
  `wrapText` folds the status text, `memberRowTitle` is the short row label. The test
  checks every widget stays on the measured face (and on a square one) without overlapping,
  with letters 0.6-1.3 units tall at the committed scale.

The glue: `onImport` reads the inputs, then checks `getObjectsWithTag("tc-warband:<code>")`;
if the code is already on the table it swaps Import for Replace / Cancel, and Replace deletes
the `tc-spawned` objects while `tc-bound` ones (the player's own models) are kept and
re-bound from the fresh payload. The
fetch is `WebRequest.get(base .. "/api/tts/warband/" .. code)`, decoded with `JSON.decode`
and spawned with `spawnObjectData`. Bind mode arms the clicking player's colour on the
selected member; `onObjectPickUp(colour, object)`, which fires in object scripts for any
object a player grabs (the moment ForceOrg's importer also binds on, via `onPlayerAction`),
copies the member's name, description, GM notes and tags onto that object and deletes the
member's spawned default. The 3D-widget panel has not been run in TTS yet (`mod/TESTING.md`
step 8 lists the orientation and sizing knobs).

## Added: Trench Crusade content (TC-014 / TC-017)

Ported from Steam Workshop 3603166284 "Trench Crusade 1.0.2 - Scripted Table" (ST) and
3700111403 "Gannel's Model Corner" (GN) by copying object states with their asset URLs and
giving every object a fresh GUID absent from the save, both sources and LCT. Nothing in
this section has been loaded in TTS yet (`mod/TESTING.md` step 9).

### Rules shelf

Six `Custom_PDF`s on the raised ledge LCT used for its 40k rulebooks (x=102, y=9.5, rotY
270, scale 5, 22" apart along z), with a "RULES SHELF" 3D label at z=72 and a "Trench
Crusade content" notebook tab listing them. The Turn Tracker's **Rules shelf** button
points the clicking player's camera at it.

| New | Source | Content | Script |
|---|---|---|---|
| `6b081d` | ST `70e736` | Trench Crusade Digital Rulebook 1.0.2 (197 pp) | section-jump buttons (ST script verbatim) |
| `a55c7e` | ST `a00f4d` | Warbands of Trench Crusade 1.0.2 (186 pp) | faction-jump buttons (verbatim) |
| `ff5f5a` | ST `bb1029` | Trench Crusade FAQ 1.0.1 (5 pp) | none |
| `bddb43` | ST `972d47` | TC Tactics Guide, community (291 pp) | faction-jump buttons (verbatim) |
| `0a5af1` | ST `485143` | Red Brigade warband supplement (12 pp) | none |
| `74c1e6` | ST `e18cdb` | The Great Hunger playtest summary (13 pp) | none |

The PDFs were identified from the local TTS PDF cache (`~/Library/Tabletop
Simulator/Mods/PDF`), since the ST objects carry no nicknames. ST's per-player duplicates
of the rulebook and warbands (`33c1dd`, `7f7cde`, `928924`, `f3c29b`, `75f7ff`) are not
ported; one copy each on the shelf. ST's five `Custom_Board`s (`f1195f`, `199749`,
`c23e91`, `ebabad`, `8352f6`) are a plain wood-texture image, not reference material, and
were left behind, as was its `6927df` shelf card (a map-controls illustration).

### Dice rollers

`25b3ac` (Red, -6.4/1/31.6) and `ea3160` (Blue, 6.4/1/-31.6) are ST `e3a6d5` / `63dad0`: the
**Trench Crusade** roller. Place a die on the centre pad, set +N / -N with the side
buttons, click the number: it rolls 2+N dice and prints the two highest (+DICE) or two
lowest (-DICE), which is the rulebook p15 Success Roll. The 26 alternate-art `States`
(10.7 KB of Lua each) were dropped and the description's "[Right Click > State]" line with
them. ST's plain N-dice roller (`15d529`, "ALT. DICE ROLLER") was not ported: LCT's dice
rollers `17ca2b` / `927ca1` and the dice mats already do bulk dice. Use the TC roller for
Success and Injury Rolls, the LCT mats for everything else; neither touches the other.

### Counters

Six `Custom_Token` counters (ST script, left click +1 / right click -1, editable name) in a
row in each player's strip: Red `c0530b` Points (-23.4/31), `0e8265` Turn (-19.2/31),
`e58368` Glory (-15/31); Blue `520a95` Points (23.4/-31), `f14264` Turn (19.2/-31),
`7a87e9` Glory (15/-31). Sources ST `bf846e`/`5114af`/`cdcfd8` and `58b28d`/`025fa8`/`9458e0`; the
Turn counters keep ST's `MIN_VALUE = 1`. The only script change is an appended `getValue`
/ `setValue` so the Turn Tracker can write them. They are **added alongside** LCT's Game
Rounds / Red Turns / Blue Turns (`ee92cf`, `055302`, `7e4111`): those drive the HUD ROUND
badge and the chess clock through the Start Menu's pass-turn and were left untouched;
LCT's "round" (both players passed) does not map onto a Trench Crusade Turn (alternating
single activations), so the TC counters carry the Trench Crusade numbers and the LCT ones
stay engine plumbing.

### Token bags (TC-017)

Twelve `Custom_Model_Infinite_Bag`s on LCT's bag shell (`3f45f1`'s mesh, invisible, scale
1.49, locked) with one tagged content object and one locked, untagged child icon. Since
TC-023v each side's six stand in one row at z=+/-27, 2.4" apart: Red x -13 .. -25 Blood
(`3b0f1d`, slot of `e51f0c`), Blessing (`6cecd8`, slot of `e87880`), Activated `fef40e`,
Down `e75c71`, Tough `d51618`, Objective `70d18f`. Blue mirrors it
(`061bfb`, `c30c00`, `0659ae`, `9eb271`, `359c8c`, `2d4b7e`). Contents and tags:

| Role | Tag on the content | Source | Why |
|---|---|---|---|
| blood | `tc-token:blood` | ST `a4e6d3` Blood Marker (`Custom_Dice` d6) | p19: a red die counts the markers; no equivalent in GN |
| blessing | `tc-token:blessing` | ST `719992` Blessing Marker (`Custom_Dice` d6) | p20; no equivalent in GN |
| activated | `tc-token:activated` | GN `7c7f58` ACTIVATED | consistent art with DOWN/TOUGH; ST's per-faction `Active` tokens (`8435a8` ...) not ported |
| down | `tc-token:down` | GN `4f22ce` DOWN (standing token) | consistent art; ST `c00e37` not ported |
| tough | `tc-token:tough` | GN `03604e` TOUGH | consistent art; ST `956155` not ported |
| objective | `tc-token:objective` | ST `ba7eaf` Objective (`Custom_Assetbundle`) | the generic green objective from ST's "Objectives + Tokens" bag |

A spawned token is a clone of the content, so it carries the tag; `getObjectsWithTag` never
returns bag contents or attached icons, which is why **Start turn** can delete every
`tc-token:activated` object on the table without emptying a bag. No Shaken or Broken token:
p21 defines Shaken as a warband state with no marker, so it is a flag on the Turn Tracker.
Not ported from ST's "Objectives + Tokens": the scenario pieces (emplacements, mines,
peasants, reliquaries, supply caches, hell ticks, explosives, shells) - Phase 2 scenario
work; the `Supply Cache` mesh is a pastebin URL in the raw save anyway. Not ported either:
ST's Fear and Infection markers, the six faction dice bags and the seven faction activation
bags (not asked for; candidates for TC-018 friction tickets).

### Turn Tracker `4ac9e3` (TC-017)

A locked `Custom_Tile` at (-31.5, 1, 16.6) (TC-023v; was (-22, 1, 15)), above the Warband Importer (measured live: a
10.67x8 face at scale 4, the same 4:3 board image, mesh from local y 0 to 0.2), with eight
`createButton`s: a label (`Turn N - <Phase> Phase`), **Initiative roll-off**, **Start turn
(clear Activated)**, **Morale reminder**, **Next turn**, **Red Shaken** / **Blue Shaken**
toggles and **Rules shelf**, laid out by `trackerLayout` from `BUTTONS` (rows 0.27 apart,
1150x170 font 70, the Shaken pair 560 wide at x +-0.72, font 60; live-tuned) on the face
`geomFromBounds` measures at load, at y top + 0.1, with one geometry line printed to the
host chat and a `relayout` call. Buttons are matched by id (`buttonIndex`), never by label.
`mod/scripts/4ac9e3.lua` is split like the importer: above the `TTS glue` line is pure
Lua that `mod/test/tracker_test.lua` runs under plain Lua:

- `tokenTag` / `roleFromTag` - the `tc-token:<role>` names, six roles.
- `newState` / `normaliseState` - `{ turn, phase, shaken = { Red, Blue } }` with garbage
  tolerance for saves made by an older script.
- `startTurn` - phase 2 (Activation), returns the announcement with the cleared count.
- `nextTurn` - turn + 1, phase 1 (Initiative), returns the initiative reminder (fewest
  models on the table, Down and Out of Action not counted, tie rolls off - p32).
- `rollOff` / `describeRollOff` - two d6, higher wins, tie asks for a re-roll.
- `successRoll` - the p15 table: 2-6 failure, 7-11 success, 12+ critical (reserved for
  later helpers; the tracker only announces initiative and morale).
- `toggleShaken` / `shakenLabel` / `describeShaken` - the p21 consequence text.
- `moraleSummary` - the p21 rule, the number of Down tokens on the table and any Shaken
  side. **Per-colour Down / Out of Action counts are not computed**: tokens carry no colour,
  and Out of Action models have left the table, so the tracker cannot tell whose they were
  without the importer's roster bookkeeping; the whole-table Down count is what is cheap.
- `countTagged` - counts entries whose tag list carries a role.
- `geomFromBounds` / `trackerLayout` / `widgetExtent` / `describeGeometry` - the widget
  geometry; the test keeps every button on the measured face, apart, with letters 0.45-1.3
  units tall at the committed scale.

The glue: `onStartTurn` destroys every `tc-token:activated` object; `onNextTurn` calls
`setValue(turn)` on both TC Turn counters; `onMorale` counts `tc-token:down`; the Shaken
toggles broadcast in the side's colour; `onRulesShelf` is `Player[colour].lookAt` at the
shelf. State persists through `onSave` / `onLoad`.

### HUD phase strip (TC-014)

The strip is data-driven (`phases` in the Start Menu) with five fixed glyph buttons per row
in the XML, so both were edited: `phases` is now Initiative / Activation / Morale, the
`_phaseIds` tables and handlers shrink to three (`hudPhaseIni*` / `hudPhaseAct*` /
`hudPhaseMor*`), the `Ph4`/`Ph5` buttons are gone from both rows of all three panels
(the spectator's are display-only, `onClick=""`, as in LCT), the remaining glyphs are a
die / crossed swords / skull with tooltips, and the panel widths drop by the two removed
buttons (1280 -> 1200, 1224 -> 1144 in the XML for Red, Blue and Grey, and in
`HUD_FULL`).

### Objective markers (TC-023u, reworked in TC-022a and TC-022b)

The content of both Objective bags (`a18feb` in Red `70d18f`, `8f0c3a` in Blue `2d4b7e`, tag
`tc-token:objective`) is a thin circular `Custom_Tile` (type 2, thickness 0.1, white tint)
whose face is our objective symbol, `https://tc.rynfin.org/tts/objective-marker.png`, running
`mod/scripts/a18feb.lua` (identical copy in `8f0c3a.lua`). TC-022b replaced the built-in
`Chip_10` poker chip (thick, printed "AWESOME POKER" / "10"); TC-022a had replaced the
Scripted Table asset bundle before it (LCT's 40k objective with a ~6" ring baked into the
model). The bags' attached icons (`fc05bb` / `b7e51d`) are the same tile.

The symbol (four wedges pointing in from a ring at a central lozenge; original, geometric)
is drawn by `scripts/objective_symbol.py` (standard library only) into
`apps/web/public/tts/`: `objective-symbol.png` on transparency for terrain decals and
`objective-marker.png` on a dark disc with a green rim for the marker face. The web build
copies `public/` into the static folder the API serves, so both ship with the image;
`pnpm mod:test` fails if the committed PNGs differ from the script's output.

- **No physics.** Once spawned the marker locks itself, turns gravity off and makes every
  Box / Mesh / Sphere / Capsule collider in it a trigger (mesh colliders convex first): it
  blocks nothing and nothing rests on it, but the cursor still hits it. The collider var
  names come from LCT's working objective code, not the docs (which list
  `Component.set(name, value)` only); whether a built-in chip accepts `isTrigger` is the
  first live check.
- **Rule size.** It levels itself and rescales x / z so `getBoundsNormalized()` is exactly
  40mm (1.575") across, the rulebook's largest Marker (p146), whatever size the tile comes in
  at.
- **Virtual spot and range**, as object vector lines 0.02" above the disc's top face (the
  tile's pivot is its bottom face, so the lift is measured from `getBounds()`):
  a 40mm spot outline, and either a control ring 1" beyond it (1.787" radius; "on, in or
  within 1"", p152 / p154 / p156 / p193) or, for an objective a terrain piece covers, the
  band the spawner passes: the piece's turned footprint grown by 1" with rounded corners
  (`grownOutline` in `packages/battlefield/src/tts.ts`; the whole piece is the Objective,
  p152). Lines are local to the marker with the dice tray's measuring-bubble recipe
  (rotation {270, 0, 0}); that local +y maps to world -z is inferred from Unity's rotation,
  not measured: if a band reads mirrored across the piece, flip the sign of `y` in `line()`.
- **Seating.** A downward ray onto the highest `tc-terrain` piece or the mat, never a model
  or another marker. A ray that lands exactly on the seam between two ground tiles passes
  through to the mat (measured live on Relic Hunt seed 32 at (-6, -12): 0.96 at x = -6, 3.45
  at x = -5.7 / -6.3), so when the centre ray finds no terrain, four rays 0.3" off centre
  decide.
- **Move / delete**: right-click **Move objective** unlocks it for one drag and it reseats and
  relocks on drop; **Delete objective** (or Delete) removes it. Ring radius and band are
  saved; everything else is re-applied on load.
- **Ready flag.** The script sets the global `ready` once it has settled (sized, seated,
  rings drawn). A `setRingRadius` call made from `takeObject`'s callback runs before the
  script's `onLoad` and is lost (seen live on Claim No Man's Land seed 25), so spawners wait
  for `getVar("ready")` first.

`objectiveMarkers(layout, palette, catalog, opts)` returns per objective its world x / z,
`ringIn` and `band` (empty for an open objective). The Battlefield panel only takes a marker
for an open objective; a covered one is marked on its terrain piece (see the panel below).

## Table layout (TC-023v)

The middle of the table is kept clear for the battlefield: nothing stands within x, z
+/-25.5 (a 48" board plus 1.5"). `mod/test/layout_test.lua` checks every footprint.

- **Side column** (x <= -27.5, |z| <= 24.7): Warband Importer `b91983` (-33.5, 0), Turn
  Tracker `4ac9e3` (-31.5, 16.6), Battlefield panel `47de64` (-31.5, -16.6), Table Theme
  anchor `369707` (-40, 16.6) beside the tracker (its XML panel is 15.7 x 7 inches).
- **Player strips**, Red at z 26.0 .. 37.8 and Blue its mirror through the centre (every
  Blue twin is the Red position negated). Seen from the Red seat (+z, facing the board):
  the dice tray `acae21` at the left end (x -0.8 .. 27.8, centre (13.5, 31.6)), the
  opponent's dice-camera screen `c09349` beyond it at x 33.7, and in the freed half to the
  right: the TC roller `25b3ac` beside the tray (x -6.4, with the 4.4" ring it rolls on
  kept clear), then three rows - the six token bags at z 27, Glory / Turn / Points and the
  banner at z 31, the trash bin and its counter, d3 / d6 bags and the two LOS markers at
  z 35.6.
- **Dice tray** (both identical): scale (1.875, 1, 3.75), so half the LCT length and the
  full depth. `place()` authors every widget in world inches and counter-scales its x by
  3.75 / 1.875, so text stays square and at the size it had on the 3.75 tray. In the seated
  player's frame (u right, v toward them): bubble / highlight tools and Clear mat / Roll
  all / colours / pip on the far row, measure buttons / size / Go / +1d6 .. +4d6 / +1d3 /
  Custom Dice on the next, the five-button tool column at the left, the readout beside it,
  then the result rows (`RESULT_LAYOUT`: 10 per row, value rows 1.05 apart, from u 0.05,
  v -2), the ten spawn slots (2 x 5, 0.94 apart) and the roller bowl on the tray's snap
  point at the right. The roller asks the tray for `getResultLayout` and lays rows and
  ejected dice out in the tray's frame instead of fixed world offsets.
- The LCT mat `4ee1f2` is parked under the felt; boards are generated for the felt's top
  (`DEFAULT_TTS_OPTIONS.matTopY` 0.9, tied to the save by `packages/battlefield/test/table.test.ts`)
  and objective markers off terrain seat on the felt.

## Added: Battlefield panel `47de64` (TC-022a)

A copy of the Turn Tracker's tile (same image, scale 4, rotY 270, so its live-measured face
and widget scale apply) at (-31.5, 1, -16.6) (TC-023v; was (-22, 1, -15)): below the
Warband Importer, mirroring the tracker above it. Nine classic 3D widgets from `BUTTONS` in `mod/scripts/47de64.lua`: the scenario
label (`n/12  Name  (36")`), **< Scenario** / **Scenario >**, the board label (`Board i/5:
seed N` or `Random board: seed N`), **Next board** / **Random board**, **Spawn battlefield**,
**Clear battlefield** and a status line.

- Data comes from the campaign API at the Warband Importer's base URL (its `state.baseUrl`,
  default `https://tc.rynfin.org`): `GET /api/battlefields` for the scenario list with five
  recommended seeds each (`data/tts/battlefield-seeds.json`, `pnpm battlefields:seeds`), and
  `GET /api/battlefields/<scenario>/<seed>` for one board in the compact `tc-battlefield-v1`
  form (`packages/battlefield/src/compact.ts`). Random board picks a seed in 1..`maxSeed`
  client-side. No board data is stored in the mod.
- `buildState` is the Lua twin of `expandBattlefield`: one payload row back to the object
  state the generator's `--tts` output carries; `mod/test/battlefield_test.lua` compares the
  two field for field on a fixture board. Names reach the mod as raw UTF-8 (the API's
  `JSON.stringify` never writes `\u` escapes), so the `·` in the terrain names survives.
- **Archetype** button (TC-022b), shown only for scenarios whose `archetypes` in the list
  has more than one entry (Great War p195 and From Below: "can use any battlefield
  archetype"; Dragon Hunt lists both): it steps through them and the board is fetched with
  `?archetype=<id>`. Hidden (width and height 0) everywhere else. **Random board** also
  picks an archetype at random there; changing scenario returns to the scenario's own.
- **Spawn battlefield** removes every object tagged `tc-terrain` or `tc-token:objective`
  (generated terrain and objective markers, nothing else), spawns each row with
  `spawnObjectData` and waits until the pieces have loaded (45 s cap). Then per objective:
  - **covered** (a row carries its id, and the spec has a band): no marker. The covering
    piece is the Objective (p152), so it gets the symbol as a decal (`setDecals`,
    `objective-symbol.png`, 40mm, over the objective point) and the band (its footprint
    grown by 1", rounded corners) as an object vector line, both converted with the piece's
    `positionToLocal` and lifted 0.05" above its `getBounds()` top so its walls never hide
    them. The piece is tagged `tc-objective` and `tc-objective:<id>` and keeps the spec in its
    `memo`; on load the panel re-draws every `tc-objective` piece from its memo. Clear removes
    it with the rest of the `tc-terrain`.
  - **open**: one marker from the Red Objective bag `70d18f` at the point; once its `ready`
    flag is set (10 s cap) the panel calls `setRingRadius` with the spec's `ringIn` (1.787").
  **Clear battlefield** removes the same two tags. Network and HTTP failures are written to
  the status line with the host and the server's message.
- State saved: scenario index, board index, random seed, chosen archetype.
