import { patronsForFaction, rosterVariants } from "@tc/rules/browser";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createWarband } from "../roster/reducer.js";
import { useRules } from "../rules.js";
import { loadDraft, startDraft } from "../storage.js";
import styles from "./NewPage.module.css";

export function NewPage() {
  const navigate = useNavigate();
  const { rules, error } = useRules();
  const [name, setName] = useState("");
  const [factionId, setFactionId] = useState("");
  const [subfactionId, setSubfactionId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [patronId, setPatronId] = useState("");
  const [gameNumber, setGameNumber] = useState(1);
  const hadDraft = useMemo(() => loadDraft() !== undefined, []);

  if (error) return <p className="error">Could not load the rules data: {error}</p>;
  if (!rules) return <p className="muted">Loading rules…</p>;

  // Faction -> optional subfaction -> variant: each list is filtered by the choice before it.
  // Patrons belong to the faction, so a subfaction takes its faction's.
  const faction = rules.factionsById.get(factionId);
  const subfactions = faction?.subfactions ?? [];
  const variants = faction ? rosterVariants(rules, { factionId: faction.id, subfactionId: subfactionId || undefined }) : [];
  const patrons = faction ? patronsForFaction(rules, faction.id) : [];

  function pickFaction(id: string) {
    setFactionId(id);
    setSubfactionId("");
    setVariantId("");
    setPatronId("");
  }

  function pickSubfaction(id: string) {
    setSubfactionId(id);
    setVariantId("");
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!faction) return;
    const warband = createWarband({
      name: name.trim(),
      factionId: faction.id,
      subfactionId: subfactionId || undefined,
      variantId: variantId || undefined,
      patronId: patronId || undefined,
      gameNumber,
    });
    startDraft(warband);
    navigate("/w/draft/barracks");
  }

  return (
    <form className={`panel ${styles.form}`} onSubmit={submit}>
      <h1>New warband</h1>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Fifth Lantern" autoFocus />
      </label>
      <label>
        Faction
        <select value={factionId} onChange={(e) => pickFaction(e.target.value)} required>
          <option value="">Choose a faction</option>
          {rules.factions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      {subfactions.length > 0 && (
        <label>
          Subfaction
          <select value={subfactionId} onChange={(e) => pickSubfaction(e.target.value)}>
            <option value="">None (core list)</option>
            {subfactions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Variant
        <select value={variantId} onChange={(e) => setVariantId(e.target.value)} disabled={!faction || variants.length === 0}>
          <option value="">{variants.length === 0 && faction ? "No variants" : "None (standard list)"}</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Patron
        <select value={patronId} onChange={(e) => setPatronId(e.target.value)} disabled={!faction}>
          <option value="">None</option>
          {patrons.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Game number
        <input type="number" min={1} step={1} value={gameNumber} onChange={(e) => setGameNumber(Math.max(1, Number(e.target.value) || 1))} />
      </label>
      <div className={styles.actions}>
        {hadDraft && <span className="warning">This replaces the unsaved draft in this browser.</span>}
        <Link to="/import">Import from NewRecruit instead</Link>
        <button type="submit" className="primary" disabled={!faction}>
          Start building
        </button>
      </div>
    </form>
  );
}
