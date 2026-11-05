import { limitContext, validateWarband, warbandCost, warbandThreshold, type RulesData, type Warband } from "@tc/rules/browser";
import { useEffect, useMemo, useReducer, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiRequestError, type SavedWarband } from "../api.js";
import { Header } from "../components/Header.js";
import { Tabs } from "../components/Tabs.js";
import { rosterReducer } from "../roster/reducer.js";
import { useRules } from "../rules.js";
import { clearDraft, loadDraft, rememberSaved, saveDraft } from "../storage.js";
import { DRAFT_CODE, warbandBase, type WarbandContext } from "./warbandContext.js";
import styles from "./WarbandLayout.module.css";

type Source =
  | { kind: "loading"; code: string }
  | { kind: "ready"; code?: string; warband: Warband }
  | { kind: "missing"; code: string }
  | { kind: "error"; message: string };

/** Resolves the roster behind /w/:code (the draft, or a fetch) and hosts the Warband, Barracks and Armoury screens. */
export function WarbandLayout() {
  const { code: param = DRAFT_CODE } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { rules, error } = useRules();
  const [source, setSource] = useState<Source>({ kind: "loading", code: param });

  useEffect(() => {
    if (param === DRAFT_CODE) {
      const draft = loadDraft();
      if (draft) setSource({ kind: "ready", warband: draft });
      else navigate("/new", { replace: true });
      return;
    }
    // Right after the first save the URL changes to the new code; the roster is already here.
    if (source.kind === "ready" && source.code === param) return;
    let live = true;
    setSource({ kind: "loading", code: param });
    api.getWarband(param).then(
      (saved) => live && setSource({ kind: "ready", code: saved.code, warband: saved.warband }),
      (e: unknown) => {
        if (!live) return;
        if (e instanceof ApiRequestError && e.status === 404) setSource({ kind: "missing", code: param });
        else setSource({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [param, navigate]);

  if (error) return <p className="error">Could not load the rules data: {error}</p>;
  if (!rules) return <p className="muted">Loading rules…</p>;
  if (source.kind === "loading") return <p className="muted">Loading warband {source.code}…</p>;
  if (source.kind === "error") return <p className="error">{source.message}</p>;
  if (source.kind === "missing") {
    return (
      <p>
        No warband with code <span className="mono">{source.code}</span>. <Link to="/">Back to the list</Link>.
      </p>
    );
  }

  return (
    <Shell
      key={source.code ?? DRAFT_CODE}
      rules={rules}
      initial={source.warband}
      code={source.code}
      onSaved={(saved) => {
        setSource({ kind: "ready", code: saved.code, warband: saved.warband });
        if (!source.code) {
          const path = location.pathname.replace(/^\/w\/draft(?=\/|$)/, `/w/${saved.code}`);
          navigate(path + location.search, { replace: true });
        }
      }}
    />
  );
}

interface ShellProps {
  rules: RulesData;
  initial: Warband;
  code?: string;
  onSaved: (saved: SavedWarband) => void;
}

function Shell({ rules, initial, code, onSaved }: ShellProps) {
  const [warband, dispatch] = useReducer(rosterReducer, initial);
  const [save, setSave] = useState<{ busy: boolean; error?: string; snapshot?: string }>({ busy: false, snapshot: code ? JSON.stringify(initial) : undefined });

  const ctx = useMemo(() => limitContext(warband, rules), [warband, rules]);
  const validation = useMemo(() => validateWarband(warband, rules), [warband, rules]);
  const cost = useMemo(() => warbandCost(warband, rules), [warband, rules]);
  const threshold = useMemo(() => warbandThreshold(warband, rules), [warband, rules]);

  useEffect(() => {
    if (!code) saveDraft(warband);
  }, [warband, code]);

  const dirty = JSON.stringify(warband) !== save.snapshot;

  async function persist() {
    setSave((s) => ({ ...s, busy: true, error: undefined }));
    try {
      const saved = code ? await api.replaceWarband(code, warband) : await api.createWarband(warband);
      rememberSaved({
        code: saved.code,
        name: saved.warband.name,
        factionName: rules.factionsById.get(saved.warband.factionId)?.name ?? saved.warband.factionId,
        savedAt: saved.updatedAt,
      });
      if (!code) clearDraft();
      setSave({ busy: false, snapshot: JSON.stringify(saved.warband) });
      onSaved(saved);
    } catch (e) {
      setSave((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }

  const base = warbandBase(code);
  const context: WarbandContext = { rules, warband, code, base, dispatch, ctx, validation, cost, threshold };

  return (
    <div className={styles.shell}>
      <Header
        warband={warband}
        rules={rules}
        cost={cost}
        threshold={threshold}
        validation={validation}
        code={code}
        base={base}
        dirty={dirty}
        busy={save.busy}
        error={save.error}
        onSave={persist}
        dispatch={dispatch}
      />
      <Tabs base={base} />
      <Outlet context={context} />
    </div>
  );
}
