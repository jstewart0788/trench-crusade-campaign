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

Counts over the 218 top-level objects: **KEEP 85, UNSURE 23, STRIP 110**. Every nested
object follows its top-level parent. The stripped table keeps 108 top-level / 1,100 total
objects and packs to about 2.9 MB. Objects this repo adds on top of the fork are classed
**ADDED** (one so far: the Warband Importer, TC-016), for 109 top-level / 1,101 total.

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
| KEEP | +1 to Rolls | `450445` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | +1 to Rolls | `988659` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | -1 to Rolls | `c54686` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | -1 to Rolls | `d1c6dd` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Action | `db0a07` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Action | `e6d3ec` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Advanced Features Panel | `ed17d0` | BlockSquare | 3,009 | 0 | terrain collider toggle panel (forwards to the Start Menu) |
| KEEP | Banner (Blue) | `0dd965` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Banner (Red) | `0dd964` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Blue Custom Dice Table | `839fcc` | Custom_Tile | 138,402 | 0 | dice mat: roll/select/clear, bubbles, save/restore positions, measurement hotkeys (138 KB) |
| KEEP | Blue dice cam | `96a319` | Custom_Assetbundle | 0 | 0 | dice camera asset for the dice mats |
| KEEP | Blue dice camera | `c09349` | Custom_Assetbundle | 0 | 0 | dice camera asset for the dice mats |
| KEEP | Blue Dice Roller | `927ca1` | Custom_Model_Bag | 33,778 | 0 | dice roller with seeded RNG and result printing |
| KEEP | Blue LOS Marker | `1b3488` | Custom_Tile | 3,676 | 0 | line-of-sight marker |
| KEEP | Blue LOS Marker | `b1625c` | Custom_Tile | 3,676 | 0 | line-of-sight marker |
| KEEP | Blue Selection Highligher | `84c3a4` | Quarter | 4,513 | 0 | generic table furniture |
| KEEP | Blue Trash bin | `4b1a7b` | Custom_Assetbundle_Bag | 1,050 | 0 | vortex trash bin |
| KEEP | Blue Turns | `7e4111` | Custom_Token | 5,490 | 0 | round / turn counter feeding the HUD |
| KEEP | BlueHiddenZone | `e1e91a` | FogOfWarTrigger | 0 | 0 | hidden zone used by the Spawn-game-tools HIDE ARMY buttons |
| KEEP | Counter | `42c161` | Custom_Token | 5,146 | 0 | token counter beside each trash bin |
| KEEP | Counter | `42c164` | Custom_Token | 5,146 | 0 | token counter beside each trash bin |
| KEEP | d3 | `2d9705` | Infinite_Bag | 0 | 1 | infinite dice bag |
| KEEP | d3 | `4c054e` | Infinite_Bag | 0 | 1 | infinite dice bag |
| KEEP | d6 | `176bc4` | Infinite_Bag | 0 | 1 | infinite dice bag |
| KEEP | d6 | `714214` | Infinite_Bag | 0 | 1 | infinite dice bag |
| KEEP | Extract terrain | `70b9f6` | Custom_Model_Bag | 13,123 | 0 | terrain extraction / mirroring tool |
| KEEP | Flex Table Control | `bd69bd` | Chinese_Checkers_Piece | 20,270 | 0 | table size / surface controls |
| KEEP | Full circle | `51ee2f` | Custom_Model | 47 | 0 | overlay template cloned for circles/arcs |
| KEEP | Game Rounds | `ee92cf` | Custom_Token | 6,588 | 0 | round / turn counter feeding the HUD |
| KEEP | Hidden | `972ea3` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Hidden | `9abea4` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Home Objective | `312600` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Home Objective | `f26331` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Injection Detector | `5c328f` | go_game_piece_white | 2,058 | 2 | malicious-script detector polled by global.lua |
| KEEP | Interactive Buttons - Deployment Zone | `8aba11` | Custom_Token | 1,069 | 0 | table toggle button (quarters / deployment zone / territory line) |
| KEEP | Interactive Buttons - Table Quarters | `59decf` | Custom_Token | 2,726 | 0 | table toggle button (quarters / deployment zone / territory line) |
| KEEP | Interactive Buttons - Territory Line | `7e7711` | Custom_Token | 1,071 | 0 | table toggle button (quarters / deployment zone / territory line) |
| KEEP | Marked Terrain | `70566d` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Marked Terrain | `b3dab3` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Marked Unit | `2914e3` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Marked Unit | `513c30` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Mat url | `c5e288` | BlockRectangle | 9,279 | 0 | table mat URL setter |
| KEEP | matObjSurface | `4ee1f2` | Custom_Model | 3,293 | 0 | table surface mat (mat_GUID) with lighting presets |
| KEEP | Objective | `4d85d9` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Objective | `d1100e` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Quarter-circle | `51ee3f` | Custom_Model | 0 | 0 | overlay template cloned for circles/arcs |
| KEEP | Red Custom Dice Table | `acae21` | Custom_Tile | 138,402 | 0 | dice mat: roll/select/clear, bubbles, save/restore positions, measurement hotkeys (138 KB) |
| KEEP | Red dice cam | `48dcae` | Custom_Assetbundle | 0 | 0 | dice camera asset for the dice mats |
| KEEP | Red dice camera | `19b9bf` | Custom_Assetbundle | 0 | 0 | dice camera asset for the dice mats |
| KEEP | Red Dice Roller | `17ca2b` | Custom_Model_Bag | 33,778 | 0 | dice roller with seeded RNG and result printing |
| KEEP | Red LOS Marker | `546598` | Custom_Tile | 3,676 | 0 | line-of-sight marker |
| KEEP | Red LOS Marker | `ca16c5` | Custom_Tile | 3,676 | 0 | line-of-sight marker |
| KEEP | Red Selection Highlighter | `27de4f` | Quarter | 4,513 | 0 | selection highlighter |
| KEEP | Red Trash bin | `be2cdb` | Custom_Assetbundle_Bag | 1,050 | 0 | vortex trash bin |
| KEEP | Red Turns | `055302` | Custom_Token | 5,490 | 0 | round / turn counter feeding the HUD |
| KEEP | RedHiddenZone | `28419e` | FogOfWarTrigger | 0 | 0 | hidden zone used by the Spawn-game-tools HIDE ARMY buttons |
| KEEP | Reroll 1s | `389ff7` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Reroll 1s | `adae2a` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Reroll All | `404fe0` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Reroll All | `af7071` | Custom_Model_Infinite_Bag | 0 | 2 | infinite token bag (tokens engine) |
| KEEP | Spawn game tools | `a76485` | BlockRectangle | 7,901 | 0 | spawns activation/wound trackers and hides/shows armies |
| KEEP | Squad activation | `229946` | BlockSquare | 2,062 | 0 | activation / wound tracker token cloned by Spawn game tools |
| KEEP | Squad activation | `37e995` | BlockSquare | 2,062 | 0 | activation / wound tracker token cloned by Spawn game tools |
| KEEP | Squad activation | `bcf2a4` | BlockSquare | 2,062 | 0 | activation / wound tracker token cloned by Spawn game tools |
| KEEP | Stopwatch | `f4ee71` | Custom_Model | 42,585 | 0 | chess clock driving the HUD clock readouts |
| KEEP | Wounds Remaining | `2e4f26` | BlockSquare | 1,968 | 0 | activation / wound tracker token cloned by Spawn game tools |
| KEEP | Wounds Remaining | `5fd19f` | BlockSquare | 1,968 | 0 | activation / wound tracker token cloned by Spawn game tools |
| KEEP | Wounds Remaining | `ad63ba` | BlockSquare | 1,968 | 0 | activation / wound tracker token cloned by Spawn game tools |
| UNSURE | (no nickname) | `138b05` | go_game_piece_black | 0 | 0 | unscripted go piece hidden under the table at x=68; purpose unknown |
| UNSURE | (no nickname) | `6f0823` | go_game_piece_black | 0 | 0 | unscripted go piece hidden under the table at x=68; purpose unknown |
| UNSURE | Army Placer | `8b7aa6` | BlockSquare | 4,358 | 0 | Army Placer: moves a staged army onto the table for Red/Blue; generic but untested here |
| UNSURE | Battle Shocked | `3f45f1` | Custom_Model_Infinite_Bag | 0 | 2 | infinite bag of 'Battle-shocked' tokens (40k rule name; harmless) |
| UNSURE | Battle Shocked | `e51f0c` | Custom_Model_Infinite_Bag | 0 | 2 | infinite bag of 'Battle-shocked' tokens (40k rule name; harmless) |
| UNSURE | Blue Lethal Hit Zone | `71ab21` | Custom_Tile | 0 | 0 | lethal-hit parking zone used by the dice mat's 40k sustained/lethal hits feature; mat kept intact |
| UNSURE | Center Objective | `3c9b57` | Custom_Model | 0 | 6 | objective marker template used by the kept objectives manager; 40k-styled 'Center Objective' model |
| UNSURE | Expansion Objective | `7fd7df` | Custom_Model | 0 | 6 | objective marker template used by the kept objectives manager; 40k-styled 'Expansion Objective' model |
| UNSURE | Home Objective | `e6b8fb` | Custom_Model | 0 | 6 | objective marker template used by the kept objectives manager; 40k-styled 'Home Objective' model |
| UNSURE | Interactive Buttons - Area Denial | `8c71ab` | Custom_Token | 2,225 | 0 | draws 3"/6" circles from the table centre (named for the 40k Area Denial secondary) - generic measurement geometry |
| UNSURE | Interactive Buttons - Show Objectives | `15d652` | Custom_Token | 2,343 | 0 | toggles the objectives manager (placeObjectives) which uses the 40k marker templates |
| UNSURE | Interactive Buttons - Strat Reserves | `7b7ab8` | Custom_Token | 3,029 | 0 | draws lines 6" from each edge (40k strategic reserves) - generic measurement geometry |
| UNSURE | Legacy Tokens (Blue) by Trashpanda | `10a26a` | Bag | 16,208 | 79 | memory bag engine is generic; contents are 40k status tokens - TC-017 replaces contents |
| UNSURE | Legacy Tokens (Red) by Trashpanda | `7aca71` | Bag | 16,208 | 85 | memory bag engine is generic; contents are 40k status tokens (Stealth, Fell Back, cover) - TC-017 replaces contents |
| UNSURE | Map Creator Filter | `369707` | BlockSquare | 23,109 | 0 | was the map-creator filter + Battlemaster mat randomizer + Table Theme swatches; rewritten to keep only the theme swatches (the only UI for table themes) |
| UNSURE | Mission & Utility Tokens Red | `3f26fa` | Bag | 36,861 | 87 | 'Mission & Utility Tokens' memory bag: engine generic, contents are 40k mission tokens (Battle-shocked, Sensor Sweep...) |
| UNSURE | Mission & Utility Tokens Red | `58d30b` | Bag | 36,861 | 87 | 'Mission & Utility Tokens' memory bag: engine generic, contents are 40k mission tokens |
| UNSURE | Objective Secured Blue | `04d13e` | Custom_Model_Infinite_Bag | 0 | 2 | infinite bag of 'Objective Secured' tokens (40k rule name; harmless) |
| UNSURE | Objective Secured Red | `e87880` | Custom_Model_Infinite_Bag | 0 | 2 | infinite bag of 'Objective Secured' tokens (40k rule name; harmless) |
| UNSURE | Red Lethal Hit Zone | `7ac8ba` | Custom_Tile | 0 | 0 | lethal-hit parking zone used by the dice mat's 40k sustained/lethal hits feature; mat kept intact |
| UNSURE | Start Menu | `738804` | BlockRectangle | 252,625 | 0 | Start Menu is the whole game controller; kept with its mission/disposition/Battlemaster/restore-point code removed (see STRIP-LOG). Sizes, mat themes, deploy-zone overlays, turn/phase HUD, territory line, terrain pass-through remain |
| UNSURE | Tokens by Mothmy Titania (Blue) | `9d6b2f` | Bag | 16,208 | 289 | memory bag engine is generic; 289 nested Mothmy tokens, mixed generic/40k - TC-017 curates |
| UNSURE | Tokens by Mothmy Titania (Red) | `446a11` | Bag | 16,208 | 289 | memory bag engine is generic; 289 nested Mothmy tokens, mixed generic/40k - TC-017 curates |
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
| ADDED | Warband Importer | `b91983` | Custom_Tile | 17,742 | 0 | TC-016: code entry, `WebRequest` fetch of `/api/tts/warband/{code}`, spawn of bound models, Bind mode, re-import; see below |


## global.lua (128,527 bytes, 151 functions) by system

| System | Class | Functions |
|---|---|---|
| HUD (overlay panels, preferences, minimalist mode, splash) | KEEP | `setHudAttribute`, `setHudValue`, `getDefaultHudSettings`, `ensureHudSettings`, `getHudColorFromCallback`, `setHudAttributeForColor`, `applyMinimalistForColor`, `hudToggleMinimalist`, `applyHudPreferencesForColor`, `applyHudPreferences`, `hudToggleHelp`, `hudCloseHelp`, `hudToggleClock`, `toggleHudOverlayForColor`, `hudHideOverlay`, `updateSplashOverlay`, `announceVersion`, `patchNumber` |
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
| Dice hotkeys | UNSURE, kept | `onScriptingButtonDown` calls the dice mat's `changeSustainedHitsThreshold` (40k sustained hits); the mat is kept intact, see below. |
| Misc | KEEP | `destroyObjectByGUID` |

Data in global.lua: the GUID constant block (KEEP, minus mission/CP/zone constants),
`missionPackData`, `missionMatchups`, the secondary zone/label GUID tables, `MAP_INDEX`
(per-map creator metadata), the primary/deployment card GUID comment block (all STRIP),
`teamModels`, `nonPlaying`, `allowMenu`/`allowAutoSeat`, `*DiceSpawnTime`, version /
changelog constants (KEEP).

## XmlUI (110,218 bytes) by panel

| Panel id | System | Class |
|---|---|---|
| `redirect` | "please wait" redirect warning; its `closeRedir` handler never existed in LCT; inactive | UNSURE, kept |
| `main` | splash + seat picker (Red / Spectator / Blue), patch notes | KEEP (retitled) |
| `bubbleOverlay_Red` / `bubbleOverlay_Blue` | aura/bubble size input | KEEP |
| `DebugTools` | shared debug panel (DEBUG builds only): diagnostics, custom mat URL | KEEP; its "Battlemaster cache" section STRIP |
| `RedHud_VPScores` / `BlueHud_VPScores` / `GreyHud_VPScores` | per-colour HUD: controls column, ROUND badge, per-player Turn readout, phase strip, clock | KEEP; inside it `*_LockBtn` (open scoreboard), `*_DispBadge*` + `*_DispSpacer*` (disposition glyph), `*_VPWatch*`, `*_CPWatch*`, `*_Row3` (Scoreboard / Gain CP / Use CP) STRIP; `*_PhaseRow*` (40k phases) UNSURE kept |
| `*_HelpOverlay` | help overlay (background + close) | KEEP |
| `RedHud_ScoringOverlay` / `Blue...` / `Grey...` | 40k scoreboard (PRI/SEC per round, active/discard/remaining secondaries) | STRIP |

## Per-object scripts worth knowing

- **Start Menu `738804`** (252 KB, 6,090 lines) - size changer, deploy-zone manager,
  objectives manager, mission manager, game manager. Subsystems: sizes/modes and mat themes
  (KEEP); deploy-zone data and overlay drawing primitives (UNSURE kept - 40k zone geometry,
  generic drawing); objectives manager (UNSURE kept); dispositions, mission generation,
  deployment/primary/layout cards, Combat Patrol dealing, restore point ("Back to
  Selection"), Battlemaster mat reskins and map-card loading, mission-pack selection,
  secondary lock-in at game start, CP on turn pass (all STRIP); turn/phase/round HUD, chess
  clock sync, territory line, 9" lines, terrain pass-through (KEEP).
- **Map Creator Filter `369707`** - creator filter + Battlemaster mat randomizer (STRIP) and
  the Table Theme swatches (KEEP); rewritten to only the swatches.
- **Custom Dice Table `acae21` / `839fcc`** (138 KB each, identical) - the dice engine,
  save/restore positions, bubbles, coherency, engagement range, measurement circles,
  hotkeys. Contains 40k sustained/lethal-hits handling and the "Lethal Hit Zone" tiles; left
  intact (UNSURE) because surgery there is a refactor of working code. Only the "Show
  Scoreboard" hotkey was removed.
- **Game Rounds `ee92cf`**, **Red/Blue Turns `055302`/`7e4111`** - counters that push to the
  HUD and tell the Start Menu when a round starts (KEEP; the rounds token no longer looks up
  the score sheet).
- **Mission Manager `cff35b`/`471de1`**, **10e Score Sheet `06d627`**, **Command Points
  `e446f7`/`deb9f2`**, **Gain CP `af8032`/`5e882b`**, **WH Stats Helper `7c7c20`/`b7ac7a`**
  - STRIP, see the table.
- Token bags (`7aca71`, `10a26a`, `446a11`, `9d6b2f`, `3f26fa`, `58d30b`, `5549a7`) share
  the memory-bag script family (place / recall / setup). Engine KEEP; `5549a7` ("40K items")
  STRIP; the others UNSURE on content only.

## Added: Warband Importer `b91983` (TC-016)

A locked 12"x12" Custom_Tile at (-22, 1, 0), left of the mat between the two hand zones,
with a flat XML panel (`mod/ui/b91983.xml`): API base URL and code fields, a "Use my
colour" toggle with a colour cycle button, Import and Bind buttons, a status line and a
30-row member list. `mod/state/b91983.json` persists the base URL, code and colour choice
through `onSave`/`onLoad`.

`mod/scripts/b91983.lua` is split in two. Above the `TTS glue` line nothing touches a TTS
global, so `mod/test/importer_test.lua` runs it under plain Lua (`pnpm mod:test`):

- `validatePayload` accepts only `version == "tc-warband-export-v1"` payloads with a code,
  a warband and members with ids (`packages/rules/src/export.ts` is the contract).
- `buildSpawnSpecs` turns the payload into one object-state table per member, laid out by
  `gridPosition` on the colour's anchor (`ANCHORS`: Red starts at (13.75, 44) and grows +x
  then +z, Blue at (26.25, -44) mirrored, six per row 2.5" apart; any other colour gets a
  grid 8" in front of the tile). Each state mirrors a Gannel's Model Corner miniature
  (3700111403, Lieutenant `15e05f`): a base `Custom_Model` (TypeIndex 1, the candidate's
  `base` mesh/collider, `ColorDiffuse` tinted 60% from Gannel's dark grey toward the player
  colour) with the figure parts as `ChildObjects` carrying their own `CustomMesh` (Gannel's)
  or `CustomAssetbundle` (Scripted Table) and child `Transform`. Nickname is the display
  name, Description and GMNotes are the payload's prebuilt `ttsDescription` / `ttsGmNotes`,
  Tags are `tc-warband:<code>`, `tc-member:<id>`, `tc-spawned`. A member with `model ==
  null` gets Gannel's bare 32mm base with the same binding.
- `mergeTags` / `memberTags` / `memberIdFromTags` keep foreign tags and replace the
  importer's own.

The glue: `onImport` checks `getObjectsWithTag("tc-warband:<code>")`; if the code is already
on the table it shows a confirm row, and Replace deletes the `tc-spawned` objects while
`tc-bound` ones (the player's own models) are kept and re-bound from the fresh payload. The
fetch is `WebRequest.get(base .. "/api/tts/warband/" .. code)`, decoded with `JSON.decode`
and spawned with `spawnObjectData`. Bind mode arms the clicking player's colour on the
selected member; `onObjectPickUp(colour, object)`, which fires in object scripts for any
object a player grabs (the moment ForceOrg's importer also binds on, via `onPlayerAction`),
copies the member's name, description, GM notes and tags onto that object and deletes the
member's spawned default. Nothing in the glue has been run in TTS yet (`mod/TESTING.md`
step 8).
