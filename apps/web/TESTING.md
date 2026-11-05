# Roster tool: manual click-through

The API and reducer are covered by vitest; this is the browser pass that nothing automated
runs. Do it in Chrome with DevTools open on the **Console** and **Network** tabs the whole way
through: a page that looks right while a request 500s is a fail.

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

- Network: `GET /api/rules` is 200, `content-encoding: gzip`, about 300 KB on the wire.
- Console: no red lines. (A Vite "new dependencies optimized" reload is fine.)

## 1. Home, empty

- Heading "Warbands", button "New warband", text "No warbands saved from this browser yet",
  an "Open by code" box. No draft banner.

## 2. New warband

- Click **New warband**. Name "The Fifth Lantern". Faction: the six factions are listed.
  Pick **New Antioch**: the Variant select fills with six variants; Patron offers Temporal
  Lord, Warrior Saint, Learned Saint and nothing else. Pick Court of the Seven-Headed Serpent
  instead: Variant reads "No variants" and is disabled; Patron offers Infernal Noble and
  Mammon. Back to **New Antioch**, Variant none, Patron **Temporal Lord**, Game 1.
- **Start building**. URL is `/w/draft`.

## 3. Builder, empty roster

- Header: name field shows the name, "NEW ANTIOCH" under it, Variant/Patron/Game/Glory
  controls, totals **0 / 700 ducats**, **0 glory of 0**, status **1 error**.
- Validation panel lists exactly: `Lieutenant 0 x Lieutenant; at least 1 required`.
- Save panel says it is an unsaved draft; button reads "Save and get code".
- Add-units list: Lieutenant shows "0 of 1", Yeoman "0 of any", Shocktrooper "0 of 0–5",
  Crimson Communicant is **absent**, Homunculus is present with the amber note
  "needs Book of Golems — not checked here", Trench Dog is greyed with "needs Dog Food" and
  its Add button disabled.

## 4. Build the starting warband (the API test fixture)

- Add **Lieutenant**: status flips to **Legal**, panel reads "Rulebook-legal". Total 70.
  The Lieutenant card is selected (brass left border) and the right side shows
  "Equip Lieutenant" with a stat line `Mov 6"/Infantry · Rng +2 · Mel +2 · Arm 0 · 32mm`.
  Lieutenant's Add button is now disabled ("1 of 1").
- In the armoury: **+ Sword/Axe** (4d), **+ Pistol** (6d), **+ Standard Armour** (15d). The
  card's chips and cost (95d) and the header total update on each click. Standard Armour
  now reads "1/1" and its + is disabled.
- Add **Yeoman**, equip **Bolt-Action Rifle** (5d) and **Bayonet** (2d). Click **Duplicate**
  on the Yeoman card three times: four Yeomen, each 37d, each with its own chips.
- Add **Shocktrooper**, equip **Submachine Gun** (30d, under "Shield combo").
- Header: **318 / 700 ducats**, **Legal**. Six cards.

## 5. Live validation

- On a Yeoman, add a second **Bolt-Action Rifle**: the panel shows `Yeoman Yeoman: one
  2-Handed or two 1-Handed Ranged Weapons (has 2 x 2H, 0 x 1H)`, the card shows "1 issue",
  and clicking the name in the panel selects that card. Remove one rifle with the chip's ×
  or the armoury −: it clears.
- Add **Machine Gun** (50d) to every Yeoman: total passes 700, the ducats figure turns red and
  the panel reads `Warband costs ... ducats; Threshold Value is 700`. Remove them.
- Rename a Yeoman "Old Tom" (type a space mid-name: it must not be eaten). The card title
  stays "Yeoman", the panel uses "Old Tom" if it has an error for him.

## 6. Variant and patron changes

- Variant **Eire Rangers**: Yeoman's Equipment group gains "Armour Piercing Bullets";
  select a Yeoman with a rifle, the row is greyed with "not with Bolt-Action Rifle"; the
  Yeoman upgrades gain "Carnyx". Lieutenant's abilities are not shown here (TTS export
  carries them).
- Variant **The Red Brigade**: "Crimson Communicant" appears in the unit list; Yeoman
  upgrades gain "Blood Cloak" (5d); add it to one Yeoman, the chip is brass-bordered.
- Variant **Papal States Intervention Force**: threshold reads **/ 500**, glory "of 11", the
  Lieutenant minimum disappears from the panel if you remove him.
- Back to Variant **None**: the Blood Cloak now errors (`Blood Cloak is only available with
  new-antioch/the-red-brigade`); remove it.
- Patron: switch between the three; no error either way. Game number 3: threshold 900.
  Back to 1.

## 7. Save

- **Save and get code**. Network: `POST /api/warbands` 201. The URL becomes `/w/XXXXXX`
  (six characters, no 0/O/1/I), the Save panel shows the code large, "Copy TTS import code",
  the URL `http://localhost:5173/api/tts/warband/XXXXXX` and "Saved".
- **Copy TTS import code**: button reads "Copied"; paste somewhere to confirm.
- Click the TTS URL: a JSON document with `"version": "tc-warband-export-v1"`, the code,
  `"valid": true`, `"totals": {"ducats": 318, "glory": 0}` and six members whose `equipment`
  names match the cards.
- Change the name; Save panel shows "Unsaved changes"; **Save changes**: Network
  `PUT /api/warbands/XXXXXX` 200, back to "Saved". Reload the page: the name sticks.

## 8. Home again

- Click **Warbands**: the table lists the warband with faction, code, time. No draft banner
  (saving cleared it). Open by code with the code in lowercase and with a dash in it: opens.
- **Forget**: the row goes; the code still opens by URL (server keeps it).
- `/w/ABCDEF` (any unused code): "No warband with code ABCDEF" with a link back.

## 9. Draft survives a reload

- New warband, add a unit, reload `/w/draft`: the roster is still there. Home shows the
  draft banner with "Resume". Save it, then the banner is gone.

## 10. Rules cache

- Reload the builder: Network `GET /api/rules` is served from cache or returns 304 with the
  same `etag` as the first load.

Anything red in the console, any 4xx/5xx other than the deliberate 404 in step 8, or any
figure that disagrees with this script is a defect: note the step and the exact text.
