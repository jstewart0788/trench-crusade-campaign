# Reference boards: how we make them good

Status: **draft**, 2026-11-24. This condenses five research reports (in
`work/trenchcrusade-patches/research-2026-11-24/`: scenic-craft, competitive, tc-aesthetic, wwi-layouts,
tts-presentation) into what we do when hand-building one reference board per archetype. Rules about
placement are in `battlefield-spec.md`; this covers what makes a board look alive and play well.

## Why ours look store-bought
- **Gaps on our side:** every piece sits *on* a flat grey slab. Nothing ties a piece to the ground, there is
  no story, palettes and eras are mixed, and pieces are spread evenly.
- **What the reference TC maps already do:** none uses a ground texture, a colour grade (LUT) or a single
  decal. The two that look storied get it from presentation, not piece choice: Burning Trenches from fire
  and bodies inside its hazard zones, Urban Brawl from low light plus tints by material.

## Every board
1. **A one-line story first.** Write it before placing anything (e.g. "the shrine where the Pilgrims
   held for three days"). Every cluster answers it. Debris sprays away from its cause.
2. **One hero piece, off-centre.** Add 2–3 supporting pieces; everything else is connective clutter.
   Supporting pieces are tinted duller than the hero.
3. **Pieces sit in the ground.**
   - Lower each piece 2–8mm into the ground and tilt wrecks 2–5°.
   - A mud or rubble decal about 1.3–1.5× each main piece's footprint.
   - 3–8 debris pieces across the line where the piece meets the ground.
   - Decal paths (ruts, duckboards, rubble) join the clusters.
4. **Clusters, not spreading.** 4–6 clusters on 36", in arcs or triangles, turned 10–35° off the board
   edges. Open ground still carries ground texture.
5. **One palette, one region.**
   - Tint every kit to 3–4 colours: umber, ash, rust, bone.
   - Strong colour only where it means something: crimson for blood and Hell, gold or brass for relics,
     sickly green for Black Grail.
   - One region per board: Flanders (breastworks, water-filled craters) or Somme (deep cuts, white chalk
     spoil), never mixed.
   - One level of ruin per board.
6. **What makes it Trench Crusade:** religious objects at human scale layered onto WWI ground. That means
   fields of trench crosses, artillery-shell shrines, church fragments, crucifixes on tank traps, and
   skulls and chains.
   - **Avoid:** girders, tech and 40k gothic; those read as 40k at once.
   - **Ruins:** two storeys at most, in brick and stone.
7. **Faction dressing goes in that faction's own deployment zone**, never midfield.
8. **Balance:** halves matched, not mirrored. Tall pieces about one third, low cover about two thirds. No
   straight lane from zone to zone wider than 8".
9. **Presentation layer, per board.** All values are to be measured in TTS before we adopt them.
   - Low ambient light and reflection under 0.2.
   - One custom colour grade (LUT) shared across boards, to unify the kits.
   - A painted 4096² ground texture per archetype.
   - Decals where pieces meet the ground, and for story (scorch, blood, craters).
   - Fire, smoke or gas effects inside Dangerous terrain.
   - 3–4 saved camera views.
   - Budget about 300 locked objects and about 100 MB of unique assets; check the frame rate.

## Per archetype

**No Man's Land.** Stark and swept by fire, but never a shooting gallery.
- **Density:** 20–25% coverage, 10–13 pieces. The Adepticon 2026 TC pack is about 23–25%, as are our
  current boards.
- **Midfield:** 3 tall blockers (4–5") in a broken diagonal across it, with 6–8" gaps.
- **Low cover:** chained at most 6" apart along two routes per side, so melee can cross.
- **Craters:** in 2–4 heaps plus one mine crater, not an even scatter.
- **Story pieces:** one oblique remnant road lined with tree stumps; one fortified farm or shrine as the
  landmark hero; a wreck nose-down in a crater; a field of crosses.
- **Trenches:** only inside the deployment zones.

**Decimated Ruins.** A dead village.
- **Density:** 35–45% coverage.
- **Ruins:** 6–8 ruins of 1–2 storeys, 3–9" apart, with 2.5–4" streets.
- **Centre:** one 8–10" square around the central objective, with the church (or its heap of white
  stones) as the hero piece. It has dressed interiors: pews, a fallen bell, altars.
- **Lanes:** two deliberate 12–18" lanes per side so rifles keep a role.
- **Damage:** grade it outward from one point of impact.
- **Choose a damage level:** model the less-damaged state (walls and gables standing), not the literal
  flattening.

**Trench Lines.** A consecrated line.
- **Trenches:** two fire trenches with bays and traverses, joined by 1–2 zig-zag communication trenches.
  The fire step is on the enemy wall only.
- **Open ground:** wire belts 2–4" deep and 1–3" in front of each fire trench, in 6–10" lengths with
  offset gaps. Craters on the enemy side of each fire trench. Corner ruins or landmarks.
- **Dressing:** altars in the trench walls, saint niches at junctions, shell shrines at T-junctions.
- **Objectives:** one at a central trench junction, the rest on open ground.

## Open questions for Jonathan
1. **Fire-trench straight runs.** Historically bays were 2.5–6" at our scale, so the WWI report suggests
   capping fire-trench straights at 8–12" (2–3 tiles). You set 5–6 tiles. Keep 5–6 tiles for
   communication trenches and use 2–3 for fire trenches?
2. **One region per board.** Do Flanders and Somme looks both appeal, or do we pick one house look?

## Found along the way (proposed, not changed)
- **Lighting reset:** `mod/scripts/4ee1f2.lua` `setDefaultLights()` resets the lighting whenever terrain is
  cleared. It overrides any per-board lighting.
- **Ambient-type numbering:** the save file and Lua number it differently (save 1 = gradient, Lua 1 =
  background).
- **Infected mods:** three local mods carry the virus marker: Scripted Table, Armoured Train #1 and Hunt
  for Heroes #2. Read their assets as data only.
