const ScoreBar = ({ label, value, max = 100 }) => {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--app-text-secondary)]">{label}</span>
        <span className="font-semibold text-[var(--app-text)]">
          {value}
          {max !== 100 ? <span className="text-[var(--app-text-muted)] font-normal"> / {max}</span> : null}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--app-input-bg)]">
        <div
          className="h-full rounded-full bg-[var(--app-accent-strong)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default ScoreBar

export const formatScanDate = (iso) => {
  if (!iso) return '-'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export const scoreTone = (value) => {
  if (value >= 75) return 'text-[var(--app-success-icon)]'
  if (value >= 55) return 'text-[var(--app-warning-icon)]'
  return 'text-[var(--app-error-icon)]'
}

export const interpretScore = (value) => {
  const score = Number(value) || 0
  if (score >= 75) {
    return {
      label: 'Strong',
      detail: 'Your signals look solid. Keep iterating on what is working.',
      tone: 'success',
    }
  }
  if (score >= 55) {
    return {
      label: 'Needs work',
      detail: 'You have a foundation, but key gaps are holding growth back.',
      tone: 'warning',
    }
  }
  return {
    label: 'High priority',
    detail: 'Address the top risks first before scaling traffic or spend.',
    tone: 'error',
  }
}

export const CHECKLIST_DISPLAY = [
  { key: 'has_reviews', label: 'Reviews' },
  { key: 'has_shipping_policy', label: 'Shipping policy' },
  { key: 'has_return_policy', label: 'Return policy' },
  { key: 'has_clear_product_photos', label: 'Product photos' },
  { key: 'posts_weekly', label: 'Weekly posting' },
  { key: 'has_competitor', label: 'Competitor tracking' },
  { key: 'offer_is_clear', label: 'Clear offer' },
]

export const sortScansNewestFirst = (scans) =>
  [...scans].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
