import { Link } from 'react-router-dom'
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import Alert from '../../components/app/Alert'

const ToolAiCoach = () => {
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setReply('')
    if (!message.trim()) {
      setError('Enter a message before sending.')
      return
    }
    setBusy(true)
    try {
      const data = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      })
      setReply(data.reply || '')
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
        <h1 className="app-page-title mt-2">AI coach</h1>
        <p className="app-page-subtitle">
          Ask about retention, pricing, and growth — get actionable guidance for your business.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="app-card mt-8 p-6">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          className="app-field"
          placeholder="What retention challenge are you facing right now?"
        />
        {error ? (
          <Alert variant="error" title="Message not sent" className="mt-4" onDismiss={() => setError('')}>
            {error}
          </Alert>
        ) : null}
        <button type="submit" disabled={busy} className="app-btn app-btn--primary mt-4">
          Send
        </button>
        {reply ? (
          <Alert variant="success" title="AI coach" className="mt-4">
            {reply}
          </Alert>
        ) : null}
      </form>
    </div>
  )
}

export default ToolAiCoach
