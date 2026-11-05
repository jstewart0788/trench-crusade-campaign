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

The api line should print `rules: .../data/rules (103 units, 213 items)` and
`db: .../apps/api/data/roster.sqlite`. Open http://localhost:5173.

- Network: `GET /api/rules` is 200, `content-encoding: gzip`, about 200 KB on the wire.
- Console: no red lines. (A Vite "new dependencies optimized" reload is fine.)

## 1. Home, empty

- Heading "Warbands", button "New warband", "No warbands saved from this browser yet", an
  "Open by code" box. No draft banner.

## 2. New warband

- **New warband**. Name "The Fifth Lantern". Faction: six listed. Pick **New Antioch**: the
  Variant select fills with six variants; Patron offers Temporal Lord, Warrior Saint, Learned
  Saint and nothing else. Pick Court of the Seven-Headed Serpent: Variant reads "No variants"
  and is disabled; Patron offers Infernal Noble and Mammon. Back to **New Antioch**, Variant
  none, Patron **Temporal Lord**, Game 1.
- **Start building**. URL is `/w/draft/barracks`.

## 3. The shell (every warband screen)

- Header: the name in brass as an editable field, "NEW ANTIOCH · TEMPORAL LORD · GAME 1"
  under it, totals **0 / 700 ducats** and **0 glory of 0**, a red **1 error** badge, "Draft"
  and a **Save and get code** button. Below it the tabs **Warband · Barracks · Armoury**;
  Barracks is lit.
- Edit the name in the header: the change shows on every screen (it is the one field that is
  never locked).

## 4. Barracks

- Left "Roster · 0 models": "No models yet. Recruit from the list on the right."
- Right "Recruit": **Units** then **Mercenaries**. Lieutenant "0 of 1", Yeoman "0 of any",
  Shocktrooper "0 of 0–5". **Not listed anywhere**: Crimson Communicant (Red Brigade only),
  Homunculus (Book of Golems), Disciple of St. Roch (third-party mercenaries), Trench Dog (needs
  Dog Food). No row carries "needs …" or "not checked" text. At the bottom of the panel one
  quiet line: **"2 options hidden by campaign rules we can't check yet"**.
- **Add** Lieutenant: a roster row appears (unit name, Elite tag, empty "Custom name" field,
  "No equipment", 70d, **Equip** link, Duplicate, Remove). Header flips to **Legal**, 70 / 700.
  Lieutenant now reads "1 of 1" and its Add is disabled.
- Add Yeoman, then **Duplicate** the Yeoman three times: four Yeoman rows, 30d each. Add
  Shocktrooper. Header 235 / 700.
- Type a custom name on the first Yeoman with a space in it ("Old Tom"): the space is not
  eaten; the row keeps "Yeoman" as its title.
- **Remove** one Yeoman, then Add it back: the roster is six rows again.

## 5. Armoury

- Click **Equip** on the Lieutenant row: URL `/w/draft/armoury?member=m1`, Armoury tab lit,
  the "Equipping" select shows "Lieutenant". Left panel: "Lieutenant", custom name field, stat
  line `Mov 6"/Infantry · Rng +2 · Mel +2 · Arm 0 · 32mm`, "Carrying: Nothing yet", model total
  70d.
- Right panel groups in this order: Ranged 1-handed, Ranged 2-handed, Bayonets, Melee
  1-handed, Melee 2-handed, Shield combo, Shields, Armour, Headgear, Grenades, Equipment, …
  Every row shows a price; no row shows "needs …", "not with …" or "not checked". The panel
  ends with a quiet "N options hidden by campaign rules we can't check yet" line.
- **+ Sword/Axe** (4d), **+ Pistol** (6d), **+ Standard Armour** (15d): chips appear in the
  left panel, model total 95d, header 260 / 700. Standard Armour shows "1/1" and its + is
  disabled. Click the chip's × on Sword/Axe, then + again: back to 95d.
- Same-model gate: Heavy Ballistic Shield is **absent** from Shields. **+ Machine Armour**
  (Armour): Heavy Ballistic Shield now appears under Shields, and the header shows **1 error**
  because two suits of armour are on. Remove Machine Armour with −: the shield row disappears
  again and the error clears.
- Change the "Equipping" select to a Yeoman: URL updates, the lists re-filter. **+ Bolt-Action
  Rifle** (5d), **+ Bayonet** (2d). Add a second Bolt-Action Rifle: header shows **1 error**;
  remove it with −.
- Repeat rifle + bayonet on the other three Yeomen via the select; give the Shocktrooper a
  **Submachine Gun** (30d, under Shield combo). Header: **318 / 700 ducats**, **Legal**.

## 6. Warband screen

- Click the **Warband** tab (or the Legal badge). Left "Campaign" panel: Name editable, then
  locked facts: Faction New Antioch, Variant None, Patron Temporal Lord, Game 1, Ducats
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

## 10. Rules cache

- Reload any warband screen: `GET /api/rules` is served from cache or 304 with the same `etag`.

Anything red in the console, any 4xx/5xx other than the deliberate 404 in step 8, any "needs",
"not with" or "not checked" text on a Barracks or Armoury row, or any figure that disagrees
with this script is a defect: note the step and the exact text.
