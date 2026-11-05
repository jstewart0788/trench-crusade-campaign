import { useState } from "react";
import { ttsUrl } from "../api.js";
import styles from "./SavePanel.module.css";

interface Props {
  code?: string;
  dirty: boolean;
  busy: boolean;
  error?: string;
  onSave: () => void;
}

export function SavePanel({ code, dirty, busy, error, onSave }: Props) {
  const [copied, setCopied] = useState<string>();

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(undefined), 1500);
    } catch {
      window.prompt(`Copy this ${what}`, text);
    }
  }

  return (
    <div className={`panel ${styles.panel}`}>
      {code ? (
        <div className={styles.code}>
          <span className={styles.label}>TTS import code</span>
          <span className={styles.value}>{code}</span>
          <button onClick={() => copy(code, "code")}>{copied === "code" ? "Copied" : "Copy TTS import code"}</button>
          <span className={styles.url}>
            <a href={ttsUrl(code)} target="_blank" rel="noreferrer" className="mono">
              {ttsUrl(code)}
            </a>
            <button className="small" onClick={() => copy(ttsUrl(code), "URL")}>
              {copied === "URL" ? "Copied" : "Copy URL"}
            </button>
          </span>
        </div>
      ) : (
        <div className="muted">Unsaved draft, kept in this browser. Save to get a code the TTS mod can import.</div>
      )}
      <div className={styles.actions}>
        {error && <span className="error">{error}</span>}
        {code && !dirty && !busy && <span className="muted">Saved</span>}
        {code && dirty && !busy && <span className="warning">Unsaved changes</span>}
        <button className="primary" onClick={onSave} disabled={busy || (!!code && !dirty)}>
          {busy ? "Saving…" : code ? "Save changes" : "Save and get code"}
        </button>
      </div>
    </div>
  );
}
