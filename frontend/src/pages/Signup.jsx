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
      <div className="mx-auto max-w-md px-4 py-14 sm:py-20">
        <div className="glass-panel hero-glass-panel rounded-2xl p-8 text-center">
          <p className="text-sm text-white/75">You are already signed in.</p>
          <p className="mt-1 font-medium text-white">{user.email}</p>
          <Link
            to="/product"
            className="btn-lift mt-6 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-orange-950"
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
    <div className="mx-auto max-w-md px-4 py-12 sm:py-20">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/65">Free trial</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Start your account
        </h1>
        <p className="mt-2 text-sm text-white/70">No credit card required. Add payment after trial only.</p>
      </div>
      <form
        onSubmit={handleSubmit}
        className="contact-panel-glow glass-panel-strong space-y-5 rounded-2xl bg-linear-to-br from-white/14 via-white/8 to-white/4 p-8"
      >
        <div>
          <label htmlFor="signup-email" className="block text-sm font-medium text-white/85">
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-amber-200/50 focus:bg-white/15"
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
            className="mt-1.5 w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none transition focus:border-amber-200/50 focus:bg-white/15"
            placeholder="At least 8 characters"
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
          {submitting ? 'Creating account…' : 'Create free account'}
        </button>
        <p className="text-center text-sm text-white/65">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-amber-100 underline-offset-2 hover:text-white hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  )
}

export default Signup
