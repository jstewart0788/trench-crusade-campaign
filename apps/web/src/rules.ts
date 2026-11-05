import { buildModelMap, buildRulesData, type ModelMap, type RulesData } from "@tc/rules/browser";
import { useEffect, useState } from "react";
import { api } from "./api.js";

let pending: Promise<RulesData> | undefined;

// The model map only names the model a member will spawn as; without it the
// roster still works, and the warband screen says the model is unknown.
async function loadModels(): Promise<ModelMap | undefined> {
  try {
    const tts = await api.models();
    return buildModelMap(tts.models, tts.picks);
  } catch {
    return undefined;
  }
}

/** Fetches and indexes the rules data, with the TTS model map, once per page load. */
export function loadRules(): Promise<RulesData> {
  pending ??= Promise.all([api.rules(), loadModels()]).then(([files, models]) => buildRulesData(files, models));
  return pending;
}

export function useRules(): { rules?: RulesData; error?: string } {
  const [state, setState] = useState<{ rules?: RulesData; error?: string }>({});
  useEffect(() => {
    let live = true;
    loadRules().then(
      (rules) => live && setState({ rules }),
      (e: unknown) => live && setState({ error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
