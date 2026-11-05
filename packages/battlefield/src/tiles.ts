import { cellKey, type Cell, type Grid, type Mask, type Rect } from "./grid.js";
import { piecesByRole, type Palette, type PalettePiece } from "./palette.js";
import type { Rng } from "./rng.js";

export interface GroundTile {
  paletteId: string;
  rotY: number;
  cells: Cell[];
  rect: Rect;
}

/**
 * Fills cells with Landscape tiles, packing 2x2 and 1x2 tiles where they fit.
 * Cells in `noQuads` take only 1x1 and 1x2 tiles, whose tops are level, so
 * anything stacked on them sits flat.
 */
export function tileCells(grid: Grid, cells: readonly Cell[], palette: Palette, rng: Rng, noQuads: Mask | null = null): GroundTile[] {
  const ground = piecesByRole(palette, "ground").filter((p) => p.layer === "ground" && p.cells);
  const single = ground.find((p) => p.cells![0] === 1 && p.cells![1] === 1);
  const double = ground.find((p) => p.cells![0] === 1 && p.cells![1] === 2);
  const quad = ground.find((p) => p.cells![0] === 2 && p.cells![1] === 2);
  if (!single) throw new Error("palette needs an enabled 1x1 ground tile");
  const todo = new Set(cells.map((cell) => cellKey(cell.c, cell.r)));
  const free = (c: number, r: number): boolean => todo.has(cellKey(c, r));
  const tiles: GroundTile[] = [];
  const lay = (piece: PalettePiece, rotY: number, laid: Cell[]) => {
    for (const cell of laid) todo.delete(cellKey(cell.c, cell.r));
    const cs = laid.map((x) => x.c);
    const rs = laid.map((x) => x.r);
    const rect: Rect = { x0: Math.min(...cs) * grid.cellIn, y0: Math.min(...rs) * grid.cellIn, x1: (Math.max(...cs) + 1) * grid.cellIn, y1: (Math.max(...rs) + 1) * grid.cellIn };
    tiles.push({ paletteId: piece.id, rotY, cells: laid, rect });
  };
  for (const { c, r } of rng.shuffle(cells)) {
    if (!free(c, r)) continue;
    const block = [
      { c, r },
      { c: c + 1, r },
      { c, r: r + 1 },
      { c: c + 1, r: r + 1 },
    ];
    if (quad && rng.chance(0.6) && block.every((b) => free(b.c, b.r) && !noQuads?.get(b.c, b.r))) {
      lay(quad, 0, block);
      continue;
    }
    if (double && rng.chance(0.85)) {
      const along = rng.pick(["N", "E"] as const);
      if (along === "N" && free(c, r + 1)) {
        lay(double, 0, [
          { c, r },
          { c, r: r + 1 },
        ]);
        continue;
      }
      if (along === "E" && free(c + 1, r)) {
        lay(double, 90, [
          { c, r },
          { c: c + 1, r },
        ]);
        continue;
      }
    }
    lay(single, 0, [{ c, r }]);
  }
  return tiles.sort((a, b) => a.rect.y0 - b.rect.y0 || a.rect.x0 - b.rect.x0);
}

/** Fills every cell not in `occupied` with ground tiles. */
export function tileGround(grid: Grid, occupied: Mask, palette: Palette, rng: Rng, noQuads: Mask | null = null): GroundTile[] {
  const cells: Cell[] = [];
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) if (!occupied.get(c, r)) cells.push({ c, r });
  return tileCells(grid, cells, palette, rng, noQuads);
}
