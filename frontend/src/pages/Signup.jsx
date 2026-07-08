import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const Signup = () => {
  const { signup, user } = useAuth()
  const navigate = useNavigate()
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
          <p className="mt-3 text-sm text-white/75">You are already signed in as</p>
          <p className="mt-1 text-base font-semibold text-white">{user.email}</p>
          <Link
            to="/product"
            className="mt-6 inline-flex rounded-sm border border-white/35 bg-white/14 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/22"
          >
            Go to product
          </Link>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) return setError('Enter your email.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setSubmitting(true)
    try {
      await signup(email, password)
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message || 'Signup failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-scene">
      <div className="auth-overlay" />
      <form onSubmit={handleSubmit} className="auth-centered-card auth-centered-card-sm space-y-5">
        <Link
          to="/"
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-sm border border-slate-700 bg-slate-900/85 text-xs text-white transition hover:bg-slate-800"
          aria-label="Close and return home"
        >
          X
        </Link>
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Register</h1>
        </div>
        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-white/85">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-card-input mt-1.5 w-full rounded-sm px-3 py-2.5 text-sm text-white placeholder:text-white/45"
            placeholder="you@brand.com"
          />
        </div>
        <div>
          <label htmlFor="signup-password" className="block text-sm font-medium text-white/85">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-card-input mt-1.5 w-full rounded-sm px-3 py-2.5 text-sm text-white placeholder:text-white/45"
            placeholder="At least 8 characters"
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
          {submitting ? 'Creating account...' : 'Start free trial'}
        </button>
        <p className="text-center text-sm text-white/75">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-white hover:underline">
            Login
          </Link>
        </p>
      </form>
    </div>
  )
}

export default Signup
