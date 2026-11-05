# Testing the stripped table in Tabletop Simulator

Nothing in this directory has been loaded in TTS yet. The build was validated offline only
(syntax, GUID cross-references, pack/unpack round-trip), so this walkthrough is the sign-off.
Expect to tune two HUD numbers (step 6) and possibly the Table Theme panel position (step 4).

## 0. Build and install

```
pnpm mod:build      # writes mod/build/trench-crusade.json (about 2.9 MB)
pnpm mod:install    # copies it to ~/Library/Tabletop Simulator/Saves/TrenchCrusade-dev.json
```

Start TTS, create a single-player game, then **Games > Save & Load > TrenchCrusade-dev**.

## 1. Load

- The save loads with no red error lines in the chat/console. Open the console (`~`) and
  check for `error` / `attempt to index a nil value`. Any script error here is a defect in the
  strip; copy the line verbatim.
- Chat shows `Trench Crusade Table (dev) - LCT base 1.12.1` after ~3 s.
- The splash panel ("TRENCH CRUSADE TABLE", patch notes with two bullets, Red / Spectator /
  Blue buttons) is up. Pick **Red**.
- The table surface has no mission-matrix bags, no card decks, no PDFs on the shelf, no link
  tiles at the top-right edge, no "Reinforcements and Reserves" boards behind the hand zones.
- Notebook tabs: "Gaming instructions" (rewritten) and "Credits" (upstream attribution, kept).

## 2. Start menu (the object at x≈52 behind the Red side)

- Six game-mode buttons under a "GAME MODES" header: 1v1, Solo, Combat Patrol, Onslaught,
  Colosseum, Boarding Action. The grey "START GAME" button above them is disabled until a
  mode is chosen.
- Click **1v1**: the mat rescales to 44"x60", the deployment picker row appears (`<-` name
  `->`), **Clear Table** sits left of it, and the Table Theme panel (step 4) appears.
- There must be **no** disposition selectors, no "Generate Missions", no "Random Single
  Layout", no "SET MISSIONS", no "Back to Selection" button. If any of those render, the
  strip missed a menu writer.
- Cycle the deployment picker: an overlay (lines/circles) draws for each zone; "No
  Deployment Zone" draws nothing. The zone names are still the 40k ones (Hammer and Anvil,
  Dawn of War...) - that data was kept deliberately, see STRIP-LOG.

## 3. Start a game, turns and HUD

- Toggle "Red player first", press **START GAME** (needs a deployment zone selected). Chat
  prints `Command Phase` and `It's Blue Player's turn`. The deployment overlay disappears.
- The HUD at the top right now has: `?` help, clock toggle, `-` minimalist; a ROUND badge;
  two rows (Blue, Red) each with Turn N, five phase glyphs, the chess-clock readout and its
  +/-/play/pause controls; an `X` hide button. There is **no** VP, CP, disposition badge,
  star/"Show scoring" button, or Scoreboard / Gain CP / Use CP row.
- Click the ROUND badge or the on-table "Pass Turn" button: the turn flips, the Turn counter
  tokens at x≈51 increment, chat prints `Round R, <Colour> Turn T` with **no** CP message.
- Round counter: when the Blue and Red turn counters both pass a value the Game Rounds token
  increments and the ROUND badge follows.
- Spectator (Grey) HUD: switch to Grey; the panel shows the same minus the pass/phase
  buttons' effect.

## 4. Table theme

- During setup (after choosing a mode, before START GAME) a "Table Theme" panel with 12
  swatches floats near the deployment picker. Clicking a swatch changes the mat image and
  highlights the swatch. If the panel is off-centre or overlapping the picker, adjust the
  anchor object `369707` position in `mod/save.json` (it used to sit left of a wider panel).
- After START GAME the panel disappears.

## 5. Engine features that must still work (all unchanged from LCT)

- **Dice mats** (red/blue boards either side of centre): spawn 1/2/3/4/5/10/25 dice, roll
  all, select/delete by face, clear mat, d3, the "123" custom bubble button opens the
  bubble-size overlay (type 12, OK: a 12" bubble appears on the selected model).
- **Hotkeys** (Options > Game Keys): Save Position / Restore Position, Custom Bubble,
  Coherency Check, Engagement Range, Roll All Dice, 1/2 inch gap arrangement, Clear
  Bubbles/Lines/Mat, Show/Hide UI, the 1/2/3/6/8/9/12 inch measurement circles. "Show
  Scoreboard" must be **gone** from the list.
- **Dice rollers** (the bowls next to the mats) print results in chat.
- **Trash bins** (vortices) destroy dropped objects; the counters beside them count.
- **Token bags**: both Mothmy bags and both Legacy bags "Place" and "Recall" their tokens;
  infinite bags (Action, Objective, Hidden, Marked, +1/-1, Reroll, Battle-shocked, banners,
  d6/d3) dispense.
- **Trackers**: "Spawn game tools" (x≈80, hidden under the Red edge) spawns Squad
  activation / Wounds trackers; HIDE ARMY moves selected models into the hidden zone.
- **LOS markers**, **selection highlighters** (select a model: a ring appears), **stopwatch**
  (chess clock on the HUD counts down, play/pause per side).
- **Interactive buttons** (six tokens at x≈45): Table Quarters, Strat Reserves lines, Area
  Denial circles, Deployment Zone toggle, Territory Line, Show Objectives (places the kept
  objective markers on objects tagged `obj_*`; with no tagged terrain it prints
  `0 objective(s) placed`).
- **Flex Table Control** (x≈81,z≈-94) resizes the table surface; **Mat url** sets a mat
  image; **Extract terrain** / **Advanced Features** (terrain collider toggle) respond.
- **Auto-seat**: save the game mid-match, reload, both colours are re-seated.

## 6. Things to tune (expected)

- `HUD_FULL` in `mod/scripts/global.lua` (height 155 / controls 143) was derived from the
  spectator panel after removing the CP row; if the Red/Blue panels clip the clock steppers
  or leave a gap, change those two numbers (and the matching `height="155"` /
  `preferredHeight="143"` in `mod/ui/global.xml`).
- Minimalist mode (`-`): the phase strips hide and the panel narrows to 804; the height no
  longer changes.

## 7. Save

Save the table under a new name and reload it: no errors, the chosen mode/size/theme
persists, the HUD state persists. Then `trash` the test save; `TrenchCrusade-dev.json` is
regenerated by `pnpm mod:install`.

## 8. Warband import (TC-016, object `b91983`)

Offline first: `pnpm mod:test` runs `mod/test/importer_test.lua` (the spawn specs the
importer builds from `mod/fixtures/warband-new-antioch.json`) and `luac -p` over every
script. The in-TTS half below has not been run yet; everything in it is unverified.

Start the API from the repo before loading the table. Until the roster tool (TC-010) exists,
`pnpm mod:serve` serves the fixtures at `http://127.0.0.1:3001/api/tts/warband/<code>`; the
only code is `NA-TEST-01` (the New Antioch starting warband: Lieutenant, 4 Yeomen,
Shocktrooper). Once the roster tool ships, run it instead and use a code it hands out; the
URL shape is the same. TTS's `WebRequest` reaches localhost without any allow-list.

- The **Warband Importer** tile (dark 12"x12" tile at x≈-22, z≈0, left of the mat between
  the two hand zones) carries a flat panel: title, **API** field (`http://127.0.0.1:3001`),
  **Code** field, **Use my colour** toggle with a **Colour: Red** cycle button that appears
  when the toggle is off, **Import** and **Bind** buttons, a status line, and an empty member
  list. If the panel renders off the tile, too small, or upside down for the seat in front of
  it, tune `position` / `rotation` / `width` / `height` on the root `<Panel>` in
  `mod/ui/b91983.xml`; the Lua does not depend on them.
- Seated as **Red**, type `NA-TEST-01`, press **Import**. Status goes `Fetching
  http://127.0.0.1:3001/api/tts/warband/NA-TEST-01`, then `Test warband: spawned 6 model(s)
  for Red.` The server's terminal logs one `GET ... 200`. Six models drop onto the Red side
  behind the Red dice mat: a row of six at z≈44, x from 13.75 to 26.25 (2.5" apart), facing
  -z, bases tinted toward red. Hover one: the tooltip shows the Lieutenant's description
  (`Lieutenant` header, `Mov 6"/Infantry  Rng +2  Mel +2  Arm -1  Base 32mm`, keywords,
  equipment, abilities); the GM Notes field (right-click > GM Notes) carries the full rule
  text. Every model carries the tags `tc-warband:NA-TEST-01`, `tc-member:m<n>` and
  `tc-spawned` (right-click > Tags).
- The model list fills with `1. Lieutenant  [default model]` ... `6. Shocktrooper  [default
  model]`. The figures are Gannel's Model Corner meshes attached to a Gannel's 32mm base; a
  member whose unit has no entry in `data/tts/models.json` reads `[plain base]` and spawns the
  bare base with the same name, description and tags.
- **Bind**: click `2. Yeoman` in the list (it highlights gold), press **Bind** (status:
  `Red: pick up the model that becomes Yeoman (Bind again to cancel).`), then pick up any
  other object - a model pulled from a bag, or a die for the smoke test. Its name,
  description, GM notes and tags become the Yeoman's (`tc-bound` instead of `tc-spawned`),
  the spawned default Yeoman for that member is deleted, and status reads `Bound Yeoman to
  <its old name> (default model removed).` Pressing Bind a second time before picking anything
  up cancels. Picking up the importer tile itself never binds.
- **Re-import**: press **Import** again with the same code. A confirm row appears:
  `NA-TEST-01 is already on the table: replace 5 spawned model(s) and re-bind 1 of your own?`
  **Cancel** leaves the table alone. **Replace** deletes the five spawned models, keeps the
  object you bound (its text is refreshed from the new payload), fetches again and spawns
  only the five members without a bound model: `Test warband: spawned 5 model(s) for Red,
  re-bound 1 of your own.`
- Switch to **Blue**, import again (confirm Replace or use a second code): Blue's models land
  mirrored on the Blue side (z≈-44, facing +z, blue-tinted bases). Any other colour, or a
  spectator importing with "Use my colour" on, gets a grid in front of the importer tile. With
  the toggle off, the Colour button chooses the seat the grid and tint use regardless of who
  clicks.
- Errors to provoke: stop the server and Import (`Request failed: ...`); a wrong code
  (`HTTP 404 for XYZ`); edit the API field to a page that is not JSON (`Response is not JSON.`
  or `Rejected: unsupported export version ...`). None of these spawn anything.
- Save and reload: the API field and code persist (object script state); the member list does
  not (re-import to repopulate it).

## Reporting

Record every error line and every item above that did not behave, with the object GUID
where it is visible (hover the object with the Gizmo tool). Those become TC-013 follow-ups;
TC-014 then ports the Trench Crusade content on top of a signed-off engine. Step 8 findings
are TC-016 follow-ups.
