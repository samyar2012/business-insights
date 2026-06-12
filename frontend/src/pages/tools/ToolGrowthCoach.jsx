import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/api'
import Alert from '../../components/app/Alert'
import ToolPageShell from './ToolPageShell'

const ToolGrowthCoach = () => {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const scanId = searchParams.get('scanId')
  const businesses = user?.businesses || []

  const [businessId, setBusinessId] = useState(businesses[0]?.id || '')
  const [message, setMessage] = useState('')
  const [useSearch, setUseSearch] = useState(false)
  const [messages, setMessages] = useState([])
  const [lastReply, setLastReply] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!businessId && businesses[0]?.id) setBusinessId(businesses[0].id)
  }, [businesses, businessId])

  const scanPrompt = useMemo(() => {
    if (!scanId) return ''
    return 'Help me understand my scan report and what to do first.'
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
          business_id: businessId || undefined,
          scan_id: scanId || undefined,
          use_search: useSearch,
        }),
      })
      const answer = data.answer || data.reply
      setMessages((prev) => [...prev, { role: 'assistant', content: answer }])
      setLastReply(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [message, businessId, scanId, useSearch])

  return (
    <ToolPageShell
      title="AI Growth Coach"
      tagline="Chat using stored business research, scans, action items, and memory."
      iconKey="coach"
    >
      <p className="text-xs text-[var(--app-text-muted)]">
        Business Insights saves research and user memory to personalize recommendations. This is not
        model training yet.
      </p>

      {businesses.length ? (
        <label className="app-card mt-4 block p-4 text-sm">
          <span className="text-[var(--app-text-secondary)]">Business</span>
          <select
            className="app-input mt-1 w-full"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
          >
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.business_name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="app-card mt-4 flex min-h-[320px] flex-col p-4">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {!messages.length ? (
            <p className="text-sm text-[var(--app-text-muted)]">
              Ask about offers, trust, market trends, or your research scores.
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

        {lastReply?.score_context?.source && lastReply.score_context.source !== 'none' ? (
          <p className="mt-4 border-t border-[var(--app-border)] pt-3 text-xs text-[var(--app-text-muted)]">
            Score context ({lastReply.score_context.source}): overall{' '}
            {lastReply.score_context.overall_score ?? '-'}
          </p>
        ) : null}

        {lastReply?.suggested_actions?.length ? (
          <ul className="mt-2 space-y-1 text-xs text-[var(--app-text-muted)]">
            {lastReply.suggested_actions.map((item) => (
              <li key={item}>-&gt; {item}</li>
            ))}
          </ul>
        ) : null}

        {lastReply?.sources?.length ? (
          <div className="mt-3 text-xs text-[var(--app-text-muted)]">
            <p className="font-semibold">Sources</p>
            <ul className="mt-1 space-y-1">
              {lastReply.sources.map((src) => (
                <li key={`${src.url}-${src.title}`}>
                  <a href={src.url} target="_blank" rel="noreferrer" className="app-link">
                    {src.title || src.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {lastReply?.used_memory?.length ? (
          <details className="mt-3 text-xs text-[var(--app-text-muted)]">
            <summary className="cursor-pointer font-semibold">Memory used</summary>
            <pre className="mt-2 overflow-x-auto rounded bg-[var(--app-surface)] p-2">
              {JSON.stringify(lastReply.used_memory, null, 2)}
            </pre>
          </details>
        ) : null}

        {lastReply?.provider ? (
          <p className="mt-2 text-xs text-[var(--app-text-muted)]">Provider: {lastReply.provider}</p>
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
            Include web search for current info (when configured)
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
