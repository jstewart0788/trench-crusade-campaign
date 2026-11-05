import type { EquipmentItem, ProfileKitEntry, RosterAbility, Upgrade } from "@tc/rules/browser";

/** What every list shows for a piece of kit, an upgrade or an ability: one shape, so a picker row and the equipped item read the same. */
export interface Description {
  name: string;
  /** Range · hands · keywords for kit; the rule names for an upgrade; empty for an ability. */
  detail: string;
  /** Full rule text, for hover and expand; empty when the data has none. */
  rules: string;
}

const clean = (text: string | undefined) => (text && text.trim() !== "-" ? text.trim() : "");

/** Armoury items and card kit read the same: range · hands · keywords, then the rules. */
export function describeItem(item: Pick<EquipmentItem | ProfileKitEntry, "name" | "range" | "hands" | "keywords" | "rules">): Description {
  return {
    name: item.name,
    detail: [item.range, item.hands ? `${item.hands}H` : null, ...item.keywords].filter(Boolean).join(" · "),
    rules: clean(item.rules),
  };
}

export function describeUpgrade(upgrade: Upgrade): Description {
  const rules = upgrade.rules ?? [];
  return {
    name: upgrade.name,
    detail: rules
      .map((r) => r.name)
      .filter((n) => n !== upgrade.name)
      .join(" · "),
    rules: rules
      .map((r) => (r.name === upgrade.name ? clean(r.text) : `${r.name}: ${clean(r.text)}`))
      .filter(Boolean)
      .join("\n"),
  };
}

export function describeAbility(ability: Pick<RosterAbility, "name" | "text">): Description {
  return { name: ability.name, detail: "", rules: clean(ability.text) };
}
