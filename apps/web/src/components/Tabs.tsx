import { NavLink } from "react-router-dom";
import { GlyphIcon } from "./IconButton.js";
import styles from "./Tabs.module.css";

export function Tabs({ base }: { base: string }) {
  const cls = ({ isActive }: { isActive: boolean }) => `${styles.tab} ${isActive ? styles.active : ""}`;
  return (
    <nav className={styles.tabs} aria-label="Warband sections">
      <NavLink to={base} end className={cls}>
        <GlyphIcon glyph="warband" className={styles.glyph} />
        Warband
      </NavLink>
      <NavLink to={`${base}/barracks`} className={cls}>
        <GlyphIcon glyph="barracks" className={styles.glyph} />
        Barracks
      </NavLink>
      <NavLink to={`${base}/armoury`} className={cls}>
        <GlyphIcon glyph="armoury" className={styles.glyph} />
        Armoury
      </NavLink>
    </nav>
  );
}
