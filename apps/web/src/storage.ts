import type { Warband } from "@tc/rules/browser";
import type { Pending } from "./roster/staging.js";

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

export function loadDraft(): Warband | undefined {
  return read<Warband>(DRAFT_KEY);
}

export function saveDraft(warband: Warband): void {
  write(DRAFT_KEY, warband);
}

export function clearDraft(): void {
  write(DRAFT_KEY, undefined);
}

// Staged (unconfirmed) purchases, keyed by the warband code or "draft", so a
// reload keeps them and the saved roster never carries them.

const PENDING_KEY = "tc.roster.pending";

function readPendingMap(): Record<string, Pending> {
  const map = read<Record<string, Pending>>(PENDING_KEY);
  return map && typeof map === "object" ? map : {};
}

export function loadPending(key: string): Pending {
  const pending = readPendingMap()[key];
  return pending && typeof pending === "object" ? pending : {};
}

export function savePending(key: string, pending: Pending): void {
  const map = readPendingMap();
  if (Object.keys(pending).length === 0) delete map[key];
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
