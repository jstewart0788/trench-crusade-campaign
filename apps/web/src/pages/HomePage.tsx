import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { forgetSaved, listSaved, loadDraft } from "../storage.js";
import styles from "./HomePage.module.css";

export function HomePage() {
  const navigate = useNavigate();
  const [saved, setSaved] = useState(listSaved);
  const [code, setCode] = useState("");
  const draft = loadDraft()?.warband;

  function open(e: FormEvent) {
    e.preventDefault();
    const clean = code.toUpperCase().replace(/[\s-]/g, "");
    if (clean) navigate(`/w/${clean}`);
  }

  return (
    <div className={styles.home}>
      <header className={styles.head}>
        <h1>Warbands</h1>
        <div className={styles.headActions}>
          <Link to="/import">
            <button>Import from NewRecruit</button>
          </Link>
          <Link to="/new">
            <button className="primary">New warband</button>
          </Link>
        </div>
      </header>

      {draft && (
        <p className={`panel ${styles.draft}`}>
          Unsaved draft: <strong>{draft.name || "(unnamed)"}</strong>, {draft.members.length} {draft.members.length === 1 ? "model" : "models"}.{" "}
          <Link to="/w/draft">Resume</Link>
        </p>
      )}

      {saved.length === 0 ? (
        <p className="muted">No warbands saved from this browser yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Faction</th>
              <th>Code</th>
              <th>Saved</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {saved.map((entry) => (
              <tr key={entry.code}>
                <td>
                  <Link to={`/w/${entry.code}`}>{entry.name || "(unnamed)"}</Link>
                </td>
                <td>{entry.factionName}</td>
                <td className="mono">{entry.code}</td>
                <td className="muted">{new Date(entry.savedAt).toLocaleString()}</td>
                <td>
                  <button
                    className="small"
                    title="Forget this code on this browser (the warband stays on the server)"
                    onClick={() => {
                      forgetSaved(entry.code);
                      setSaved(listSaved());
                    }}
                  >
                    Forget
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form className={styles.open} onSubmit={open}>
        <label>
          Open by code
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. K7PX2M" className="mono" />
        </label>
        <button type="submit" disabled={!code.trim()}>
          Open
        </button>
      </form>
    </div>
  );
}
