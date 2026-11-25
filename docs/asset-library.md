# Terrain asset library

Building types and the models that fill them, chosen by Jonathan from candidates laid out on a TTS board
(`scripts/tts_asset_board.py`). Ids are catalog asset ids (`data/tts/catalog.json`), first 6 characters.
Survey shots and measurements: `work/trenchcrusade-patches/assets-2026-11-24/`.

The machine-readable tag map is `data/tts/asset-library.json`. Each entry has a type, a status
(chosen / proposed / candidate / undecided / cut), tags (material, style, storeys, shape) and the
archetypes it suits. Its `measuredIn` comes from collider bounds, so some heights read low (a ruin whose
collider is only its floor); heights get re-measured once a piece is chosen.

## Types

**Centerpiece.** A massive piece the mission and battlefield are built around: one per board, at its
heart. Exception: a dense-city board may use these as ordinary buildings.
- 8c9398 Church (ruined, with spire)
- 475760 Burned Building
- b8157f Ruins Large
- 6a10e5 Ruins Large
- 3bf65f Ruins Medium, 3 storeys *(proposed: too big for a 2-storey large; confirm)*
- b4e3d7 Ruins Medium, bell-tower ruin *(proposed: too big for a 2-storey large; confirm)*

**Large 2-storey ruin.** Reference: the Ruins Medium family.
- 0f9003 Ruins Medium
- b96fb2 Ruins Medium
- c6781e Ruins Medium *(narrow, 4×4; confirm)*
- feebe7 Ruins Medium, red-brick fragment *(confirm)*

**Large 1-storey ruin.**
- de291f Town Ruins

**Small 1-storey ruin.** None yet; searching.

**Corner ruin.**
- 1da0b5 Wrecked Brick Wall, L with spilled rubble
- 5d6746 Wrecked Brick Wall, small with rubble
- 2f1be9 Ruins Corner, gothic, tall

**Wall.**
- c3cc64 ruined wall fragment ("okay wall")
- e82fb9 Wrecked Brick Wall, straight
- b6ac3e, 9dc524 broken stone walls (sloped, triangular)
- 8733f7 long low stone wall
- 48f041 mossy stone wall
- 615f2a brick wall · b650fb brick gate · 1240ca brick pillars

**Landmark** (p60: a single solid Impassable piece that gives Cover).
- 218044 Ruins Tower, round *(Jonathan: "probably")*
- 0f21fb stone archway *(proposed; models could walk through it, so it may suit wall better)*

**Rubble (Difficult).**
- 0e69e6, 84a2a2 Escombros

## Cut
- 9aea00 Medium House (just a shell)
- 556a10, 67e376 Ruins Small: not chosen for any type
- From the survey, before the board: modern concrete and industrial buildings, the 24–42" "Massive"
  blocks, intact western barns, the white bunker, mis-scaled or failed props, and 19 identical blank
  town-wall slabs.

