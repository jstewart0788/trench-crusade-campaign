import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { ArmouryScreen } from "./pages/ArmouryScreen.js";
import { BarracksScreen } from "./pages/BarracksScreen.js";
import { HomePage } from "./pages/HomePage.js";
import { ImportPage } from "./pages/ImportPage.js";
import { NewPage } from "./pages/NewPage.js";
import { WarbandLayout } from "./pages/WarbandLayout.js";
import { WarbandScreen } from "./pages/WarbandScreen.js";
import styles from "./App.module.css";

export function App() {
  return (
    <BrowserRouter>
      <div className={styles.shell}>
        <nav className={styles.nav} aria-label="Site">
          <Link to="/" className={styles.brand} title="Your warbands">
            <Emblem />
            <span className={styles.brandText}>
              <span className={styles.title}>Trench Crusade</span>
              <span className={styles.sub}>Warband Roster</span>
            </span>
          </Link>
          <div className={styles.links}>
            <NavLink to="/import" className={({ isActive }) => `${styles.ghost} ${isActive ? styles.current : ""}`}>
              Import
            </NavLink>
            <NavLink to="/new" className={({ isActive }) => `${styles.primary} ${isActive ? styles.current : ""}`}>
              New warband
            </NavLink>
          </div>
        </nav>
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/new" element={<NewPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/w/:code" element={<WarbandLayout />}>
              <Route index element={<WarbandScreen />} />
              <Route path="barracks" element={<BarracksScreen />} />
              <Route path="armoury" element={<ArmouryScreen />} />
            </Route>
            <Route path="*" element={<p className="muted">Nothing here.</p>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

// A crossed blade over a ring, in the current theme's accent; decorative.
function Emblem() {
  return (
    <svg className={styles.emblem} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="22 4" />
      <path d="M20 5v26M13 12h14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" />
      <path d="M20 35l-4-5h8z" fill="currentColor" />
    </svg>
  );
}
