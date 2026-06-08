const ScoreBar = ({ label, value }) => (
  <div>
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--app-text-secondary)]">{label}</span>
      <span className="font-semibold text-[var(--app-text)]">{value}</span>
    </div>
    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--app-input-bg)]">
      <div
        className="h-full rounded-full bg-[var(--app-accent-strong)] transition-all duration-500"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  </div>
)

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
