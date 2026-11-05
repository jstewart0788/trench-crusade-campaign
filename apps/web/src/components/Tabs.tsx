import { NavLink } from "react-router-dom";
import styles from "./Tabs.module.css";

export function Tabs({ base }: { base: string }) {
  const cls = ({ isActive }: { isActive: boolean }) => `${styles.tab} ${isActive ? styles.active : ""}`;
  return (
    <nav className={styles.tabs} aria-label="Warband sections">
      <NavLink to={base} end className={cls}>
        Warband
      </NavLink>
      <NavLink to={`${base}/barracks`} className={cls}>
        Barracks
      </NavLink>
      <NavLink to={`${base}/armoury`} className={cls}>
        Armoury
      </NavLink>
    </nav>
  );
}
