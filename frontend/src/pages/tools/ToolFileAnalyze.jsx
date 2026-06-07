import { Link } from 'react-router-dom'
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import Alert from '../../components/app/Alert'

const ToolFileAnalyze = () => {
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!file) {
      setError('Choose a CSV or PDF file.')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const data = await apiFetch('/tools/churn/analyze-file', { method: 'POST', body: fd })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/app/tools" className="app-link text-sm font-medium">
        ← All tools
      </Link>
      <header className="mt-4">
        <p className="app-eyebrow">Tool</p>
        <h1 className="app-page-title mt-2">File analyze</h1>
        <p className="app-page-subtitle">
          Upload customer exports as CSV or PDF for automated parsing and insights.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="app-card mt-8 p-6">
        <input
          type="file"
          accept=".csv,.pdf"
          onChange={(ev) => setFile(ev.target.files?.[0] || null)}
          className="block w-full text-sm text-[var(--app-text-secondary)] file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--app-accent-soft)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--app-accent-strong)]"
        />
        {error ? (
          <Alert variant="error" title="Upload failed" className="mt-4" onDismiss={() => setError('')}>
            {error}
          </Alert>
        ) : null}
        <button type="submit" disabled={busy} className="app-btn app-btn--primary mt-5">
          Upload & analyze
        </button>
        {result ? (
          <pre className="mt-4 max-h-64 overflow-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-input-bg)] p-3 text-xs text-[var(--app-text-secondary)]">
            {JSON.stringify(result, null, 2)}
          </pre>
        ) : null}
      </form>
    </div>
  )
}

export default ToolFileAnalyze
