import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
import Alert from '../components/app/Alert'

const COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
]

const priorityClass = {
  high: 'text-[var(--app-error-fg)]',
  medium: 'text-[var(--app-warning-fg)]',
  low: 'text-[var(--app-text-muted)]',
}

const formatDate = (value) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const ActionPlan = () => {
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/actions')
      setActions(data.actions || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const grouped = useMemo(() => {
    const map = { todo: [], in_progress: [], done: [] }
    for (const action of actions) {
      if (map[action.status]) map[action.status].push(action)
    }
    return map
  }, [actions])

  const updateStatus = async (action, status) => {
    setBusyId(action.id)
    try {
      const data = await apiFetch(`/actions/${action.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setActions((prev) => prev.map((a) => (a.id === action.id ? data.action : a)))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const cycleStatus = (action) => {
    const order = ['todo', 'in_progress', 'done']
    const idx = order.indexOf(action.status)
    const next = order[(idx + 1) % order.length]
    updateStatus(action, next)
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <p className="app-eyebrow">Tasks</p>
        <h1 className="app-page-title mt-2">Action Plan</h1>
        <p className="app-page-subtitle">
          Track website fixes and growth tasks from your analyzer report — todo to done.
        </p>
      </header>

      {error ? (
        <Alert variant="error" title="Could not update" className="mt-6">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-[var(--app-text-muted)]">Loading tasks...</p>
      ) : actions.length === 0 ? (
        <div className="app-card mt-8 p-8 text-center">
          <p className="text-sm text-[var(--app-text-secondary)]">No action items yet.</p>
          <p className="mt-2 text-sm text-[var(--app-text-muted)]">
            Open your website report and click Create fix plan to turn ranked problems into tasks.
          </p>
          <Link to="/app" className="app-btn app-btn--primary mt-5 inline-flex">
            Go to dashboard
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((col) => (
            <section key={col.key} className="app-card p-4">
              <h2 className="text-sm font-semibold text-[var(--app-text)]">
                {col.label}
                <span className="ml-2 text-xs font-normal text-[var(--app-text-muted)]">
                  ({grouped[col.key].length})
                </span>
              </h2>
              <ul className="mt-4 space-y-3">
                {grouped[col.key].map((action) => (
                  <li
                    key={action.id}
                    className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-3"
                  >
                    <p className="text-sm font-semibold text-[var(--app-text)]">{action.title}</p>
                    {action.description ? (
                      <p className="mt-1 text-xs text-[var(--app-text-secondary)]">
                        {action.description}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--app-text-muted)]">
                      <span className={priorityClass[action.priority] || ''}>
                        {action.priority} priority
                      </span>
                      {action.business_name ? <span>{action.business_name}</span> : null}
                      <span>Created {formatDate(action.created_at)}</span>
                    </div>
                    {action.scan_id ? (
                      <Link
                        to={`/app/scans/${action.scan_id}`}
                        className="app-link mt-2 inline-block text-xs font-medium"
                      >
                        View source scan -&gt;
                      </Link>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="app-btn app-btn--secondary text-xs"
                        disabled={busyId === action.id}
                        onClick={() => cycleStatus(action)}
                      >
                        Move status
                      </button>
                      {action.status !== 'done' ? (
                        <button
                          type="button"
                          className="app-btn app-btn--ghost text-xs"
                          disabled={busyId === action.id}
                          onClick={() => updateStatus(action, 'done')}
                        >
                          Mark done
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
                {!grouped[col.key].length ? (
                  <li className="text-xs text-[var(--app-text-muted)]">No tasks here.</li>
                ) : null}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export default ActionPlan
