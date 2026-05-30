import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'bi_auth_user'
const TOKEN_KEY = 'bi_auth_token'
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const rawUser = localStorage.getItem(STORAGE_KEY)
        const rawToken = localStorage.getItem(TOKEN_KEY)
        if (rawUser) setUser(JSON.parse(rawUser))
        if (!rawToken) return

        setToken(rawToken)
        const res = await fetch(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${rawToken}` },
        })
        if (!res.ok) throw new Error('Session expired')
        const data = await res.json()
        if (data?.user) {
          setUser(data.user)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user))
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY)
        localStorage.removeItem(TOKEN_KEY)
        setUser(null)
        setToken(null)
      } finally {
        setLoading(false)
      }
    }

    bootstrap()
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || 'Login failed')
    }
    const nextUser = data.user || { email: email.trim().toLowerCase() }
    const nextToken = data.token || null
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken)
    setUser(nextUser)
    setToken(nextToken)
    return nextUser
  }, [])

  const signup = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(data.error || 'Signup failed')
    }
    const nextUser = data.user || { email: email.trim().toLowerCase() }
    const nextToken = data.token || null
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken)
    setUser(nextUser)
    setToken(nextToken)
    return nextUser
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    setToken(null)
  }, [])

  const value = useMemo(
    () => ({ user, token, loading, login, signup, logout }),
    [user, token, loading, login, signup, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
