import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_TTS_OPTIONS } from "../src/index.js";
import { ROOT } from "./fixtures.js";

// Boards spawn locked where the emitter puts them, so its default surface has to be the one
// the mod's table actually presents: the felt tile's top face in mod/save.json.
interface SaveObject {
  GUID: string;
  Transform: { posY: number; scaleY: number };
  CustomImage?: { CustomTile?: { Thickness: number } };
}
const save = JSON.parse(readFileSync(resolve(ROOT, "mod/save.json"), "utf8")) as { ObjectStates: SaveObject[] };
const byGuid = (guid: string): SaveObject => save.ObjectStates.find((o) => o.GUID === guid)!;
// Measured live with the LCT mat 4ee1f2 at posY -9.52: its top face at 0.9615.
const MAT_TOP_ABOVE_PIVOT = 0.9615 + 9.52;

describe("the table surface boards are emitted for", () => {
  it("is the top face of the table felt 28865a", () => {
    const felt = byGuid("28865a");
    const top = felt.Transform.posY + felt.CustomImage!.CustomTile!.Thickness * felt.Transform.scaleY;
    expect(DEFAULT_TTS_OPTIONS.matTopY).toBeCloseTo(top, 3);
  });

  it("has the LCT 40k mat 4ee1f2 parked wholly under the felt, so nothing rests on it", () => {
    expect(byGuid("4ee1f2").Transform.posY + MAT_TOP_ABOVE_PIVOT).toBeLessThan(byGuid("28865a").Transform.posY);
  });
});
