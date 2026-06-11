import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import Alert from '../../components/app/Alert'
import ToolPageShell from './ToolPageShell'

const ToolGrowthCoach = () => {
  const [searchParams] = useSearchParams()
  const scanId = searchParams.get('scanId')
  const [message, setMessage] = useState('')
  const [useSearch, setUseSearch] = useState(false)
  const [messages, setMessages] = useState([])
  const [insights, setInsights] = useState([])
  const [provider, setProvider] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const scanPrompt = useMemo(() => {
    if (!scanId) return ''
    return `Help me understand my scan report (id ${scanId}) and what to do first.`
  }, [scanId])

  useEffect(() => {
    if (scanPrompt && !message) setMessage(scanPrompt)
  }, [scanPrompt, message])

  const send = useCallback(async () => {
    const text = message.trim()
    if (!text) return
    setError('')
    setBusy(true)
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setMessage('')
    try {
      const data = await apiFetch('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          scan_id: scanId || undefined,
          use_search: useSearch,
        }),
      })
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }])
      setInsights(data.insights || [])
      setProvider(data.provider || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [message, scanId, useSearch])

  return (
    <ToolPageShell
      title="AI Growth Coach"
      tagline="Strategy chat using your business profile, scans, and action plan."
      iconKey="coach"
    >
      {scanId ? (
        <Alert variant="info" title="Scan context loaded">
          Coaching with context from scan {scanId.slice(0, 8)}...
        </Alert>
      ) : null}

      <div className="app-card mt-4 flex min-h-[320px] flex-col p-4">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {!messages.length ? (
            <p className="text-sm text-[var(--app-text-muted)]">
              Ask about offers, retention, content, or your latest scan scores.
            </p>
          ) : null}
          {messages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`rounded-lg px-3 py-2 text-sm ${
                msg.role === 'user'
                  ? 'ml-8 bg-[var(--app-accent-soft)] text-[var(--app-text)]'
                  : 'mr-8 border border-[var(--app-border)] text-[var(--app-text-secondary)]'
              }`}
            >
              {msg.content}
            </div>
          ))}
        </div>

        {insights.length ? (
          <ul className="mt-4 space-y-1 border-t border-[var(--app-border)] pt-3 text-xs text-[var(--app-text-muted)]">
            {insights.map((item) => (
              <li key={item}>- {item}</li>
            ))}
          </ul>
        ) : null}

        {provider ? (
          <p className="mt-2 text-xs text-[var(--app-text-muted)]">Provider: {provider}</p>
        ) : null}

        {error ? (
          <Alert variant="error" title="Chat failed" className="mt-3">
            {error}
          </Alert>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <textarea
            className="app-input min-h-[80px] w-full resize-y"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What should I focus on this week?"
          />
          <label className="flex items-center gap-2 text-xs text-[var(--app-text-secondary)]">
            <input
              type="checkbox"
              checked={useSearch}
              onChange={(e) => setUseSearch(e.target.checked)}
            />
            Include web search context (when configured)
          </label>
          <button
            type="button"
            className="app-btn app-btn--primary self-start"
            disabled={busy || !message.trim()}
            onClick={send}
          >
            {busy ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </div>
    </ToolPageShell>
  )
}

export default ToolGrowthCoach
