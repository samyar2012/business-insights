import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import Alert from '../../components/app/Alert'
import ToolPageShell from './ToolPageShell'

const FORMATS = [
  { value: 'tiktok', label: 'TikTok hooks' },
  { value: 'script', label: 'Short-form scripts' },
  { value: 'caption', label: 'Captions' },
  { value: 'email', label: 'Email ideas' },
  { value: 'ad', label: 'Ad copy' },
  { value: 'product', label: 'Product page copy' },
]

const sections = [
  { key: 'hooks', label: 'Hooks' },
  { key: 'captions', label: 'Captions' },
  { key: 'ad_copy', label: 'Ad copy' },
  { key: 'email_ideas', label: 'Email ideas' },
  { key: 'product_page', label: 'Product page' },
]

const ToolContentGenerator = () => {
  const [form, setForm] = useState({
    topic: '',
    format: 'tiktok',
    platform: 'TikTok',
    notes: '',
  })
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = async (e) => {
    e.preventDefault()
    if (!form.topic.trim()) {
      setError('Enter a topic or product.')
      return
    }
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const data = await apiFetch('/ai/content', {
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
      title="Content Generator"
      tagline="Hooks, scripts, captions, emails, ads, and product copy from your business context."
      iconKey="content"
    >
      <form className="app-card space-y-4 p-5" onSubmit={run}>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Topic / product</span>
          <input
            className="app-input mt-1 w-full"
            value={form.topic}
            onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
            placeholder="Summer bundle, hero serum..."
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Format focus</span>
          <select
            className="app-input mt-1 w-full"
            value={form.format}
            onChange={(e) => setForm((f) => ({ ...f, format: e.target.value }))}
          >
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Platform</span>
          <input
            className="app-input mt-1 w-full"
            value={form.platform}
            onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--app-text-secondary)]">Notes (optional)</span>
          <textarea
            className="app-input mt-1 min-h-[60px] w-full"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </label>
        <button type="submit" className="app-btn app-btn--primary" disabled={busy}>
          {busy ? 'Generating...' : 'Generate content'}
        </button>
      </form>

      {error ? (
        <Alert variant="error" title="Generation failed" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {result ? (
        <section className="app-card mt-6 space-y-4 p-5 text-sm">
          {result.raw ? <p className="whitespace-pre-wrap">{result.raw}</p> : null}
          {sections.map(({ key, label }) =>
            result[key]?.length ? (
              <div key={key}>
                <h3 className="font-semibold">{label}</h3>
                <ul className="mt-2 space-y-2 text-[var(--app-text-secondary)]">
                  {result[key].map((item) => (
                    <li key={item} className="rounded border border-[var(--app-border)] p-2">
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          <p className="text-xs text-[var(--app-text-muted)]">Provider: {result.provider}</p>
        </section>
      ) : null}
    </ToolPageShell>
  )
}

export default ToolContentGenerator
