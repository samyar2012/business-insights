import { useState } from 'react'
import Alert from '../../components/app/Alert'

const WorkspacePage = ({ eyebrow, title, subtitle, children }) => (
  <div className="mx-auto max-w-2xl">
    <header>
      <p className="app-eyebrow">{eyebrow}</p>
      <h1 className="app-page-title mt-2">{title}</h1>
      <p className="app-page-subtitle">{subtitle}</p>
    </header>
    <div className="app-card mt-8 p-6">{children}</div>
  </div>
)

export const WorkspaceGitHub = () => {
  const [connected, setConnected] = useState(false)

  return (
    <WorkspacePage
      eyebrow="Workspace"
      title="Connect GitHub"
      subtitle="Link a repository to sync projects, deploy configs, and version your workspace data."
    >
      <p className="text-sm text-[var(--app-text-secondary)]">
        OAuth integration will be enabled in a future release. For now, preview the connection flow.
      </p>
      {connected ? (
        <Alert variant="success" title="Connected" className="mt-4">
          GitHub workspace linked successfully (preview).
        </Alert>
      ) : null}
      <button
        type="button"
        onClick={() => setConnected(true)}
        className="app-btn app-btn--primary mt-5"
      >
        Connect with GitHub
      </button>
    </WorkspacePage>
  )
}

export const WorkspaceUrl = () => {
  const [url, setUrl] = useState('')
  const [saved, setSaved] = useState(false)

  return (
    <WorkspacePage
      eyebrow="Workspace"
      title="Add URL"
      subtitle="Point your workspace at a store, site, or API endpoint for live context."
    >
      <label className="app-label">
        Website or store URL
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setSaved(false)
          }}
          className="app-field"
          placeholder="https://yourstore.com"
        />
      </label>
      {saved ? (
        <Alert variant="success" title="Saved" className="mt-4">
          URL added to your workspace (preview).
        </Alert>
      ) : null}
      <button
        type="button"
        onClick={() => url && setSaved(true)}
        className="app-btn app-btn--primary mt-5"
        disabled={!url.trim()}
      >
        Save URL
      </button>
    </WorkspacePage>
  )
}

export const WorkspaceCreate = () => {
  const [name, setName] = useState('')
  const [created, setCreated] = useState(false)

  return (
    <WorkspacePage
      eyebrow="Workspace"
      title="Create project"
      subtitle="Start a new project workspace with its own tools, data, and business context."
    >
      <label className="app-label">
        Project name
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setCreated(false)
          }}
          className="app-field"
          placeholder="Q2 retention sprint"
        />
      </label>
      {created ? (
        <Alert variant="success" title="Project created" className="mt-4">
          &ldquo;{name}&rdquo; is ready in your workspace (preview).
        </Alert>
      ) : null}
      <button
        type="button"
        onClick={() => name && setCreated(true)}
        className="app-btn app-btn--primary mt-5"
        disabled={!name.trim()}
      >
        Create project
      </button>
    </WorkspacePage>
  )
}

export const WorkspaceLoad = () => {
  const [projectId, setProjectId] = useState('')
  const [loaded, setLoaded] = useState(false)

  return (
    <WorkspacePage
      eyebrow="Workspace"
      title="Load project"
      subtitle="Open an existing project from your workspace or import by ID."
    >
      <label className="app-label">
        Project ID or name
        <input
          value={projectId}
          onChange={(e) => {
            setProjectId(e.target.value)
            setLoaded(false)
          }}
          className="app-field"
          placeholder="my-shopify-store"
        />
      </label>
      {loaded ? (
        <Alert variant="info" title="Project loaded" className="mt-4">
          Loaded &ldquo;{projectId}&rdquo; into your session (preview).
        </Alert>
      ) : null}
      <button
        type="button"
        onClick={() => projectId && setLoaded(true)}
        className="app-btn app-btn--primary mt-5"
        disabled={!projectId.trim()}
      >
        Load project
      </button>
    </WorkspacePage>
  )
}
