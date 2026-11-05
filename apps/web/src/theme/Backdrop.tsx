import type { ReactNode } from "react";

// One original sigil per faction, drawn from circles, lines and polygons. It sits
// large and faint behind the screens; decorative, so hidden from assistive tech.

const ring = <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="5" />;

const points = (n: number, r: number, step: number, start = -90) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((start + (i * step * 360) / n) * Math.PI) / 180;
    return `${(100 + r * Math.cos(a)).toFixed(1)},${(100 + r * Math.sin(a)).toFixed(1)}`;
  }).join(" ");

const SIGILS: Record<string, ReactNode> = {
  // A crenellated keep under a four-pointed star.
  "new-antioch": (
    <g fill="currentColor">
      {ring}
      <path d="M62 150V92h10v-12h12v12h10v-12h12v12h10v-12h12v12h10v58h-26v-26a10 10 0 0 0-20 0v26z" />
      <path d="M100 30l6 14 14 6-14 6-6 14-6-14-14-6 14-6z" />
    </g>
  ),
  // A broken ring, a falling blade and two horns.
  "heretic-legion": (
    <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round">
      <circle cx="100" cy="100" r="92" strokeDasharray="60 18" />
      <path d="M100 60v90M84 76h32" />
      <path d="M100 150l-10-14h20z" fill="currentColor" />
      <path d="M62 70c-18-6-26-24-20-42M138 70c18-6 26-24 20-42" />
    </g>
  ),
  // A rayed halo behind a tall cross, a flame above.
  "trench-pilgrims": (
    <g fill="currentColor">
      {ring}
      <g stroke="currentColor" strokeWidth="4">
        {Array.from({ length: 16 }, (_, i) => {
          const a = (i * Math.PI) / 8;
          return <line key={i} x1={100 + 54 * Math.cos(a)} y1={92 + 54 * Math.sin(a)} x2={100 + 70 * Math.cos(a)} y2={92 + 70 * Math.sin(a)} />;
        })}
      </g>
      <circle cx="100" cy="92" r="44" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M94 48h12v36h28v12h-28v80H94V96H66V84h28z" />
      <path d="M100 22c8 10 8 18 0 22-8-4-8-12 0-22z" />
    </g>
  ),
  // An eight-pointed star of two squares, a seal at its heart.
  "iron-sultanate": (
    <g fill="none" stroke="currentColor" strokeWidth="6">
      {ring}
      <path d="M50 50h100v100H50z" />
      <path d="M100 29l71 71-71 71-71-71z" />
      <circle cx="100" cy="100" r="20" />
      <circle cx="100" cy="100" r="6" fill="currentColor" />
    </g>
  ),
  // A goblet, brimming and dripping.
  "black-grail": (
    <g fill="currentColor">
      {ring}
      <path d="M58 48h84c0 36-16 58-36 62v34h18v10H70v-10h18v-34c-20-4-36-26-30-62z" />
      <circle cx="80" cy="128" r="5" />
      <circle cx="122" cy="136" r="4" />
      <circle cx="100" cy="176" r="6" />
    </g>
  ),
  // A seven-pointed star in a ring of seven.
  "court-of-the-seven-headed-serpent": (
    <g fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round">
      {ring}
      <polygon points={points(7, 72, 3)} />
      {points(7, 84, 1)
        .split(" ")
        .map((p) => {
          const [x, y] = p.split(",").map(Number);
          return <circle key={p} cx={x} cy={y} r="5" fill="currentColor" stroke="none" />;
        })}
    </g>
  ),
};

/** The faint sigil behind a themed warband's screens. */
export function FactionBackdrop({ factionId }: { factionId: string }) {
  const sigil = SIGILS[factionId];
  if (!sigil) return null;
  return (
    <div className="faction-backdrop" aria-hidden="true" data-sigil={factionId}>
      <svg viewBox="0 0 200 200" focusable="false">
        {sigil}
      </svg>
    </div>
  );
}

export const SIGIL_IDS = Object.keys(SIGILS);
