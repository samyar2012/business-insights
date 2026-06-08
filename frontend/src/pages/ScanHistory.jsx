import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import Alert from '../components/app/Alert'
import { formatScanDate, scoreTone, sortScansNewestFirst } from '../components/app/ScanUi'

const ScanHistory = () => {
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [businessFilter, setBusinessFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch('/scans')
      setScans(sortScansNewestFirst(data.scans || []))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const businessOptions = useMemo(() => {
    const map = new Map()
    for (const scan of scans) {
      const id = scan.business_id || 'unknown'
      const name = scan.business_name || `Business ${id.slice(0, 8)}`
      if (!map.has(id)) map.set(id, name)
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [scans])

  const filteredScans = useMemo(() => {
    const sorted = sortScansNewestFirst(scans)
    if (businessFilter === 'all') return sorted
    return sorted.filter((scan) => scan.business_id === businessFilter)
  }, [scans, businessFilter])

  const showBusinessFilter = businessOptions.length > 1

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="app-eyebrow">Reports</p>
          <h1 className="app-page-title mt-2">Scan history</h1>
          <p className="app-page-subtitle">Previous Business Scanner runs for your account.</p>
        </div>
        <Link to="/app/tools/business-scanner" className="app-btn app-btn--primary">
          Run new scan
        </Link>
      </header>

      {showBusinessFilter ? (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="text-sm text-[var(--app-text-secondary)]">
            Filter by business
            <select
              className="app-field ml-2 mt-1 inline-block w-auto min-w-[12rem]"
              value={businessFilter}
              onChange={(e) => setBusinessFilter(e.target.value)}
            >
              <option value="all">All businesses</option>
              {businessOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-[var(--app-text-muted)]">
            {filteredScans.length} scan{filteredScans.length === 1 ? '' : 's'} - newest first
          </p>
        </div>
      ) : null}

      {loading ? (
        <div className="app-loading mt-10">
          <span className="app-loading__dot" />
          <span className="app-loading__dot" />
          <span className="app-loading__dot" />
          Loading scans...
        </div>
      ) : null}

      {error ? (
        <Alert variant="error" title="Could not load scans" className="mt-6" onDismiss={() => setError('')}>
          {error}
        </Alert>
      ) : null}

      {!loading && !error && scans.length === 0 ? (
        <div className="app-card mt-8 p-8 text-center">
          <p className="text-lg font-semibold text-[var(--app-text)]">No scans yet</p>
          <p className="mt-2 text-sm text-[var(--app-text-secondary)]">
            Run your first Business Scanner to see scores and recommendations here.
          </p>
          <Link to="/app/tools/business-scanner" className="app-btn app-btn--primary mt-5 inline-flex">
            Run Business Scanner
          </Link>
        </div>
      ) : null}

      {!loading && scans.length > 0 && filteredScans.length === 0 ? (
        <div className="app-card mt-8 p-8 text-center">
          <p className="text-lg font-semibold text-[var(--app-text)]">No scans for this business</p>
          <p className="mt-2 text-sm text-[var(--app-text-secondary)]">
            Try another filter or run a new scan for this business.
          </p>
          <button
            type="button"
            onClick={() => setBusinessFilter('all')}
            className="app-btn app-btn--secondary mt-5"
          >
            Show all scans
          </button>
        </div>
      ) : null}

      {!loading && filteredScans.length > 0 ? (
        <div className="mt-8 space-y-3">
          <div className="hidden overflow-x-auto rounded-xl border border-[var(--app-border)] lg:block">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-[var(--app-border)] bg-[var(--app-input-bg)]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-[var(--app-text-muted)]">Date</th>
                  <th className="px-4 py-3 font-semibold text-[var(--app-text-muted)]">Business</th>
                  <th className="px-4 py-3 font-semibold text-[var(--app-text-muted)]">Overall</th>
                  <th className="px-4 py-3 font-semibold text-[var(--app-text-muted)]">Store</th>
                  <th className="px-4 py-3 font-semibold text-[var(--app-text-muted)]">Trust</th>
                  <th className="px-4 py-3 font-semibold text-[var(--app-text-muted)]">Content</th>
                  <th className="px-4 py-3 font-semibold text-[var(--app-text-muted)]">Competitor</th>
                  <th className="px-4 py-3 font-semibold text-[var(--app-text-muted)]">Report</th>
                </tr>
              </thead>
              <tbody>
                {filteredScans.map((scan) => (
                  <tr key={scan.id} className="border-b border-[var(--app-border)] last:border-0">
                    <td className="px-4 py-3 text-[var(--app-text-secondary)]">{formatScanDate(scan.created_at)}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--app-text)]">
                        {scan.business_name || scan.business_id?.slice(0, 8) || '-'}
                      </p>
                      {scan.business_type ? (
                        <p className="text-xs text-[var(--app-text-muted)]">{scan.business_type}</p>
                      ) : null}
                    </td>
                    <td className={`px-4 py-3 font-semibold ${scoreTone(scan.overall_score)}`}>
                      {scan.overall_score}
                    </td>
                    <td className="px-4 py-3">{scan.store_score}</td>
                    <td className="px-4 py-3">{scan.trust_score}</td>
                    <td className="px-4 py-3">{scan.content_score}</td>
                    <td className="px-4 py-3">{scan.competitor_score}</td>
                    <td className="px-4 py-3">
                      <Link to={`/app/scans/${scan.id}`} className="app-link font-medium">
                        View report
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 lg:hidden">
            {filteredScans.map((scan) => (
              <li key={scan.id} className="app-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--app-text)]">
                      {scan.business_name || 'Business scan'}
                    </p>
                    <p className="text-xs text-[var(--app-text-muted)]">{formatScanDate(scan.created_at)}</p>
                  </div>
                  <p className={`text-2xl font-semibold ${scoreTone(scan.overall_score)}`}>
                    {scan.overall_score}
                  </p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-[var(--app-text-muted)]">Store</dt>
                    <dd className="font-medium">{scan.store_score}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--app-text-muted)]">Trust</dt>
                    <dd className="font-medium">{scan.trust_score}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--app-text-muted)]">Content</dt>
                    <dd className="font-medium">{scan.content_score}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--app-text-muted)]">Competitor</dt>
                    <dd className="font-medium">{scan.competitor_score}</dd>
                  </div>
                </dl>
                <Link to={`/app/scans/${scan.id}`} className="app-link mt-3 inline-block text-sm font-medium">
                  View report -&gt;
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export default ScanHistory
