import { Link } from 'react-router-dom'
import { TOOL_ICONS } from './toolConfig'

const ToolPlaceholder = ({ title, tagline, description, iconKey = 'scan' }) => (
  <div className="mx-auto max-w-3xl">
    <Link to="/app/tools" className="app-link text-sm font-medium">
      &larr; All tools
    </Link>
    <header className="mt-4">
      <p className="app-eyebrow">Tool</p>
      <h1 className="app-page-title mt-2">{title}</h1>
      <p className="app-page-subtitle">{tagline}</p>
    </header>

    <div className="app-card mt-8 p-8 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--app-accent-soft)] text-xl text-[var(--app-accent-strong)]">
        {TOOL_ICONS[iconKey] || '*'}
      </span>
      <p className="mt-4 text-sm leading-relaxed text-[var(--app-text-secondary)]">{description}</p>
      <p className="mt-4 text-sm font-medium text-[var(--app-text)]">Coming soon</p>
      <p className="mt-2 text-xs text-[var(--app-text-muted)]">
        Start with{' '}
        <Link to="/app/tools/business-scanner" className="app-link">
          Business Scanner
        </Link>{' '}
        for store, trust, and content scores today.
      </p>
    </div>
  </div>
)

export default ToolPlaceholder
