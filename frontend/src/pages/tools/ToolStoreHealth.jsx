import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import Alert from '../../components/app/Alert'
import ToolPageShell from './ToolPageShell'

const ToolStoreHealth = () => {
  const [form, setForm] = useState({ store_url: '', focus: '', topic: '' })
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const data = await apiFetch('/ai/store-health', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolPageShell
      title="Store Health Report"
      tagline="Detailed storefront quality review using your scans and optional web context."
      iconKey="health"
    >
      <form className="app-card space-y-4 p-5" onSubmit={run}>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Store URL (optional)</span>
          <input
            className="app-input mt-1 w-full"
            value={form.store_url}
            onChange={(e) => setForm((f) => ({ ...f, store_url: e.target.value }))}
            placeholder="https://yourstore.com"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Focus area</span>
          <input
            className="app-input mt-1 w-full"
            value={form.focus}
            onChange={(e) => setForm((f) => ({ ...f, focus: e.target.value }))}
            placeholder="Conversion, trust, merchandising..."
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Topic for web search (optional)</span>
          <input
            className="app-input mt-1 w-full"
            value={form.topic}
            onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
            placeholder="DTC skincare checkout best practices"
          />
        </label>
        <button type="submit" className="app-btn app-btn--primary" disabled={busy}>
          {busy ? 'Analyzing...' : 'Run report'}
        </button>
      </form>

      {error ? (
        <Alert variant="error" title="Report failed" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {result ? (
        <section className="app-card mt-6 p-5">
          <p className="app-eyebrow">Results</p>
          <p className="mt-2 text-3xl font-semibold text-[var(--app-text)]">{result.overall ?? '-'}</p>
          {result.findings?.length ? (
            <ul className="mt-4 space-y-2 text-sm">
              {result.findings.map((f) => (
                <li key={f.area} className="flex justify-between border-b border-[var(--app-border)] pb-2">
                  <span>{f.area}</span>
                  <span className="text-[var(--app-text-muted)]">{f.status}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {result.recommendations?.length ? (
            <>
              <h3 className="mt-5 text-sm font-semibold">Recommendations</h3>
              <ul className="mt-2 space-y-1 text-sm text-[var(--app-text-secondary)]">
                {result.recommendations.map((r) => (
                  <li key={r}>-&gt; {r}</li>
                ))}
              </ul>
            </>
          ) : null}
          {result.summary ? (
            <p className="mt-4 text-sm text-[var(--app-text-secondary)]">{result.summary}</p>
          ) : null}
          <p className="mt-3 text-xs text-[var(--app-text-muted)]">Provider: {result.provider}</p>
        </section>
      ) : null}
    </ToolPageShell>
  )
}

export default ToolStoreHealth
