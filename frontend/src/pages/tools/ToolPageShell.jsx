import { Link } from 'react-router-dom'
import ToolIcon from '../../components/app/ToolIcon'

const ToolPageShell = ({ title, tagline, iconKey, eyebrow = 'Tool', children }) => (
  <div className="mx-auto max-w-3xl">
    <Link to="/app/tools" className="app-link text-sm font-medium">
      &lt;- All tools
    </Link>
    <header className="mt-4">
      <p className="app-eyebrow">{eyebrow}</p>
      <div className="mt-2 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--app-accent-soft)] text-[var(--app-accent-strong)]">
          <ToolIcon name={iconKey} className="h-5 w-5" />
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
