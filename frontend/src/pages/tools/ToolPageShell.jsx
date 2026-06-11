import { Link } from 'react-router-dom'
import { TOOL_ICONS } from './toolConfig'

const ToolPageShell = ({ title, tagline, iconKey, children }) => (
  <div className="mx-auto max-w-3xl">
    <Link to="/app/tools" className="app-link text-sm font-medium">
      &lt;- All tools
    </Link>
    <header className="mt-4">
      <p className="app-eyebrow">Tool</p>
      <div className="mt-2 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--app-accent-soft)] text-lg text-[var(--app-accent-strong)]">
          {TOOL_ICONS[iconKey] || '*'}
        </span>
        <div>
          <h1 className="app-page-title">{title}</h1>
          <p className="app-page-subtitle">{tagline}</p>
        </div>
      </div>
    </header>
    <div className="mt-8">{children}</div>
  </div>
)

export default ToolPageShell
