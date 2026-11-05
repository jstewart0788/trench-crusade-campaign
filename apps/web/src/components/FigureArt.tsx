import { useId } from "react";
import type { Carried, Pose } from "../roster/pose.js";
import { ICONS, type IconId } from "./figureIcons.js";
import styles from "./Figure.module.css";

// A trench soldier in silhouette, dressed in the model's kit. The body is drawn
// here with tabletop-miniature proportions (squat, broad, a large head) so the
// kit reads at the size of the figure; every piece of equipment except the Iron
// Capirote is a game-icons.net icon (CC BY 3.0), placed by its centre, size and
// turn. Icons draw blades and barrels bottom-left to top-right with the grip
// near the bottom-left corner; pistols point left.

type Pt = readonly [number, number];

// The body is authored tall and drawn squashed toward the feet: SQUAT maps an
// authored point to the canvas, and the body paths get the same transform.
const FOOT = 396;
const SQUAT = 0.72;
const SLIM = 0.84;
const at = (x: number, y: number): Pt => [100 + (x - 100) * SLIM, FOOT - (FOOT - y) * SQUAT];
const BODY_TRANSFORM = `translate(${100 * (1 - SLIM)} ${FOOT * (1 - SQUAT)}) scale(${SLIM} ${SQUAT})`;

interface Arm {
  elbow: Pt;
  hand: Pt;
}
const SHOULDER_R = at(64, 96);
const SHOULDER_L = at(136, 96);
const IDLE_R: Arm = { elbow: at(52, 150), hand: at(50, 198) };
const IDLE_L: Arm = { elbow: at(148, 150), hand: at(150, 198) };
const PORT_R: Arm = { elbow: at(48, 150), hand: at(76, 186) };
const PORT_L: Arm = { elbow: at(158, 118), hand: at(126, 132) };
const RAISED_R: Arm = { elbow: at(40, 140), hand: at(42, 104) };
const RAISED_L: Arm = { elbow: at(160, 140), hand: at(158, 104) };
const SHIELD_L: Arm = { elbow: at(154, 150), hand: at(140, 182) };
const HEAD: Pt = [100, at(100, 50)[1]];
const CHEST: Pt = at(100, 140);
const BELT_Y = at(100, 205)[1];

/** Equipment is drawn larger than life so it reads against the figure. */
const KIT = 1.5;

/** Icons drawn the other way round: blade top-left, grip bottom-right. Mirroring them puts them in the usual orientation. */
const REVERSED = new Set<IconId>(["greatsword", "dagger"]);
const flip = (icon: IconId, mirror: boolean) => mirror !== REVERSED.has(icon);

const KNIVES = new Set<IconId>(["trenchKnife", "dagger"]);
const POLEARMS = new Set<IconId>(["halberdSlim", "spear", "halberd"]);

/** Where a pistol icon's grip sits from its centre, as fractions of its size: left of centre and below. */
const PISTOL_GRIP: Pt = [-0.28, 0.2];

/** How far the grip of a diagonal icon sits from its centre, as a fraction of its size. */
const GRIP = 0.37;

/** Parts of an icon to leave out, as the height in icon units below which it is cut: the Brodie's chin strap. */
const CUT_BELOW: Partial<Record<IconId, number>> = { brodie: 322 };

function Icon({ id, at: c, size, turn = 0, mirror = false, className }: { id: IconId; at: Pt; size: number; turn?: number; mirror?: boolean; className?: string }) {
  const k = size / 512;
  const clipId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cut = CUT_BELOW[id];
  return (
    <g className={className} transform={`translate(${c[0]} ${c[1]}) rotate(${turn}) scale(${mirror ? -k : k} ${k}) translate(-256 -256)`}>
      {cut !== undefined && (
        <clipPath id={`cut${clipId}`}>
          <rect x={-40} y={-40} width={592} height={cut + 40} />
        </clipPath>
      )}
      <path className={styles.gear} d={ICONS[id]} clipPath={cut !== undefined ? `url(#cut${clipId})` : undefined} />
    </g>
  );
}

const zoneClass = (w: Carried) => (w.zone === "ranged" ? styles.zoneRanged : styles.zoneMelee);

/** A one-handed weapon in a raised hand, pointed up and away from the body. */
function heldInHand(w: Carried, hand: Pt, side: "r" | "l") {
  const out = side === "r" ? -1 : 1;
  if (w.grip === "claws") return <Icon id={w.icon} at={[hand[0], hand[1] + 6]} size={34 * KIT} mirror={side === "r"} className={zoneClass(w)} />;
  if (w.grip === "pistol") {
    // Pistol icons point right with the grip low on the left; the right hand mirrors them to point outward.
    const size = 74;
    return <Icon id={w.icon} at={[hand[0] - out * PISTOL_GRIP[0] * size, hand[1] - PISTOL_GRIP[1] * size]} size={size} mirror={side === "r"} className={zoneClass(w)} />;
  }
  const size = KNIVES.has(w.icon) ? 46 : 84;
  return <Icon id={w.icon} at={[hand[0] + out * GRIP * size, hand[1] - GRIP * size]} size={size} mirror={flip(w.icon, side === "r")} className={zoneClass(w)} />;
}

/**
 * A two-handed weapon fitted to both hands: turned to lie along the line between
 * them, sized so the rear hand sits on the grip and the front hand on the barrel
 * or haft. `rear` and `front` are those points as fractions of the icon's length.
 */
function heldInBothHands(w: Carried, rearHand: Pt, frontHand: Pt) {
  if (POLEARMS.has(w.icon)) return <Polearm w={w} rearHand={rearHand} frontHand={frontHand} />;
  const [rear, front] = w.zone === "ranged" ? [0.3, 0.6] : w.icon === "halberdSlim" || w.icon === "spear" ? [0.3, 0.7] : [0.1, 0.52];
  const dx = frontHand[0] - rearHand[0];
  const dy = frontHand[1] - rearHand[1];
  const span = Math.hypot(dx, dy);
  const length = span / (front - rear);
  // Icons fill about nine tenths of their box along the diagonal.
  const diagonal = w.icon !== "minigun";
  const size = length / (diagonal ? 0.9 * Math.SQRT2 : 0.9);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const turn = angle - (diagonal ? -45 : 0);
  const fromCentre = (0.5 - rear) * length;
  const centre: Pt = [rearHand[0] + (dx / span) * fromCentre, rearHand[1] + (dy / span) * fromCentre];
  return <Icon id={w.icon} at={centre} size={size} turn={turn} mirror={flip(w.icon, false)} className={zoneClass(w)} />;
}

function Limb({ from, arm, className }: { from: Pt; arm: Arm; className?: string }) {
  const points = [from, arm.elbow, arm.hand].map((p) => p.join(",")).join(" ");
  return (
    <g className={className}>
      <polyline className={styles.limbEdge} points={points} />
      <polyline className={styles.limb} points={points} />
    </g>
  );
}

/**
 * A polearm drawn rather than iconned: a long haft running through both hands,
 * butt below the rear hand and a small head well above the front one. The
 * icons' heads are too large to scale onto a haft this long.
 */
function Polearm({ w, rearHand, frontHand }: { w: Carried; rearHand: Pt; frontHand: Pt }) {
  const dx = frontHand[0] - rearHand[0];
  const dy = frontHand[1] - rearHand[1];
  const span = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const tip = span + 96;
  const spear = w.icon === "spear";
  return (
    <g className={zoneClass(w)} transform={`translate(${rearHand[0]} ${rearHand[1]}) rotate(${angle})`}>
      <g className={styles.gear} style={{ strokeWidth: 1.5 }}>
        <path d={`M-46 -2.6H${tip}V2.6H-46Z`} />
        <path d={`M-50 -3.6H-42V3.6H-50Z`} />
        <path d={`M${tip} -4.5L${tip + 24} 0L${tip} 4.5Z`} />
        {!spear && <path d={`M${tip - 26} -2.6L${tip - 30} -21Q${tip - 12} -26 ${tip - 4} -13L${tip - 6} -2.6Z`} />}
        {!spear && <path d={`M${tip - 16} 2.6L${tip - 13} 13L${tip - 9} 2.6Z`} />}
      </g>
    </g>
  );
}

/** The Iron Capirote: a tall riveted iron cone over the whole head and neck, banded, with a cross cut for the eyes. */
function Capirote() {
  const [x, y] = HEAD;
  return (
    <g className={styles.iron}>
      <path d={`M${x - 24} ${y + 26}C${x - 22} ${y + 6} ${x - 16} ${y - 30} ${x - 4} ${y - 78}Q${x} ${y - 84} ${x + 4} ${y - 78}C${x + 16} ${y - 30} ${x + 22} ${y + 6} ${x + 24} ${y + 26}Q${x} ${y + 34} ${x - 24} ${y + 26}Z`} />
      <path className={styles.band} d={`M${x - 19} ${y - 14}Q${x} ${y - 9} ${x + 19} ${y - 14}M${x - 12} ${y - 44}Q${x} ${y - 40} ${x + 12} ${y - 44}M${x - 22} ${y + 18}Q${x} ${y + 24} ${x + 22} ${y + 18}`} />
      {[-14, -7, 0, 7, 14].map((dx) => (
        <circle key={dx} className={styles.rivet} cx={x + dx} cy={y - 11 - Math.abs(dx) * 0.08} r={1.5} />
      ))}
      <path className={styles.slit} d={`M${x - 12} ${y + 1}H${x + 12}V${y + 5}H${x + 2}V${y + 15}H${x - 2}V${y + 5}H${x - 12}Z`} />
    </g>
  );
}

export function FigureArt({ pose }: { pose: Pose }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { bothHands, right, left, shield, armour, headgear } = pose;
  const rightArm = bothHands?.grip === "claws" ? IDLE_R : bothHands ? PORT_R : right && right.grip !== "claws" ? RAISED_R : IDLE_R;
  const leftArm = bothHands?.grip === "claws" ? IDLE_L : bothHands ? PORT_L : shield ? SHIELD_L : left && left.grip !== "claws" ? RAISED_L : IDLE_L;
  const carried = [bothHands, right, left, ...pose.back, ...pose.hip];
  const hasRanged = carried.some((w) => w?.zone === "ranged");
  const hasMelee = carried.some((w) => w?.zone === "melee");
  const shieldAt: Pt = bothHands ? [162, at(0, 150)[1]] : [152, at(0, 176)[1]];
  const capirote = headgear?.icon === "capirote";
  const faceCovered = capirote || headgear?.icon === "visored";

  return (
    <svg className={styles.silhouette} viewBox="-62 70 324 344" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`${id}glow`} cx="0.5" cy="0.55" r="0.55">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.16" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="100" cy="250" rx="150" ry="170" fill={`url(#${id}glow)`} />

      <g className={styles.base}>
        <ellipse cx="100" cy="404" rx="76" ry="10" />
        <ellipse cx="100" cy="399" rx="76" ry="10" />
      </g>

      {pose.back.map((w, i) => (
        <Icon key={`back-${i}`} id={w.icon} at={[100 + i * 14, CHEST[1] + 10]} size={175} mirror={flip(w.icon, true)} className={zoneClass(w)} />
      ))}

      <g className={styles.zoneTorso}>
        <g transform={BODY_TRANSFORM}>
          <path
            className={styles.flesh}
            vectorEffect="non-scaling-stroke"
            d="M100 78C114 78 130 81 139 87C146 92 147 100 146 112L140 168C138 186 136 196 137 206L141 242C142 272 139 302 135 332L132 382H109L106 302L102 250H98L94 302L91 382H68L65 332C61 302 58 272 59 242L63 206C64 196 62 186 60 168L54 112C53 100 54 92 61 87C70 81 86 78 100 78Z"
          />
          <path className={styles.flesh} vectorEffect="non-scaling-stroke" d="M66 378H93L94 392Q78 398 58 393Q59 383 66 378Z" />
          <path className={styles.flesh} vectorEffect="non-scaling-stroke" d="M107 378H134Q141 383 142 393Q122 398 106 392Z" />
          <path className={styles.seam} vectorEffect="non-scaling-stroke" d="M100 92V200M102 252L105 378M98 252L95 378" />
          {armour?.icon === "robe" && <path className={styles.cloth} vectorEffect="non-scaling-stroke" d="M62 202H138L154 374Q100 388 46 374Z" />}
        </g>
        {armour && armour.icon !== "robe" && <Icon id={armour.icon} at={[100, CHEST[1] + (armour.icon === "breastplate" ? -4 : 2)]} size={(armour.icon === "breastplate" ? 76 : 84) * KIT} />}
      </g>

      <g className={styles.zoneGrenade}>
        <path className={styles.belt} d={`M60 ${BELT_Y - 5}H140V${BELT_Y + 5}H60Z`} />
        {pose.grenades && (
          <g>
            <Icon id={pose.grenades.icon} at={[74, BELT_Y + 16]} size={30 * KIT} />
            <Icon id={pose.grenades.icon} at={[90, BELT_Y + 18]} size={30 * KIT} turn={12} />
          </g>
        )}
      </g>

      {pose.hip.map((w, i) =>
        w.zone === "melee" ? (
          <Icon key={`hip-${i}`} id={w.icon} at={[146 + i * 10, BELT_Y + 34]} size={KNIVES.has(w.icon) ? 56 : 92} turn={135} mirror={flip(w.icon, false)} className={styles.zoneMelee} />
        ) : (
          <Icon key={`hip-${i}`} id={w.icon} at={[54 - i * 10, BELT_Y + 30]} size={46 * KIT} turn={90} className={styles.zoneRanged} />
        ),
      )}

      <g className={styles.zoneHead}>
        <path className={styles.flesh} d={`M91 ${HEAD[1] + 12}H109V${HEAD[1] + 30}H91Z`} />
        {!faceCovered && <ellipse className={styles.flesh} cx={HEAD[0]} cy={HEAD[1]} rx="19" ry="22" />}
        {pose.mask && !faceCovered && <Icon id="gasMask" at={[HEAD[0], HEAD[1] + 8]} size={34 * KIT} />}
        {capirote ? (
          <Capirote />
        ) : headgear ? (
          <Icon
            id={headgear.icon}
            at={headgear.icon === "visored" ? [HEAD[0], HEAD[1] + 2] : headgear.icon === "hood" ? [HEAD[0], HEAD[1]] : [HEAD[0], HEAD[1] - 12]}
            size={(headgear.icon === "visored" ? 40 : headgear.icon === "hood" ? 50 : 48) * KIT}
          />
        ) : null}
      </g>

      <Limb from={SHOULDER_R} arm={rightArm} className={hasRanged ? undefined : styles.zoneRanged} />
      <Limb from={SHOULDER_L} arm={leftArm} className={hasMelee ? undefined : styles.zoneMelee} />

      {bothHands?.grip === "claws" && (
        <g>
          {heldInHand(bothHands, rightArm.hand, "r")}
          {heldInHand(bothHands, leftArm.hand, "l")}
        </g>
      )}
      {bothHands && bothHands.grip !== "claws" && heldInBothHands(bothHands, rightArm.hand, leftArm.hand)}
      {right && heldInHand(right, rightArm.hand, "r")}
      {left && heldInHand(left, leftArm.hand, "l")}


      {shield ? (
        <Icon id={shield.icon} at={shieldAt} size={(shield.icon === "riotShield" ? 72 : 62) * KIT} className={styles.zoneOffhand} />
      ) : (
        <g className={`${styles.ghost} ${styles.zoneOffhand}`}>
          <circle cx={shieldAt[0]} cy={shieldAt[1]} r={36} />
        </g>
      )}
    </svg>
  );
}
