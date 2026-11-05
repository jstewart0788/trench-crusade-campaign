// The rulebook's currency marks, drawn rather than typed: a crown for ducats
// (brass), a sun for glory (its own pale colour). Sized to sit on a text line.

export function DucatGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 14" width="13" height="11" role="img" aria-label="ducats">
      <path d="M1.5 11 L1 3.5 L4.6 7 L8 1.5 L11.4 7 L15 3.5 L14.5 11 Z" fill="currentColor" />
      <rect x="1.5" y="11.6" width="13" height="1.9" rx="0.6" fill="currentColor" />
    </svg>
  );
}

export function GloryGlyph({ className }: { className?: string }) {
  const rays = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg className={className} viewBox="0 0 16 16" width="12" height="12" role="img" aria-label="glory">
      <circle cx="8" cy="8" r="3.3" fill="currentColor" />
      {rays.map((a) => (
        <line key={a} x1="8" y1="1" x2="8" y2="3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" transform={`rotate(${a} 8 8)`} />
      ))}
    </svg>
  );
}
