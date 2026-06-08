import { useTheme } from '../../context/ThemeContext'

const options = [
  { value: 'light', label: 'Light', icon: 'L' },
  { value: 'dark', label: 'Dark', icon: 'D' },
  { value: 'system', label: 'System', icon: 'A' },
]

const ThemeToggle = ({ compact = false }) => {
  const { preference, setTheme } = useTheme()

  if (compact) {
    const next = preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light'
    const current = options.find((o) => o.value === preference) || options[2]
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        className="app-icon-btn"
        aria-label={`Theme: ${current.label}. Click to switch.`}
        title={`Theme: ${current.label}`}
      >
        <span className="text-base leading-none">{current.icon}</span>
      </button>
    )
  }

  return (
    <div className="app-theme-toggle" role="group" aria-label="Appearance">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setTheme(opt.value)}
          className={`app-theme-toggle__btn ${preference === opt.value ? 'is-active' : ''}`}
          aria-pressed={preference === opt.value}
        >
          <span aria-hidden>{opt.icon}</span>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default ThemeToggle
