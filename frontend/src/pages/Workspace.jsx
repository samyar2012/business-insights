import { useCallback, useEffect, useState } from 'react'
import Footer from '../components/general/Footer'
import Reveal from '../components/general/Reveal'
import { apiFetch } from '../lib/api'

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

const Workspace = () => {
  const [me, setMe] = useState(null)
  const [meError, setMeError] = useState('')
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

  const loadMe = useCallback(async () => {
    setMeError('')
    try {
      const data = await apiFetch('/me')
      setMe(data.user)
    } catch (e) {
      setMeError(e.message)
    }
  }, [])

  useEffect(() => {
    loadMe()
  }, [loadMe])

  const handlePredict = async (e) => {
    e.preventDefault()
    setPredictError('')
    setPredictResult(null)
    setBusy(true)
    try {
      const payload = {
        values: {
          ...values,
          tenure: Number(values.tenure),
          MonthlyCharges: Number(values.MonthlyCharges),
        },
      }
      const data = await apiFetch('/tools/churn/predict', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      setPredictResult(data)
      loadMe()
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
      loadMe()
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
    if (!chatMessage.trim()) return
    setBusy(true)
    try {
      const data = await apiFetch('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: chatMessage }),
      })
      setChatReply(data.reply || '')
      loadMe()
    } catch (err) {
      setChatError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <section className="modern-section scroll-mt-24 lg:scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Workspace</p>
            <h1 className="section-heading-gradient mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Tools connected to your backend
            </h1>
            <p className="mt-3 max-w-3xl text-white/75">
              Churn prediction and file analysis use the existing Express API. Credits apply unless you
              are premium on the backend.
            </p>
          </Reveal>

          <div className="mt-8 rounded-2xl bg-white/6 p-5 sm:p-6">
            <p className="text-sm text-white/80">Account</p>
            {meError ? <p className="mt-2 text-sm text-amber-200">{meError}</p> : null}
            {me ? (
              <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-white/60">Email</dt>
                  <dd className="font-medium text-white">{me.email}</dd>
                </div>
                <div>
                  <dt className="text-white/60">Credits</dt>
                  <dd className="font-medium text-white">{me.creditsBalance ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-white/60">Premium</dt>
                  <dd className="font-medium text-white">{me.is_premium ? 'Yes' : 'No'}</dd>
                </div>
                <div>
                  <dt className="text-white/60">Referral</dt>
                  <dd className="font-medium text-white">{me.referralCode || '-'}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-white/60">Loading profile...</p>
            )}
          </div>

          <div className="mt-10 grid gap-8 lg:grid-cols-2">
            <Reveal variant="scale">
              <form onSubmit={handlePredict} className="card-hover rounded-2xl bg-white/6 p-6">
                <h2 className="text-lg font-semibold text-white">Churn prediction (single row)</h2>
                <p className="mt-1 text-sm text-white/65">Uses `/api/tools/churn/predict` (credits).</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {FIELDS.map((key) => (
                    <label key={key} className="block text-xs text-white/70">
                      {key}
                      <input
                        className="mt-1 w-full rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white"
                        value={values[key]}
                        onChange={(ev) => setValues((v) => ({ ...v, [key]: ev.target.value }))}
                      />
                    </label>
                  ))}
                </div>
                {predictError ? <p className="mt-3 text-sm text-amber-200">{predictError}</p> : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="btn-lift mt-4 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-orange-950 disabled:opacity-60"
                >
                  Run prediction
                </button>
                {predictResult ? (
                  <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-black/30 p-3 text-xs text-white/80">
                    {JSON.stringify(predictResult, null, 2)}
                  </pre>
                ) : null}
              </form>
            </Reveal>

            <Reveal variant="scale" delay={80}>
              <form onSubmit={handleFile} className="card-hover rounded-2xl bg-white/6 p-6">
                <h2 className="text-lg font-semibold text-white">Analyze CSV / PDF</h2>
                <p className="mt-1 text-sm text-white/65">Uses `/api/tools/churn/analyze-file`.</p>
                <input
                  type="file"
                  accept=".csv,.pdf"
                  onChange={(ev) => setFile(ev.target.files?.[0] || null)}
                  className="mt-4 block w-full text-sm text-white/80 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-4 file:py-2 file:text-sm file:font-semibold file:text-orange-950"
                />
                {fileError ? <p className="mt-3 text-sm text-amber-200">{fileError}</p> : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="btn-lift mt-4 rounded-full border border-white/35 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Upload & analyze
                </button>
                {fileResult ? (
                  <pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-black/30 p-3 text-xs text-white/80">
                    {JSON.stringify(fileResult, null, 2)}
                  </pre>
                ) : null}
              </form>
            </Reveal>
          </div>

          <Reveal variant="scale" delay={120}>
            <form onSubmit={handleChat} className="card-hover mt-8 rounded-2xl bg-white/6 p-6">
              <h2 className="text-lg font-semibold text-white">AI coach (text)</h2>
              <p className="mt-1 text-sm text-white/65">Uses `/api/chat` (small credit cost).</p>
              <textarea
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                rows={4}
                className="mt-3 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40"
                placeholder="Ask how to structure a churn analysis workflow..."
              />
              {chatError ? <p className="mt-2 text-sm text-amber-200">{chatError}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="btn-lift mt-3 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-orange-950 disabled:opacity-60"
              >
                Send
              </button>
              {chatReply ? <p className="mt-4 text-sm text-white/80">{chatReply}</p> : null}
            </form>
          </Reveal>
        </div>
      </section>
      <Footer />
    </>
  )
}

export default Workspace
