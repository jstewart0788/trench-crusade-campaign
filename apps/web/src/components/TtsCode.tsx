import { useState } from "react";
import { ttsUrl } from "../api.js";
import { IconButton } from "./IconButton.js";
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
        <IconButton glyph={copied === "code" ? "copied" : "copy"} label={copied === "code" ? "Copied" : "Copy TTS import code"} onClick={() => copy(code, "code")} />
      </div>
      <div className={styles.url}>
        <a href={ttsUrl(code)} target="_blank" rel="noreferrer" className="mono">
          {ttsUrl(code)}
        </a>
        <IconButton glyph={copied === "URL" ? "copied" : "copy"} label={copied === "URL" ? "Copied" : "Copy URL"} onClick={() => copy(ttsUrl(code), "URL")} />
      </div>
      <p className="quiet">Type the code into the mod's importer, or point it at the URL.</p>
    </div>
  );
}
