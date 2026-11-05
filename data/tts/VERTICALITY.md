# Verticality in the reference maps

How the reference TTS saves build height, and the live measurements the battlefield generator's third
layer is built from (TC-021b, 2026-11-04). Saves read from `~/Library/Tabletop Simulator/Mods/Workshop`;
positions are world units (1 unit = 1 inch); GUIDs are the saves' object GUIDs. Live numbers come from
`scripts/tts_measure_rest.py` (`--on` for stacking) and `scripts/tts_profile_trench.py`, recorded in
`palette-measured-v2.json`.

## Height levels (live, 2026-11-04)

Heights above the surface a stack starts on (the mat, in our boards):

| Level | What | Height |
| --- | --- | --- |
| 0 | mat; trench pieces stand on it | 0 |
| trench floor | channel floor of the plain, ledge, logs, corner and T pieces | 0.50 |
| 1 | top of a Landscape 1x1 / 1x2 tile (2x2 collider: 2.58) | 2.50 |
| 1, trench lip | top of a trench piece standing on the mat | 2.59 |
| 2 | top of a second Landscape tile stacked on the first | 5.00 |
| 2, ramp top | Landscape Hill Ramp on a tile climbs one tile height | 2.50 + 2.56 |
| hill | H4x4 on a tile; a second H4x4 on that | 4.60; 6.70 |

Rest heights of a piece on a stack equal its rest height on the flat, within 0.01: Landscape 1x1 on a
1x1 rests 1.00 above it, a trench straight 1.50, a Hill Ramp 1.28, an H4x4 0.00, H4x4 on H4x4 0.00,
the 9.4in Tower 442da3ffde7a on an H4x4 0.076. So a stacked piece's pivot is the support's top plus
its own rest height, which is what the generator emits.

## Trenches Square Off (3321247064): plateau, ramps, trench on raised ground

285 top-level objects (273 terrain). The surface sits at y 1.59 (Landscape tiles rest 1.00 above it at
y 2.59). A 48x48 board:

- Base layer: 35 tiles on the surface: 11 Landscape 1x4 (8x8) such as 2f09cd at (-5.93, 2.59, 2.34),
  14 Landscape 1x2, four Landscape 1x4 Crater (8268d1, b9a951, 8e4b56, c75b1c), four Landscape 1x1
  flipped (rotZ 180, y 3.09-3.10), and two 8x48in strips of Landscape 1x2 571fca0839f7 (618b75 at
  x -19.89, 0a870e at x 19.96) under the two edge berms.
- Second layer: 14 Landscape 1x2 at y 5.13-5.17 on the edge strips, 2.55 above the base: east
  dad2e4, aa9589, 3196e8, a09cb9, 7534e2, 96e16e, e406d9 (x 17.9-21.9); west 70c03c, d6365d, b2306f,
  1afd7e, 645f7b, 098274, a3a994. They form a raised berm along each deployment edge.
- Trench on raised ground: 20 trench pieces at y 5.63-5.67 standing on the base layer, so their lips are
  level with the second layer. East line at x 17.94 from Entrance 8bd6a3 (z -17.82, rotY 0) through
  straights 9e5a22 … 87ab9b to Entrance 8bbff5 (z 18.12, rotY 180); west line at x -17.9 from Entrance
  de2980 (rotY 0.3) to c83b63 (rotY 180.2). Each deployment edge has its own line, with Entrances at both
  ends; all four Entrances sit so their opening faces along the line (+z at rotY 0).
- Ramps: 22 Landscape Hill Ramps at y 5.37-5.39 on the base tiles at x ±14.9, one per cell along the
  inner side of each berm: east ones at rotY 0 (2d6b8c, 607d27, 3e47a8, 645c2d, cd05ca, 563e1b, …),
  west ones at rotY 180.2 (0721c3, 705d6e, d17395, cffbab, 9acfe1, …). Each climbs from the middle
  ground up to its trench line's lip, which puts the uphill side on +x at rotY 0. Two Landscape 1x1
  Flat Ramps (3a0d3a, a58a69) lie on their sides (rotZ 270) at y 4.56-4.58.
- Fire steps: the ledge straights in the east line are at rotY 0 and the west line's at rotY 180. With
  the ledge on -x at rotY 0 (collider raycast below), both lines' fire steps face no man's land.
- Four ground-level ledge straights at y 3.09-3.10 (be0bb7, 15e28e, 7b0394, 83ad0c) cut through the
  base layer beside the berms.
- What stands where: 142 pieces on base tiles, 15 on the second layer (Plank Floors such as c99ad0 at
  y 6.69 on 70c03c), 6 on trench pieces, 5 on ramps.
- Mix of its 273 terrain objects: other cover, ruins and decor 32.6% (mostly unnamed meshes), ground
  tiles 16.5%, Plank Floor 12.8%, Difficult + Dangerous wire 11.7% (32, laid in rows), trench 8.8%,
  ramps 8.1%, Difficult Terrain 8.1%, crater tiles 1.5%.

## Armoured Train #1 (3665398498): two-tier H4x4 hills

333 objects. The whole ground layer is 144 H4x4 blocks at y 2.0 (the H4x4 rests on its bottom, so the
surface is y 2.0). A second tier of 38-40 H4x4 at y 4.10 (2.0 + 2.1) such as cb5d54 (-22, 4.10, -5.0),
5ea758, 3045ee, 7d2622 forms two raised ridges, x -22..-6 and 6..22 across z -5..5: the scenario's
embankments. 51 pieces stand on the second tier (548ae4 "Open Terrain" at y 9.06 on 6b0179, the train
cars); two pieces sit on other pieces. No ramps: the embankment sides are Difficult terrain per the
scenario.

## The High Ground #1 (3661436557): tall structures on the ground layer

293 objects. The ground layer is 100 H4x4 (60 f58a16b08b7e and 40 of its mirrored copy d80b6372fd98) at
y 2.0; 189 pieces stand on it at about y 4.1. Its height comes from multi-part structures stacked from
y 4.1 up to 13.1, nine of them spanning more than 4in: at (0, 0) 839796 (c1c032d9442f, y 4.09) under
fd2657 (1a53cf1ab45b, y 11.39) under f5412f and 2ecd06 (y 13.0-13.1); at (8, 4) 496d4f (044ee68dd4f6,
y 4.16) under 3dd4ca (c6a8ef9d3a29, y 8.6); at (-8, 10) c2fc11 (y 5.26), 6f60bb (7.06), d80d43 (11.1).
These are locked parts placed by hand, not physics stacks, so the generator uses single tall pieces
(towers and multi-storey ruins, measured below) rather than reassembling them.

## Urban Brawl (3347913885) and Howitzers (3449196567): single level

Urban Brawl: 348 objects: 12 ground tiles, 32 trench pieces, 18 wire, 274 other (Rough Grass ×27,
Ladders ×10, crate and barrel groups, skeleton piles, burnt ruins); everything on one level.
Howitzers: 288 objects: 33 ground tiles, 16 trench pieces, 6 wire, 233 other (pillboxes, cannons, blood
decals, crates); one level.

## Ruins 1 (3468858688): buildings and the Ruins Corner

358 objects on a different tile system: 4555001d1357 plates (3.8in, y -2.5) each carrying one child,
either a "1x1" ground block (108) or a trench piece (14 ledge straights, 14 corners, 6 double logs).
Buildings are single unnamed assetbundles placed on top (eea7dc4cd031 ×12, 897d7050216a ×10, "Ruins
Defendable" 6557fa863ef6 ×2). The Ruins Corner 2f1be9f52091 sits in the Small Buildings bag (c0f5b0) as
one object with no children. Measured live, its mesh is a full corner ruin 3.19 x 3.18 x 4.70; only its
collider is a 2.4 x 0.1 x 2.4 floor plate, which is what made it read as a floor whose walls were
elsewhere. The palette uses it whole. The City Ruins, Small/Medium/Large Buildings and Misc Structures
bags of Ruins 1 and Trench Crusade: Map (3427166914) supplied the ruined buildings and towers below.

## Tall and ruined pieces measured live (visual bounds)

Collider and visual bounds differ a lot for these assetbundles, so footprints use the visual
(`getVisualBoundsNormalized`) and rest heights the physics settle.

| Piece | id | Visual footprint | Height | Collider |
| --- | --- | --- | --- | --- |
| Tower (outpost) | 442da3ffde7a | 3.96 x 4.01 | 9.40 | 3.69 x 3.71 x 7.03 |
| Tower Small | 3a9d88b510b0 | 4.41 x 2.65 | 6.87 | 1.66 x 1.59 x 4.37 |
| Tower | fe67d72ef012 | 4.74 x 4.74 | 9.49 | 4.54 x 4.56 |
| Water Tower | 859f77538985 | 2.12 x 2.12 | 8.36 | same |
| Watchtower | 5556771354e7 | 9.11 x 9.36 | 9.04 | rests with its pivot 4.28 below the surface |
| Ruins Small | 67e376e90648, 556a105de9ef | 6.05 x 3.92, 7.49 x 3.76 | 9.71, 6.81 | 3.1 tall boxes |
| Ruins Medium | c6781ed0494f, b4e3d7f81bb7, b96fb2c4c431, feebe78ae6ed, 3bf65f8ba45d, 0f9003d125d0 | 5.16 sq to 9.92 x 6.92 | 6.81-9.88 | boxes or 0.1 plates |
| Ruins Large | 6a10e5672b47 | 9.35 x 9.35 | 9.81 | 9 x 9.1 x 9 |
| Ruins Corner | 2f1be9f52091 | 3.19 x 3.18 | 4.70 | 2.4 x 0.1 x 2.4 |

The 6-10in Ruins are the "ruined buildings with upper floors"; the towers are the outposts.

## Trench walls (collider raycast, live)

Each trench piece spawned locked at rotY 0 and raycast on a 0.1in grid (`profiles` in
`palette-measured-v2.json`):

- Channel floor 0.50 above the bottom in the plain, ledge, logs, corner and T pieces.
- Inner wall faces slope from 1.08-1.13in off the cell centre at 0.8in up to 1.31-1.37in at 2.0in up,
  the same within 0.06in for every piece, so the log fence's 1.35in inset (placed live against the plain
  straight's bare wall) serves them all.
- Trench Straight w/ Ledge 031559734221: a 1.5in-high step covers x -1.6..-0.4 at rotY 0, so the ledge
  is on -x. This frame matches the visually verified corner and T openings; the 2026-11-04 visual note
  said +x. Square Off's orientations agree with -x (fire steps toward no man's land on both lines).
- Trench Straight w/ Double Logs d654d331ecd3: the collider is symmetric, so it cannot say which wall
  carries the logs; the palette marks it assumed and the generator uses plain straights with log fences
  instead until someone looks.
- Log Fence 44a0aae22d66: its body centre is 1.22in to +x of the pivot (collider and visual agree);
  pivot 1.20 above its bottom.
