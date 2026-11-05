import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { ArmouryScreen } from "./pages/ArmouryScreen.js";
import { BarracksScreen } from "./pages/BarracksScreen.js";
import { HomePage } from "./pages/HomePage.js";
import { NewPage } from "./pages/NewPage.js";
import { WarbandLayout } from "./pages/WarbandLayout.js";
import { WarbandScreen } from "./pages/WarbandScreen.js";
import styles from "./App.module.css";

export function App() {
  return (
    <BrowserRouter>
      <div className={styles.shell}>
        <nav className={styles.nav}>
          <Link to="/" className={styles.brand}>
            Trench Crusade <span className={styles.sub}>Warband Roster</span>
          </Link>
          <div className={styles.links}>
            <Link to="/">Warbands</Link>
            <Link to="/new" className={styles.primary}>
              New warband
            </Link>
          </div>
        </nav>
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/new" element={<NewPage />} />
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
