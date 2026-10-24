/** The mark: a ring with one segment completed. Decorative beside the
 *  wordmark, so it is hidden from assistive technology. */
export function LogoMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <circle
        cx="16"
        cy="16"
        r="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        className="text-edge"
      />
      <path
        d="M16 5a11 11 0 0 1 11 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        className="text-accent"
      />
      <circle cx="16" cy="16" r="3" fill="currentColor" className="text-accent" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-[-0.015em] ${className}`}>
      Round<span className="text-accent">Ready</span>
    </span>
  );
}
