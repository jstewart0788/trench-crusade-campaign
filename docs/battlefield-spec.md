# Battlefield spec

Status: **v2 for Jonathan's review**, 2026-11-24. This is what a generated board must be. Every rule is
either his (J), the rulebook's (p = Digital Rulebook printed page), or marked **house**. A rule here is
built and checked exactly as written; anything not here is not built. Panel working papers:
`work/trenchcrusade-patches/panel-2026-11-24/`.

## 0. Words used below

- **Axis**: the line joining the centres of the two deployment zones (DZ). **Centre line**: the
  perpendicular bisector of the axis. A piece's **half** is the side of the centre line its centre is on.
- **Inner edge** of a DZ: its edges that are not on the board edge.
- **Distance**: the shortest gap between two footprints (turned, measured outlines), never centre to centre.
- **Terrain piece**: any piece that carries a rule (Cover, Difficult, Dangerous, Impassable, Climb,
  Elevated). This includes small pieces that give Cover, such as sandbags and crate piles (J 2026-11-24).
  A **heap** of small terrain pieces whose footprints are all within 1" of another member counts as one
  terrain piece.
- **Decor**: a piece with no rule (skulls, candles, graves, books). Decor is never a terrain piece.
- **Tile**: a ground, trench or hill tile. Tiles sit on the 4" grid by design and are exempt from §5.
- **Linear piece**: a wall, fence, wired wall or sandbag run. Its **long axis** is its longest side.
- **Ruin**: a ruined building or a corner ruin. Its **solid faces** are the two sides with the highest
  ground-storey wall cover (palette `wallCover`), each at least 0.6.
- **Blocker**: a piece whose top is at least 2.5" above the ground (hides a 28mm model on a 32mm base).

## 1. Every board

1.1 **Pieces only from the archetype's rulebook list** (p65–67, J decision 2), plus the house field cover
    in §1.3. A piece more than 8" across counts as two toward a minimum.
1.2 **Spacing** (p65–67): terrain pieces at least 3" apart. On Trench Lines, terrain pieces also at least
    1" from every trench tile. Decor ignores spacing (J decision 3).
1.3 **House field cover** (J 2026-11-24): walls, fences, wired walls, sandbag runs and crate stacks are
    allowed on No Man's Land and Trench Lines, never on Decimated Ruins. At most 4 per half. Each one must
    do one of these jobs, recorded on the piece:
    - **trench support**: within 3" of a trench edge, long axis within 15° of parallel to the trench edge
      it faces;
    - **lane block**: breaks an open lane (§1.6);
    - **objective approach**: 3–8" from an objective's footprint, between it and a DZ.
    A linear piece that is not supporting a trench stands with its long axis 15–45° off the nearest DZ
    inner edge, never parallel or square to it. Linear pieces stay at least 5" from any ruin, tower or
    hill, and at least 5" from another linear piece within 30° of parallel to it.
1.4 **Balanced halves, not a mirror** (J decision 5). Every terrain piece in one half has a partner in
    the other half:
    - same palette category, height within 1", footprint area within 25%;
    - centre within 3" of the point reflected across the centre line;
    - a different model where the category has two or more (J: less copy-paste);
    - rotation set by its own facing rule, not mirrored.
    A piece centred within 1" of the centre line partners itself. Objectives keep their scenario positions.
1.5 **Fairness counts**, equal between halves within the tolerance shown:
    cover footprint area (ratio ≥ 0.85) · blockers at least 6" tall (±1) · Difficult plus Dangerous area
    (ratio ≥ 0.75) · elevated positions (exact) · trench tiles (±1) · open lanes (±1).
1.6 **Open lanes, loose cap** (J 2026-11-24): no straight unblocked gap wider than 8" from one DZ's inner
    edge to the other's, tested along the axis and at ±20° to it, sampled every 0.5". (Today's No Man's
    Land boards leave gaps up to 7–9" wide; this trims the worst, it does not close No Man's Land.)
1.7 **Reachable**: each DZ can reach every objective at ground level (p146). Checked by one flood fill on
    a 1" raster.
1.8 **Edges**: every footprint is on the board and at least 1.3" from the edge.
1.9 **Labels**: every piece is named for its rule and its measured height ("Hill · 3\" · Elevated",
    "Wall · 3\" · Cover"). Stated heights are measured off the model, never nominal (J Nov 17).

## 2. Archetypes

Each archetype follows its own rulebook placement procedure (J decision 2). The order below is the
placement order; each step only adds pieces, never moves earlier ones.

### No Man's Land (p65)
List: trench sections, ruined buildings, corner ruins, hills, Dangerous, Difficult, landmarks; aim for at
least 2 of each.
1. **Trenches only wholly inside a DZ**, none where the scenario bans terrain in the zones. Each DZ gets
   2–3 sections of 1–3 tiles along the zone, separated by gaps of at least one tile, adjacent sections of
   different lengths (J: no single long trench, not uneven between players). The pattern of lengths and
   gaps matches between the two DZs. A DZ is 4–6" deep, so its trenches cannot zig-zag; zig-zags are a
   Trench Lines rule.
2. **Hills** at the current frequency (J decision 1): 60% of boards whose scenario has objectives, relics
   or supplies, 20% otherwise. Hill tops are flush with the ground; anything on a hill gets a ramp; hills
   play at 3".
3. **Objective covers**, then ruins, then landmarks, Difficult and Dangerous, then field cover, then decor.

### Decimated Ruins (p66, J decision 4)
List: at least 6 ruined buildings, at least 2 corner ruins, at least 2 each of Dangerous, Difficult,
landmark. No trenches, no hills, no field cover.
1. **Ruins first.** The first within 2" of the board centre (or the objective covers, if the scenario has
   them). Each later ruin is 3–9" from its nearest ruin and at least 3" from every ruin.
2. Then everything else, at least 3" from all pieces. Then decor.

### Trench Lines (p67)
List: trench sections, corner ruins, Dangerous, Difficult, landmarks, plus house field cover. **No hills,
no ruined buildings, no towers, no raised ground.**
1. **Trenches first.** The first section enters from a board edge; each later section connects; the
   network runs unbroken to the opposite edge. One fire trench per half runs edge to edge through or
   beside its DZ; communication trenches join them.
2. Every terrain piece at least 1" from any trench and 3" from other pieces. Then decor.

## 3. Trenches
3.1 No straight run longer than 6 tiles (24") (J Nov 5).
3.2 Played at 3" deep, climbable.
3.3 Every trench wall without a fire step is lined with planks (J Nov 5).

## 4. Ruins
4.1 **Facing** (J Nov 17–18). Let E point toward the enemy DZ along the axis and M point from the ruin
    toward the centre of the board. The outside corner where the two solid faces meet points within ±20°
    of the direction E + M. A ruin within 3" of the centre line points that corner along the centre line,
    so each DZ faces one solid wall. Pass on screen: from a low angle in the enemy DZ, the ruin shows its
    solid walls, not its open back.
4.2 **Storeys**: never more than 2; 2 only when the footprint's short side is at least 6.75" (J Nov 12).
    The "mostly 1 storey" mix waits on the building asset library (§8).
4.3 Claim No Man's Land: the four outer objectives are ruined buildings (J Nov 17).

## 5. Placement feel
5.1 **Off the grid**: positions are sampled continuously and never snapped to a tile edge, cell centre or
    trench edge. Check: no free terrain piece's centre is within 0.4" of a 4" grid line on either axis.
5.2 **Free rotation**: craters, rubble, landmarks and wrecks turn to any angle. Pieces with a facing rule
    (ruins, field cover) get 2–8° of jitter off their target, never exactly square.
5.3 **No rows**: no three terrain pieces or heaps whose centres lie within 1" of one straight line with
    each within 10" of the next. Heaps count by their centre, so a heap cannot hide a row.
5.4 **Sandbags beside a trench** lie parallel to the trench edge they sit on (within 10°), never sideways
    to it (J Nov 9).

## 6. Objectives
6.1 A covered objective is the terrain piece itself: our symbol on its floor, the 1" aura on the ground
    around the piece, no chip (J Nov 9).
6.2 An open objective is a 40mm spot with our symbol that models pass through (J Nov 5).

## 7. Decor
7.1 Off by default; switched on by the Battlefield panel. Never counts toward density (J Nov 11).
7.2 Comes in heaps of 3–6 pieces, at most 6" across, each heap within 4" of a terrain piece, trench or
    objective. Pieces in a heap turn to any angle.
7.3 Never on a trench or ramp tile, never within 1.6" of an objective marker, never narrows a gap between
    terrain pieces below 1.3".

## 8. Building asset library (next, before Decimated Ruins)
J 2026-11-24: the first job is a library of building types mapped to models. Each type (e.g. small
1-storey ruin, large wide 2-storey ruin, corner ruin, tower) lists the models that fill it, each with its
measured footprint, storeys, height and per-side wall cover. §4.2's storey mix and Decimated Ruins are
built on it.

## 9. How a board is accepted
9.1 One `check(layout)` holds every rule above that the layout data can show. The generator uses the same
    check: a seed that fails is re-drawn (seed + n) up to a fixed number of times, then the generator stops
    with an error naming the failed rule. **No rule is ever relaxed and no degraded board is shipped.**
9.2 Before Jonathan looks, the board is spawned in TTS and screenshotted top-down and from a low angle in
    each DZ. The reviewer passes or fails each of these:
    1. nothing floats, sinks or clips into another piece;
    2. from each DZ, every ruin in the far half shows its solid walls;
    3. planks on every trench wall without a fire step;
    4. sandbags and field cover beside trenches run along the trench;
    5. top-down, no visible rows or grid pattern among free pieces;
    6. hill tops flush with the ground, ramps present;
    7. hover labels match the rule and measured height;
    8. objective bubbles visible; covered objectives carry the symbol;
    9. the halves read as equally dense.

## 10. Not built (deferred until a reviewed board shows the need)
Village street network for Decimated Ruins · wire belts and crater clusters as layouts · height bands ·
wreck angles · infernal-piece caps · saps and duckboards · tower placement rules · walk-distance parity ·
objective exposure sampling · cover-chain graphs · per-board metrics reports · grid statistics ·
aesthetic quotas.
