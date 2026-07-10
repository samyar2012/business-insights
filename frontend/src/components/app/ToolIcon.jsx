const icons = {
  scan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  ),
  website: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M3 12h18M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
    </svg>
  ),
  coach: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l.8-3.2A8.8 8.8 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  health: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.5l4 4L19.5 6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4M12 17v4M3 12h4M17 12h4" />
    </svg>
  ),
  social: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path strokeLinecap="round" d="M7 15l3-3 2 2 5-5" />
    </svg>
  ),
  track: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 7h7v7" />
    </svg>
  ),
  content: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  ),
  plan: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path strokeLinecap="round" d="M9 12h6M9 16h6" />
    </svg>
  ),
}

export function ToolIcon({ name, className = 'h-5 w-5' }) {
  const icon = icons[name]
  if (!icon) {
    return (
      <span className={className} aria-hidden>
        *
      </span>
    )
  }
  return <span className={`inline-flex shrink-0 ${className}`}>{icon}</span>
}

export default ToolIcon
