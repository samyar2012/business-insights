import { useTheme } from '../../context/ThemeContext'

const options = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const SunIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
    <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM3.05 4.28a.75.75 0 011.06 0l1.06 1.06a.75.75 0 11-1.06 1.06L3.05 5.34a.75.75 0 010-1.06zM14.83 16.06a.75.75 0 011.06 0l1.06 1.06a.75.75 0 11-1.06 1.06l-1.06-1.06a.75.75 0 010-1.06zM2 10a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 012 10zM15.25 9.25a.75.75 0 010 1.5h-1.5a.75.75 0 010-1.5h1.5zM3.05 15.72a.75.75 0 010-1.06l1.06-1.06a.75.75 0 111.06 1.06l-1.06 1.06a.75.75 0 01-1.06 0zM14.83 3.94a.75.75 0 010-1.06l1.06-1.06a.75.75 0 111.06 1.06l-1.06 1.06a.75.75 0 01-1.06 0zM10 6.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
  </svg>
)

const MoonIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
    <path
      fillRule="evenodd"
      d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 9.958.75.75 0 011.047 1.047A8.5 8.5 0 116.75 2.31a.75.75 0 01.705-.306z"
      clipRule="evenodd"
    />
  </svg>
)

const SystemIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
    <path
      fillRule="evenodd"
      d="M2 4.25A2.25 2.25 0 014.25 2h11.5A2.25 2.25 0 0118 4.25v8.5A2.25 2.25 0 0115.75 15h-3.105a3.501 3.501 0 001.1 1.5H16a.75.75 0 010 1.5H4a.75.75 0 010-1.5h2.355a3.501 3.501 0 001.1-1.5H4.25A2.25 2.25 0 012 12.75v-8.5zm1.5 0v8.5c0 .414.336.75.75.75h11.5a.75.75 0 00.75-.75v-8.5a.75.75 0 00-.75-.75H4.25a.75.75 0 00-.75.75z"
      clipRule="evenodd"
    />
  </svg>
)

const compactIcons = {
  light: SunIcon,
  dark: MoonIcon,
  system: SystemIcon,
}

const ThemeToggle = ({ compact = false }) => {
  const { preference, setTheme } = useTheme()

  if (compact) {
    const next = preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light'
    const current = options.find((o) => o.value === preference) || options[2]
    const Icon = compactIcons[current.value] || SystemIcon
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        className="app-icon-btn"
        aria-label={`Theme: ${current.label}. Click to switch.`}
        title={`Theme: ${current.label}`}
      >
        <Icon />
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
          <span aria-hidden>{opt.label[0]}</span>
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default ThemeToggle
