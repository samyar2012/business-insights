import { Link } from 'react-router-dom'
import { TOOL_CATALOG, TOOL_ICONS } from './tools/toolConfig'

const ToolsHub = () => {
  return (
    <div className="mx-auto max-w-5xl">
      <header className="app-stagger">
        <p className="app-eyebrow">Intelligence suite</p>
        <h1 className="app-page-title mt-2">Tools</h1>
        <p className="app-page-subtitle max-w-2xl">
          Growth tools built for ecommerce operators. Run a Business Scanner first, then use AI
          coaching, content generation, and competitor research on dedicated pages.
        </p>
      </header>

      <section className="app-card app-card--accent app-stagger mt-10 p-6 sm:p-8">
        <p className="app-eyebrow">Getting started</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--app-text)]">Run your first scan</h2>
        <p className="mt-2 max-w-xl text-sm text-[var(--app-text-secondary)]">
          Select a business, add your store and social URLs, and get scores with strengths, risks,
          and next actions. Connect your workspace for richer context later.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to="/app/workspace/url" className="app-btn app-btn--secondary">
            Add store URL
          </Link>
          <Link to="/app/tools/business-scanner" className="app-btn app-btn--primary">
            Run Business Scanner
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
              {TOOL_ICONS[tool.icon] || '*'}
            </span>
            <h3 className="mt-4 text-lg font-semibold text-[var(--app-text)]">{tool.title}</h3>
            <p className="mt-1 text-sm font-medium text-[var(--app-accent-strong)]">{tool.tagline}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-secondary)]">
              {tool.description}
            </p>
            <span className="app-link mt-4 inline-block text-sm font-semibold">
              {tool.live ? 'Open tool ->' : 'Preview ->'}
            </span>
          </Link>
        ))}
      </div>

      <p className="app-stagger mt-8 text-center text-xs text-[var(--app-text-muted)]">
        Configure OPENAI_API_KEY and SEARCH_PROVIDER in backend .env for live AI and web search.
      </p>
    </div>
  )
}

export default ToolsHub
