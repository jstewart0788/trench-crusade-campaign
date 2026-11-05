import { buildRulesData, type RulesData } from "@tc/rules/browser";
import { useEffect, useState } from "react";
import { api } from "./api.js";

let pending: Promise<RulesData> | undefined;

/** Fetches and indexes the rules data once per page load. */
export function loadRules(): Promise<RulesData> {
  pending ??= api.rules().then(buildRulesData);
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
