# Roster tool: manual click-through

The API, the reducer and the availability filtering are covered by vitest; this is the browser
pass that nothing automated runs. Do it in Chrome with DevTools open on the **Console** and
**Network** tabs the whole way through: a page that looks right while a request 500s is a fail.

## 0. Start

```
pnpm install
pnpm dev            # api on http://127.0.0.1:3001, web on http://localhost:5173
```

The api binds 127.0.0.1:3001, the address the TTS mod fetches from. If `pnpm mod:serve` (the
fixture server) is still running it holds that port and the api exits with
`tc-api: 127.0.0.1:3001 is already taken`; stop the fixture server first, or run the api
elsewhere with `PORT=3002 pnpm --filter @tc/api dev` and `API_URL=http://127.0.0.1:3002
pnpm --filter @tc/web dev`.

The api line should print `rules: .../data/rules (130 units, 225 items)` and
`db: .../apps/api/data/roster.sqlite`. Open http://localhost:5173.

- Network: `GET /api/rules` is 200, `content-encoding: gzip`, about 200 KB on the wire.
- Console: no red lines. (A Vite "new dependencies optimized" reload is fine.)

## 1. Home, empty

- Heading "Warbands", button "New warband", "No warbands saved from this browser yet", an
  "Open by code" box. No draft banner.

## 2. New warband

- **New warband**. Name "The Fifth Lantern". Faction: six listed, and neither Heretic Naval
  Raiders nor Procession of the Sacred Affliction is among them. Pick **New Antioch**: no
  Subfaction select appears; the Variant select fills with six variants; Patron offers Temporal
  Lord, Warrior Saint, Learned Saint and nothing else. Pick Court of the Seven-Headed Serpent: Variant reads "No variants"
  and is disabled; Patron offers Infernal Noble and Mammon. Back to **New Antioch**, Variant
  none, Patron **Temporal Lord**, Game 1.
- **Start building**. URL is `/w/draft/barracks`.

## 2b. Subfactions are chosen under their faction

- Pick **Heretic Legion**: a **Subfaction** select appears between Faction and Variant, reading
  "None (core list)", with **Heretic Naval Raiders** as its only other option. Variant offers
  Knights of Avarice and Trench Ghosts (no "Heretic Naval Raiders"); Patron offers Infernal Noble
  and Mammon.
- Pick Variant **Trench Ghosts**, then Subfaction **Heretic Naval Raiders**: the Variant resets to
  "None (standard list)" and now offers **The Drowned Choir** and **The Leviathan Shoal** only;
  Patron is unchanged (a subfaction takes its faction's patrons). Back to "None (core list)": the
  Heretic Legion variants return.
- Pick **Trench Pilgrims**: the Subfaction select offers **Procession of the Sacred Affliction**.
  Pick **Court of the Seven-Headed Serpent** or **Black Grail**: no Subfaction select.
- Make a throwaway warband: Heretic Legion, **Heretic Naval Raiders**, Variant **The Leviathan
  Shoal**, Patron Infernal Noble, **Start building**. Header meta reads "HERETIC LEGION · HERETIC
  NAVAL RAIDERS · THE LEVIATHAN SHOAL · INFERNAL NOBLE · GAME 1". The Barracks Recruit list shows
  Heretic Captain, Heretic Raider, Anointed Heretic Raider ("0 of 0–4" under the Shoal), Abyssal
  Commando, Heretic Captain "0 of 1", Heretic Raider "0 of any" and the Fallen mercenaries (Goetic
  Warlock, Scripture Guardian, Sin Eater); Drowned Chorister, Sea Hag and Wretched read "0 of 0"
  (the Shoal bars them); **no** Heretic Priest or Heretic Trooper. Buy a Heretic Captain, Confirm, open the
  Armoury: a Submachine Gun is offered at 25d. The Warband screen's locked facts show **Subfaction
  Heretic Naval Raiders**. Save it: the TTS URL's JSON has
  `"subfaction": {"id": "heretic-naval-raiders", "name": "Heretic Naval Raiders"}` next to
  `"faction"`. Forget it on Home before going on.

## 3. The shell (every warband screen)

- Header: the name in brass as an editable field, "NEW ANTIOCH · TEMPORAL LORD · GAME 1"
  under it, totals **0 / 700 ducats** and **0 glory of 0**, a red **1 error** badge, "Draft"
  and a **Save and get code** button. Below it the tabs **Warband · Barracks · Armoury**, each
  with its glyph before the label: a banner on a pole (Warband), a tent (Barracks), crossed
  swords (Armoury). Barracks is lit.
- Edit the name in the header: the change shows on every screen (it is the one field that is
  never locked).
- **Icon actions.** Every action that is not a purchase is a round 32px glyph with no text:
  crossed swords **Equip**, a door and arrow **Dismiss**, a minus in a circle **Remove**, a
  curved arrow **Undo** and **Keep**, × **Close**, an open book **Rules**, two sheets **Copy**,
  a tent **Barracks**, a bag **Shop for kit**, a chevron **Details**. An icon that takes you to a
  screen wears that screen's tab glyph: Equip the Armoury's crossed swords, Recruit in the
  Barracks and the Armoury's Barracks link the Barracks tent. At rest they are quiet (Equip, Barracks and Shop
  in soft brass; Dismiss and Remove in a muted oxblood); hovered or focused they fill, Dismiss and
  Remove turning blood red. Hover one, or Tab to it: a small bubble above it shows its name, and
  Tab draws a brass ring around it. In this script a bold action name means that icon. Chrome
  DevTools → Accessibility: each one's name is the bubble's word plus what it acts on ("Dismiss
  Yeoman", "Remove Bolt-Action Rifle", "Rules for Tough"). Price buttons are unchanged.

## 4. Barracks (recruiting is staged)

- Left "Roster · 0 models": "No models yet. Recruit from the list on the right."
- Right "Recruit": **Units** then **Mercenaries**. Each row is the unit's name (serif), one quiet
  line with its stat line and a count chip ("0 of 1" for the Lieutenant, "0 of 0–5" for the
  Shocktrooper, nothing for the unlimited Yeoman until one is recruited, then "×1"), and on the
  right a **price button**: a crown and the ducat price ("👑 70" drawn as a brass crown, not an
  emoji). There is no "Add" anywhere. Glory-priced mercenaries show a pale-blue sun instead,
  dimmed: hover says "Short 7 glory" (a game-1 warband has no glory). **Not listed anywhere**: Crimson Communicant (Red Brigade only),
  Homunculus (Book of Golems), Disciple of St. Roch (third-party mercenaries), Trench Dog (needs
  Dog Food). No row carries "needs …" or "not checked" text. At the bottom of the panel one
  quiet line: **"2 options hidden by campaign rules we can't check yet"**. No row ever reads "0 of 0": a unit whose limit
  is 0 for this roster is left out like any other unavailable option (check with a Heretic Naval
  Raiders warband under **The Leviathan Shoal**: no Sea Hag; without the variant the Sea Hag reads
  "0 of 0–1").
- Hover the Lieutenant's price (or Tab to it): it lifts a pixel and a small bubble shows the purse
  after buying, "→ 👑 70/700". Press it: the button gives a brief brass pulse and a roster row
  appears with a brass outline and a **PENDING** chip (unit name, Elite tag, empty "Custom name"
  field, "No equipment", its crown price, **Equip**, **Copy 👑 70**, **Undo**). The header's
  two coin readouts show **👑 70 / 700** and **☼ 0 / 0**, with a receipt line under them,
  "Pending · 1 line ……… 👑 +70", then **Discard changes** and **Confirm purchases (1)**; the
  badge still reads **Legal**. The Lieutenant's price is now dimmed with a dashed border; hover
  says "Limit reached 1/1" and pressing it does nothing (the Copy price on his row is dimmed the
  same way).
- Buy a Yeoman, then press **Copy** on the Yeoman row three times: four pending Yeoman rows,
  30 each. Buy a Shocktrooper. Header 👑 235 / 700, receipt "Pending · 6 lines … +235".
- Type a custom name on the first Yeoman with a space in it ("Old Tom"): the space is not
  eaten; the row keeps "Yeoman" as its title. Names are never staged.
- **Undo** one pending Yeoman: the row vanishes, Confirm purchases (5). Buy it back.
- **Confirm purchases (6)**: outlines and chips vanish, header **235 / 700**, "Unsaved changes",
  Confirm/Discard gone.
- **Dismiss** a confirmed Yeoman: the row stays, struck, with a red **LEAVING** chip and only
  **Keep** (no Equip, Copy or Dismiss); header 👑 205, receipt "Pending · 1 line … 👑 −30", Confirm purchases (1).
  **Keep**: back to normal. Dismiss it again and **Discard changes**: back to normal.
- Over the threshold: keep buying until the purse is within a unit's price of 700. Every price
  that would break 700 dims; hover one: "Over threshold by N" with the exact overshoot; pressing
  does nothing. Prices that still fit stay live. Nothing is struck through.
- **Dismiss** the Lieutenant: the badge turns red (**1 error**: at least 1 Lieutenant required)
  and **Confirm purchases** is disabled with "Fix the errors before confirming"; **Keep** him.

## 5. Armoury: the figure

- Click **Equip** on the Lieutenant row: URL `/w/draft/armoury?member=m1`, Armoury tab lit, the
  "Equipping" select shows "Lieutenant" (a pending recruit would read "… (pending recruit)" and
  can be equipped too). Left column: the Lieutenant panel (custom name field,
  stat line `Mov 6"/Infantry · Rng +2 · Mel +2 · Arm 0 · 32mm`, "Model total 70d"), then the
  **figure**: a brass silhouette with eight dashed slots laid over it: Head on top; Ranged /
  Torso / Melee on the first row; Ranged / Off-hand / Melee on the second; Grenades at the
  bottom. Every slot reads "empty". Below it the **Inventory** panel ("Nothing in the pack",
  **Shop for kit** at its top right). Right column: the hint "Click a slot on the figure to equip it…".
- Click the top **Melee** slot: the right column becomes the picker "Melee · Melee hands" with
  the hint "one 2-Handed or two 1-Handed Melee Weapons" and ledger rows: name and stat line on the
  left, a crown price button on the right. Press **Escape**: it closes. Click it again and press
  **Sword/Axe**'s price (👑 4): the slot fills, the item has a brass outline and a "PENDING" chip,
  the picker closes. Header 👑 74 / 700 with "Pending · 1 line … 👑 +4"; Save is no longer the
  brass button. The model total reads "👑 70 → 👑 74".
- Top **Ranged** → **Pistol** (👑 6). **Torso** → **Standard Armour** (👑 15). Receipt +25,
  Confirm purchases (3).
- Click the filled **Torso** slot: the picker shows Standard Armour with **Undo** and, under "Swap
  for", nothing buyable (one suit of armour); Standard Armour itself is not offered. Click
  **Undo**: the slot empties, receipt +10, Confirm (2). Put Standard Armour back.
- Swaps are priced net: on a Yeoman carrying a Bolt-Action Rifle, open its Ranged slot and hover
  the Automatic Rifle's price (👑 40): the bubble reads the purse after the swap, which is 35 more
  than now, not 40 (the rifle's 5 comes back). A row at its limit stays listed, dimmed, with its
  count ("2/2 in warband") and "Limit reached 2/2 in the warband" on hover.
- **Confirm purchases (3)**: the chips and outlines vanish, header reads **95 / 700**, "Saved"
  turns into "Unsaved changes" (the roster changed), the Confirm/Discard buttons are gone.
- Network: nothing was sent to `/api/warbands` by any of the above (pending purchases never
  leave the browser; only Save sends, and it sends the confirmed roster).

## 5b. Armoury: hands, shields and bayonets

- Select a Yeoman. Top **Ranged** → **Bolt-Action Rifle** (5d): the slot reads "Bolt-Action
  Rifle · both hands" and the second Ranged slot turns dotted with "Bolt-Action Rifle" in
  italics. Click that covered slot: the picker says "Taken by Bolt-Action Rifle (both hands)",
  then an **Attach** section with **Bayonet** (2d), then "Replace with" listing Pistol,
  Submachine Gun, Machine Gun… but not Bolt-Action Rifle itself. Press Escape.
- Open the filled top Ranged slot: the same Attach / "Swap for" split. Pick **Bayonet** under
  Attach: the rifle stays, "+ Bayonet" with a PENDING chip appears under it, and both **Melee**
  slots turn dotted with "Bayonet (fixed)". Click a Melee slot: "Taken by Bayonet (fixed
  bayonet)" and "Nothing fits here" (the bayonet is the model's 2-handed melee weapon).
- **Confirm purchases**. Header Legal. **Off-hand** → the list has no Trench Shield (a
  2-handed rifle cannot pair with a shield). Open the rifle slot, **Swap for** →
  **Submachine Gun** (30d): the SMG fills the slot with PENDING, the rifle appears struck with
  REMOVING under **Leaving** (Keep brings it back), and the bayonet drops to **No room** (no
  lug any more): remove it there. **Off-hand** → **Trench Shield** (10d) is now offered
  (Shield Combo): pick it. Header shows 1 warning and no error. Confirm purchases.
- **Grenades** → **Frag Grenades** (7d). Open Grenades again: "Swap for" lists Molotov
  Cocktail, Greek Fire… (one kind at a time, so swapping is the only way to a second kind).
  **Head** → **Combat Helmet** (5d); open Head again: "Nothing fits here".
- **Shop for kit** → press **Medikit**'s price (👑 5): it lists under Inventory with a PENDING
  chip and **Undo**. Confirm purchases.
- Put **Mountaineer Kit** (👑 3) in the inventory of four Yeomen (confirming each; on the fourth
  the row read "3/4 in warband"). On a fifth model it is still listed, dimmed: "4/4 in warband",
  hover "Limit reached 4/4 in the warband", and pressing it does nothing.

## 5c. Staging survives, and errors block Confirm

- Stage a purchase and reload the page: the PENDING chip is still there and the header still
  shows the → delta (pending purchases are kept in this browser, per warband). **Discard
  changes**: everything pending vanishes and the totals return.
- Neither the pickers nor the price buttons will stage anything that breaks a model's battlekit,
  passes the threshold or a limit, so the errors that block Confirm come from removals: in the
  Barracks, dismiss the Lieutenant. The badge reads **1 error** and **Confirm purchases** is disabled with "Fix the errors before
  confirming". Keep him: Confirm re-enables. Discard changes.
- With purchases pending, **Save** (or "Save changes") still works and sends only the
  confirmed roster: Network → `PUT /api/warbands/…` body has no pending items; after the save
  the PENDING chips are still on the figure.

## 5d. Skills & abilities, built-in kit, and item descriptions

- With no slot open, the right-hand column shows **Skills & abilities** above the hint. For the
  Lieutenant: **Abilities** Hold Your Fire!, Tough, Leader, each with its rule text on hover and
  **Rules** beside its name: press it and the text opens below (the book stays brass while open);
  press again to close. No Remove or Undo anywhere in the panel. Open any
  slot: the picker replaces the panel; Escape brings it back.
- Descriptions match the picker: in the Ranged picker the Submachine Gun row reads
  `16" · 2H · ASSAULT` under its name and shows "Quick Bursts…" on hover. Pick it: the slot on the
  figure shows the same name and the same `16" · 2H · ASSAULT` line, with the same hover. Open the
  filled slot: the current row shows the same lines plus **Rules** beside the name for the full
  text. A bayonet under a rifle and anything in the Inventory read the same way.
- Built-in kit (Black Grail; any Black Grail warband will do): recruit a **Sin Eater** and confirm.
  Its Head reads "Combat Helmet", its Torso "Reinforced Armour", its Melee slot "Tenderizer
  Maul", each with "built in", a small lock next to the slot name, and an oxblood border and fill
  that read clearly apart from a pending item's brass and from a removal's red. Click either: the picker shows the item with **built in** where Remove would be, the
  line "Built-in kit: always carried. It cannot be removed or swapped.", and no Swap list. The Skills & abilities panel lists all three under **Built-in kit** with where they
  sit, each in the same oxblood with the lock: Combat Helmet "Head", Reinforced Armour "Torso",
  Tenderizer Maul "Melee hands". The Inventory panel does **not** list the Combat Helmet.
- Profile kit: recruit a **Witchburner** (New Antioch mercenary). Built-in kit lists Combat Helmet
  ("Head"), Reinforced Armour ("Torso") and **Gavel of Justice** marked "Profile" (printed on the
  unit card, not bought). On the figure the Gavel sits locked in a Melee hand; buy a Great
  Sword/Axe and the sword takes both hands while the Gavel stays listed in the panel only (card kit
  never pushes a purchase aside). A Court **Hell Knight** shows its Infernal Iron Armour locked on
  the Torso. **Dignified Conduct** and **Divine Judgement** are card *abilities*, so
  they are under Abilities. A Court **Hunter of the Left-Hand Path** shows its spells under
  Abilities with their cost ("Spell (Cost 3): …" on expand).
- Built-in kit is required: import or hand-edit a roster whose Sin Eater lacks its Tenderizer Maul
  (or remove it via a stale pending removal): the badge shows an error "Sin Eater must carry
  Tenderizer Maul: it is part of the unit's kit", and Confirm is blocked while it is staged.
- TTS: save a warband with a Witchburner and open its TTS URL: the Witchburner's `equipment` lists
  Combat Helmet and Reinforced Armour with `"builtIn": true`, then
  `{"id": "profile/gavel-of-justice", …, "builtIn": true}`; its `abilities` end with Dignified
  Conduct and Divine Judgement; `ttsDescription` names the Gavel. Bought kit has no `builtIn` key.
- Headgear: in a Trench Pilgrims warband, give a **Huscarl** its Combat Helmet (a free purchase,
  not built in) through Head. Open Head again: "Swap for" offers the Iron Capirote, as a swap only;
  nothing lets it wear both. An imported roster carrying both shows **1 error**, "Huscarl: one
  piece of Headgear (has 2)". A Yeoman with one bought Combat Helmet stays Legal, unlocked.
- Mandatory upgrade: in a **The Red Brigade** warband, recruit a **Crimson Communicant**. It
  arrives with the **Atonement Bell**: the panel lists it under **Skills & upgrades** (pending
  until you confirm the recruit), the Inventory's Upgrades list does not, and nothing offers to
  remove it.
- Purchases are unchanged: a bought Medikit in the Inventory still has Remove; a bought rifle's
  slot still offers Remove and Swap.
- Warband screen: each roster row has a compact line under its kit, e.g. "ABILITIES: Hold Your
  Fire!, Tough, Leader", and for the Sin Eater "BUILT IN: Combat Helmet, Reinforced Armour,
  Tenderizer Maul". Hover a name for its rules. On that screen the kit line lists only purchases.

## 5e. The Anchorite Shrine (Trench Pilgrims, Warbands p59, p63-64)

- **Core list.** New Trench Pilgrims warband, no variant. Barracks: buy an **Anchorite Shrine**
  (👑 140, "0 of 1"). It arrives with its **Catherine Wheel**. Armoury: the wheel sits in a
  Melee hand, oxblood with the lock, "built in"; the card's **Bonebreaker Mace** sits locked in
  the other Melee hand. The stat line reads `Rng n/a`. Click the wheel: the read-only picker,
  "Built-in kit: always carried. It cannot be removed or swapped." Even while the Shrine is a
  pending recruit nothing replaces it (the swap is a Methodius rule). Nothing else is for sale:
  the Shrine "cannot have any other Battlekit". A second Shrine's price is dimmed, "Limit
  reached 1/1".
- **War Pilgrimage of Saint Methodius.** New warband with that variant. The Barracks Shrine row
  reads "0 of 0–2" and its stat line `Rng +0`. Buy a Shrine and, **before confirming**, open the
  Armoury: the wheel's slot says "built in · swap while recruiting". Click it: the picker reads
  "Built-in, but while recruiting it may be replaced (p64)" and lists **Replace the Catherine
  Wheel with**: Anti-Materiel Rifle 👑 40, Autocannon 👑 55, Gas Censer 👑 50, Heavy Flamethrower
  👑 45, Punt Gun 👑 10, Trench Mortar 👑 40. Press Autocannon's price: the wheel goes to
  "Leaving", the Autocannon sits in a Ranged hand marked "1H" with PENDING; the receipt reads
  +55. **Undo** the Autocannon: the wheel comes back. Buy it again and **Confirm purchases**:
  the Autocannon is now locked, "built in", and its slot's picker is read-only. A Shrine bought
  and confirmed with its wheel can never swap it afterwards.
- **Anchorite Battlekit** (Methodius only): **Shop for kit** lists Gas Filters 👑 5, Grand
  Anchorite 👑 15, Hallowed Anchorite 👑 10, Holy Diesel Engine 👑 10, Piston Legs 👑 10, Sacred
  Geometry 👑 10, Wrathful Cherub Face 👑 20. Buy two: every other fitting dims, hover "Limit
  reached 2/2 Anchorite Battlekit". A staged fitting has Undo; after **Confirm purchases** it
  shows oxblood with the lock and "permanent", and no Remove.
- Two Shrines: under Methodius the second Shrine is buyable (Legal, "2 of 0–2"). Grand Anchorite
  on both: the second one's price dims ("Limit reached 1/1 in the warband").
- **Broken on the Wheel.** Core list, with a Shrine, a Trench Pilgrim, an Ecclesiastic Prisoner
  and a War Prophet, confirmed. The Warband screen shows **Before the game · Broken on the
  Wheel · p59** with a Victim select: "No one", the Trench Pilgrim, the Ecclesiastic Prisoner
  (no War Prophet). Pick the Pilgrim: a line under it says the Pilgrim is not deployed this game
  and the Shrine has Armour 0, no NEGATE SHRAPNEL or TOUGH, Down as a Minor Hit, until its
  first Out of Action. Save; open the TTS URL: the Pilgrim's member has `"removedForGame": true`,
  the Shrine's `ttsDescription` has "Broken on the Wheel: … Arm 0 …" and its GM notes a "Before
  this game" section. In TTS the importer spawns every member but the Pilgrim. Dismiss the
  Pilgrim in the Barracks: the choice clears. Under **Methodius** the panel says "Not allowed:
  Mortal Sin … (p64)" with no select.

## 6. Warband screen

- Click the **Warband** tab (or the Legal badge). Left "Campaign" panel: Name editable, then
  locked facts: Faction New Antioch (no Subfaction row: New Antioch has none), Variant None, Patron Temporal Lord, Game 1, Ducats
  "318 of 700", Glory "0 spent of 0", and the note that these are fixed at creation. There are
  **no** selects or number inputs for faction, variant, patron or game.
- Right "TTS import" panel: "Unsaved draft … Save (top right) to get a code".
- "Roster · 6 models" with **Recruit in the Barracks** (the tent) at the right; each row has the
  custom-name field (edit one here; it shows in the Barracks and the Armoury select), its kit in
  one line, its cost and **Equip**, which opens the Armoury filtered to it.
- "Rulebook-legal: nothing to fix."
- Make it illegal to see the list: Barracks → **Dismiss** the Lieutenant → Warband screen lists
  `0 x Lieutenant; at least 1 required` and the badge reads 1 error. **Keep** him.

## 6b. Expanded rows on the Warband screen

- Each roster row has a chevron (**Details**) at the right of its Equip line; the collapsed row is
  otherwise unchanged. Press it, or click anywhere on the row that is not the name field or a
  button: the row opens below with the model's full details, and the chevron turns up and brass.
  Clicking the name field, Equip or anything inside the open panel does not toggle it; selecting
  text in the row does not either. Several rows can be open at once.
- The Lieutenant (Sword/Axe, Pistol, Standard Armour): stat boxes **Mov 6"/Infantry · Rng +2 ·
  Mel +2 · Arm −1 · Base 32mm**, the line "Armour 0 profile, −1 (Standard Armour)", Keywords;
  **Abilities** Hold Your Fire!, Tough, Leader each with its full text; **Equipment** each item
  with range · hands · keywords and its rules, its price at the right; **Cost** a ledger
  Lieutenant 👑70, Sword/Axe 👑4, Pistol 👑6, Standard Armour 👑15, **Total 👑95** (the row's own
  price); **TTS model** the sculpt's name and "default for this unit".
- A Witchburner: Combat Helmet and Reinforced Armour marked oxblood **built in** with the lock (and
  "built in" in the ledger), Gavel of Justice "on the unit card", Dignified Conduct and Divine
  Judgement among the abilities, a ☼5 price, and no armour breakdown (built-in armour is in the
  profile already).
- Heretic Legion → Heretic Naval Raiders: a Heretic Raider with a Submachine Gun reads "your pick
  for this loadout" in brass; give it a Pistol instead and it reads "default for this unit".
- A row with an error (a core Anchorite Shrine without its Catherine Wheel) lists it under
  **Issues**; a Shrine with a Broken on the Wheel victim shows it under **Before this game**, and
  the victim's row says "Not deployed this game."
- Everything in the panel comes from the TTS export: open `/api/tts/warband/XXXXXX` after saving
  and compare a member's stats, armourBreakdown, abilities, equipment, upgrades and model.nickname.
- Reload: the same rows are still open (remembered per warband in this browser). Network:
  `GET /api/tts/models` 200, gzip, about 20 KB; if it fails the panel says the model map did not
  load and everything else still works.
- Tab to a chevron: focus ring and "Details" bubble; Enter/Space opens it. Accessibility pane:
  button "Details for Captain Vane (Lieutenant)", expanded true/false, controlling a region with
  the same name.

## 7. Save

- **Save and get code** in the header from any screen. Network: `POST /api/warbands` 201. The
  URL becomes `/w/XXXXXX` plus the screen you were on (six characters, no 0/O/1/I); the header
  shows the code in brass and "Saved". The Warband screen's TTS panel shows the code large,
  **Copy TTS import code** beside it, the URL `http://localhost:5173/api/tts/warband/XXXXXX` and
  **Copy URL**.
- Copy the code: the icon turns into a check and the bubble reads "Copied" for a moment; paste
  somewhere to confirm.
- Open the TTS URL: JSON with `"version": "tc-warband-export-v1"`, the code, `"valid": true`,
  `"totals": {"ducats": 318, "glory": 0}` and six members whose equipment matches the rows.
- Change the name; header shows "Unsaved changes"; **Save changes**: `PUT /api/warbands/XXXXXX`
  200, back to "Saved". Reload: the name sticks and the Warband screen is the landing screen.

## 8. Home again

- **Warbands**: the table lists the warband with faction, code, time; no draft banner. Open by
  code in lowercase with a dash: opens. **Forget** removes the row; the URL still opens it.
- `/w/ABCDEF` (unused code): "No warband with code ABCDEF" with a link back.

## 9. Draft survives a reload

- New warband, buy a unit, reload `/w/draft/barracks`: the roster is still there, and
  `/w/draft` and `/w/draft/armoury` show the same roster. Home shows the draft banner with
  "Resume". Save it; the banner is gone.

## 10. Import from NewRecruit

- Home → **Import from NewRecruit** (also linked from `/new`): `/import` with a dashed drop
  zone. Drop `packages/rules/test/fixtures/new-antioch.ros` (or pick it): a preview appears —
  "The Fifth Lantern", File "new-antioch.ros (BattleScribe roster, https://www.newrecruit.eu)",
  Faction New Antioch, Variant None, Patron Temporal Lord, Cost 328 ducats, Rules check
  **Legal**, six models (Captain Vane (Lieutenant), three Yeomen each with Bolt-Action Rifle and
  Bayonet, Old Tom (Yeoman) with Trench Mole, Shocktrooper with Submachine Gun), and
  **Not mapped · 2**: "Allow Third-Party Mercenaries?" and "Lieutenant > Lucky Charm" with their
  reasons and entry ids.
- Drop a NewRecruit JSON export of a **Heretic Naval Raiders** roster (force catalogue "Heretic
  Naval Raiders"): the preview reads Faction **Heretic Legion** (catalogue "Heretic Naval
  Raiders"), **Subfaction Heretic Naval Raiders**, the variant it was built with, every model
  mapped, and under Not mapped only "Campaign Rules" (the "Heretic Naval Raiders Rules" and
  "Warband Variant" selections are consumed). A 799-ducat roster reads 1 error (over the
  700-ducat Threshold for game 1).
- Zip the same file as `anything.rosz` (`zip anything.rosz new-antioch.ros`) and drop it: the
  same preview. (The JSON export path is covered by the tests; drop one if you have a real
  NewRecruit JSON export and tell me what the preview says.)
- Drop any other file (a PNG, a 40k roster): a red "could not be imported" line with the reason;
  nothing is created.
- **Create draft from this roster**: lands on `/w/draft` (Warband screen) with the roster, the
  patron and the names, badge **Legal**, 328 / 700. If a draft already existed the preview
  warned that it would be replaced.

## 11. Rules cache

- Reload any warband screen: `GET /api/rules` is served from cache or 304 with the same `etag`.

Contrast check (WCAG AA): dimmed price text, error text and the Elite tag must all stay readable
on the dark panels; nothing relies on a strikethrough or colour alone (dimmed prices also go
dashed, and say why on hover and to screen readers).

Anything red in the console, any 4xx/5xx other than the deliberate 404 in step 8, any "needs",
"not with" or "not checked" text on a Barracks row or in a picker, a request to `/api/warbands`
carrying an unconfirmed item or recruit, or any figure that disagrees with this script is a
defect: note the step and the exact text.
