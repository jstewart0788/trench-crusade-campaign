import {
  chooseObjectiveCovers,
  compositionTargets,
  coverKeepOut,
  dressFaces,
  mergePlans,
  placeScatter,
  placeTallOnPlateau,
  placeTallPair,
  placeTerrainSlots,
  placeTwinHills,
  placeTwinPlateaus,
  planCentreHills,
  planCentrePlateaus,
  planObjectiveHills,
  registerCovers,
  registerFeature,
  registerPlateau,
  TALL_MIN_HEIGHT_IN,
  type Aesthetic,
  type ArchetypeSpec,
  type CoverChoice,
  type Hill,
  type Placed,
  type PlacementContext,
  type Plateau,
  type RaisedPlan,
} from "./dressing.js";
import { cellAt, cellCentre, cellKey, cellRect, cellsInRect, createGrid, DELTA, Mask, rectFromCentre, rectPointDistance, type Cell, type Grid } from "./grid.js";
import { Layout, LAYOUT_VERSION, type LayoutCell, type LayoutPiece, type SlotRef } from "./layout.js";
import { chooseParity, mapCell, type Parity, type ParityKind } from "./parity.js";
import { pieceById, rotatedFootprint, rotateVector, rotYTurning, STRUCTURAL_ROLES, type Palette, type Role } from "./palette.js";
import { createRng, type Rng } from "./rng.js";
import { deploymentTracks, enemyFacing, scenarioOverlay, type ObjectiveSpec, type ScenarioGeometry } from "./scenario.js";
import { tileCells, tileGround, type GroundTile } from "./tiles.js";
import { DEFAULT_TRENCH_OPTIONS, layTrenchNetwork, resolveTrenchPiece, resolveTrenchPieces, type Axis, type DeploymentTrack, type TrenchNetwork, type TrenchOptions, type TrenchPiece } from "./trench.js";

export * from "./layout.js";
export { Layout as LayoutSchema } from "./layout.js";

export type Archetype = "trench-lines" | "no-mans-land";

export interface GenerateOptions {
  /** "auto" lets the seed choose when there are no deployment lines; with them the spine runs alongside. */
  axis: Axis | "auto";
  branches: number | "auto";
  spacingIn: number;
  /** Gap scattered terrain keeps from everything, so model bases fit between. */
  scatterGapIn: number;
  trenchClearanceIn: number;
  /** Free pieces keep this far inside the board edge. */
  edgeMarginIn: number;
  maxLateralRun: number;
  allowBranchExits: boolean;
  allowLoops: boolean;
  /** A trench line inside each deployment zone, joined to the network. */
  deploymentLines: boolean;
  /** How the two halves mirror each other; "auto" picks per scenario. */
  parity: ParityKind | "auto";
  plateau: boolean;
  /** Cells in each twin plateau, when the centre cannot be raised. */
  plateauCells: [number, number];
  raisedTrenchChance: number;
  /** Chance a board gets hills; "auto" uses the scenario's rate (hillRateFor). */
  hillRate: number | "auto";
  hillStepChance: number;
  tallPieces: boolean;
  /** Upright cover pieces (walls, crates, emplacements) to aim for beyond the archetype list. */
  houseCover: number;
  /** Largest footprint side for an objective cover. */
  maxCoverSideIn: number;
  /** Step the cover cap down when the archetype's minimums do not fit. */
  relaxCovers: boolean;
  /** Chance a straight trench cell gets a duckboard along its floor. */
  duckboardChance: number;
  /** Chance each exposed plateau face gets sandbags, crates or rubble against it. */
  faceDressingChance: number;
  /** Most times one piece or group fills a slot on a board, unless its category runs out of variants. */
  repeatCap: number;
  /** Object count the scatter fills the board toward. */
  targetObjects: number;
  aesthetic: Aesthetic | null;
}

export const DEFAULT_GENERATE_OPTIONS: GenerateOptions = {
  axis: "auto",
  branches: "auto",
  spacingIn: 3,
  scatterGapIn: 1,
  trenchClearanceIn: 1,
  edgeMarginIn: 0.5,
  maxLateralRun: DEFAULT_TRENCH_OPTIONS.maxLateralRun,
  allowBranchExits: DEFAULT_TRENCH_OPTIONS.allowBranchExits,
  allowLoops: DEFAULT_TRENCH_OPTIONS.allowLoops,
  deploymentLines: true,
  parity: "auto",
  plateau: true,
  plateauCells: [2, 3],
  raisedTrenchChance: 0.5,
  hillRate: "auto",
  hillStepChance: 0.6,
  tallPieces: true,
  houseCover: 4,
  maxCoverSideIn: 7.5,
  relaxCovers: true,
  duckboardChance: 0.6,
  faceDressingChance: 0.8,
  repeatCap: 3,
  targetObjects: 270,
  aesthetic: null,
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

/**
 * Hills on 60% of boards whose scenario has objectives, relics or supplies to
 * fight over (Jonathan likes the climbing they reward there), 20% elsewhere.
 */
export const HILL_RATE_OBJECTIVES = 0.6;
export const HILL_RATE_OPEN = 0.2;

export function hillRateFor(scenario: ScenarioGeometry): number {
  const fought = scenario.objectives.some((o) => !/trench section/i.test(String(o.placementRule ?? "")));
  return fought ? HILL_RATE_OBJECTIVES : HILL_RATE_OPEN;
}

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

/** Without deployment lines, a mirrored board's spine runs down its mirror line, so the trench is its own twin. */
const mirrorSpineAxis = (parity: Parity): Axis | null => (parity.kind === "mirror-x" ? "y" : parity.kind === "mirror-y" ? "x" : null);

interface TrenchAttempt {
  network: TrenchNetwork;
  covers: CoverChoice[];
  attempts: number;
  shrinks: number;
}

interface LayInputs {
  grid: Grid;
  rng: Rng;
  seed: number;
  palette: Palette;
  parity: Parity;
  objectives: ObjectiveSpec[];
  blocked: Mask;
  tracks: DeploymentTrack[];
  mode: TrenchOptions["mode"];
  opts: GenerateOptions;
  archetype: ArchetypeSpec;
}

// Big objective covers can wall the trench off, so each cover configuration
// gets a few fresh draws (new offsets, new walks) before the largest cover
// steps down a size level. Covers on raised ground are fixed with their plan.
function layTrenchWithCovers(p: LayInputs, raised: RaisedPlan | null, maxShrinks = Number.POSITIVE_INFINITY): TrenchAttempt {
  const { grid, rng, opts, tracks } = p;
  const axes: Axis[] = tracks.length ? [tracks[0]!.along] : opts.axis === "auto" ? (mirrorSpineAxis(p.parity) ? [mirrorSpineAxis(p.parity)!] : rng.shuffle(["x", "y"] as const)) : [opts.axis];
  const fromLowEdge = rng.chance(0.5);
  const [lo, hi] = BRANCHES_BY_DENSITY[p.archetype.density];
  const twinned = p.parity.kind !== "none" && tracks.length === 2;
  // Deployment lines and their cross trenches already fill much of a 36in board, and a mirrored board needs
  // room for every slot twice: twin boards and mirrored boards take no branches.
  const branches = opts.branches === "auto" ? (twinned || p.parity.kind !== "none" ? 0 : tracks.length ? rng.intBetween(0, 1) : rng.intBetween(lo, hi)) : opts.branches;
  const levels = new Map<string, number>();
  const avoid = tracks.flatMap((t) => t.cells.map((cell) => cellRect(grid, cell.c, cell.r)));
  const raisedCells = raised ? [...raised.plateaus.flatMap((x) => [...x.cells, ...x.ramps.map((r) => r.cell)]), ...raised.hills.flatMap((h) => h.cells)] : [];
  const pieces = raisedCells.map((cell) => cellRect(grid, cell.c, cell.r));
  const fixed = raised?.covers ?? [];
  const sightAxis: Axis | null = tracks[0]?.along === "y" ? "x" : tracks[0]?.along === "x" ? "y" : null;
  const rules = { grid, parity: p.parity, maxCoverSideIn: opts.maxCoverSideIn, edgeMarginIn: opts.edgeMarginIn, spacingIn: opts.spacingIn, trenchClearanceIn: opts.trenchClearanceIn, avoid, pieces, sightAxis, repeatCap: opts.repeatCap };
  const base = raised ? p.blocked.or(raised.keepOut) : p.blocked;
  let attempts = 0;
  let shrinks = 0;
  for (;;) {
    let covers: CoverChoice[] = [];
    for (let draw = 0; draw < 3; draw++) {
      covers = [...fixed, ...chooseObjectiveCovers(p.palette, rng, p.objectives, fixed, levels, rules)];
      const trenchBlocked = base.or(coverKeepOut(grid, covers.filter((c) => c.base === "ground"), opts.trenchClearanceIn));
      for (const maxLateralRun of [opts.maxLateralRun, 99]) {
        for (const axis of axes) {
          attempts++;
          const trenchOpts: TrenchOptions = { ...DEFAULT_TRENCH_OPTIONS, mode: p.mode, axis, fromLowEdge, branches, maxLateralRun, allowBranchExits: opts.allowBranchExits, allowLoops: opts.allowLoops, tracks, parity: p.parity };
          const network = layTrenchNetwork(grid, trenchBlocked, rng, trenchOpts);
          if (network) return { network, covers, attempts, shrinks };
        }
      }
    }
    const fixedIds = new Set(fixed.map((c) => c.objectiveId));
    const candidates = shrinks < maxShrinks ? covers.filter((c) => !fixedIds.has(c.objectiveId) && (levels.get(c.objectiveId) ?? 0) < 2) : [];
    if (!candidates.length) throw new GenerateError(`no trench network for seed ${p.seed} after ${attempts} attempts${covers.length ? " with every objective cover at its smallest" : ""}`);
    const largest = candidates.reduce((a, b) => ((b.rect.x1 - b.rect.x0) * (b.rect.y1 - b.rect.y0) > (a.rect.x1 - a.rect.x0) * (a.rect.y1 - a.rect.y0) ? b : a));
    for (const c of covers) if (c.placeable.key === largest.placeable.key || c.objectiveId === largest.objectiveId) levels.set(c.objectiveId, (levels.get(c.objectiveId) ?? 0) + 1);
    shrinks++;
  }
}

interface Builder {
  pieces: LayoutPiece[];
  byId: Map<string, LayoutPiece>;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000 + 0;

function addPiece(
  b: Builder,
  palette: Palette,
  p: { id: string; paletteId: string; role?: Role; rotY: number; centre: [number, number]; cells?: Cell[] | null; supports?: LayoutPiece[]; baseIn?: number; groupId?: string | null; objectiveId?: string | null; slot?: SlotRef | null },
): LayoutPiece {
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
    slot: p.slot ?? null,
    objectiveId: p.objectiveId ?? null,
  };
  b.pieces.push(piece);
  b.byId.set(piece.id, piece);
  return piece;
}

/** Height of the top a piece offers to what stands on it. */
const topOf = (palette: Palette, piece: LayoutPiece): number => piece.baseIn + (pieceById(palette, piece.paletteId).topIn ?? 0);

// Cover size caps to step down through when the archetype's minimums do not
// fit, and the fresh layouts each cap gets first. 6.2in still takes the
// smaller ruined buildings; 4in drops to whatever fits.
const COVER_CAPS_IN = [7.5, 6.2, 5.2, 4] as const;
const DRAWS_PER_CAP = [3, 3, 2, 2] as const;

const missingUnits = (layout: Layout): number => layout.stats.shortfalls.reduce((n, s) => n + Math.max(0, s.min - s.placed), 0);
const settled = (layout: Layout): boolean => missingUnits(layout) === 0 && (!layout.stats.hillsWanted || layout.hills.length > 0);

/**
 * Lays a battlefield. The seed fixes the board's look and whether it has
 * hills; when a layout misses the archetype's minimum of some listed type (big
 * objective covers can fill a 36in board) or drew hills it could not fit, the
 * seed's layout is drawn again, and then again with the objective covers
 * capped smaller, down to 4in. The best layout found is returned with the
 * draws and the cap it took recorded.
 */
export function generateBattlefield(input: GenerateInput, env: GeneratorEnv): Layout {
  const requested = input.options?.maxCoverSideIn ?? DEFAULT_GENERATE_OPTIONS.maxCoverSideIn;
  const relax = input.options?.relaxCovers ?? DEFAULT_GENERATE_OPTIONS.relaxCovers;
  const caps = relax ? [requested, ...COVER_CAPS_IN.filter((cap) => cap < requested)] : [requested];
  let best: Layout | null = null;
  let draws = 0;
  for (const [i, cap] of caps.entries()) {
    const perCap = relax ? DRAWS_PER_CAP[Math.min(i, DRAWS_PER_CAP.length - 1)]! : 1;
    for (let draw = 0; draw < perCap; draw++) {
      const layout = generateOnce({ ...input, options: { ...input.options, maxCoverSideIn: cap } }, env, draws++);
      if (!best || missingUnits(layout) < missingUnits(best) || (missingUnits(layout) === missingUnits(best) && settled(layout) && !settled(best))) best = layout;
      if (settled(layout)) break;
    }
    if (settled(best!)) break;
  }
  best!.stats.layoutDraws = draws;
  if (best!.stats.coverCapIn < requested) best!.stats.warnings.push(`objective covers capped at ${best!.stats.coverCapIn}in so the archetype's minimums${best!.stats.hillsWanted ? " and the hills" : ""} fit`);
  return best!;
}

/** The layout stream for a redraw: the same seed, a different walk. */
const drawSeed = (seed: number, draw: number): number => (draw === 0 ? seed : (Math.imul(seed ^ 0x5bd1e995, 0x27d4eb2d) + Math.imul(draw, 0x165667b1)) | 0);

function pickAesthetic(rng: Rng, palette: Palette): Aesthetic {
  const primary = rng.pick(palette.aesthetics);
  const others = palette.aesthetics.filter((a) => a !== primary);
  return { primary, secondary: rng.chance(0.5) && others.length ? rng.pick(others) : null };
}

const STRUCTURAL_NAMES: Partial<Record<Role, string>> = {
  ground: "ground",
  "trench-straight": "trench",
  "trench-corner": "trench",
  "trench-t": "trench",
  "trench-entrance": "trench",
  revetment: "log-fence",
  decor: "duckboard",
  ramp: "ramp",
  hill: "hill",
};

function generateOnce(input: GenerateInput, env: GeneratorEnv, draw = 0): Layout {
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
  const decide = createRng(input.seed);
  const warnings: string[] = [];
  if (scenario.battlefield.widthIn !== boardIn || scenario.battlefield.depthIn !== boardIn) warnings.push(`scenario expects ${scenario.battlefield.widthIn}x${scenario.battlefield.depthIn}in, laying ${boardIn}x${boardIn}`);
  const archetypeMatchesScenario = scenario.archetypes.includes("any") || scenario.archetypes.includes(input.archetype);
  if (!archetypeMatchesScenario) warnings.push(`scenario ${scenario.id} lists ${scenario.archetypes.join("/")}, not ${input.archetype}`);

  const overlay = scenarioOverlay(scenario);
  const parity = chooseParity(overlay, boardIn, opts.parity);
  if (parity.kind !== "none" && !parity.objectivesMatch) warnings.push(`the objectives have no ${parity.kind} twin: they stand alone`);
  const aesthetic = opts.aesthetic ?? pickAesthetic(decide, palette);
  const hillRate = opts.hillRate === "auto" ? hillRateFor(scenario) : opts.hillRate;
  const hillsWanted = decide.chance(hillRate);
  const rng = draw === 0 ? decide : createRng(drawSeed(input.seed, draw));
  const zoneMasks = overlay.zones.map((spec) => ({ spec, mask: Mask.fromPolygon(grid, spec.polygon) }));
  const objectiveMask = Mask.fromPoints(
    grid,
    overlay.objectives.map((o) => o.position),
  );
  const blocked = baseBlocked(grid, overlay.objectives, zoneMasks);
  const tracks = opts.deploymentLines ? deploymentTracks(grid, overlay.zones, warnings) : [];
  const mode = input.archetype === "no-mans-land" ? "deployment-only" : "trench-lines";
  if (tracks.length && opts.axis !== "auto" && opts.axis !== tracks[0]!.along) warnings.push(`axis ${opts.axis} overridden: the spine runs alongside the deployment lines`);

  // Raised ground planned before the trench: the centre raised as its own
  // twin (an H4x4 hill when the board draws hills, otherwise a plateau with
  // ramps; the midpoint's cover on top), or twin objectives on hills beside a
  // centre plateau. Each combination the trench cannot get round falls back to
  // the next; raised ground on open cells comes after the minimums.
  const reserved = Mask.fromCells(grid, tracks.flatMap((t) => t.cells));
  const spineAxis = !tracks.length && opts.axis === "auto" ? mirrorSpineAxis(parity) : null;
  if (spineAxis === "y") for (let r = 0; r < grid.rows; r++) reserved.set((grid.cols - 1) / 2, r);
  if (spineAxis === "x") for (let c = 0; c < grid.cols; c++) reserved.set(c, (grid.rows - 1) / 2);
  const noTerrain = zoneMasks.filter((z) => z.spec.noTerrain).reduce((m, z) => m.or(z.mask), new Mask(grid));
  const planInputs = { grid, rng, palette, parity, objectives: overlay.objectives, blocked, reserved, noTerrain, edgeMarginIn: opts.edgeMarginIn, trenchClearanceIn: opts.trenchClearanceIn };
  const sightAxis: Axis | null = tracks[0]?.along === "y" ? "x" : tracks[0]?.along === "x" ? "y" : null;
  const centres = opts.plateau ? planCentrePlateaus(planInputs, sightAxis) : [];
  // A board that draws hills raises its centre as a hill; twin objective hills beside a centre plateau come next.
  const combos: (RaisedPlan | null)[] = hillsWanted ? planCentreHills(planInputs, sightAxis, opts.hillStepChance) : [];
  for (const centre of [...centres, null]) {
    const avoid = new Mask(grid);
    if (centre) for (const cell of centre.keepOut.cells()) for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) avoid.set(cell.c + dc, cell.r + dr);
    const hills = hillsWanted ? planObjectiveHills(planInputs, avoid, sightAxis).slice(0, 2) : [];
    for (const hill of hills) combos.push(mergePlans(grid, [...(centre ? [centre] : []), hill]));
    if (centre) combos.push(centre);
  }
  const lay: LayInputs = { grid, rng, seed: input.seed, palette, parity, objectives: overlay.objectives, blocked, tracks, mode, opts, archetype };
  let raised: RaisedPlan | null = null;
  let laid: TrenchAttempt | null = null;
  for (const plan of combos.slice(0, 8)) {
    try {
      laid = layTrenchWithCovers(lay, plan, 3);
      raised = plan;
      break;
    } catch (e) {
      if (!(e instanceof GenerateError)) throw e;
    }
  }
  laid ??= layTrenchWithCovers(lay, null);
  const { network, covers, attempts, shrinks } = laid;
  warnings.push(...network.warnings);
  const enemyOf = enemyFacing(grid, overlay.zones, () => rng.chance(0.5));
  const trenchPieces = resolveTrenchPieces(network, palette, rng, enemyOf);

  const trenchMask = Mask.fromCells(grid, network.cells);
  const ctx: PlacementContext = {
    grid,
    rng,
    palette,
    parity,
    aesthetic,
    trenchRects: network.cells.map((cell) => cellRect(grid, cell.c, cell.r)),
    trenchMask,
    zones: zoneMasks,
    objectives: overlay.objectives,
    objectiveMask,
    occupiedGround: trenchMask.clone(),
    featureMask: new Mask(grid),
    plateauTop: new Mask(grid),
    keepClear: new Mask(grid),
    trackMask: Mask.fromCells(grid, tracks.flatMap((t) => t.cells)),
    placed: [],
    usage: new Map(),
    repeatCap: opts.repeatCap,
    spacingIn: opts.spacingIn,
    scatterGapIn: opts.scatterGapIn,
    trenchClearanceIn: opts.trenchClearanceIn,
    edgeMarginIn: opts.edgeMarginIn,
    sightAxis,
    nextId: 0,
  };
  const plateaus: Plateau[] = [...(raised?.plateaus ?? [])];
  const hills: Hill[] = [...(raised?.hills ?? [])];
  for (const plateau of plateaus) registerPlateau(ctx, plateau);
  for (const hill of hills) registerFeature(ctx, hill.id, hill.cells, "hill");
  const coverResult = registerCovers(ctx, covers);
  warnings.push(...coverResult.warnings);

  const tall: Placed[] = [];
  const centrePlateau = plateaus.find((x) => x.id === "plateau");
  if (opts.tallPieces && centrePlateau && !coverResult.placed.some((c) => c.base === "plateau")) {
    const onTop = placeTallOnPlateau(ctx, centrePlateau);
    if (onTop) tall.push(onTop);
  }

  // The archetype's minimum of each listed type goes down before the house
  // extras: raised ground on open cells, then tall pieces and the density fill.
  const targets = compositionTargets(archetype, opts.houseCover);
  const minimums = placeTerrainSlots(ctx, targets, "minimum");
  if (opts.plateau && !plateaus.length && !hills.length) {
    plateaus.push(...placeTwinPlateaus(ctx, rng.intBetween(opts.plateauCells[0], opts.plateauCells[1]), opts.raisedTrenchChance));
    if (!plateaus.length) warnings.push("no room for a plateau");
  }
  for (const plateau of plateaus) if (plateau.raisedTrench) ctx.trenchRects.push(cellRect(grid, plateau.raisedTrench.cell.c, plateau.raisedTrench.cell.r));
  if (hillsWanted && !hills.length) {
    hills.push(...placeTwinHills(ctx, rng.intBetween(1, 2), opts.hillStepChance));
    if (!hills.length) warnings.push("the board drew hills but none fit");
  }
  const faces = dressFaces(ctx, plateaus, opts.faceDressingChance);
  const tallOnBoard = () => ctx.placed.filter((p) => p.placeable && (p.role === "tower" || p.role === "building") && p.placeable.heightIn >= TALL_MIN_HEIGHT_IN).length;
  if (opts.tallPieces && tallOnBoard() < 2) tall.push(...placeTallPair(ctx));
  const fill = placeTerrainSlots(ctx, targets, "fill");
  const shortfalls = fill.shortfalls.map((s) => ({ ...s, min: targets.find((t) => t.typeId === s.typeId)!.min }));

  // ---- assemble pieces ------------------------------------------------------
  const b: Builder = { pieces: [], byId: new Map() };
  const baseByCell = new Map<string, LayoutPiece>();
  const upperByCell = new Map<string, LayoutPiece[]>();
  const addUpper = (cell: Cell, piece: LayoutPiece) => upperByCell.set(cellKey(cell.c, cell.r), [...(upperByCell.get(cellKey(cell.c, cell.r)) ?? []), piece]);
  const wallsByCell = new Map<string, LayoutCell["walls"]>();
  let revetments = 0;

  // Duckboards follow parity: a straight's twin gets one when it does.
  const duckboards = new Map<string, boolean>();
  const wantsDuckboard = (cell: Cell): boolean => {
    const twin = parity.kind === "none" ? cell : mapCell(parity, grid, cell);
    const canonical = cellKey(cell.c, cell.r) < cellKey(twin.c, twin.r) ? cell : twin;
    const k = cellKey(canonical.c, canonical.r);
    if (!duckboards.has(k)) duckboards.set(k, rng.chance(opts.duckboardChance));
    return duckboards.get(k)!;
  };
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
    if (entry.role === "trench-straight" && entry.channelFloorIn !== undefined && wantsDuckboard(cell)) {
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

  for (const cell of network.cells) baseByCell.set(cellKey(cell.c, cell.r), layTrench(cell, trenchPieces.get(cellKey(cell.c, cell.r))!, `t-${cell.c}-${cell.r}`, []));

  const terrain = [...minimums.placed, ...tall.filter((t) => t.base === "ground"), ...fill.placed];
  const craterTiles = terrain.filter((p) => p.kind === "crater-tile");
  for (const p of craterTiles) {
    const piece = addPiece(b, palette, { id: p.id, paletteId: p.placeable!.key, rotY: 0, centre: p.centre, cells: p.cells, slot: p.slot });
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

  const stackedTiles: LayoutPiece[] = [];
  const ramp = pieceById(palette, "hill-ramp");
  for (const plateau of plateaus) {
    const tops = plateau.cells.filter((cell) => ctx.plateauTop.get(cell.c, cell.r));
    stackedTiles.push(...layTiles(tileCells(grid, tops, palette, rng, Mask.fromCells(grid, tops)), "s", true));
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
  const hillTopByCell = new Map<string, LayoutPiece>();
  for (const hill of hills) {
    for (const cell of hill.cells) {
      const base = baseByCell.get(cellKey(cell.c, cell.r))!;
      const block = addPiece(b, palette, { id: `${hill.id}-${cell.c}-${cell.r}`, paletteId: "h4x4", rotY: 0, centre: cellCentre(grid, cell.c, cell.r), cells: [cell], supports: [base] });
      addUpper(cell, block);
      hillTopByCell.set(cellKey(cell.c, cell.r), block);
      if (hill.stepped.some((s) => s.c === cell.c && s.r === cell.r)) {
        const top = addPiece(b, palette, { id: `${hill.id}-${cell.c}-${cell.r}-top`, paletteId: "h4x4", rotY: 0, centre: cellCentre(grid, cell.c, cell.r), cells: [cell], supports: [block] });
        addUpper(cell, top);
        hillTopByCell.set(cellKey(cell.c, cell.r), top);
      }
    }
  }

  // Free pieces rest on whatever their footprint covers: stacked tiles on a plateau, H4x4 tops on a hill, the ground layer elsewhere.
  const stackedByCell = new Map<string, LayoutPiece>();
  for (const tile of stackedTiles) for (const [c, r] of tile.cells!) stackedByCell.set(cellKey(c, r), tile);
  const plateauTall = new Map<string, string>();
  const layFree = (p: Placed) => {
    const placeable = p.placeable!;
    const supportsOf = p.base === "plateau" ? stackedByCell : p.base === "hill" ? hillTopByCell : baseByCell;
    placeable.members.forEach((m, i) => {
      const rotY = (p.rotY + m.rotY) % 360;
      const [ox, oy] = rotateVector(m.at, p.rotY, sense);
      const centre: [number, number] = [p.centre[0] + ox, p.centre[1] + oy];
      const [w, d] = rotatedFootprint(pieceById(palette, m.pieceId), rotY);
      const under = cellsInRect(grid, rectFromCentre(centre[0], centre[1], w, d));
      const supports = [...new Set(under.map((cell) => supportsOf.get(cellKey(cell.c, cell.r))).filter((s): s is LayoutPiece => s !== undefined))];
      if (!supports.length) throw new GenerateError(`${p.id} has nothing under it`);
      const single = placeable.members.length === 1;
      const piece = addPiece(b, palette, { id: single ? p.id : `${p.id}.${i}`, paletteId: m.pieceId, rotY, centre, supports, groupId: single ? null : p.id, objectiveId: p.objectiveId, slot: p.slot });
      if (p.base === "plateau") {
        const plateau = plateaus.find((x) => x.cells.some((c) => under.some((u) => u.c === c.c && u.r === c.r)));
        if (plateau && (p.kind === "tall" || p.kind === "cover")) plateauTall.set(plateau.id, piece.id);
      }
    });
  };
  for (const p of [...coverResult.placed, ...tall.filter((t) => t.base !== "ground"), ...terrain.filter((x) => x.kind !== "crater-tile"), ...faces]) layFree(p);

  // Scattered terrain fills the board toward the object target, in twin pairs.
  const scatter = placeScatter(ctx, Math.max(0, opts.targetObjects - b.pieces.length));
  for (const p of scatter) layFree(p);

  // ---- cells ----------------------------------------------------------------
  const plateauKeys = new Set(plateaus.flatMap((x) => x.cells.map((c) => cellKey(c.c, c.r))));
  const rampByKey = new Map(plateaus.flatMap((x) => x.ramps.map((r) => [cellKey(r.cell.c, r.cell.r), r.up] as const)));
  const hillKeys = new Set(hills.flatMap((h) => h.cells.map((c) => cellKey(c.c, c.r))));
  const raisedKeys = new Set(plateaus.filter((x) => x.raisedTrench).map((x) => cellKey(x.raisedTrench!.cell.c, x.raisedTrench!.cell.r)));
  const trenchByKey = new Map(network.cells.map((cell) => [cellKey(cell.c, cell.r), cell]));
  const cells: LayoutCell[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const key = cellKey(c, r);
      const base = baseByCell.get(key);
      if (!base) throw new GenerateError(`cell ${c},${r} was left empty`);
      const uppers = upperByCell.get(key) ?? [];
      const trench = trenchByKey.get(key);
      const feature = raisedKeys.has(key) ? "raised-trench" : rampByKey.has(key) ? "ramp" : plateauKeys.has(key) ? "plateau" : hillKeys.has(key) ? "hill" : null;
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
  const objectsByCategory: Record<string, number> = {};
  for (const p of b.pieces) {
    piecesByRole[p.role] = (piecesByRole[p.role] ?? 0) + 1;
    const category = p.slot?.category ?? STRUCTURAL_NAMES[p.role] ?? p.role;
    objectsByCategory[category] = (objectsByCategory[category] ?? 0) + 1;
  }
  const slotted = b.pieces.filter((p) => p.slot && !STRUCTURAL_ROLES.includes(p.role)).length;
  const listed = new Set(archetype.composition.map((c) => c.typeId));
  const houseRules = new Set<string>();
  for (const p of ctx.placed) if (p.typeId && p.typeId !== "scattered-terrain" && !listed.has(p.typeId)) houseRules.add(p.typeId);
  if ((plateaus.length || hills.length) && !listed.has("hill")) houseRules.add("hill");

  const layout: Layout = {
    version: LAYOUT_VERSION,
    seed: input.seed,
    scenarioId: scenario.id,
    archetype: input.archetype,
    boardIn,
    cellIn: grid.cellIn,
    parity: { kind: parity.kind, objectivesMatch: parity.objectivesMatch },
    aesthetic,
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
    plateaus: plateaus.map((x) => ({
      id: x.id,
      cells: x.cells.map((c) => [c.c, c.r] as [number, number]),
      ramps: x.ramps.map((r) => ({ cell: [r.cell.c, r.cell.r] as [number, number], up: r.up })),
      raisedTrench: x.raisedTrench ? [x.raisedTrench.cell.c, x.raisedTrench.cell.r] : null,
      tallPieceId: plateauTall.get(x.id) ?? null,
    })),
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
      dressingPieces: ctx.placed.filter((p) => p.placeable && !p.scatter).length,
      tallPieces: b.pieces.filter((p) => (p.role === "tower" || p.role === "building") && pieceById(palette, p.paletteId).heightIn >= TALL_MIN_HEIGHT_IN).length,
      scatterPieces: b.pieces.filter((p) => p.slot && palette.categories[p.slot.category]?.scatter).length,
      objectsByCategory,
      dressingShare: round3(slotted / b.pieces.length),
      hillsWanted,
      hillRate,
      totalPieces: b.pieces.length,
      coverShrinks: shrinks,
      trenchAttempts: attempts,
      layoutDraws: draw + 1,
      coverCapIn: opts.maxCoverSideIn,
      shortfalls,
      houseRules: [...houseRules].sort(),
      warnings,
      archetypeMatchesScenario,
    },
  };
  return Layout.parse(layout);
}
