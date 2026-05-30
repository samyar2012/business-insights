import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const Login = () => {
  const { login, logout, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/app'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    return (
      <div className="auth-scene">
        <div className="auth-overlay" />
        <div className="auth-centered-card auth-centered-card-sm text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Session active</p>
          <p className="mt-3 text-sm text-white/75">Signed in as</p>
          <p className="mt-1 text-base font-semibold text-white">{user.email}</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/"
              className="inline-flex justify-center rounded-sm border border-white/30 bg-white/15 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
            >
              Back to home
            </Link>
            <button
              type="button"
              onClick={() => logout()}
              className="rounded-sm border border-white/30 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) {
      setError('Enter your email.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSubmitting(true)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || 'Sign in failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-scene">
      <div className="auth-overlay" />
      <form onSubmit={handleSubmit} className="auth-centered-card auth-centered-card-sm space-y-5" noValidate>
        <Link
          to="/"
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-sm border border-slate-700 bg-slate-900/85 text-xs text-white transition hover:bg-slate-800"
          aria-label="Close and return home"
        >
          X
        </Link>
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Login</h1>
        </div>
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-white/85">
            Email
          </label>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-card-input mt-1.5 w-full rounded-sm px-3 py-2.5 text-sm text-white placeholder:text-white/45"
            placeholder="you@brand.com"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="block text-sm font-medium text-white/85">
            Password
          </label>
          <input
            id="login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-card-input mt-1.5 w-full rounded-sm px-3 py-2.5 text-sm text-white placeholder:text-white/45"
            placeholder="••••••••"
          />
        </div>

        {error ? (
          <p className="rounded-sm border border-red-300/40 bg-red-500/12 px-3 py-2 text-sm text-red-100" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-sm border border-white/35 bg-white/14 py-2.5 text-sm font-semibold text-white transition hover:bg-white/22 disabled:opacity-60"
        >
          {submitting ? 'Signing in...' : 'Login'}
        </button>

        <p className="text-center text-sm text-white/75">
          Don&apos;t have an account?{' '}
          <Link to="/signup" className="font-semibold text-white hover:underline">
            Register
          </Link>
        </p>
      </form>
    </div>
  )
}

export default Login
