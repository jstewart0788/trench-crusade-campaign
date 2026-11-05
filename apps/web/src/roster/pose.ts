import type { IconId } from "../components/figureIcons.js";
import type { FigureView, KitEntry, SlotView } from "./slots.js";

// What the Armoury figure shows: the kit the model carries, the icon for each
// piece, and where it goes. Pending removals are already gone; pending additions show.

/** How an icon is held: pistols are drawn level, long arms and blades on the diagonal, claws on the hands. */
export type Grip = "pistol" | "long" | "claws";

export interface Carried {
  zone: "ranged" | "melee";
  name: string;
  icon: IconId;
  grip: Grip;
  twoHanded: boolean;
}

export interface Pose {
  headgear?: { name: string; icon: IconId };
  mask: boolean;
  armour?: { name: string; icon: IconId };
  /** A 2-Handed weapon held in both hands. */
  bothHands?: Carried;
  /** The model's right hand (the viewer's left). */
  right?: Carried;
  /** The model's left hand (the viewer's right), unless a shield is on that arm. */
  left?: Carried;
  shield?: { name: string; icon: IconId };
  /** Weapons the hands cannot hold: two-handed ones across the back, one-handed ones at the hip. */
  back: Carried[];
  hip: Carried[];
  grenades?: { name: string; icon: IconId };
}

const shown = (e: KitEntry | undefined): e is KitEntry => !!e && e.pending !== "remove";

const first = <T>(name: string, table: [RegExp, T][], fallback: T): T => table.find(([re]) => re.test(name))?.[1] ?? fallback;

export const headgearIcon = (name: string): IconId =>
  first<IconId>(name, [[/capirote/i, "capirote"], [/visor|barbute|great helm/i, "visored"], [/hood|cowl/i, "hood"]], "brodie");

export const armourIcon = (name: string): IconId => first<IconId>(name, [[/vestment|robe/i, "robe"], [/reinforced|machine|alchemist|icon|palanquin/i, "breastplate"]], "trenchArmour");

export const shieldIcon = (name: string): IconId => first<IconId>(name, [[/trench|ballistic|thermal/i, "riotShield"], [/holy|icon|grail|cross/i, "crossShield"]], "heaterShield");

export const grenadeIcon = (name: string): IconId => first<IconId>(name, [[/molotov|greek fire/i, "molotov"], [/gas|incendiary|stick|war cross|kura/i, "stickGrenade"]], "grenade");

export function gunIcon(name: string, twoHanded: boolean): { icon: IconId; grip: Grip } {
  if (!twoHanded) return { icon: first<IconId>(name, [[/blunderbuss/i, "blunderbuss"], [/shotgun/i, "sawnOff"], [/revolver/i, "revolver"]], "luger"), grip: "pistol" };
  const icon = first<IconId>(
    name,
    [
      [/flame|fumigator|belcher|vomitus|censer|corruption/i, "flamethrower"],
      [/autocannon|minigun|viscera|tormentor/i, "minigun"],
      [/machine gun/i, "thompson"],
      [/mortar|bombard|launcher|rocket|cannon|punt/i, "mortar"],
      [/submachine|assault gun|automatic rifle/i, "mp40"],
      [/automatic shotgun/i, "thompson"],
      [/shotgun/i, "winchester"],
      [/musket|arquebus|jezzail|abus|alaybozan|blunderbuss/i, "musket"],
    ],
    "leeEnfield",
  );
  return { icon, grip: "long" };
}

export function bladeIcon(name: string, twoHanded: boolean): { icon: IconId; grip: Grip } {
  if (/claw|iron-clawed/i.test(name)) return { icon: "claws", grip: "claws" };
  const icon = first<IconId>(
    name,
    [
      [/torch/i, "torch"],
      [/drill/i, "drill"],
      [/whip/i, "whip"],
      [/flail|scourge|wheel/i, "flail"],
      [/hammer|maul|millstone|tenderizer/i, twoHanded ? "maul" : "hammer"],
      [/mace/i, "mace"],
      [/club|bat\b/i, "club"],
      [/halberd|lochaber|polearm/i, "halberdSlim"],
      [/spear|geirr|anaza|staff|crook/i, "spear"],
      [/bayonet/i, "bayonet"],
      [/knife|khanjar|misericordia|khyber/i, "trenchKnife"],
      [/dagger|sacrificial|fang|instrument/i, "dagger"],
      [/great|tank-splitter|zulfiqar|hellblade/i, "greatsword"],
      [/sword\/axe|axe|headtaker/i, twoHanded ? "battleAxe" : "hatchet"],
      [/sword|blade|shotel/i, "machete"],
      [/axe|headtaker/i, twoHanded ? "battleAxe" : "warAxe"],
    ],
    twoHanded ? "greatsword" : "machete",
  );
  return { icon, grip: "long" };
}

function carried(slot: SlotView): Carried | undefined {
  const o = slot.occupant;
  if (!o || !shown(o.entry)) return undefined;
  const name = o.entry.item.name;
  const twoHanded = o.spans && !o.oneHandedByStrength;
  const look = slot.zone === "ranged" ? gunIcon(name, o.spans) : bladeIcon(name, o.spans);
  return { zone: slot.zone === "ranged" ? "ranged" : "melee", name, ...look, twoHanded };
}

export function poseOf(figure: FigureView): Pose {
  const slot = (id: SlotView["id"]) => figure.slots.find((s) => s.id === id);
  const head = slot("head")?.occupant?.entry;
  const torso = slot("torso")?.occupant?.entry;
  const off = slot("offhand")?.occupant?.entry;
  const grenade = slot("grenade")?.occupant?.entry;
  const mask = figure.inventory.some((e) => shown(e) && /gas mask/i.test(e.item.name)) || (shown(head) && /mask/i.test(head.item.name));

  const pose: Pose = { mask, back: [], hip: [] };
  if (shown(head) && !/mask/i.test(head.item.name)) pose.headgear = { name: head.item.name, icon: headgearIcon(head.item.name) };
  if (shown(torso)) pose.armour = { name: torso.item.name, icon: armourIcon(torso.item.name) };
  if (shown(grenade)) pose.grenades = { name: grenade.item.name, icon: grenadeIcon(grenade.item.name) };
  const shield = shown(off) && off.classified.kind === "shield";
  if (shield) pose.shield = { name: off.item.name, icon: shieldIcon(off.item.name) };

  const weapons = (["ranged-a", "ranged-b", "melee-a", "melee-b"] as const).flatMap((id) => {
    const s = slot(id);
    const c = s && carried(s);
    return c ? [c] : [];
  });
  const twoHanded = weapons.filter((w) => w.twoHanded);
  const oneHanded = weapons.filter((w) => !w.twoHanded);

  // A two-handed gun takes precedence in the hands; everything else is stowed.
  pose.bothHands = twoHanded.find((w) => w.zone === "ranged") ?? twoHanded[0];
  pose.back = twoHanded.filter((w) => w !== pose.bothHands);
  if (pose.bothHands) {
    pose.hip = oneHanded;
    return pose;
  }
  // One-handed: guns to the right hand first, then blades; the left hand only when no shield is on that arm.
  const queue = [...oneHanded.filter((w) => w.zone === "ranged"), ...oneHanded.filter((w) => w.zone === "melee")];
  pose.right = queue.shift();
  if (!shield) pose.left = queue.find((w) => w.zone === "melee") ?? queue[0];
  pose.hip = queue.filter((w) => w !== pose.left);
  return pose;
}
