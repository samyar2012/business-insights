import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ToolIcon from '../components/app/ToolIcon'
import { resolveToolPath, toolsByGroup } from './tools/toolConfig'

const ToolsHub = () => {
  const { user } = useAuth()
  const businessId = user?.businesses?.[0]?.id
  const groups = toolsByGroup()

  return (
    <div className="mx-auto max-w-5xl">
      <header className="app-stagger">
        <p className="app-eyebrow">Workspace tools</p>
        <h1 className="app-page-title mt-2">Tools</h1>
        <p className="app-page-subtitle max-w-2xl">
          Every tool connects to your Website Analyzer workflow — scan, plan, improve, compare, and
          grow. Built for online stores, service businesses, listings, and hybrid models.
        </p>
      </header>

      <section className="app-next-action app-stagger mt-8">
        <p className="app-eyebrow">Recommended start</p>
        <h2 className="mt-2 text-lg font-semibold text-[var(--app-text)]">Run the Website Analyzer</h2>
        <p className="mt-2 max-w-xl text-sm text-[var(--app-text-secondary)]">
          Add your business URL if needed, then scan your public pages for trust, UX, and conversion
          blockers.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            to={resolveToolPath({ resolveTo: 'website-report', to: '/app' }, businessId)}
            className="app-btn app-btn--primary"
          >
            {businessId ? 'Open Website Analyzer' : 'Add business first'}
          </Link>
          <Link to="/app/action-plan" className="app-btn app-btn--secondary">
            View fix plan
          </Link>
        </div>
      </section>

      <div className="app-stagger mt-10 space-y-10">
        {groups.map((group) => (
          <section key={group.id}>
            <div className="mb-4">
              <p className="app-eyebrow">{group.label}</p>
              <p className="mt-1 text-sm text-[var(--app-text-secondary)]">{group.description}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.tools.map((tool) => (
                <li key={tool.slug}>
                  <Link
                    to={resolveToolPath(tool, businessId)}
                    className="app-tool-row group block h-full"
                  >
                    <span className="app-tool-row__icon">
                      <ToolIcon name={tool.icon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[var(--app-text)]">{tool.title}</span>
                        {!tool.live ? (
                          <span className="rounded bg-[var(--app-input-bg)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--app-text-muted)]">
                            Preview
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs font-medium text-[var(--app-accent-strong)]">
                        {tool.tagline}
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-[var(--app-text-secondary)]">
                        {tool.description}
                      </span>
                      <span className="app-link mt-2 inline-block text-xs font-semibold">
                        {tool.live ? 'Open tool →' : 'Preview →'}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}

export default ToolsHub
