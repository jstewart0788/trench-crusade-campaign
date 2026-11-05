import { useState } from "react";
import { ttsUrl } from "../api.js";
import styles from "./TtsCode.module.css";

export function TtsCode({ code }: { code: string }) {
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
    <div className={styles.block}>
      <div className={styles.row}>
        <span className={styles.value}>{code}</span>
        <button onClick={() => copy(code, "code")}>{copied === "code" ? "Copied" : "Copy TTS import code"}</button>
      </div>
      <div className={styles.url}>
        <a href={ttsUrl(code)} target="_blank" rel="noreferrer" className="mono">
          {ttsUrl(code)}
        </a>
        <button className="small" onClick={() => copy(ttsUrl(code), "URL")}>
          {copied === "URL" ? "Copied" : "Copy URL"}
        </button>
      </div>
      <p className="quiet">Type the code into the mod's importer, or point it at the URL.</p>
    </div>
  );
}
