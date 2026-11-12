import { useState } from "react";

// The warband's own ducat and glory limits (a campaign's or a house rule's).
// Blank means "what the rules give", shown as the placeholder; a set limit says
// what it replaces, so a house rule never hides the rules' number.

interface Props {
  ducatLimit: number | undefined;
  glory: number | undefined;
  /** The rules' Threshold Value for this warband. */
  ruledDucats: number;
  /** The rules' glory pool; undefined when they give none to check against (a later game). */
  ruledGlory: number | undefined;
  onDucats: (n: number | undefined) => void;
  onGlory: (n: number | undefined) => void;
}

function LimitField({ label, value, ruled, unit, onChange }: { label: string; value: number | undefined; ruled: number | undefined; unit: string; onChange: (n: number | undefined) => void }) {
  // Typed text is kept while it is being edited so a half-typed number is not reformatted under the cursor.
  const [text, setText] = useState<string | undefined>(undefined);
  const shown = text ?? (value === undefined ? "" : String(value));
  const commit = (raw: string) => {
    const t = raw.trim();
    onChange(t === "" ? undefined : Math.max(0, Math.floor(Number(t)) || 0));
  };
  return (
    <label>
      {label}
      <input
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        value={shown}
        placeholder={ruled === undefined ? "not set" : `${ruled} (the rules)`}
        aria-label={label}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setText(undefined)}
      />
      <span className="quiet">
        {value === undefined ? (ruled === undefined ? `No ${unit} limit from the rules at this game.` : `From the rules: ${ruled}.`) : `Custom; the rules give ${ruled ?? "none"}.`}
        {value !== undefined && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => {
                setText(undefined);
                onChange(undefined);
              }}
            >
              Use the rules
            </button>
          </>
        )}
      </span>
    </label>
  );
}

/** Ducat and glory limit inputs: blank follows the rules, a number replaces them. */
export function PurseLimits({ ducatLimit, glory, ruledDucats, ruledGlory, onDucats, onGlory }: Props) {
  return (
    <>
      <LimitField label="Ducat limit" value={ducatLimit} ruled={ruledDucats} unit="ducat" onChange={onDucats} />
      <LimitField label="Glory limit" value={glory} ruled={ruledGlory} unit="glory" onChange={onGlory} />
    </>
  );
}
