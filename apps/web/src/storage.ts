import type { Warband } from "@tc/rules/browser";
import { EMPTY_PENDING, hasPending, type Pending } from "./roster/staging.js";

// Everything this browser remembers: the codes it has saved and the one
// unsaved draft. localStorage can be absent or throw (private windows), so
// every access is guarded and the app works without it.

const SAVED_KEY = "tc.roster.saved";
const DRAFT_KEY = "tc.roster.draft";

export interface SavedEntry {
  code: string;
  name: string;
  factionName: string;
  savedAt: string;
}

function read<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === undefined) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable; the page still works, it just forgets
  }
}

export function listSaved(): SavedEntry[] {
  const entries = read<SavedEntry[]>(SAVED_KEY);
  return Array.isArray(entries) ? entries : [];
}

export function rememberSaved(entry: SavedEntry): void {
  write(SAVED_KEY, [entry, ...listSaved().filter((e) => e.code !== entry.code)]);
}

export function forgetSaved(code: string): void {
  write(SAVED_KEY, listSaved().filter((e) => e.code !== code));
}

/**
 * The one unsaved draft, with the key its pending purchases and open rows are
 * kept under. Every draft gets its own key, so a new list never inherits the
 * last one's state; the URL stays /w/draft.
 */
export interface Draft {
  key: string;
  warband: Warband;
}

/** Drafts stored before they had keys are bare rosters; their state sits under the old shared key. */
const LEGACY_DRAFT_KEY = "draft";

export function loadDraft(): Draft | undefined {
  const stored = read<Partial<Draft> & Partial<Warband>>(DRAFT_KEY);
  if (!stored || typeof stored !== "object") return undefined;
  if (typeof stored.key === "string" && stored.warband) return { key: stored.key, warband: stored.warband };
  return { key: LEGACY_DRAFT_KEY, warband: stored as Warband };
}

export function saveDraft(draft: Draft): void {
  write(DRAFT_KEY, draft);
}

const newDraftKey = () => `draft-${Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

/** Starts a new draft from `warband`, discarding the current one and everything kept under its key. */
export function startDraft(warband: Warband): Draft {
  discardDraft();
  const draft = { key: newDraftKey(), warband };
  saveDraft(draft);
  return draft;
}

/** Throws the draft away, with its pending purchases and open rows. */
export function discardDraft(): void {
  const draft = loadDraft();
  if (!draft) return;
  savePending(draft.key, EMPTY_PENDING);
  saveExpanded(draft.key, []);
  write(DRAFT_KEY, undefined);
}

/** The draft has been saved as `code`: its pending purchases and open rows follow it, and the draft is gone. */
export function promoteDraft(key: string, code: string): void {
  movePending(key, code);
  moveExpanded(key, code);
  if (loadDraft()?.key === key) write(DRAFT_KEY, undefined);
}

// Staged (unconfirmed) purchases, keyed by the warband code or the draft's key, so a
// reload keeps them and the saved roster never carries them.

const PENDING_KEY = "tc.roster.pending";

function readPendingMap(): Record<string, Pending> {
  const map = read<Record<string, Pending>>(PENDING_KEY);
  return map && typeof map === "object" ? map : {};
}

export function loadPending(key: string): Pending {
  const stored = readPendingMap()[key] as unknown;
  if (!stored || typeof stored !== "object") return EMPTY_PENDING;
  const o = stored as Partial<Pending> & Record<string, unknown>;
  // Before recruits were staged, the stored value was the per-member map itself.
  if (!("members" in o)) return { members: o as Pending["members"], recruits: [], dismissals: [] };
  return { members: o.members ?? {}, recruits: Array.isArray(o.recruits) ? o.recruits : [], dismissals: Array.isArray(o.dismissals) ? o.dismissals : [] };
}

export function savePending(key: string, pending: Pending): void {
  const map = readPendingMap();
  if (!hasPending(pending)) delete map[key];
  else map[key] = pending;
  write(PENDING_KEY, Object.keys(map).length ? map : undefined);
}

/** When a draft gets its code, its pending purchases follow it. */
export function movePending(from: string, to: string): void {
  const map = readPendingMap();
  const pending = map[from];
  if (!pending) return;
  delete map[from];
  map[to] = pending;
  write(PENDING_KEY, map);
}

// Which member rows are expanded on the Warband screen, per warband code or draft key.

const EXPANDED_KEY = "tc.roster.expanded";

export function loadExpanded(key: string): string[] {
  const ids = read<Record<string, unknown>>(EXPANDED_KEY)?.[key];
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export function saveExpanded(key: string, ids: string[]): void {
  const map = read<Record<string, string[]>>(EXPANDED_KEY) ?? {};
  if (ids.length) map[key] = ids;
  else delete map[key];
  write(EXPANDED_KEY, Object.keys(map).length ? map : undefined);
}

export function moveExpanded(from: string, to: string): void {
  const ids = loadExpanded(from);
  if (!ids.length) return;
  saveExpanded(from, []);
  saveExpanded(to, ids);
}
