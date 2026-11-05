/** Marks kit the model always carries: it is shown, but nothing offers to change it. */
export function LockGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 12 14" width="10" height="12" role="img" aria-label="Built in, cannot be edited">
      <path d="M3 6V4a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="1" y="6" width="10" height="7.5" rx="1.2" fill="currentColor" />
    </svg>
  );
}
