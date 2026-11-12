// Resolver for the converter's constraint text, e.g.
//   "max 5 per warband; max set 8 per warband when atLeast 1 Stoßtruppen of the
//    Free State of Prussia (roster); max increment 1 per warband when repeat per
//    Organized Shocktroopers (roster)"
// Base clauses give the number; modifiers apply when their condition names
// something the roster can count (a variant, unit, item or upgrade). Anything
// else is reported back as unresolved so the caller can warn instead of guess.

export type LimitField = "max" | "min";
export type LimitScope = "warband" | "model";

export interface LimitContext {
  /** Instances of `name` in the roster, or undefined when the name is not something we model. */
  count(name: string): number | undefined;
  /** A cap the roster's list puts on a unit beyond its entry (variantRenames max: 0-4 Dervishes, p90). */
  unitCap?(unitId: string): number | undefined;
  /** True for a name no list here can have (unit-rules.json notInTheBooks); counts as 0 whatever it is counted over. */
  excluded?(name: string): boolean;
}

export interface ResolvedLimit {
  value: number | null;
  unresolved: string[];
}

interface Modifier {
  op: "set" | "increment" | "decrement";
  n: number;
  conditions: string[];
}

const CLAUSE = /^(max|min)(?: (set|increment|decrement))? (-?\d+) per (warband|model|self)(?: when (.+))?$/;
// The other comparisons upstream writes ("lessThan 1 Trench Ghosts (roster)", "atMost 0 Lazarist Communicant (roster)").
const COMPARE = /^(atLeast|atMost|lessThan|greaterThan|equalTo) (\d+) (.+?) \((roster|parent|self|model)\)$/;
const REPEAT = /^repeat per (.+?) \(roster\)$/;

export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/\s*\[[^\]]*\]\s*$/, "").replace(/[^a-z0-9]+/g, "");
}

function scopeOf(raw: string): LimitScope {
  return raw === "warband" ? "warband" : "model";
}

export function resolveLimit(
  text: string | undefined,
  field: LimitField,
  scope: LimitScope,
  base: number | null,
  ctx: LimitContext,
  subject?: string,
): ResolvedLimit {
  let value = base;
  const unresolved: string[] = [];
  const modifiers: Modifier[] = [];
  let current: Modifier | undefined;

  for (const clause of (text ?? "").split(";").map((c) => c.trim()).filter(Boolean)) {
    const m = CLAUSE.exec(clause);
    if (m) {
      current = undefined;
      if (m[1] !== field || scopeOf(m[4]!) !== scope) continue;
      const n = Number(m[3]);
      if (!m[2]) {
        value = n < 0 ? null : n;
        continue;
      }
      current = { op: m[2] as Modifier["op"], n, conditions: m[5] ? [m[5]] : [] };
      modifiers.push(current);
      continue;
    }
    if (current && (COMPARE.test(clause) || REPEAT.test(clause))) {
      current.conditions.push(clause);
      continue;
    }
    unresolved.push(clause);
  }

  // A modifier's conditions: "atLeast"/"greaterThan"/"repeat" ones are
  // alternatives (Eire Rangers or Kingdom of Alba), while "lessThan"/"atMost"/
  // "equalTo" ones are exclusions every one of which must hold (the Artillery
  // Witch's +1 at 1,000 ducats is "not Trench Ghosts and not Naval Raiders").
  for (const mod of modifiers) {
    let times = 0;
    let unknown = false;
    let alternatives = 0;
    let excluded = false;
    for (const cond of mod.conditions) {
      const compare = COMPARE.exec(cond);
      const repeat = REPEAT.exec(cond);
      const name = compare?.[3] ?? repeat?.[1];
      const exclusion = compare !== null && (compare[1] === "lessThan" || compare[1] === "atMost" || compare[1] === "equalTo");
      if (!exclusion) alternatives++;
      // "repeat per X" on X's own limit would raise the cap by the count it
      // caps, which the books never do (Brazen Bull 0-1, p88; Lions of Jabir
      // 0-2, p86): it adds nothing.
      const self = repeat !== null && subject !== undefined && normaliseName(repeat[1]!) === normaliseName(subject);
      if (self) continue;
      // Counts over the model or its parent are not the roster's; only a name nothing can have resolves there.
      const overRoster = !compare || compare[4] === "roster";
      const count = name === undefined ? undefined : overRoster ? ctx.count(name) : ctx.excluded?.(name) ? 0 : undefined;
      if (count === undefined) {
        unknown = true;
        continue;
      }
      if (compare) {
        const n = Number(compare[2]);
        const holds = { atLeast: count >= n, atMost: count <= n, lessThan: count < n, greaterThan: count > n, equalTo: count === n }[compare[1] as "atLeast"];
        if (exclusion) excluded ||= !holds;
        else times = Math.max(times, holds ? 1 : 0);
      } else times = Math.max(times, count);
    }
    if (excluded) continue;
    if (alternatives === 0 && !unknown) times = 1;
    if (unknown && times === 0) unresolved.push(`${field} ${mod.op} ${mod.n} when ${mod.conditions.join(" / ")}`);
    if (times === 0) continue;
    if (mod.op === "set") value = mod.n < 0 ? null : mod.n;
    // A count cannot go below none (the Red Brigade's dog allowance less each Trench Dog would read -1).
    else if (value !== null) value = Math.max(0, mod.op === "increment" ? value + mod.n * times : value - mod.n * times);
  }

  return { value, unresolved };
}
