import type { Warband } from "@tc/rules/browser";

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
