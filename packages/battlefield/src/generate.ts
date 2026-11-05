import {
  chooseObjectiveCovers,
  compositionTargets,
  coverKeepOut,
  placeDressing,
  registerCovers,
  tileGround,
  type ArchetypeSpec,
  type Placed,
  type PlacementContext,
} from "./dressing.js";
import { cellAt, cellKey, cellRect, createGrid, Mask, rectPointDistance, type Cell, type Grid, type Rect } from "./grid.js";
import { Layout, LAYOUT_VERSION, type LayoutCell, type LayoutPiece } from "./layout.js";
import { type Palette, type Role } from "./palette.js";
import { createRng, type Rng } from "./rng.js";
import { scenarioOverlay, type ObjectiveSpec, type ScenarioGeometry, type ScenarioOverlay } from "./scenario.js";
import { DEFAULT_TRENCH_OPTIONS, layTrenchNetwork, resolveTrenchPieces, type Axis, type TrenchNetwork, type TrenchOptions } from "./trench.js";

export * from "./layout.js";
export { Layout as LayoutSchema } from "./layout.js";

export interface GenerateOptions {
  /** "auto" lets the seed choose; "x" runs west-east (the contested spine for W/E deployments), "y" runs south-north. */
  axis: Axis | "auto";
  branches: number | "auto";
  spacingIn: number;
  trenchClearanceIn: number;
  maxLateralRun: number;
  allowBranchExits: boolean;
  allowLoops: boolean;
}

export const DEFAULT_GENERATE_OPTIONS: GenerateOptions = {
  axis: "auto",
  branches: "auto",
  spacingIn: 3,
  trenchClearanceIn: 1,
  maxLateralRun: DEFAULT_TRENCH_OPTIONS.maxLateralRun,
  allowBranchExits: DEFAULT_TRENCH_OPTIONS.allowBranchExits,
  allowLoops: DEFAULT_TRENCH_OPTIONS.allowLoops,
};

export interface GenerateInput {
  scenarioId: string;
  archetype: "trench-lines";
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

function baseBlocked(grid: Grid, overlay: ScenarioOverlay, zoneMasks: { spec: ScenarioOverlay["zones"][number]; mask: Mask }[]): Mask {
  const mask = new Mask(grid);
  for (const o of overlay.objectives) {
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

// Big objective covers can wall the trench off (five covers at Claim No Man's
// Land block every column when each is over 2in), so the search shrinks the
// largest cover one at a time until a path exists.
function layTrenchWithCovers(grid: Grid, rng: Rng, seed: number, palette: Palette, objectives: ObjectiveSpec[], blocked: Mask, opts: GenerateOptions, archetype: ArchetypeSpec): TrenchAttempt {
  const axes: Axis[] = opts.axis === "auto" ? rng.shuffle(["x", "y"] as const) : [opts.axis];
  const fromLowEdge = rng.chance(0.5);
  const [lo, hi] = BRANCHES_BY_DENSITY[archetype.density];
  const branches = opts.branches === "auto" ? rng.intBetween(lo, hi) : opts.branches;
  const levels = new Map<string, number>();
  const coverable = objectives.filter((o) => o.requiresCover);
  let attempts = 0;
  let shrinks = 0;
  for (;;) {
    const covers = chooseObjectiveCovers(palette, rng, objectives, levels);
    const trenchBlocked = blocked.or(coverKeepOut(grid, covers, opts.trenchClearanceIn));
    for (const maxLateralRun of [opts.maxLateralRun, 99]) {
      for (const axis of axes) {
        attempts++;
        const trenchOpts: TrenchOptions = { ...DEFAULT_TRENCH_OPTIONS, axis, fromLowEdge, branches, maxLateralRun, allowBranchExits: opts.allowBranchExits, allowLoops: opts.allowLoops };
        const network = layTrenchNetwork(grid, trenchBlocked, rng, trenchOpts);
        if (network) return { network, covers, attempts, shrinks };
      }
    }
    const candidates = covers.filter((c) => (levels.get(c.objectiveId) ?? 0) === 0);
    if (!candidates.length) throw new GenerateError(`no trench path for seed ${seed} after ${attempts} attempts with ${coverable.length} objective covers at their smallest`);
    const largest = candidates.reduce((a, b) => ((b.rect.x1 - b.rect.x0) * (b.rect.y1 - b.rect.y0) > (a.rect.x1 - a.rect.x0) * (a.rect.y1 - a.rect.y0) ? b : a));
    levels.set(largest.objectiveId, 1);
    shrinks++;
  }
}

const TYPE_BY_ROLE: Record<string, string> = { ruin: "corner-ruin", wire: "dangerous-terrain", dangerous: "dangerous-terrain", crater: "difficult-terrain", difficult: "difficult-terrain", landmark: "landmark", hill: "hill" };

export function generateBattlefield(input: GenerateInput, env: GeneratorEnv): Layout {
  if (input.archetype !== "trench-lines") throw new GenerateError(`archetype ${String(input.archetype)} is not supported; v1 lays Trench Lines only`);
  const scenario = env.scenarios.find((s) => s.id === input.scenarioId);
  if (!scenario) throw new GenerateError(`unknown scenario "${input.scenarioId}"`);
  const archetype = env.archetypes.find((a) => a.id === input.archetype);
  if (!archetype) throw new GenerateError(`archetype ${input.archetype} missing from terrain data`);
  const opts: GenerateOptions = { ...DEFAULT_GENERATE_OPTIONS, ...input.options };
  const boardIn = input.boardIn ?? 36;
  const grid = createGrid(boardIn, env.palette.cellIn);
  const palette = env.palette;
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
  const blocked = baseBlocked(grid, overlay, zoneMasks);

  const { network, covers, attempts, shrinks } = layTrenchWithCovers(grid, rng, input.seed, palette, overlay.objectives, blocked, opts, archetype);
  const trenchPieces = resolveTrenchPieces(network, palette, rng);

  const occupiedGround = Mask.fromCells(grid, network.cells);
  const ctx: PlacementContext = {
    grid,
    rng,
    palette,
    trenchRects: network.cells.map((cell) => cellRect(grid, cell.c, cell.r)),
    zones: zoneMasks,
    objectives: overlay.objectives,
    objectiveMask,
    occupiedGround,
    placed: [],
    spacingIn: opts.spacingIn,
    trenchClearanceIn: opts.trenchClearanceIn,
  };
  const coverResult = registerCovers(ctx, covers);
  warnings.push(...coverResult.warnings);
  const alreadyByType = new Map<string, number>();
  for (const p of coverResult.placed) {
    const typeId = TYPE_BY_ROLE[p.role];
    if (typeId) alreadyByType.set(typeId, (alreadyByType.get(typeId) ?? 0) + 1);
  }
  const dressing = placeDressing(ctx, compositionTargets(archetype), alreadyByType);
  const groundTiles = tileGround(grid, occupiedGround, palette, rng);

  const pieces: LayoutPiece[] = [];
  const cellsByKey = new Map<string, LayoutCell>();
  const pieceFor = (id: string, paletteId: string, role: Role, rotY: number, cells: Cell[] | null, rect: Rect, objectiveId: string | null, zOrder: number): LayoutPiece => {
    const piece = palette.pieces.find((p) => p.id === paletteId);
    if (!piece) throw new GenerateError(`palette piece ${paletteId} vanished`);
    const anchor = cells ? cells.reduce((a, b) => (b.r < a.r || (b.r === a.r && b.c < a.c) ? b : a)) : null;
    return {
      id,
      role,
      paletteId,
      assetId: piece.assetId,
      layer: piece.layer,
      cell: anchor ? [anchor.c, anchor.r] : null,
      cells: cells ? cells.map((cell) => [cell.c, cell.r] as [number, number]) : null,
      position: [(rect.x0 + rect.x1) / 2, (rect.y0 + rect.y1) / 2],
      footprintIn: [rect.x1 - rect.x0, rect.y1 - rect.y0],
      rotY: rotY as 0 | 90 | 180 | 270,
      zOrder,
      objectiveId,
    };
  };

  const trenchCounts = { straight: 0, corner: 0, t: 0 };
  for (const cell of network.cells) {
    const resolved = trenchPieces.get(cellKey(cell.c, cell.r))!;
    const piece = palette.pieces.find((p) => p.id === resolved.paletteId)!;
    const id = `t-${cell.c}-${cell.r}`;
    pieces.push(pieceFor(id, piece.id, piece.role, resolved.rotY, [cell], cellRect(grid, cell.c, cell.r), null, 0));
    cellsByKey.set(cellKey(cell.c, cell.r), { c: cell.c, r: cell.r, kind: "trench", pieceId: id, openings: cell.openings });
    if (piece.role === "trench-straight") trenchCounts.straight++;
    else if (piece.role === "trench-corner") trenchCounts.corner++;
    else trenchCounts.t++;
  }
  for (const tile of groundTiles) {
    const id = `g-${tile.cells[0]!.c}-${tile.cells[0]!.r}`;
    pieces.push(pieceFor(id, tile.paletteId, "ground", tile.rotY, tile.cells, tile.rect, null, 0));
    for (const cell of tile.cells) cellsByKey.set(cellKey(cell.c, cell.r), { c: cell.c, r: cell.r, kind: "ground", pieceId: id });
  }
  const surface: Placed[] = [...coverResult.placed, ...dressing.placed];
  for (const p of surface) {
    pieces.push(pieceFor(p.id, p.paletteId, p.role, p.rotY, p.cells, p.rect, p.objectiveId, p.kind === "crater-tile" ? 0 : 1));
    if (p.cells) for (const cell of p.cells) cellsByKey.set(cellKey(cell.c, cell.r), { c: cell.c, r: cell.r, kind: "crater", pieceId: p.id });
  }

  const cells: LayoutCell[] = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const entry = cellsByKey.get(cellKey(c, r));
      if (!entry) throw new GenerateError(`cell ${c},${r} was left empty`);
      cells.push(entry);
    }
  }

  const piecesByRole: Record<string, number> = {};
  for (const p of pieces) piecesByRole[p.role] = (piecesByRole[p.role] ?? 0) + 1;

  const layout: Layout = {
    version: LAYOUT_VERSION,
    seed: input.seed,
    scenarioId: scenario.id,
    archetype: "trench-lines",
    boardIn,
    cellIn: grid.cellIn,
    grid: { cols: grid.cols, rows: grid.rows },
    cells,
    pieces,
    trench: {
      axis: network.axis,
      start: network.start,
      end: network.end,
      exits: network.exits,
      mainPathLength: network.mainPathLength,
      branches: network.branches,
      loops: network.loops,
    },
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
      piecesByRole,
      groundTiles: groundTiles.length,
      dressingPieces: surface.length,
      totalPieces: pieces.length,
      coverShrinks: shrinks,
      trenchAttempts: attempts,
      shortfalls: dressing.shortfalls,
      warnings,
      archetypeMatchesScenario,
    },
  };
  return Layout.parse(layout);
}
