import type { RulesFiles, ValidationResult, Warband, WarbandCost } from "@tc/rules/browser";

// Same-origin by default (Vite proxies /api in dev); VITE_API_BASE points at
// another origin, e.g. "http://localhost:3001".
export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export interface SavedWarband {
  code: string;
  warband: Warband;
  validation: ValidationResult;
  cost: WarbandCost;
  createdAt: string;
  updatedAt: string;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
  });
  if (!res.ok) {
    let code = "http-error";
    let message = `${res.status} ${res.statusText}`;
    let issues: unknown;
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string; issues?: unknown } };
      if (body.error) ({ code = code, message = message, issues } = body.error);
    } catch {
      // not JSON; keep the status line
    }
    throw new ApiRequestError(res.status, code, message, issues);
  }
  return (await res.json()) as T;
}

/** Each unit's default TTS model and the hand-picked ones by loadout, for buildModelMap. */
export interface TtsModels {
  models: unknown;
  picks?: unknown;
}

export const api = {
  rules: () => call<RulesFiles>("/api/rules"),
  models: () => call<TtsModels>("/api/tts/models"),
  getWarband: (code: string) => call<SavedWarband>(`/api/warbands/${encodeURIComponent(code)}`),
  createWarband: (warband: Warband) => call<SavedWarband>("/api/warbands", { method: "POST", body: JSON.stringify(warband) }),
  replaceWarband: (code: string, warband: Warband) =>
    call<SavedWarband>(`/api/warbands/${encodeURIComponent(code)}`, { method: "PUT", body: JSON.stringify(warband) }),
};

/** The absolute URL the TTS mod fetches for this code. */
export function ttsUrl(code: string): string {
  const base = /^https?:\/\//.test(API_BASE) ? API_BASE : `${window.location.origin}${API_BASE}`;
  return `${base}/api/tts/warband/${code}`;
}
