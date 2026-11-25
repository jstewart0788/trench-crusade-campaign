# The studio: battlefields made end to end

Status: **proposal**, 2026-11-24. Jonathan wants to generate as much of each battlefield as we can
ourselves so everything shares one aesthetic, working as "a studio of one" that builds battlefields one
after another. Each battlefield goes through the same five stages. Every stage leaves an artifact in the
repo, so a battlefield can be rebuilt or revised.

## Pipeline (one battlefield)

1. **Brief.** Scenario, archetype, a one-line story, the hero piece, which faction owns which side, the
   region look (Flanders or Somme). Written against `reference-boards.md` and `battlefield-spec.md`.
2. **Storyboard.** Images before any 3D:
   - a top-down layout sketch;
   - two or three mood shots at model eye height;
   - a concept sheet per piece the board needs that we don't already have.

   Jonathan approves the storyboard; this is the cheapest place to change our minds.
3. **Assets.** For each new piece: concept image → 3D model → Blender cleanup → TTS-ready model. It is
   tagged into `data/tts/asset-library.json` and checked in TTS next to existing pieces.
4. **Assembly.** The board is laid out in TTS from the storyboard, using chosen library pieces and the
   new ones. Then the presentation pass: ground texture, decals, tints, lighting, effects, camera views.
   The layout is saved as a battlefield definition the API serves.
5. **Playtest and review.** The 3D check from the spec, then Jonathan's look, then a real game. Findings
   go back into the library and the brief template.

## Tooling (all local, free, scriptable)

| Stage | Tool | Notes |
|---|---|---|
| Storyboard / concept images | FLUX via `mflux` (MLX, Apple Silicon) | To verify: runs on the M1 Max 32 GB, speed, quality. Fallback: Jonathan's own image tool. |
| Image → 3D | TRELLIS.2, `trellis-mac` port | Needs ≥24 GB; outputs GLB. Community port, unproven here. |
| Cleanup | Blender, scripted headless (`bpy`) | Decimate to <25k verts, collider <255 tris, textures ≤4096 power-of-two, scale to inches, sink the base, export OBJ + PNG. |
| Hosting | our server (`apps/web/public`) | Same route the mod already loads images from. |
| Assembly | `scripts/tts_asset_board.py` and `tts_exec.py` | Extend to place from a layout file. |

Hosted alternatives (Meshy, Tripo, Rodin) stay available if the local route falls short; past their free
tiers they cost money, which is Jonathan's call.

## The hard part: large buildings
An AI mesh of a ruin looks right but plays wrong: floors aren't flat, wall heights aren't measurable, and
the collider is a blob. Two approaches, to be tested side by side:
- **A. Generate whole, fix in Blender.** Generate the building, then script the fixes: flat floor slabs
  at each storey height, box colliders per wall, and a measured height.
- **B. Generate a kit.** For one building style, generate wall sections, corners, floor slabs, a stair
  and rubble. Assemble buildings from the kit. Floors are flat and heights consistent by construction;
  variety comes from the arrangement.

My expectation (unproven): B for buildings players fight in, A for centerpieces and landmarks that are
mostly looked at.

## First steps
1. Install and smoke-test the three tools: `mflux`, `trellis-mac` and Blender. About 30 GB of models.
2. A single-prop trial: the artillery-shell field shrine, from concept image to TTS. This proves the
   pipeline end to end.
3. A large-building trial: one ruined two-storey building done both ways (A and B), judged in TTS against
   0f9003 (the reference large 2-storey).
4. The first full battlefield through all five stages.
