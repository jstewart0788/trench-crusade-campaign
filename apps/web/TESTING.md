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
  (the Shoal bars them); **no** Heretic Priest or Heretic Trooper. Add a Heretic Captain, Confirm, open the
  Armoury: a Submachine Gun is offered at 25d. The Warband screen's locked facts show **Subfaction
  Heretic Naval Raiders**. Save it: the TTS URL's JSON has
  `"subfaction": {"id": "heretic-naval-raiders", "name": "Heretic Naval Raiders"}` next to
  `"faction"`. Forget it on Home before going on.

## 3. The shell (every warband screen)

- Header: the name in brass as an editable field, "NEW ANTIOCH · TEMPORAL LORD · GAME 1"
  under it, totals **0 / 700 ducats** and **0 glory of 0**, a red **1 error** badge, "Draft"
  and a **Save and get code** button. Below it the tabs **Warband · Barracks · Armoury**;
  Barracks is lit.
- Edit the name in the header: the change shows on every screen (it is the one field that is
  never locked).

## 4. Barracks (recruiting is staged)

- Left "Roster · 0 models": "No models yet. Recruit from the list on the right."
- Right "Recruit": **Units** then **Mercenaries**. Lieutenant "0 of 1", Yeoman "0 of any",
  Shocktrooper "0 of 0–5". **Not listed anywhere**: Crimson Communicant (Red Brigade only),
  Homunculus (Book of Golems), Disciple of St. Roch (third-party mercenaries), Trench Dog (needs
  Dog Food). No row carries "needs …" or "not checked" text. At the bottom of the panel one
  quiet line: **"2 options hidden by campaign rules we can't check yet"**.
- **Add** Lieutenant: a roster row appears with a brass outline and a **PENDING** chip (unit
  name, Elite tag, empty "Custom name" field, "No equipment", 70d, **Equip** link, Duplicate,
  **Undo**). Header: **0 → 70 / 700 ducats** with "+70", **Discard changes**, **Confirm
  purchases (1)**, and the badge still reads **Legal** (the staged roster has its Lieutenant).
  Lieutenant now reads "1 of 1" in the Recruit list and its Add is disabled.
- Add Yeoman, then **Duplicate** the Yeoman three times: four pending Yeoman rows, 30d each.
  Add Shocktrooper. Header 0 → 235 (+235), Confirm purchases (6).
- Type a custom name on the first Yeoman with a space in it ("Old Tom"): the space is not
  eaten; the row keeps "Yeoman" as its title. Names are never staged.
- **Undo** one pending Yeoman: the row vanishes, Confirm purchases (5). Add it back.
- **Confirm purchases (6)**: outlines and chips vanish, header **235 / 700**, "Unsaved changes",
  Confirm/Discard gone.
- **Remove** a confirmed Yeoman: the row stays, struck, with a red **LEAVING** chip and a
  **Keep** button; header **235 → 205 (−30)**, Confirm purchases (1). **Keep**: back to normal.
  Remove it again and **Discard changes**: back to normal.
- Add a second Lieutenant: it appears pending, the badge turns red (**1 error**: at most 1 per
  warband) and **Confirm purchases** is disabled; **Undo** it.

## 5. Armoury: the figure

- Click **Equip** on the Lieutenant row: URL `/w/draft/armoury?member=m1`, Armoury tab lit, the
  "Equipping" select shows "Lieutenant" (a pending recruit would read "… (pending recruit)" and
  can be equipped too). Left column: the Lieutenant panel (custom name field,
  stat line `Mov 6"/Infantry · Rng +2 · Mel +2 · Arm 0 · 32mm`, "Model total 70d"), then the
  **figure**: a brass silhouette with eight dashed slots laid over it: Head on top; Ranged /
  Torso / Melee on the first row; Ranged / Off-hand / Melee on the second; Grenades at the
  bottom. Every slot reads "empty". Below it the **Inventory** panel ("Nothing in the pack",
  "Add to inventory"). Right column: the hint "Click a slot on the figure to equip it…".
- Click the top **Melee** slot: the right column becomes the picker "Melee · Melee hands" with
  the hint "one 2-Handed or two 1-Handed Melee Weapons" and a list with prices. Press
  **Escape**: it closes. Click it again, pick **Sword/Axe** (4d): the slot fills, the item has a
  brass outline and a "PENDING" chip, the picker closes. Header: **70 → 74 / 700 ducats** with a
  "+4" chip, buttons **Discard changes** and **Confirm purchases (1)**; Save is no longer the
  brass button. The model total reads "70d → 74d".
- Top **Ranged** slot → pick **Pistol** (6d). **Torso** → **Standard Armour** (15d). Header
  70 → 95 (+25), Confirm purchases (3).
- Click the filled **Torso** slot: the picker shows "Standard Armour [Undo]" and "Swap for" with
  "Nothing fits here" (one suit of armour). Click **Undo**: the slot empties, header back to
  (+10), Confirm (2). Put Standard Armour back.
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
- **Add to inventory** → pick **Medikit** (5d): it lists under Inventory with a PENDING chip
  and "Undo". Confirm purchases.
- Put **Mountaineer Kit** (3d) in the inventory of four Yeomen (confirming each; on the fourth
  the row read "3/4 in warband"); on a fifth model the inventory picker no longer offers it.

## 5c. Staging survives, and errors block Confirm

- Stage a purchase and reload the page: the PENDING chip is still there and the header still
  shows the → delta (pending purchases are kept in this browser, per warband). **Discard
  changes**: everything pending vanishes and the totals return.
- The picker will not offer anything that breaks a model's own battlekit rules, so the error
  that blocks Confirm is a warband-level one: stage a **Machine Gun** (50d) on every Yeoman via
  the top Ranged slot's "Swap for" until the header's ducats pass 700. The figure turns red,
  the badge reads **1 error**, and **Confirm purchases** is disabled with the tooltip "Fix the
  errors before confirming". Undo one Machine Gun (open its slot, Undo): Confirm re-enables.
  Discard changes.
- With purchases pending, **Save** (or "Save changes") still works and sends only the
  confirmed roster: Network → `PUT /api/warbands/…` body has no pending items; after the save
  the PENDING chips are still on the figure.

## 6. Warband screen

- Click the **Warband** tab (or the Legal badge). Left "Campaign" panel: Name editable, then
  locked facts: Faction New Antioch (no Subfaction row: New Antioch has none), Variant None, Patron Temporal Lord, Game 1, Ducats
  "318 of 700", Glory "0 spent of 0", and the note that these are fixed at creation. There are
  **no** selects or number inputs for faction, variant, patron or game.
- Right "TTS import" panel: "Unsaved draft … Save (top right) to get a code".
- "Roster · 6 models" with a "Recruit in the Barracks" link; each row has the custom-name
  field (edit one here; it shows in the Barracks and the Armoury select), its kit in one line,
  its cost and an **Equip** link that opens the Armoury filtered to it.
- "Rulebook-legal: nothing to fix."
- Make it illegal to see the list: Barracks → Add a second Lieutenant → Warband screen lists
  `2 x Lieutenant; at most 1 per warband` and the badge reads 1 error. Remove him.

## 7. Save

- **Save and get code** in the header from any screen. Network: `POST /api/warbands` 201. The
  URL becomes `/w/XXXXXX` plus the screen you were on (six characters, no 0/O/1/I); the header
  shows the code in brass and "Saved". The Warband screen's TTS panel shows the code large,
  **Copy TTS import code**, the URL `http://localhost:5173/api/tts/warband/XXXXXX`, Copy URL.
- Copy the code: button reads "Copied"; paste somewhere to confirm.
- Open the TTS URL: JSON with `"version": "tc-warband-export-v1"`, the code, `"valid": true`,
  `"totals": {"ducats": 318, "glory": 0}` and six members whose equipment matches the rows.
- Change the name; header shows "Unsaved changes"; **Save changes**: `PUT /api/warbands/XXXXXX`
  200, back to "Saved". Reload: the name sticks and the Warband screen is the landing screen.

## 8. Home again

- **Warbands**: the table lists the warband with faction, code, time; no draft banner. Open by
  code in lowercase with a dash: opens. **Forget** removes the row; the URL still opens it.
- `/w/ABCDEF` (unused code): "No warband with code ABCDEF" with a link back.

## 9. Draft survives a reload

- New warband, Add a unit, reload `/w/draft/barracks`: the roster is still there, and
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

Anything red in the console, any 4xx/5xx other than the deliberate 404 in step 8, any "needs",
"not with" or "not checked" text on a Barracks row or in a picker, a request to `/api/warbands`
carrying an unconfirmed item or recruit, or any figure that disagrees with this script is a
defect: note the step and the exact text.
