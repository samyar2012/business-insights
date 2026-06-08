import { useState } from 'react'
import { apiFetch } from '../lib/api'
import Alert from '../components/app/Alert'

const FIELDS = [
  'InternetService',
  'OnlineSecurity',
  'OnlineBackup',
  'DeviceProtection',
  'TechSupport',
  'StreamingTV',
  'StreamingMovies',
  'Contract',
  'PaymentMethod',
  'PaperlessBilling',
  'tenure',
  'MonthlyCharges',
]

const defaultValues = {
  InternetService: 'Fiber optic',
  OnlineSecurity: 'No',
  OnlineBackup: 'No',
  DeviceProtection: 'No',
  TechSupport: 'No',
  StreamingTV: 'No',
  StreamingMovies: 'No',
  Contract: 'Month-to-month',
  PaymentMethod: 'Electronic check',
  PaperlessBilling: 'Yes',
  tenure: 12,
  MonthlyCharges: 70,
}

const AppTools = () => {
  const [values, setValues] = useState(defaultValues)
  const [predictResult, setPredictResult] = useState(null)
  const [predictError, setPredictError] = useState('')
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState(null)
  const [fileResult, setFileResult] = useState(null)
  const [fileError, setFileError] = useState('')
  const [chatMessage, setChatMessage] = useState('')
  const [chatReply, setChatReply] = useState('')
  const [chatError, setChatError] = useState('')

  const handlePredict = async (e) => {
    e.preventDefault()
    setPredictError('')
    setPredictResult(null)
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
      setPredictResult(data)
    } catch (err) {
      setPredictError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleFile = async (e) => {
    e.preventDefault()
    setFileError('')
    setFileResult(null)
    if (!file) {
      setFileError('Choose a CSV or PDF file.')
      return
    }
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const data = await apiFetch('/tools/churn/analyze-file', { method: 'POST', body: fd })
      setFileResult(data)
    } catch (err) {
      setFileError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleChat = async (e) => {
    e.preventDefault()
    setChatError('')
    setChatReply('')
    if (!chatMessage.trim()) {
      setChatError('Enter a message before sending.')
      return
    }
    setBusy(true)
    try {
      const data = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: chatMessage }),
      })
      setChatReply(data.reply || '')
    } catch (err) {
      setChatError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <p className="app-eyebrow">Intelligence</p>
        <h1 className="app-page-title mt-2">Tools</h1>
        <p className="app-page-subtitle">Churn prediction, file analysis, and AI coach.</p>
      </header>

      <div className="app-stagger mt-8 grid gap-6 lg:grid-cols-2">
        <form onSubmit={handlePredict} className="app-card p-6">
          <h2 className="font-semibold text-[var(--app-text)]">Churn prediction</h2>
          <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
            Run a model on customer feature inputs.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {FIELDS.map((key) => (
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
          {predictError ? (
            <Alert variant="error" title="Prediction failed" className="mt-4" onDismiss={() => setPredictError('')}>
              {predictError}
            </Alert>
          ) : null}
          <button type="submit" disabled={busy} className="app-btn app-btn--primary mt-5">
            Run prediction
          </button>
          {predictResult ? (
            <pre className="mt-4 max-h-48 overflow-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-input-bg)] p-3 text-xs text-[var(--app-text-secondary)]">
              {JSON.stringify(predictResult, null, 2)}
            </pre>
          ) : null}
        </form>

        <form onSubmit={handleFile} className="app-card p-6">
          <h2 className="font-semibold text-[var(--app-text)]">Analyze CSV / PDF</h2>
          <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
            Upload customer data for automated analysis.
          </p>
          <input
            type="file"
            accept=".csv,.pdf"
            onChange={(ev) => setFile(ev.target.files?.[0] || null)}
            className="mt-5 block w-full text-sm text-[var(--app-text-secondary)] file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--app-accent-soft)] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[var(--app-accent-strong)]"
          />
          {fileError ? (
            <Alert variant="error" title="Upload failed" className="mt-4" onDismiss={() => setFileError('')}>
              {fileError}
            </Alert>
          ) : null}
          <button type="submit" disabled={busy} className="app-btn app-btn--secondary mt-5">
            Upload & analyze
          </button>
          {fileResult ? (
            <pre className="mt-4 max-h-48 overflow-auto rounded-lg border border-[var(--app-border)] bg-[var(--app-input-bg)] p-3 text-xs text-[var(--app-text-secondary)]">
              {JSON.stringify(fileResult, null, 2)}
            </pre>
          ) : null}
        </form>
      </div>

      <form onSubmit={handleChat} className="app-card mt-6 p-6">
        <h2 className="font-semibold text-[var(--app-text)]">AI coach</h2>
        <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
          Ask about retention strategy and customer growth.
        </p>
        <textarea
          value={chatMessage}
          onChange={(e) => setChatMessage(e.target.value)}
          rows={4}
          className="app-field mt-4"
          placeholder="Ask about retention strategy..."
        />
        {chatError ? (
          <Alert variant="error" title="Message not sent" className="mt-4" onDismiss={() => setChatError('')}>
            {chatError}
          </Alert>
        ) : null}
        <button type="submit" disabled={busy} className="app-btn app-btn--primary mt-4">
          Send
        </button>
        {chatReply ? (
          <Alert variant="success" title="AI coach" className="mt-4">
            {chatReply}
          </Alert>
        ) : null}
      </form>
    </div>
  )
}

export default AppTools
