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
      <div className="mx-auto max-w-md px-4 py-16 sm:py-24">
        <div className="glass-panel hero-glass-panel rounded-2xl p-8 text-center">
          <p className="text-sm text-white/75">Signed in as</p>
          <p className="mt-1 font-medium text-white">{user.email}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/"
              className="btn-lift inline-flex justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-orange-950"
            >
              Back to home
            </Link>
            <button
              type="button"
              onClick={() => logout()}
              className="btn-lift rounded-full border border-white/35 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
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
    <div className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Business Insight</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Log in</h1>
        <p className="mt-2 text-sm text-white/70">Use your Supabase-backed account credentials.</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="contact-panel-glow glass-panel-strong space-y-5 rounded-2xl bg-linear-to-br from-white/14 via-white/8 to-white/4 p-8"
        noValidate
      >
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
            className="mt-1.5 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none ring-0 transition focus:border-amber-200/50 focus:bg-white/15"
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
            className="mt-1.5 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-amber-200/50 focus:bg-white/15"
            placeholder="••••••••"
          />
        </div>

        {error ? (
          <p className="text-sm text-amber-200" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="btn-lift w-full rounded-full bg-white py-3 text-sm font-semibold text-orange-950 shadow-lg disabled:opacity-60"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-sm text-white/65">
          New here?{' '}
          <Link to="/signup" className="font-medium text-amber-100 underline-offset-2 hover:text-white hover:underline">
            Start your free trial
          </Link>{' '}
          — no card required.
        </p>
      </form>
    </div>
  )
}

export default Login
