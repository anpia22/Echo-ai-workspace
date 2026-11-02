const PATH =
  "M16 61 H81 C90 60.4 94 53 93 46 C92 36 82 30.4 70 30.4 C54 30.4 39 42 36.6 58 C34.4 78 48 92 64 92 C80 92 94 82 105 71.6";

/** Static Echo mark (public/logo/logo.svg). Stroke follows text color so it works in light and dark. */
export function EchoLogo({ className = "h-8 w-8", title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={PATH} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="105" cy="71.6" r="7.5" fill="#0F766E" />
    </svg>
  );
}

/** Animated Echo mark (public/logo/logo-loader.svg). Styles live in globals.css (.echo-loader-*). */
export function EchoLoader({ className = "h-20 w-20" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label="Loading">
      <path className="echo-loader-line" pathLength={100} d={PATH} />
      <g className="echo-loader-pen">
        <circle className="echo-loader-dot" cx="0" cy="0" r="7.5" />
      </g>
    </svg>
  );
}
