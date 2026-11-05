import { findSubfaction, findUnit, importNewRecruit, rosterVariants, unzipRoster, upgradeFor, validateWarband, warbandCost, type ImportResult, type RulesData } from "@tc/rules/browser";
import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { memberTitle, priceText } from "../roster/select.js";
import { EMPTY_PENDING } from "../roster/staging.js";
import { useRules } from "../rules.js";
import { loadDraft, saveDraft, savePending } from "../storage.js";
import { DRAFT_CODE } from "./warbandContext.js";
import styles from "./ImportPage.module.css";

type State = { kind: "idle" } | { kind: "busy"; fileName: string } | { kind: "error"; fileName: string; message: string } | { kind: "ready"; fileName: string; result: ImportResult };

// The browser's own inflater; a .rosz is a zip with one deflated .ros inside.
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readRoster(file: File): Promise<string> {
  if (/\.rosz$/i.test(file.name)) return unzipRoster(new Uint8Array(await file.arrayBuffer()), inflateRaw);
  return file.text();
}

/** /import: drop or pick a NewRecruit export (.ros, .rosz or .json), check the mapping, then start a draft from it. */
export function ImportPage() {
  const navigate = useNavigate();
  const { rules, error } = useRules();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  const hadDraft = useMemo(() => loadDraft() !== undefined, []);

  async function take(file: File | undefined) {
    if (!file || !rules) return;
    setState({ kind: "busy", fileName: file.name });
    try {
      const text = await readRoster(file);
      setState({ kind: "ready", fileName: file.name, result: importNewRecruit(text, rules) });
    } catch (e) {
      setState({ kind: "error", fileName: file.name, message: e instanceof Error ? e.message : String(e) });
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void take(e.dataTransfer.files[0]);
  };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    void take(e.target.files?.[0]);
    e.target.value = "";
  };

  function createDraft(result: ImportResult) {
    saveDraft(result.warband);
    savePending(DRAFT_CODE, EMPTY_PENDING);
    navigate(`/w/${DRAFT_CODE}`);
  }

  if (error) return <p className="error">Could not load the rules data: {error}</p>;
  if (!rules) return <p className="muted">Loading rules…</p>;

  return (
    <div className={styles.page}>
      <h1>Import from NewRecruit</h1>
      <p className="muted">
        Export the list from NewRecruit as a BattleScribe roster (.ros or .rosz) or as JSON, then drop it here. The import is checked against the rules data before
        anything is created; selections that cannot be matched are listed, not dropped.
      </p>

      <label
        className={`${styles.drop} ${dragging ? styles.dragging : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input type="file" accept=".ros,.rosz,.json,application/json,text/xml" onChange={onPick} className={styles.file} />
        <span>Drop a .ros, .rosz or .json file here, or click to choose one.</span>
      </label>

      {state.kind === "busy" && <p className="muted">Reading {state.fileName}…</p>}
      {state.kind === "error" && (
        <div className={`panel ${styles.error}`}>
          <strong>{state.fileName}</strong> could not be imported: {state.message}
        </div>
      )}
      {state.kind === "ready" && <Preview rules={rules} fileName={state.fileName} result={state.result} hadDraft={hadDraft} onCreate={() => createDraft(state.result)} />}
    </div>
  );
}

function Preview({ rules, fileName, result, hadDraft, onCreate }: { rules: RulesData; fileName: string; result: ImportResult; hadDraft: boolean; onCreate: () => void }) {
  const { warband, unresolved, source } = result;
  const faction = rules.factionsById.get(warband.factionId);
  const subfaction = findSubfaction(rules, warband);
  const variant = rosterVariants(rules, warband).find((v) => v.id === warband.variantId);
  const patron = rules.campaign.patrons.find((p) => p.id === warband.patronId);
  const cost = warbandCost(warband, rules);
  const validation = validateWarband(warband, rules);

  return (
    <div className={styles.preview}>
      <section className="panel">
        <h2>{warband.name}</h2>
        <dl className={styles.facts}>
          <dt>File</dt>
          <dd>
            {fileName} <span className="muted">({source.format === "ros" ? "BattleScribe roster" : "NewRecruit JSON"}{source.generatedBy ? `, ${source.generatedBy}` : ""})</span>
          </dd>
          <dt>Faction</dt>
          <dd>
            {faction?.name ?? warband.factionId}
            {source.catalogue && source.catalogue !== (subfaction ?? faction)?.name && <span className="muted"> (catalogue "{source.catalogue}")</span>}
          </dd>
          {subfaction && (
            <>
              <dt>Subfaction</dt>
              <dd>{subfaction.name}</dd>
            </>
          )}
          <dt>Variant</dt>
          <dd>{variant?.name ?? <span className="muted">None</span>}</dd>
          <dt>Patron</dt>
          <dd>{patron?.name ?? <span className="muted">None</span>}</dd>
          <dt>Cost</dt>
          <dd>
            {cost.ducats} ducats{cost.glory ? `, ${cost.glory} glory` : ""}
            {warband.glory !== undefined && <span className="muted"> (glory pool {warband.glory})</span>}
          </dd>
          <dt>Rules check</dt>
          <dd className={validation.errors.length ? "error" : "ok"}>
            {validation.errors.length === 0 ? "Legal" : `${validation.errors.length} ${validation.errors.length === 1 ? "error" : "errors"}`}
            {validation.warnings.length > 0 && <span className="warning"> · {validation.warnings.length} warnings</span>}
          </dd>
        </dl>
      </section>

      <section className="panel">
        <h2>
          Roster · {warband.members.length} {warband.members.length === 1 ? "model" : "models"}
        </h2>
        <ul className={styles.members}>
          {warband.members.map((m) => {
            const unit = findUnit(rules, warband, m.unitId);
            const kit = [...m.equipmentItemIds.map((id) => rules.equipmentById.get(id)?.name ?? id), ...(m.upgradeIds ?? []).map((id) => (unit && upgradeFor(unit, id)?.name) ?? id)];
            const perMember = cost.perMember.find((c) => c.memberId === m.id);
            return (
              <li key={m.id}>
                <span className={styles.memberTitle}>{memberTitle(m, unit)}</span>
                <span className={styles.kit}>{kit.length ? kit.join(", ") : <span className="muted">No equipment</span>}</span>
                <span className="mono muted">{perMember ? priceText(perMember) : ""}</span>
              </li>
            );
          })}
        </ul>
        {validation.errors.length > 0 && (
          <ul className={styles.issues}>
            {validation.errors.map((e, i) => (
              <li key={i} className="error">
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Not mapped · {unresolved.length}</h2>
        {unresolved.length === 0 ? (
          <p className="ok">Every selection in the roster was matched.</p>
        ) : (
          <ul className={styles.unresolved}>
            {unresolved.map((u, i) => (
              <li key={i}>
                <span className={styles.path}>{u.path}</span>
                <span className="muted">{u.reason}</span>
                {u.entryId && <span className={`mono ${styles.entryId}`}>{u.entryId}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.actions}>
        {hadDraft && <span className="warning">This replaces the unsaved draft in this browser.</span>}
        <Link to="/">Cancel</Link>
        <button className="primary" onClick={onCreate}>
          Create draft from this roster
        </button>
      </div>
    </div>
  );
}
