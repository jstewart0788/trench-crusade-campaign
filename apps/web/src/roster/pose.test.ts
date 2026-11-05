import { loadRulesData, type RulesData } from "@tc/rules";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { poseOf } from "./pose.js";
import { kitEntries, layoutFigure } from "./slots.js";
import type { PendingMember } from "./staging.js";

let data: RulesData;
beforeAll(() => {
  data = loadRulesData(resolve(import.meta.dirname, "../../../.."));
});

const UNIT = "new-antioch/lieutenant";
const poseFor = (items: string[], pending?: PendingMember) => {
  const unit = data.unitsById.get(UNIT)!;
  return poseOf(layoutFigure(kitEntries({ id: "m1", unitId: UNIT, equipmentItemIds: items }, unit, data, pending), unit));
};

describe("poseOf", () => {
  it("draws headgear only when some is equipped, every helmet as a Brodie and the Iron Capirote as itself", () => {
    expect(poseFor([]).headgear).toBeUndefined();
    expect(poseFor(["combat-helmet"]).headgear?.icon).toBe("brodie");
    expect(poseFor(["iron-capirote"]).headgear?.icon).toBe("capirote");
  });

  it("puts a two-handed gun in both hands and stows a two-handed blade across the back", () => {
    const pose = poseFor(["machine-gun", "great-sword-axe"]);
    expect(pose.bothHands?.name).toBe("Machine Gun");
    expect(pose.back.map((w) => w.name)).toEqual(["Great Sword/Axe"]);
    expect(pose.right).toBeUndefined();
  });

  it("stows one-handed weapons at the hip while both hands hold a two-handed gun", () => {
    const pose = poseFor(["bolt-action-rifle", "trench-knife"]);
    expect(pose.bothHands?.name).toBe("Bolt-Action Rifle");
    expect(pose.hip.map((w) => w.name)).toEqual(["Trench Knife"]);
  });

  it("gives a pistol to the right hand and a blade to the left, and draws Sword/Axe as a hatchet", () => {
    const pose = poseFor(["pistol", "sword-axe"]);
    expect(pose.right).toMatchObject({ name: "Pistol", grip: "pistol" });
    expect(pose.left).toMatchObject({ name: "Sword/Axe", icon: "hatchet" });
  });

  it("keeps the left arm for the shield, sending a second one-handed weapon to the hip", () => {
    const pose = poseFor(["pistol", "sword-axe", "trench-shield"]);
    expect(pose.right?.name).toBe("Pistol");
    expect(pose.left).toBeUndefined();
    expect(pose.hip.map((w) => w.name)).toEqual(["Sword/Axe"]);
    expect(pose.shield?.icon).toBe("riotShield");
  });

  it("draws the gas mask from the inventory and the grenades on the belt", () => {
    const pose = poseFor(["gas-mask", "gas-grenades"]);
    expect(pose.mask).toBe(true);
    expect(pose.grenades?.icon).toBe("stickGrenade");
  });

  it("shows a staged purchase and hides a staged removal", () => {
    const pose = poseFor(["combat-helmet"], { adds: ["polearm"], removes: ["combat-helmet"], upgradeAdds: [], upgradeRemoves: [] });
    expect(pose.headgear).toBeUndefined();
    expect(pose.bothHands?.name).toBe("Polearm");
  });
});
