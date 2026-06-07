import { Link } from 'react-router-dom'
import { useState } from 'react'
import { apiFetch } from '../../lib/api'
import Alert from '../../components/app/Alert'
import { CHURN_DEFAULTS, CHURN_FIELDS } from './toolConfig'

const ToolChurnPrediction = () => {
  const [values, setValues] = useState(CHURN_DEFAULTS)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const data = await apiFetch('/tools/churn/predict', {
        method: 'POST',
        body: JSON.stringify({
          values: {
            ...values,
            tenure: Number(values.tenure),
            MonthlyCharges: Number(values.MonthlyCharges),
          },
        }),
      })
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/app/tools" className="app-link text-sm font-medium">
        ← All tools
      </Link>
      <header className="mt-4">
        <p className="app-eyebrow">Tool</p>
        <h1 className="app-page-title mt-2">Churn prediction</h1>
        <p className="app-page-subtitle">
          Run the model on customer feature inputs and surface at-risk accounts.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="app-card mt-8 p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {CHURN_FIELDS.map((key) => (
            <label key={key} className="app-label text-xs">
              {key}
              <input
                className="app-field"
                value={values[key]}
                onChange={(ev) => setValues((v) => ({ ...v, [key]: ev.target.value }))}
              />
            </label>
          ))}
        </div>
        {error ? (
          <Alert variant="error" title="Prediction failed" className="mt-4" onDismiss={() => setError('')}>
            {error}
          </Alert>
        ) : null}
        <button type="submit" disabled={busy} className="app-btn app-btn--primary mt-5">
          Run prediction
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

export default ToolChurnPrediction
