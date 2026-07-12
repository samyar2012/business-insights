import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { apiFetch } from '../../lib/api'
import Alert from '../../components/app/Alert'
import ToolPageShell from './ToolPageShell'

const SUGGESTED_PROMPTS = [
  'What should I execute first in my growth roadmap?',
  'How do I make my primary call to action clearer?',
  'What trust signals is my site missing?',
]

const ToolGrowthCoach = () => {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const queryBusinessId = searchParams.get('businessId')
  const reportContext = searchParams.get('context')
  const actionId = searchParams.get('actionId')
  const scanId = searchParams.get('scanId')
  const businesses = user?.businesses || []

  const [businessId, setBusinessId] = useState(queryBusinessId || businesses[0]?.id || '')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [lastReply, setLastReply] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fixAction, setFixAction] = useState(null)
  const [reportScores, setReportScores] = useState(null)

  useEffect(() => {
    if (queryBusinessId) setBusinessId(queryBusinessId)
    else if (!businessId && businesses[0]?.id) setBusinessId(businesses[0].id)
  }, [businesses, businessId, queryBusinessId])

  // Load the specific roadmap step when the user arrived from the Growth Roadmap.
  useEffect(() => {
    if ((reportContext !== 'fix-plan' && reportContext !== 'growth-plan') || !actionId) {
      setFixAction(null)
      return undefined
    }
    let cancelled = false
    apiFetch('/actions')
      .then((data) => {
        if (cancelled) return
        const found = (data.actions || []).find((a) => a.id === actionId)
        setFixAction(found || null)
      })
      .catch(() => {
        if (!cancelled) setFixAction(null)
      })
    return () => {
      cancelled = true
    }
  }, [reportContext, actionId])

  // Load report scores when the user arrived from the Website Report.
  useEffect(() => {
    if (reportContext !== 'website-report' || !businessId) {
      setReportScores(null)
      return undefined
    }
    let cancelled = false
    apiFetch(`/businesses/${businessId}/web-profile`)
      .then((data) => {
        if (!cancelled) setReportScores(data?.profile?.scores || null)
      })
      .catch(() => {
        if (!cancelled) setReportScores(null)
      })
    return () => {
      cancelled = true
    }
  }, [reportContext, businessId])

  const initialPrompt = useMemo(() => {
    if (reportContext === 'fix-plan' || reportContext === 'growth-plan') {
      if (fixAction) {
        const category = fixAction.metadata?.category_label
        const categoryPart = category ? ` (${category})` : ''
        return `Help me implement this growth step${categoryPart}: "${fixAction.title}". What should I do first, and what business outcome should I expect?`
      }
      return 'Help me work through the next step in my growth roadmap. What should I prioritize?'
    }
    if (reportContext === 'website-report') {
      return 'Review my website analyzer report and tell me what to fix first for more customers.'
    }
    if (scanId) return 'Help me understand my scan report and what to do first.'
    return ''
  }, [scanId, reportContext, fixAction])

  useEffect(() => {
    if (initialPrompt && !message && !messages.length) setMessage(initialPrompt)
  }, [initialPrompt, message, messages.length])

  const send = useCallback(
    async (textOverride) => {
      const text = (textOverride ?? message).trim()
      if (!text || busy) return
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
    },
    [message, businessId, scanId, busy],
  )

  const fixMeta = fixAction?.metadata || {}

  return (
    <ToolPageShell
      title="AI Growth Coach"
      tagline="Ask how to execute each growth step - grounded in your website report, growth roadmap, and business profile."
      iconKey="coach"
    >
      {fixAction ? (
        <section className="app-card p-4">
          <p className="app-eyebrow">Coaching context: growth roadmap step</p>
          <p className="mt-2 text-sm font-semibold text-[var(--app-text)]">{fixAction.title}</p>
          {fixMeta.category_label ? (
            <p className="mt-1 text-xs text-[var(--app-text-muted)]">{fixMeta.category_label}</p>
          ) : null}
          {fixMeta.why_it_matters ? (
            <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-secondary)]">
              {fixMeta.why_it_matters}
            </p>
          ) : null}
          {fixMeta.evidence?.length ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-[var(--app-text-secondary)]">
              {fixMeta.evidence.slice(0, 3).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
          <Link to="/app/action-plan" className="app-link mt-3 inline-block text-xs font-medium">
            {'Back to Growth Roadmap ->'}
          </Link>
        </section>
      ) : reportContext === 'website-report' && reportScores ? (
        <section className="app-card p-4">
          <p className="app-eyebrow">Coaching context: website report</p>
          <p className="mt-2 text-sm font-semibold text-[var(--app-text)]">
            Overall score {reportScores.overall_score ?? '-'}/100
          </p>
          {reportScores.readable_summary ? (
            <p className="mt-2 text-sm leading-relaxed text-[var(--app-text-secondary)]">
              {reportScores.readable_summary}
            </p>
          ) : null}
          {businessId ? (
            <Link
              to={`/app/businesses/${businessId}/website-report`}
              className="app-link mt-3 inline-block text-xs font-medium"
            >
              {'Back to report ->'}
            </Link>
          ) : null}
        </section>
      ) : null}

      {businesses.length > 1 ? (
        <label className="app-card mt-4 block p-4 text-sm">
          <span className="text-[var(--app-text-secondary)]">Business</span>
          <select
            className="app-field mt-1 w-full"
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

      <div className="app-card mt-4 flex min-h-[360px] flex-col p-4">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {!messages.length ? (
            <div>
              <p className="text-sm text-[var(--app-text-muted)]">
                Ask about your report, a specific growth step, offers, trust, or what to focus on this week.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="app-btn app-btn--ghost text-xs"
                    disabled={busy}
                    onClick={() => send(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'ml-8 bg-[var(--app-accent-soft)] text-[var(--app-text)]'
                  : 'mr-8 border border-[var(--app-border)] text-[var(--app-text-secondary)]'
              }`}
            >
              {msg.content}
            </div>
          ))}
          {busy ? <p className="text-xs text-[var(--app-text-muted)]">Coach is thinking...</p> : null}
        </div>

        {lastReply?.score_context?.source && lastReply.score_context.source !== 'none' ? (
          <p className="mt-4 border-t border-[var(--app-border)] pt-3 text-xs text-[var(--app-text-muted)]">
            Score context ({lastReply.score_context.source}): overall{' '}
            {lastReply.score_context.overall_score ?? '-'}
          </p>
        ) : null}

        {lastReply?.suggested_actions?.length ? (
          <div className="mt-2 text-xs text-[var(--app-text-muted)]">
            <p className="font-semibold">Suggested next actions</p>
            <ul className="mt-1 space-y-1">
              {lastReply.suggested_actions.map((item) => (
                <li key={item}>{'-> '}{item}</li>
              ))}
            </ul>
          </div>
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

        {error ? (
          <Alert variant="error" title="Chat failed" className="mt-3">
            {error}
          </Alert>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <textarea
            className="app-field min-h-[80px] w-full resize-y"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="What should I focus on this week?"
          />
          <button
            type="button"
            className="app-btn app-btn--primary self-start"
            disabled={busy || !message.trim()}
            onClick={() => send()}
          >
            {busy ? 'Thinking...' : 'Send'}
          </button>
        </div>
      </div>
    </ToolPageShell>
  )
}

export default ToolGrowthCoach
