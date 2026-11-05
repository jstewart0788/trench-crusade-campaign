import type { ClassifiedItem, EquipmentItem } from "@tc/rules/browser";
import { FigureArt } from "../components/FigureArt.js";
import figureStyles from "../components/Figure.module.css";
import { poseOf } from "../roster/pose.js";
import { SLOTS, type FigureView, type KitEntry, type SlotId, type SlotView, type Zone } from "../roster/slots.js";

// Dev-only review page: real item names run through the figure's pose and drawing.

type Kind = ClassifiedItem["kind"];
interface Put {
  slot: SlotId;
  name: string;
  kind: Kind;
  spans?: boolean;
  strong?: boolean;
  bayonet?: string;
}

let n = 0;
const entry = (name: string, kind: Kind): KitEntry =>
  ({ index: n++, itemId: name, item: { id: name, name } as EquipmentItem, access: undefined, classified: { kind, hands: 0, combo: false, heavy: false, headgear: kind === "other", bayonet: false, attachesTo: [] } }) as KitEntry;

function view(puts: Put[], inventory: string[] = []): FigureView {
  const slots: SlotView[] = SLOTS.map((s) => {
    const p = puts.find((x) => x.slot === s.id);
    if (!p) return { ...s };
    return { ...s, occupant: { entry: entry(p.name, p.kind), spans: !!p.spans, oneHandedByStrength: !!p.strong, attachments: p.bayonet ? [entry(p.bayonet, "melee")] : [] } };
  });
  return { slots, inventory: inventory.map((name) => entry(name, "other")), unplaced: [], leaving: [] };
}

interface Case {
  title: string;
  puts: Put[];
  inventory?: string[];
  lit?: Zone;
}

const CASES: Case[] = [
  { title: "Nothing equipped", puts: [] },
  { title: "Rifleman", puts: [{ slot: "head", name: "Combat Helmet", kind: "other" }, { slot: "torso", name: "Standard Armour", kind: "armour" }, { slot: "ranged-a", name: "Bolt-Action Rifle", kind: "ranged", spans: true }, { slot: "melee-a", name: "Trench Knife", kind: "melee" }] },
  { title: "Two-handed gun, two-handed blade", puts: [{ slot: "head", name: "Minenhelm", kind: "other" }, { slot: "torso", name: "Reinforced Armour", kind: "armour" }, { slot: "ranged-a", name: "Machine Gun", kind: "ranged", spans: true }, { slot: "melee-a", name: "Great Sword/Axe", kind: "melee", spans: true }], inventory: ["Gas Mask"] },
  { title: "Pistol and sword", puts: [{ slot: "ranged-a", name: "Pistol", kind: "ranged" }, { slot: "melee-a", name: "Sword/Axe", kind: "melee" }, { slot: "grenade", name: "Gas Grenades", kind: "grenade" }] },
  { title: "Sword and trench shield", puts: [{ slot: "head", name: "Combat Helmet", kind: "other" }, { slot: "melee-a", name: "Sword/Axe", kind: "melee" }, { slot: "offhand", name: "Trench Shield", kind: "shield" }] },
  { title: "Pistol and round shield", puts: [{ slot: "ranged-a", name: "Automatic Pistol", kind: "ranged" }, { slot: "offhand", name: "Iron Wall Kalkan", kind: "shield" }, { slot: "torso", name: "Standard Armour", kind: "armour" }] },
  { title: "Great hammer, pistol at hip", puts: [{ slot: "head", name: "Iron Capirote", kind: "other" }, { slot: "melee-a", name: "Great Hammer/Maul", kind: "melee", spans: true }, { slot: "ranged-a", name: "Pistol", kind: "ranged" }] },
  { title: "Flamethrower, axe at hip", puts: [{ slot: "ranged-a", name: "Flamethrower", kind: "ranged", spans: true }, { slot: "melee-a", name: "Boarding Axe", kind: "melee" }, { slot: "torso", name: "Standard Armour", kind: "armour" }], inventory: ["Gas Mask"] },
  { title: "Polearm", puts: [{ slot: "melee-a", name: "Polearm", kind: "melee", spans: true }, { slot: "head", name: "Combat Helmet", kind: "other" }] },
  { title: "Two swords", puts: [{ slot: "melee-a", name: "Sword/Axe", kind: "melee" }, { slot: "melee-b", name: "Sword/Axe", kind: "melee" }] },
  { title: "Vestments and flail", puts: [{ slot: "torso", name: "Ragged Vestments", kind: "armour" }, { slot: "melee-a", name: "Flail/Scourge", kind: "melee" }] },
  { title: "Strong: great hammer in one hand, shield", puts: [{ slot: "melee-a", name: "Great Hammer/Maul", kind: "melee", spans: true, strong: true }, { slot: "offhand", name: "Trench Shield", kind: "shield" }, { slot: "torso", name: "Reinforced Armour", kind: "armour" }] },
  { title: "Shotgun with bayonet", puts: [{ slot: "ranged-a", name: "Shotgun", kind: "ranged", spans: true, bayonet: "Bayonet" }, { slot: "head", name: "Combat Helmet", kind: "other" }] },
  { title: "Two-handed gun and shield", puts: [{ slot: "ranged-a", name: "Heavy Shotgun", kind: "ranged", spans: true }, { slot: "offhand", name: "Heavy Ballistic Shield", kind: "shield" }] },
  { title: "Claws", puts: [{ slot: "melee-a", name: "Iron-Clawed Hands", kind: "melee", spans: true }] },
  { title: "Hover: Melee slot (sword lit)", puts: [{ slot: "ranged-a", name: "Pistol", kind: "ranged" }, { slot: "melee-a", name: "Sword/Axe", kind: "melee" }], lit: "melee" },
  { title: "Hover: Torso slot", puts: [{ slot: "torso", name: "Standard Armour", kind: "armour" }, { slot: "ranged-a", name: "Bolt-Action Rifle", kind: "ranged", spans: true }], lit: "torso" },
  { title: "Hover: empty Off-hand", puts: [{ slot: "melee-a", name: "Sword/Axe", kind: "melee" }], lit: "offhand" },
];

export function FigureLab() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }} data-figure-lab>
      {CASES.map((c) => {
        const pose = poseOf(view(c.puts, c.inventory));
        const items = [...c.puts.map((p) => (p.bayonet ? `${p.name} + ${p.bayonet}` : p.name) + (p.strong ? " (Strong)" : "")), ...(c.inventory ?? [])];
        return (
          <figure key={c.title} className="panel" style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div className={figureStyles.figure} style={{ display: "block", height: 340, padding: 0 }}>
              {c.lit && <button hidden data-zone={c.lit} aria-pressed="true" />}
              <FigureArt pose={pose} />
            </div>
            <figcaption>
              <strong style={{ fontFamily: "var(--font-display)", color: "var(--brass)" }}>{c.title}</strong>
              <div style={{ fontSize: "0.8rem", color: "var(--ink-muted)" }}>{items.join(" · ") || "—"}</div>
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
