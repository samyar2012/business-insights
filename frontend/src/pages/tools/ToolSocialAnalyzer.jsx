import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import Alert from '../../components/app/Alert'
import ToolPageShell from './ToolPageShell'

const ToolSocialAnalyzer = () => {
  const [form, setForm] = useState({
    profile_url: '',
    content_notes: '',
    posting_frequency: 'weekly',
    niche: '',
  })
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const data = await apiFetch('/ai/social-analysis', {
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
      title="Social Content Analyzer"
      tagline="Score your content rhythm and get hooks, plans, and gap fixes."
      iconKey="social"
    >
      <form className="app-card space-y-4 p-5" onSubmit={run}>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Profile URL</span>
          <input
            className="app-input mt-1 w-full"
            value={form.profile_url}
            onChange={(e) => setForm((f) => ({ ...f, profile_url: e.target.value }))}
            placeholder="https://instagram.com/yourbrand"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Content notes</span>
          <textarea
            className="app-input mt-1 min-h-[80px] w-full"
            value={form.content_notes}
            onChange={(e) => setForm((f) => ({ ...f, content_notes: e.target.value }))}
            placeholder="What you post, recent themes, engagement..."
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Posting frequency</span>
          <select
            className="app-input mt-1 w-full"
            value={form.posting_frequency}
            onChange={(e) => setForm((f) => ({ ...f, posting_frequency: e.target.value }))}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="rarely">Rarely</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Niche</span>
          <input
            className="app-input mt-1 w-full"
            value={form.niche}
            onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
            placeholder="Fitness accessories, pet treats..."
          />
        </label>
        <button type="submit" className="app-btn app-btn--primary" disabled={busy}>
          {busy ? 'Analyzing...' : 'Analyze content'}
        </button>
      </form>

      {error ? (
        <Alert variant="error" title="Analysis failed" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {result ? (
        <section className="app-card mt-6 space-y-4 p-5 text-sm">
          <p>
            Content score:{' '}
            <span className="text-lg font-semibold text-[var(--app-text)]">{result.content_score}</span>
          </p>
          {result.hook_ideas?.length ? (
            <div>
              <h3 className="font-semibold">Hook ideas</h3>
              <ul className="mt-2 space-y-1 text-[var(--app-text-secondary)]">
                {result.hook_ideas.map((h) => (
                  <li key={h}>- {h}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.posting_plan?.length ? (
            <div>
              <h3 className="font-semibold">Posting plan</h3>
              <ul className="mt-2 space-y-1 text-[var(--app-text-secondary)]">
                {result.posting_plan.map((p) => (
                  <li key={p}>- {p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {result.content_gaps?.length ? (
            <div>
              <h3 className="font-semibold">Content gaps</h3>
              <ul className="mt-2 space-y-1 text-[var(--app-text-secondary)]">
                {result.content_gaps.map((g) => (
                  <li key={g}>- {g}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </ToolPageShell>
  )
}

export default ToolSocialAnalyzer
