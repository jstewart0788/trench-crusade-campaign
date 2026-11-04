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
const AT_LEAST = /^atLeast (\d+) (.+?) \(roster\)$/;
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
    if (current && (AT_LEAST.test(clause) || REPEAT.test(clause))) {
      current.conditions.push(clause);
      continue;
    }
    unresolved.push(clause);
  }

  for (const mod of modifiers) {
    let times = 0;
    let unknown = false;
    for (const cond of mod.conditions) {
      const atLeast = AT_LEAST.exec(cond);
      const repeat = REPEAT.exec(cond);
      const name = atLeast?.[2] ?? repeat?.[1];
      // "repeat per X" on X's own limit would raise the cap by the count it
      // caps (Brazen Bull: 0-1, Warbands p88), so it is left unresolved.
      const self = repeat !== null && subject !== undefined && normaliseName(repeat[1]!) === normaliseName(subject);
      const count = name === undefined || self ? undefined : ctx.count(name);
      if (count === undefined) {
        unknown = true;
        continue;
      }
      if (atLeast) times = Math.max(times, count >= Number(atLeast[1]) ? 1 : 0);
      else times = Math.max(times, count);
    }
    if (unknown && times === 0) unresolved.push(`${field} ${mod.op} ${mod.n} when ${mod.conditions.join(" / ")}`);
    if (times === 0) continue;
    if (mod.op === "set") value = mod.n < 0 ? null : mod.n;
    else if (value !== null) value = mod.op === "increment" ? value + mod.n * times : value - mod.n * times;
  }

  return { value, unresolved };
}
