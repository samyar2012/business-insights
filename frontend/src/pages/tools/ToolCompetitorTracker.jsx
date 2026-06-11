import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import Alert from '../../components/app/Alert'
import ToolPageShell from './ToolPageShell'

const ToolCompetitorTracker = () => {
  const [form, setForm] = useState({ competitor_name: '', competitor_url: '' })
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (e) => {
    e.preventDefault()
    if (!form.competitor_name.trim() && !form.competitor_url.trim()) {
      setError('Enter a competitor name or URL.')
      return
    }
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const data = await apiFetch('/ai/competitor-research', {
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
      title="Competitor Tracker"
      tagline="Public positioning, offer ideas, and risks from search-backed research."
      iconKey="track"
    >
      <form className="app-card space-y-4 p-5" onSubmit={run}>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Competitor name</span>
          <input
            className="app-input mt-1 w-full"
            value={form.competitor_name}
            onChange={(e) => setForm((f) => ({ ...f, competitor_name: e.target.value }))}
            placeholder="Brand name"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Competitor URL</span>
          <input
            className="app-input mt-1 w-full"
            value={form.competitor_url}
            onChange={(e) => setForm((f) => ({ ...f, competitor_url: e.target.value }))}
            placeholder="https://competitor.com"
          />
        </label>
        <button type="submit" className="app-btn app-btn--primary" disabled={busy}>
          {busy ? 'Researching...' : 'Research competitor'}
        </button>
      </form>

      {error ? (
        <Alert variant="error" title="Research failed" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {result ? (
        <section className="app-card mt-6 space-y-4 p-5 text-sm">
          {result.positioning ? (
            <p>
              <span className="font-semibold">Positioning: </span>
              {result.positioning}
            </p>
          ) : null}
          {result.summary ? <p className="text-[var(--app-text-secondary)]">{result.summary}</p> : null}
          {['offer_ideas', 'content_angles', 'risks'].map((key) =>
            result[key]?.length ? (
              <div key={key}>
                <h3 className="font-semibold capitalize">{key.replace('_', ' ')}</h3>
                <ul className="mt-2 space-y-1 text-[var(--app-text-secondary)]">
                  {result[key].map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          <p className="text-xs text-[var(--app-text-muted)]">
            Search: {result.search_provider || result.provider}
          </p>
        </section>
      ) : null}
    </ToolPageShell>
  )
}

export default ToolCompetitorTracker
