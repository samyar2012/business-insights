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
    const nextToken = data.token || null
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken)
    setToken(nextToken)

    if (nextToken) {
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${nextToken}` },
      })
      if (meRes.ok) {
        const meData = await meRes.json()
        setUser(meData.user)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(meData.user))
        return meData.user
      }
    }

    const nextUser = data.user || { email: email.trim().toLowerCase() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
    setUser(nextUser)
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
    const nextToken = data.token || null
    if (nextToken) localStorage.setItem(TOKEN_KEY, nextToken)
    setToken(nextToken)

    if (nextToken) {
      const meRes = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${nextToken}` },
      })
      if (meRes.ok) {
        const meData = await meRes.json()
        setUser(meData.user)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(meData.user))
        return meData.user
      }
    }

    const nextUser = data.user || { email: email.trim().toLowerCase() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser))
    setUser(nextUser)
    return nextUser
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(TOKEN_KEY)
    setUser(null)
    setToken(null)
  }, [])

  const refreshUser = useCallback(async () => {
    const rawToken = localStorage.getItem(TOKEN_KEY)
    if (!rawToken) return null
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${rawToken}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to refresh session')
    if (data?.user) {
      setUser(data.user)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data.user))
    }
    return data.user
  }, [])

  const value = useMemo(
    () => ({ user, token, loading, login, signup, logout, refreshUser }),
    [user, token, loading, login, signup, logout, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
