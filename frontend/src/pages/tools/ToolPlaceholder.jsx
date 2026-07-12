import { Link } from 'react-router-dom'
import ToolIcon from '../../components/app/ToolIcon'

/**
 * Preview page for tools that are on the roadmap but not part of the current
 * core workflow (Analyze -> Report -> Growth Roadmap -> Coach -> Rescan).
 */
const ToolPlaceholder = ({ title, tagline, description, iconKey = 'scan' }) => (
  <div className="mx-auto max-w-3xl">
    <Link to="/app/tools" className="app-link text-sm font-medium">
      &lt;- All tools
    </Link>
    <header className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="app-eyebrow">Tool preview</p>
        <span className="rounded bg-[var(--app-input-bg)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--app-text-muted)]">
          Preview
        </span>
      </div>
      <h1 className="app-page-title mt-2">{title}</h1>
      <p className="app-page-subtitle">{tagline}</p>
    </header>

    <div className="app-card mt-8 p-8 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]">
        <ToolIcon name={iconKey} className="h-6 w-6" />
      </span>
      <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-[var(--app-text-secondary)]">
        {description}
      </p>
      <p className="mt-4 text-sm font-medium text-[var(--app-text)]">
        This tool is in preview and will be enabled in a later release.
      </p>
      <p className="mt-2 text-xs text-[var(--app-text-muted)]">
        In the meantime, the core workflow already works end to end.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/app" className="app-btn app-btn--primary">
          Run the Website Analyzer
        </Link>
        <Link to="/app/action-plan" className="app-btn app-btn--secondary">
          Open Growth Roadmap
        </Link>
      </div>
    </div>
  </div>
)

export default ToolPlaceholder
