import { Link } from 'react-router-dom'
import { TOOL_CATALOG } from './tools/toolConfig'

const ToolsHub = () => {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="app-stagger">
        <p className="app-eyebrow">Intelligence suite</p>
        <h1 className="app-page-title mt-2">Tools</h1>
        <p className="app-page-subtitle max-w-2xl">
          A curated set of growth tools built for operators. Start with an overview, then dive into
          each tool on its own workspace — some will require separate access in the future.
        </p>
      </header>

      <section className="app-card app-card--accent app-stagger mt-10 p-6 sm:p-8">
        <p className="app-eyebrow">Getting started</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--app-text)]">
          Pick a tool to begin
        </h2>
        <p className="mt-2 max-w-xl text-sm text-[var(--app-text-secondary)]">
          Each tool lives on its own page so you can focus. Connect your workspace first for richer
          context, or jump straight into predictions and analysis.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/app/workspace/github" className="app-btn app-btn--secondary">
            Connect workspace
          </Link>
          <Link to="/app/tools/churn-prediction" className="app-btn app-btn--primary">
            Try churn prediction
          </Link>
        </div>
      </section>

      <div className="app-stagger mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOL_CATALOG.map((tool) => (
          <Link
            key={tool.slug}
            to={tool.to}
            className="app-card app-card--interactive group block p-6"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--app-accent-soft)] text-lg text-[var(--app-accent-strong)] transition group-hover:scale-105">
              {tool.icon}
            </span>
            <h3 className="mt-4 text-lg font-semibold text-[var(--app-text)]">{tool.title}</h3>
            <p className="mt-1 text-sm font-medium text-[var(--app-accent-strong)]">{tool.tagline}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-secondary)]">
              {tool.description}
            </p>
            <span className="app-link mt-4 inline-block text-sm font-semibold">
              Open tool →
            </span>
          </Link>
        ))}
      </div>

      <p className="app-stagger mt-8 text-center text-xs text-[var(--app-text-muted)]">
        Advanced tools with dedicated login coming soon.
      </p>
    </div>
  )
}

export default ToolsHub
