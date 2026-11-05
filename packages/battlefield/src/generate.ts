import {
  chooseObjectiveCovers,
  compositionTargets,
  coverKeepOut,
  placeDressing,
  placeHill,
  placePlateau,
  placeTallBeside,
  placeTallOnPlateau,
  planObjectivePlateaus,
  registerCovers,
  registerPlateau,
  TALL_MIN_HEIGHT_IN,
  tileCells,
  tileGround,
  TYPE_BY_ROLE,
  type ArchetypeSpec,
  type GroundTile,
  type Hill,
  type Placed,
  type PlacementContext,
  type ObjectivePlateau,
  type Plateau,
} from "./dressing.js";
import { cellAt, cellCentre, cellKey, cellRect, cellsInRect, createGrid, DELTA, Mask, rectFromCentre, rectPointDistance, type Cell, type Grid } from "./grid.js";
import { Layout, LAYOUT_VERSION, type LayoutCell, type LayoutPiece } from "./layout.js";
import { pieceById, rotatedFootprint, rotateVector, rotYTurning, type Palette, type Role } from "./palette.js";
import { createRng, type Rng } from "./rng.js";
import { deploymentTracks, enemyFacing, scenarioOverlay, type ObjectiveSpec, type ScenarioGeometry } from "./scenario.js";
import { DEFAULT_TRENCH_OPTIONS, layTrenchNetwork, resolveTrenchPiece, resolveTrenchPieces, type Axis, type DeploymentTrack, type TrenchNetwork, type TrenchOptions, type TrenchPiece } from "./trench.js";

export * from "./layout.js";
export { Layout as LayoutSchema } from "./layout.js";

export type Archetype = "trench-lines" | "no-mans-land";

export interface GenerateOptions {
  /** "auto" lets the seed choose when there are no deployment lines; with them the spine runs alongside. */
  axis: Axis | "auto";
  branches: number | "auto";
  spacingIn: number;
  trenchClearanceIn: number;
  /** Free pieces keep this far inside the board edge. */
  edgeMarginIn: number;
  maxLateralRun: number;
  allowBranchExits: boolean;
  allowLoops: boolean;
  /** A trench line inside each deployment zone, joined to the network. */
  deploymentLines: boolean;
  plateau: boolean;
  plateauCells: [number, number];
  raisedTrenchChance: number;
  hills: [number, number];
  hillStepChance: number;
  tallPieces: [number, number];
  /** Upright cover pieces (walls, crates, sandbags) to add beyond the archetype list. */
  houseCover: number;
  /** Largest footprint side for an objective cover. */
  maxCoverSideIn: number;
  /** Chance a straight trench cell gets a duckboard along its floor. */
  duckboardChance: number;
}

export const DEFAULT_GENERATE_OPTIONS: GenerateOptions = {
  axis: "auto",
  branches: "auto",
  spacingIn: 3,
  trenchClearanceIn: 1,
  edgeMarginIn: 0.5,
  maxLateralRun: DEFAULT_TRENCH_OPTIONS.maxLateralRun,
  allowBranchExits: DEFAULT_TRENCH_OPTIONS.allowBranchExits,
  allowLoops: DEFAULT_TRENCH_OPTIONS.allowLoops,
  deploymentLines: true,
  plateau: true,
  plateauCells: [2, 6],
  raisedTrenchChance: 0.5,
  hills: [0, 1],
  hillStepChance: 0.6,
  tallPieces: [1, 2],
  houseCover: 4,
  maxCoverSideIn: 7.5,
  duckboardChance: 0.6,
};

export interface GenerateInput {
  scenarioId: string;
  archetype: Archetype;
  seed: number;
  boardIn?: number;
  options?: Partial<GenerateOptions>;
}

export interface GeneratorEnv {
  scenarios: ScenarioGeometry[];
  archetypes: ArchetypeSpec[];
  palette: Palette;
}

export class GenerateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerateError";
  }
}

const BRANCHES_BY_DENSITY = { sparse: [0, 1], medium: [1, 3], dense: [2, 4] } as const;
const ARCHETYPES: readonly Archetype[] = ["trench-lines", "no-mans-land"];

function baseBlocked(grid: Grid, objectives: readonly ObjectiveSpec[], zoneMasks: { spec: { noTerrain: boolean }; mask: Mask }[]): Mask {
  const mask = new Mask(grid);
  for (const o of objectives) {
    const cell = cellAt(grid, o.position[0], o.position[1]);
    if (cell && !o.allowsTrench) mask.set(cell.c, cell.r);
    if (o.keepOutIn > 0) {
      for (let c = 0; c < grid.cols; c++) for (let r = 0; r < grid.rows; r++) if (rectPointDistance(cellRect(grid, c, r), o.position[0], o.position[1]) < o.keepOutIn) mask.set(c, r);
    }
  }
  for (const zone of zoneMasks) if (zone.spec.noTerrain) for (const cell of zone.mask.cells()) mask.set(cell.c, cell.r);
  return mask;
}

interface TrenchAttempt {
  network: TrenchNetwork;
  covers: ReturnType<typeof chooseObjectiveCovers>;
  attempts: number;
  shrinks: number;
}

// Big objective covers can wall the trench off, so each cover configuration
// gets a few fresh draws (new offsets, new walks) before the largest cover
// steps down a size level.
function layTrenchWithCovers(grid: Grid, rng: Rng, seed: number, palette: Palette, objectives: ObjectiveSpec[], blocked: Mask, tracks: DeploymentTrack[], mode: TrenchOptions["mode"], opts: GenerateOptions, archetype: ArchetypeSpec, raised: ObjectivePlateau | null, maxShrinks = Number.POSITIVE_INFINITY): TrenchAttempt {
  const axes: Axis[] = tracks.length ? [tracks[0]!.along] : opts.axis === "auto" ? rng.shuffle(["x", "y"] as const) : [opts.axis];
  const fromLowEdge = rng.chance(0.5);
  const [lo, hi] = BRANCHES_BY_DENSITY[archetype.density];
  // Deployment lines and their communication trenches already fill much of a 36in board.
  const branches = opts.branches === "auto" ? (tracks.length ? rng.intBetween(0, 1) : rng.intBetween(lo, hi)) : opts.branches;
  const levels = new Map<string, number>();
  const avoid = tracks.flatMap((t) => t.cells.map((cell) => cellRect(grid, cell.c, cell.r)));
  const pieces = raised ? [...raised.plateau.cells, ...raised.plateau.ramps.map((r) => r.cell)].map((cell) => cellRect(grid, cell.c, cell.r)) : [];
  const rules = { boardIn: grid.boardIn, maxCoverSideIn: opts.maxCoverSideIn, edgeMarginIn: opts.edgeMarginIn, spacingIn: opts.spacingIn, trenchClearanceIn: opts.trenchClearanceIn, avoid, pieces };
  const others = raised ? objectives.filter((o) => o.id !== raised.objectiveId) : objectives;
  const withRaised = (covers: ReturnType<typeof chooseObjectiveCovers>) => (raised ? [raised.cover, ...covers] : covers);
  const baseBlocked = raised ? blocked.or(raised.keepOut) : blocked;
  let attempts = 0;
  let shrinks = 0;
  for (;;) {
    let covers = withRaised(chooseObjectiveCovers(palette, rng, others, levels, rules));
    for (let draw = 0; draw < 3; draw++) {
      if (draw > 0) covers = withRaised(chooseObjectiveCovers(palette, rng, others, levels, rules));
      const trenchBlocked = baseBlocked.or(coverKeepOut(grid, covers, opts.trenchClearanceIn));
      for (const maxLateralRun of [opts.maxLateralRun, 99]) {
        for (const axis of axes) {
          attempts++;
          const trenchOpts: TrenchOptions = { ...DEFAULT_TRENCH_OPTIONS, mode, axis, fromLowEdge, branches, maxLateralRun, allowBranchExits: opts.allowBranchExits, allowLoops: opts.allowLoops, tracks };
          const network = layTrenchNetwork(grid, trenchBlocked, rng, trenchOpts);
          if (network) return { network, covers, attempts, shrinks };
        }
      }
    }
    const candidates = shrinks < maxShrinks ? covers.filter((c) => c.objectiveId !== raised?.objectiveId && (levels.get(c.objectiveId) ?? 0) < 2) : [];
    if (!candidates.length) throw new GenerateError(`no trench network for seed ${seed} after ${attempts} attempts${covers.length ? " with every objective cover at its smallest" : ""}`);
    const largest = candidates.reduce((a, b) => ((b.rect.x1 - b.rect.x0) * (b.rect.y1 - b.rect.y0) > (a.rect.x1 - a.rect.x0) * (a.rect.y1 - a.rect.y0) ? b : a));
    levels.set(largest.objectiveId, (levels.get(largest.objectiveId) ?? 0) + 1);
    shrinks++;
  }
}

function makeRaisedCover(raised: ObjectivePlateau): Placed {
  const { cover } = raised;
  return {
    id: `o-${cover.objectiveId}`,
    role: cover.placeable.role,
    kind: "cover",
    rects: [cover.rect],
    placeable: cover.placeable,
    centre: [(cover.rect.x0 + cover.rect.x1) / 2, (cover.rect.y0 + cover.rect.y1) / 2],
    rotY: cover.rotY,
    cells: null,
    objectiveId: cover.objectiveId,
    onPlateau: true,
    typeId: TYPE_BY_ROLE[cover.placeable.role] ?? null,
  };
}

interface Builder {
  pieces: LayoutPiece[];
  byId: Map<string, LayoutPiece>;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000 + 0;

function addPiece(b: Builder, palette: Palette, p: { id: string; paletteId: string; role?: Role; rotY: number; centre: [number, number]; cells?: Cell[] | null; supports?: LayoutPiece[]; baseIn?: number; groupId?: string | null; objectiveId?: string | null }): LayoutPiece {
  const entry = pieceById(palette, p.paletteId);
  const supports = p.supports ?? [];
  const cells = p.cells ?? null;
  const anchor = cells ? cells.reduce((a, c) => (c.r < a.r || (c.r === a.r && c.c < a.c) ? c : a)) : null;
  const piece: LayoutPiece = {
    id: p.id,
    role: p.role ?? entry.role,
    paletteId: entry.id,
    assetId: entry.assetId,
    layer: entry.layer,
    cell: anchor ? [anchor.c, anchor.r] : null,
    cells: cells ? cells.map((c) => [c.c, c.r] as [number, number]) : null,
    position: [round3(p.centre[0]), round3(p.centre[1])],
    footprintIn: rotatedFootprint(entry, p.rotY),
    rotY: (((p.rotY % 360) + 360) % 360) as 0 | 90 | 180 | 270,
    zOrder: supports.length ? Math.max(...supports.map((s) => s.zOrder)) + 1 : 0,
    baseIn: round3(p.baseIn ?? (supports.length ? Math.max(...supports.map((s) => s.baseIn + (pieceById(palette, s.paletteId).topIn ?? 0))) : 0)),
    supportIds: supports.map((s) => s.id),
    groupId: p.groupId ?? null,
    objectiveId: p.objectiveId ?? null,
  };
  b.pieces.push(piece);
  b.byId.set(piece.id, piece);
  return piece;
}

/** Height of the top a piece offers to what stands on it. */
const topOf = (palette: Palette, piece: LayoutPiece): number => piece.baseIn + (pieceById(palette, piece.paletteId).topIn ?? 0);

// Cover size caps to step down through when the archetype's minimums do not fit.
const COVER_CAPS_IN = [7.5, 6.2, 5.2, 4] as const;

const missesMinimum = (layout: Layout): boolean => layout.stats.shortfalls.some((s) => s.placed < s.min);

/**
 * Lays a battlefield. When the archetype's minimum of some listed type does
 * not fit (big objective covers can fill a 36in board), the same seed is laid
 * again with the covers capped smaller, down to 4in; the step is recorded.
 */
export function generateBattlefield(input: GenerateInput, env: GeneratorEnv): Layout {
  const requested = input.options?.maxCoverSideIn ?? DEFAULT_GENERATE_OPTIONS.maxCoverSideIn;
  const caps = [requested, ...COVER_CAPS_IN.filter((cap) => cap < requested)];
  let layout: Layout | null = null;
  for (const cap of caps) {
    layout = generateOnce({ ...input, options: { ...input.options, maxCoverSideIn: cap } }, env);
    if (!missesMinimum(layout)) {
      if (cap < requested) layout.stats.warnings.push(`objective covers capped at ${cap}in so the archetype's minimums fit`);
      return layout;
    }
  }
  return layout!;
}

function generateOnce(input: GenerateInput, env: GeneratorEnv): Layout {
  if (!ARCHETYPES.includes(input.archetype)) throw new GenerateError(`archetype ${String(input.archetype)} is not supported; v1 lays Trench Lines and No Man's Land`);
  const scenario = env.scenarios.find((s) => s.id === input.scenarioId);
  if (!scenario) throw new GenerateError(`unknown scenario "${input.scenarioId}"`);
  const archetype = env.archetypes.find((a) => a.id === input.archetype);
  if (!archetype) throw new GenerateError(`archetype ${input.archetype} missing from terrain data`);
  const opts: GenerateOptions = { ...DEFAULT_GENERATE_OPTIONS, ...input.options };
  const boardIn = input.boardIn ?? 36;
  const grid = createGrid(boardIn, env.palette.cellIn);
  const palette = env.palette;
  const sense = palette.rotation.rotYSense;
  const rng = createRng(input.seed);
  const warnings: string[] = [];
  if (scenario.battlefield.widthIn !== boardIn || scenario.battlefield.depthIn !== boardIn) warnings.push(`scenario expects ${scenario.battlefield.widthIn}x${scenario.battlefield.depthIn}in, laying ${boardIn}x${boardIn}`);
  const archetypeMatchesScenario = scenario.archetypes.includes("any") || scenario.archetypes.includes(input.archetype);
  if (!archetypeMatchesScenario) warnings.push(`scenario ${scenario.id} lists ${scenario.archetypes.join("/")}, not ${input.archetype}`);

  const overlay = scenarioOverlay(scenario);
  const zoneMasks = overlay.zones.map((spec) => ({ spec, mask: Mask.fromPolygon(grid, spec.polygon) }));
  const objectiveMask = Mask.fromPoints(
    grid,
    overlay.objectives.map((o) => o.position),
  );
  const blocked = baseBlocked(grid, overlay.objectives, zoneMasks);
  const tracks = opts.deploymentLines ? deploymentTracks(grid, overlay.zones, warnings) : [];
  const mode = input.archetype === "no-mans-land" ? "deployment-only" : "trench-lines";
  if (tracks.length && opts.axis !== "auto" && opts.axis !== tracks[0]!.along) warnings.push(`axis ${opts.axis} overridden: the spine runs alongside the deployment lines`);

  // An objective may sit on a raised plateau: the one nearest the centre first, then the next ones out. If the
  // trench cannot get round any of them, a plateau goes on open ground after the trench instead.
  const reserved = Mask.fromCells(grid, tracks.flatMap((t) => t.cells));
  const noTerrain = zoneMasks.filter((z) => z.spec.noTerrain).reduce((m, z) => m.or(z.mask), new Mask(grid));
  const plans = opts.plateau ? planObjectivePlateaus(grid, rng, palette, overlay.objectives, blocked, reserved, noTerrain, opts.edgeMarginIn) : [];
  let raised: ObjectivePlateau | null = null;
  let laid: TrenchAttempt | null = null;
  for (const plan of plans.slice(0, 8)) {
    try {
      laid = layTrenchWithCovers(grid, rng, input.seed, palette, overlay.objectives, blocked, tracks, mode, opts, archetype, plan, 3);
      raised = plan;
      break;
    } catch (e) {
      if (!(e instanceof GenerateError)) throw e;
    }
  }
  if (plans.length && !raised) warnings.push("no objective could be raised: the trench had no way round any plateau");
  laid ??= layTrenchWithCovers(grid, rng, input.seed, palette, overlay.objectives, blocked, tracks, mode, opts, archetype, null);
  const { network, covers, attempts, shrinks } = laid;
  warnings.push(...network.warnings);
  const enemyOf = enemyFacing(grid, overlay.zones, () => rng.chance(0.5));
  const trenchPieces = resolveTrenchPieces(network, palette, rng, enemyOf);

  const trenchMask = Mask.fromCells(grid, network.cells);
  const ctx: PlacementContext = {
    grid,
    rng,
    palette,
    trenchRects: network.cells.map((cell) => cellRect(grid, cell.c, cell.r)),
    trenchMask,
    zones: zoneMasks,
    objectives: overlay.objectives,
    objectiveMask,
    occupiedGround: trenchMask.clone(),
    featureMask: new Mask(grid),
    plateauTop: new Mask(grid),
    trackMask: Mask.fromCells(grid, tracks.flatMap((t) => t.cells)),
    placed: [],
    spacingIn: opts.spacingIn,
    trenchClearanceIn: opts.trenchClearanceIn,
    edgeMarginIn: opts.edgeMarginIn,
    sightAxis: tracks[0]?.along === "y" ? "x" : tracks[0]?.along === "x" ? "y" : null,
  };
  if (raised) registerPlateau(ctx, raised.plateau);
  const coverResult = registerCovers(ctx, covers.filter((c) => c.objectiveId !== raised?.objectiveId));
  if (raised) {
    const onTop = makeRaisedCover(raised);
    ctx.placed.push(onTop);
    coverResult.placed.push(onTop);
  }
  warnings.push(...coverResult.warnings);

  // A plateau that is not on an objective goes down before the dressing, so it gets first pick of open ground.
  let plateau: Plateau | null = raised?.plateau ?? null;
  if (opts.plateau && !raised) {
    plateau = placePlateau(ctx, rng.intBetween(opts.plateauCells[0], opts.plateauCells[1]), opts.raisedTrenchChance);
    if (!plateau) warnings.push("no room for a plateau");
    else if (plateau.raisedTrench) ctx.trenchRects.push(cellRect(grid, plateau.raisedTrench.cell.c, plateau.raisedTrench.cell.r));
  }
  // The archetype's minimum of each listed type goes down before the house extras (tall pieces, hills, upright cover).
  const counted = new Map<string, number>();
  const count = (placed: readonly Placed[]) => {
    for (const p of placed) if (p.typeId) counted.set(p.typeId, (counted.get(p.typeId) ?? 0) + 1);
  };
  count(coverResult.placed);
  const targets = compositionTargets(archetype, opts.houseCover);
  const minimums = placeDressing(
    ctx,
    targets.map((t) => ({ ...t, target: Math.min(t.target, t.min) })),
    counted,
    "m",
    true,
  );
  count(minimums.placed);
  const hillMin = archetype.composition.find((c) => c.typeId === "hill") ? 2 - (plateau ? 1 : 0) : 0;
  const hillsWanted = Math.max(rng.intBetween(opts.hills[0], opts.hills[1]), hillMin);
  const hills: Hill[] = [];
  for (let i = 0; i < hillsWanted; i++) {
    const hill = placeHill(ctx, `hill-${i}`, rng.intBetween(1, 2), opts.hillStepChance);
    if (hill) hills.push(hill);
  }
  // A tower or multi-storey ruin standing on the raised objective is already one of the tall pieces.
  const tallWanted = Math.max(0, rng.intBetween(opts.tallPieces[0], opts.tallPieces[1]) - (raised && raised.cover.placeable.heightIn >= TALL_MIN_HEIGHT_IN ? 1 : 0));
  const tall: Placed[] = [];
  for (let i = 0; i < tallWanted; i++) {
    const id = `tall-${i}`;
    const placed = (i === 0 && plateau && !raised ? placeTallOnPlateau(ctx, plateau, id) : null) ?? placeTallBeside(ctx, id);
    if (placed) tall.push(placed);
  }
  if (tall.length < tallWanted) warnings.push(`placed ${tall.length} of ${tallWanted} tall pieces`);

  count(tall);
  if (plateau || hills.length) counted.set("hill", (plateau ? 1 : 0) + hills.length);
  const fill = placeDressing(ctx, targets, counted);
  const dressing = { placed: [...minimums.placed, ...fill.placed], shortfalls: fill.shortfalls };

  // ---- assemble pieces ------------------------------------------------------
  const b: Builder = { pieces: [], byId: new Map() };
  const baseByCell = new Map<string, LayoutPiece>();
  const upperByCell = new Map<string, LayoutPiece[]>();
  const addUpper = (cell: Cell, piece: LayoutPiece) => upperByCell.set(cellKey(cell.c, cell.r), [...(upperByCell.get(cellKey(cell.c, cell.r)) ?? []), piece]);
  const wallsByCell = new Map<string, LayoutCell["walls"]>();
  let revetments = 0;

  const trenchCounts = { straight: 0, corner: 0, t: 0 };
  const layTrench = (cell: Cell, resolved: TrenchPiece, id: string, supports: LayoutPiece[]) => {
    const trench = addPiece(b, palette, { id, paletteId: resolved.paletteId, rotY: resolved.rotY, centre: cellCentre(grid, cell.c, cell.r), cells: [cell], supports, baseIn: supports.length ? Math.max(...supports.map((s) => topOf(palette, s))) : 0 });
    const walls: NonNullable<LayoutCell["walls"]> = resolved.lined.map((l) => ({ side: l.side, kind: l.kind }));
    const fence = pieceById(palette, palette.revetment.pieceId);
    for (const side of resolved.fences) {
      const [dx, dy] = DELTA[side];
      const [cx, cy] = cellCentre(grid, cell.c, cell.r);
      addPiece(b, palette, {
        id: `v-${cell.c}-${cell.r}-${side}`,
        paletteId: fence.id,
        rotY: rotYTurning("W", side, sense),
        centre: [cx + dx * palette.revetment.insetIn, cy + dy * palette.revetment.insetIn],
        supports: [trench],
        baseIn: trench.baseIn + palette.revetment.bottomAboveTrenchBaseIn,
      });
      walls.push({ side, kind: "revetment" });
      revetments++;
    }
    wallsByCell.set(cellKey(cell.c, cell.r), walls);
    const entry = pieceById(palette, resolved.paletteId);
    if (entry.role === "trench-straight" && entry.channelFloorIn !== undefined && rng.chance(opts.duckboardChance)) {
      const ledge = resolved.lined.find((l) => l.kind === "ledge");
      const shift: [number, number] = ledge ? [-DELTA[ledge.side][0] * 0.3, -DELTA[ledge.side][1] * 0.3] : [0, 0];
      const [cx, cy] = cellCentre(grid, cell.c, cell.r);
      const channelAlongY = [...resolved.fences, ...resolved.lined.map((l) => l.side)].some((s) => s === "E" || s === "W");
      addPiece(b, palette, { id: `k-${cell.c}-${cell.r}`, paletteId: "plank-floor", rotY: channelAlongY ? 0 : 90, centre: [cx + shift[0], cy + shift[1]], supports: [trench], baseIn: trench.baseIn + entry.channelFloorIn });
    }
    if (entry.role === "trench-straight") trenchCounts.straight++;
    else if (entry.role === "trench-corner") trenchCounts.corner++;
    else trenchCounts.t++;
    return trench;
  };

  for (const cell of network.cells) {
    const trench = layTrench(cell, trenchPieces.get(cellKey(cell.c, cell.r))!, `t-${cell.c}-${cell.r}`, []);
    baseByCell.set(cellKey(cell.c, cell.r), trench);
  }

  const craterTiles = dressing.placed.filter((p) => p.kind === "crater-tile");
  for (const p of craterTiles) {
    const piece = addPiece(b, palette, { id: p.id, paletteId: p.placeable!.key, rotY: 0, centre: p.centre, cells: p.cells });
    for (const cell of p.cells!) baseByCell.set(cellKey(cell.c, cell.r), piece);
  }

  const occupied = trenchMask.clone();
  for (const p of craterTiles) for (const cell of p.cells!) occupied.set(cell.c, cell.r);
  const groundTiles = tileGround(grid, occupied, palette, rng, ctx.featureMask);
  const layTiles = (tiles: GroundTile[], prefix: string, stacked: boolean) =>
    tiles.map((tile) => {
      const supports = stacked ? [...new Set(tile.cells.map((cell) => baseByCell.get(cellKey(cell.c, cell.r))!))] : [];
      const piece = addPiece(b, palette, { id: `${prefix}-${tile.cells[0]!.c}-${tile.cells[0]!.r}`, paletteId: tile.paletteId, rotY: tile.rotY, centre: [(tile.rect.x0 + tile.rect.x1) / 2, (tile.rect.y0 + tile.rect.y1) / 2], cells: tile.cells, supports });
      for (const cell of tile.cells) (stacked ? (c: Cell) => addUpper(c, piece) : (c: Cell) => baseByCell.set(cellKey(c.c, c.r), piece))(cell);
      return piece;
    });
  layTiles(groundTiles, "g", false);

  let stackedTiles: LayoutPiece[] = [];
  let tallOnPlateauId: string | null = null;
  if (plateau) {
    const tops = plateau.cells.filter((cell) => ctx.plateauTop.get(cell.c, cell.r));
    stackedTiles = layTiles(tileCells(grid, tops, palette, rng, Mask.fromCells(grid, tops)), "s", true);
    const ramp = pieceById(palette, "hill-ramp");
    for (const r of plateau.ramps) {
      const base = baseByCell.get(cellKey(r.cell.c, r.cell.r))!;
      addUpper(r.cell, addPiece(b, palette, { id: `ramp-${r.cell.c}-${r.cell.r}`, paletteId: ramp.id, rotY: rotYTurning(ramp.uphill!.rotY0, r.up, sense), centre: cellCentre(grid, r.cell.c, r.cell.r), cells: [r.cell], supports: [base] }));
    }
    if (plateau.raisedTrench) {
      const { cell, openings } = plateau.raisedTrench;
      const base = baseByCell.get(cellKey(cell.c, cell.r))!;
      addUpper(cell, layTrench(cell, resolveTrenchPiece(openings, palette, rng, enemyOf(cell)), `rt-${cell.c}-${cell.r}`, [base]));
    }
  }
  for (const hill of hills) {
    for (const cell of hill.cells) {
      const base = baseByCell.get(cellKey(cell.c, cell.r))!;
      const block = addPiece(b, palette, { id: `${hill.id}-${cell.c}-${cell.r}`, paletteId: "h4x4", rotY: 0, centre: cellCentre(grid, cell.c, cell.r), cells: [cell], supports: [base] });
      addUpper(cell, block);
      if (hill.stepped.some((s) => s.c === cell.c && s.r === cell.r)) addUpper(cell, addPiece(b, palette, { id: `${hill.id}-${cell.c}-${cell.r}-top`, paletteId: "h4x4", rotY: 0, centre: cellCentre(grid, cell.c, cell.r), cells: [cell], supports: [block] }));
    }
  }

  // Free pieces rest on whatever tiles their footprint covers: stacked tiles on the plateau, the ground layer elsewhere.
  const stackedByCell = new Map<string, LayoutPiece>();
  for (const tile of stackedTiles) for (const [c, r] of tile.cells!) stackedByCell.set(cellKey(c, r), tile);
  const layFree = (p: Placed) => {
    const placeable = p.placeable!;
    p.placeable!.members.forEach((m, i) => {
      const rotY = (p.rotY + m.rotY) % 360;
      const [ox, oy] = rotateVector(m.at, p.rotY, sense);
      const centre: [number, number] = [p.centre[0] + ox, p.centre[1] + oy];
      const [w, d] = rotatedFootprint(pieceById(palette, m.pieceId), rotY);
      const under = cellsInRect(grid, rectFromCentre(centre[0], centre[1], w, d));
      const supports = [...new Set(under.map((cell) => (p.onPlateau ? stackedByCell : baseByCell).get(cellKey(cell.c, cell.r))).filter((s): s is LayoutPiece => s !== undefined))];
      if (!supports.length) throw new GenerateError(`${p.id} has nothing under it`);
      const single = placeable.members.length === 1;
      const piece = addPiece(b, palette, { id: single ? p.id : `${p.id}.${i}`, paletteId: m.pieceId, rotY, centre, supports, groupId: single ? null : p.id, objectiveId: p.objectiveId });
      if (p.onPlateau && (p.kind === "tall" || p.kind === "cover")) tallOnPlateauId = piece.id;
    });
  };
  for (const p of [...coverResult.placed, ...tall, ...dressing.placed.filter((x) => x.kind !== "crater-tile")]) layFree(p);

  // ---- cells ----------------------------------------------------------------
  const plateauKeys = new Set(plateau?.cells.map((c) => cellKey(c.c, c.r)) ?? []);
  const rampByKey = new Map(plateau?.ramps.map((r) => [cellKey(r.cell.c, r.cell.r), r.up]) ?? []);
  const hillKeys = new Set(hills.flatMap((h) => h.cells.map((c) => cellKey(c.c, c.r))));
  const raisedKey = plateau?.raisedTrench ? cellKey(plateau.raisedTrench.cell.c, plateau.raisedTrench.cell.r) : null;
  const trenchByKey = new Map(network.cells.map((cell) => [cellKey(cell.c, cell.r), cell]));
  const cells: LayoutCell[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const key = cellKey(c, r);
      const base = baseByCell.get(key);
      if (!base) throw new GenerateError(`cell ${c},${r} was left empty`);
      const uppers = upperByCell.get(key) ?? [];
      const trench = trenchByKey.get(key);
      const feature = key === raisedKey ? "raised-trench" : rampByKey.has(key) ? "ramp" : plateauKeys.has(key) ? "plateau" : hillKeys.has(key) ? "hill" : null;
      const topPiece = [base, ...uppers].filter((p) => p.role !== "ramp" && p.role !== "revetment" && p.role !== "decor").reduce((a, p) => (p.zOrder > a.zOrder ? p : a));
      const isTrenchTop = pieceById(palette, topPiece.paletteId).role.startsWith("trench");
      cells.push({
        c,
        r,
        kind: trench ? "trench" : base.role === "crater" ? "crater" : "ground",
        pieceId: base.id,
        ...(trench ? { openings: trench.openings } : {}),
        ...(wallsByCell.has(key) ? { walls: wallsByCell.get(key) } : {}),
        feature,
        rampUp: rampByKey.get(key) ?? null,
        topIn: round3(isTrenchTop ? topPiece.baseIn + pieceById(palette, topPiece.paletteId).heightIn : topOf(palette, topPiece)),
        upperPieceIds: uppers.map((p) => p.id),
      });
    }
  }

  const piecesByRole: Record<string, number> = {};
  for (const p of b.pieces) piecesByRole[p.role] = (piecesByRole[p.role] ?? 0) + 1;
  const listed = new Set(archetype.composition.map((c) => c.typeId));
  const houseRules = new Set<string>();
  for (const p of [...coverResult.placed, ...tall, ...dressing.placed]) {
    const typeId = TYPE_BY_ROLE[p.role];
    if (typeId && !listed.has(typeId)) houseRules.add(typeId);
  }
  if ((plateau || hills.length) && !listed.has("hill")) houseRules.add("hill");

  const layout: Layout = {
    version: LAYOUT_VERSION,
    seed: input.seed,
    scenarioId: scenario.id,
    archetype: input.archetype,
    boardIn,
    cellIn: grid.cellIn,
    grid: { cols: grid.cols, rows: grid.rows },
    cells,
    pieces: b.pieces,
    trench: {
      axis: network.axis,
      mode: network.mode,
      start: network.start,
      end: network.end,
      exits: network.exits,
      mainPathLength: network.mainPathLength,
      branches: network.branches,
      loops: network.loops,
      deploymentLines: network.deploymentLines.map((l) => ({
        player: l.player,
        zoneLabel: l.zoneLabel,
        side: l.side,
        variant: l.variant,
        cells: l.cells.map((c) => [c.c, c.r] as [number, number]),
        commCells: l.commCells.map((c) => [c.c, c.r] as [number, number]),
      })),
    },
    plateau: plateau
      ? {
          cells: plateau.cells.map((c) => [c.c, c.r] as [number, number]),
          ramps: plateau.ramps.map((r) => ({ cell: [r.cell.c, r.cell.r] as [number, number], up: r.up })),
          raisedTrench: plateau.raisedTrench ? [plateau.raisedTrench.cell.c, plateau.raisedTrench.cell.r] : null,
          tallPieceId: tallOnPlateauId,
        }
      : null,
    hills: hills.map((h) => ({ id: h.id, cells: h.cells.map((c) => [c.c, c.r] as [number, number]), stepped: h.stepped.map((c) => [c.c, c.r] as [number, number]) })),
    objectives: overlay.objectives.map((o) => {
      const cell = cellAt(grid, o.position[0], o.position[1]);
      if (!cell) throw new GenerateError(`objective ${o.id} at ${o.position.join(",")} is off the board`);
      const cover = coverResult.placed.find((p) => p.objectiveId === o.id);
      return { id: o.id, label: o.label, position: o.position, cell: [cell.c, cell.r], requiresCover: o.requiresCover, coverPieceId: cover ? cover.id : null };
    }),
    deploymentZones: zoneMasks.map(({ spec, mask }) => ({
      player: spec.player,
      label: spec.label,
      polygon: spec.polygon,
      isDeployment: spec.isDeployment,
      noTerrain: spec.noTerrain,
      cells: mask.cells().map((cell) => [cell.c, cell.r] as [number, number]),
    })),
    stats: {
      trenchCells: network.cells.length,
      trenchPieces: trenchCounts,
      deploymentLineCells: network.deploymentLines.reduce((n, l) => n + l.cells.length, 0),
      revetments,
      piecesByRole,
      groundTiles: groundTiles.length,
      stackedTiles: stackedTiles.length,
      dressingPieces: coverResult.placed.length + tall.length + dressing.placed.length,
      tallPieces: b.pieces.filter((p) => (p.role === "tower" || p.role === "building") && pieceById(palette, p.paletteId).heightIn >= TALL_MIN_HEIGHT_IN).length,
      totalPieces: b.pieces.length,
      coverShrinks: shrinks,
      trenchAttempts: attempts,
      shortfalls: dressing.shortfalls,
      houseRules: [...houseRules].sort(),
      warnings,
      archetypeMatchesScenario,
    },
  };
  return Layout.parse(layout);
}
