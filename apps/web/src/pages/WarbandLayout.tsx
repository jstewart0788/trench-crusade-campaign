import { limitContext, validateWarband, warbandCost, warbandThreshold, type RulesData, type Warband } from "@tc/rules/browser";
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiRequestError, type SavedWarband } from "../api.js";
import { Header } from "../components/Header.js";
import { Tabs } from "../components/Tabs.js";
import { gloryPool, type Purse } from "../roster/purse.js";
import { rosterReducer } from "../roster/reducer.js";
import { applyPending, EMPTY_PENDING, pendingCount, pendingDelta, stagedMembers, stagingReducer, type Pending, type StagingAction } from "../roster/staging.js";
import { useRules } from "../rules.js";
import { applyTheme } from "../theme/apply.js";
import { FactionBackdrop } from "../theme/Backdrop.js";
import { themeFor } from "../theme/themes.js";
import { clearDraft, loadDraft, loadPending, moveExpanded, movePending, rememberSaved, saveDraft, savePending } from "../storage.js";
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
  const storageKey = code ?? DRAFT_CODE;
  const [confirmed, dispatch] = useReducer(rosterReducer, initial);
  const [pending, setPending] = useState<Pending>(() => loadPending(storageKey));
  const [save, setSave] = useState<{ busy: boolean; error?: string; snapshot?: string }>({ busy: false, snapshot: code ? JSON.stringify(initial) : undefined });

  const stage = useCallback((action: StagingAction) => setPending((p) => stagingReducer(p, action)), []);
  const staged = useMemo(() => applyPending(confirmed, pending), [confirmed, pending]);
  const rows = useMemo(() => stagedMembers(confirmed, pending), [confirmed, pending]);

  // The warband's faction dresses the whole page while its screens are open; leaving them strips it again.
  const theme = useMemo(() => themeFor(confirmed), [confirmed.factionId, confirmed.subfactionId, confirmed.variantId]);
  useLayoutEffect(() => applyTheme(document.documentElement, theme), [theme]);

  // Pending changes never outlive the member they belong to.
  const memberKey = confirmed.members.map((m) => m.id).join("\u0000");
  useEffect(() => {
    const memberIds = memberKey ? memberKey.split("\u0000") : [];
    setPending((p) => {
      const known = (id: string) => memberIds.includes(id) || p.recruits.some((r) => r.id === id);
      const stale = Object.keys(p.members).some((id) => !known(id)) || p.dismissals.some((id) => !memberIds.includes(id));
      return stale ? stagingReducer(p, { type: "prune", memberIds }) : p;
    });
  }, [memberKey]);

  useEffect(() => {
    if (!code) saveDraft(confirmed);
  }, [confirmed, code]);
  useEffect(() => {
    savePending(storageKey, pending);
  }, [pending, storageKey]);

  const ctx = useMemo(() => limitContext(staged, rules), [staged, rules]);
  const validation = useMemo(() => validateWarband(staged, rules), [staged, rules]);
  const cost = useMemo(() => warbandCost(staged, rules), [staged, rules]);
  const threshold = useMemo(() => warbandThreshold(staged, rules), [staged, rules]);
  const purse = useMemo<Purse>(() => {
    const pool = gloryPool(staged, rules);
    return { ducats: cost.ducats, threshold: threshold.value, glory: cost.glory, ...(pool !== undefined ? { gloryPool: pool } : {}) };
  }, [cost, threshold, staged, rules]);
  const delta = useMemo(() => pendingDelta(confirmed, pending, rules), [confirmed, pending, rules]);
  const count = pendingCount(pending);
  const canConfirm = count > 0 && validation.errors.length === 0;

  const confirmPurchases = () => {
    if (!canConfirm) return;
    dispatch({ type: "apply-purchases", pending });
    setPending(EMPTY_PENDING);
  };
  const discardPurchases = () => setPending(EMPTY_PENDING);

  const dirty = JSON.stringify(confirmed) !== save.snapshot;

  // The API only ever receives the confirmed roster; staged purchases stay in this browser.
  async function persist() {
    setSave((s) => ({ ...s, busy: true, error: undefined }));
    try {
      const saved = code ? await api.replaceWarband(code, confirmed) : await api.createWarband(confirmed);
      rememberSaved({
        code: saved.code,
        name: saved.warband.name,
        factionName: rules.factionsById.get(saved.warband.factionId)?.name ?? saved.warband.factionId,
        savedAt: saved.updatedAt,
      });
      if (!code) {
        clearDraft();
        movePending(DRAFT_CODE, saved.code);
        moveExpanded(DRAFT_CODE, saved.code);
      }
      setSave({ busy: false, snapshot: JSON.stringify(saved.warband) });
      onSaved(saved);
    } catch (e) {
      setSave((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : String(e) }));
    }
  }

  const base = warbandBase(code);
  const context: WarbandContext = {
    rules,
    warband: staged,
    confirmed,
    code,
    base,
    dispatch,
    pending,
    rows,
    stage,
    pendingCount: count,
    delta,
    canConfirm,
    confirmPurchases,
    discardPurchases,
    ctx,
    validation,
    cost,
    threshold,
    purse,
  };

  return (
    <div className={styles.shell}>
      {theme && <FactionBackdrop factionId={theme.id} />}
      <Header
        warband={staged}
        rules={rules}
        cost={cost}
        delta={delta}
        pendingCount={count}
        canConfirm={canConfirm}
        onConfirm={confirmPurchases}
        onDiscard={discardPurchases}
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
