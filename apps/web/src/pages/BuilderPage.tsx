import { findUnit, limitContext, validateWarband, warbandCost, warbandThreshold, type RulesData, type Warband } from "@tc/rules/browser";
import { useEffect, useMemo, useReducer, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiRequestError, type SavedWarband } from "../api.js";
import { Armoury } from "../components/Armoury.js";
import { Header } from "../components/Header.js";
import { RosterList } from "../components/RosterList.js";
import { SavePanel } from "../components/SavePanel.js";
import { UnitPicker } from "../components/UnitPicker.js";
import { ValidationPanel } from "../components/ValidationPanel.js";
import { nextMemberId, rosterReducer } from "../roster/reducer.js";
import { defaultKit } from "../roster/select.js";
import { useRules } from "../rules.js";
import { clearDraft, loadDraft, rememberSaved, saveDraft } from "../storage.js";
import styles from "./BuilderPage.module.css";

/** The :code that means "the unsaved draft in this browser". Real codes are six uppercase characters, so they never collide. */
export const DRAFT_CODE = "draft";

type Source =
  | { kind: "loading"; code: string }
  | { kind: "ready"; code?: string; warband: Warband }
  | { kind: "missing"; code: string }
  | { kind: "error"; message: string };

export function BuilderPage() {
  const { code: param = DRAFT_CODE } = useParams();
  const navigate = useNavigate();
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
    <Builder
      key={source.code ?? DRAFT_CODE}
      rules={rules}
      initial={source.warband}
      code={source.code}
      onSaved={(saved) => {
        setSource({ kind: "ready", code: saved.code, warband: saved.warband });
        if (!source.code) navigate(`/w/${saved.code}`, { replace: true });
      }}
    />
  );
}

interface BuilderProps {
  rules: RulesData;
  initial: Warband;
  code?: string;
  onSaved: (saved: SavedWarband) => void;
}

function Builder({ rules, initial, code, onSaved }: BuilderProps) {
  const [warband, dispatch] = useReducer(rosterReducer, initial);
  const [selectedId, setSelectedId] = useState<string | undefined>(initial.members[0]?.id);
  const [save, setSave] = useState<{ busy: boolean; error?: string; snapshot?: string }>({ busy: false, snapshot: code ? JSON.stringify(initial) : undefined });

  const ctx = useMemo(() => limitContext(warband, rules), [warband, rules]);
  const validation = useMemo(() => validateWarband(warband, rules), [warband, rules]);
  const cost = useMemo(() => warbandCost(warband, rules), [warband, rules]);
  const threshold = useMemo(() => warbandThreshold(warband, rules), [warband, rules]);

  useEffect(() => {
    if (!code) saveDraft(warband);
  }, [warband, code]);

  const selected = warband.members.find((m) => m.id === selectedId) ?? warband.members[0];
  const selectedUnit = selected ? findUnit(rules, warband.factionId, selected.unitId) : undefined;
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

  return (
    <div className={styles.builder}>
      <Header warband={warband} rules={rules} cost={cost} threshold={threshold} validation={validation} dispatch={dispatch} />
      <SavePanel code={code} dirty={dirty} busy={save.busy} error={save.error} onSave={persist} />
      <ValidationPanel warband={warband} rules={rules} validation={validation} onSelect={setSelectedId} />
      <div className={styles.columns}>
        <section className={styles.roster}>
          <RosterList
            warband={warband}
            rules={rules}
            cost={cost}
            validation={validation}
            selectedId={selected?.id}
            onSelect={setSelectedId}
            dispatch={dispatch}
          />
        </section>
        <section className={styles.pickers}>
          <UnitPicker
            warband={warband}
            rules={rules}
            ctx={ctx}
            onAdd={(unit) => {
              const memberId = nextMemberId(warband.members);
              dispatch({ type: "add-member", unitId: unit.id, equipmentItemIds: defaultKit(unit, warband, rules, ctx) });
              setSelectedId(memberId);
            }}
          />
          {selected && selectedUnit ? (
            <Armoury warband={warband} rules={rules} ctx={ctx} member={selected} unit={selectedUnit} dispatch={dispatch} />
          ) : (
            <p className="muted">Add a model, then pick it on the left to equip it.</p>
          )}
        </section>
      </div>
    </div>
  );
}
