const express = require('express')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')
const { query, withClient } = require('../db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth requests. Please try again later.' },
})

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts. Please wait and try again.' },
})

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' },
  )
}

router.post('/signup', authLimiter, signupLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' })
  }
  if (!PASSWORD_RE.test(password)) {
    return res.status(400).json({
      error: 'Password must be 8+ chars with uppercase, lowercase, and number',
    })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  try {
    const result = await withClient(async (client) => {
      await client.query('BEGIN')
      const userInsert = await client.query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email, created_at`,
        [email, passwordHash],
      )
      const user = userInsert.rows[0]

      await client.query(
        `INSERT INTO profiles (user_id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id, email.split('@')[0]],
      )

      const profileResult = await client.query(
        `SELECT user_id, display_name, avatar_url, phone, company, timezone
         FROM profiles
         WHERE user_id = $1`,
        [user.id],
      )
      await client.query('COMMIT')
      return { user, profile: profileResult.rows[0] || null }
    })

    const token = signToken(result.user)

    return res.status(201).json({
      user: { id: result.user.id, email: result.user.email, profile: result.profile },
      token,
    })
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' })
    }
    if (err.code === '42P01') {
      return res.status(500).json({
        error: 'Database tables missing. Run backend/sql/init.sql in Supabase SQL Editor.',
      })
    }
    console.error('signup error:', err.message)
    return res.status(500).json({ error: 'Could not create account' })
  }
})

router.post('/login', authLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email)
  const password = String(req.body?.password || '')

  if (!EMAIL_RE.test(email) || !password) {
    return res.status(400).json({ error: 'Invalid credentials format' })
  }

  try {
    const userResult = await query(
      `SELECT u.id, u.email, u.password_hash, u.created_at,
              p.display_name, p.avatar_url, p.phone, p.company, p.timezone
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.email = $1`,
      [email],
    )

    const user = userResult.rows[0]
    if (!user) return res.status(401).json({ error: 'Invalid email or password' })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' })

    const token = signToken(user)
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        profile: {
          user_id: user.id,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          phone: user.phone,
          company: user.company,
          timezone: user.timezone,
        },
      },
      token,
    })
  } catch (err) {
    console.error('login error:', err.message)
    return res.status(500).json({ error: 'Could not login' })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.created_at,
              p.display_name, p.avatar_url, p.phone, p.company, p.timezone,
              COALESCE(p.onboarding_completed, false) AS onboarding_completed,
              COALESCE(p.is_premium, false) AS is_premium
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.id = $1`,
      [req.auth.sub],
    )
    const user = result.rows[0]
    if (!user) return res.status(404).json({ error: 'User not found' })

    const businesses = await query(
      `SELECT id, owner_name, business_name, business_type, product_sold, target_customers,
              store_url, monthly_revenue, customer_count, monthly_orders, created_at, updated_at
       FROM businesses WHERE user_id = $1 ORDER BY created_at ASC`,
      [req.auth.sub],
    )

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        onboarding_completed: user.onboarding_completed,
        is_premium: user.is_premium,
        profile: {
          user_id: user.id,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          phone: user.phone,
          company: user.company,
          timezone: user.timezone,
        },
        businesses: businesses.rows,
      },
    })
  } catch (err) {
    console.error('me error:', err.message)
    return res.status(500).json({ error: 'Failed to fetch user' })
  }
})

router.patch('/profile', requireAuth, async (req, res) => {
  const displayName = String(req.body?.display_name || '').trim()
  const phone = String(req.body?.phone || '').trim()
  const company = String(req.body?.company || '').trim()
  const timezone = String(req.body?.timezone || '').trim()
  const avatarUrl = String(req.body?.avatar_url || '').trim()

  try {
    const profileResult = await query(
      `INSERT INTO profiles (user_id, display_name, phone, company, timezone, avatar_url)
       VALUES ($1, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''))
       ON CONFLICT (user_id) DO UPDATE
       SET display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), profiles.display_name),
           phone = COALESCE(NULLIF(EXCLUDED.phone, ''), profiles.phone),
           company = COALESCE(NULLIF(EXCLUDED.company, ''), profiles.company),
           timezone = COALESCE(NULLIF(EXCLUDED.timezone, ''), profiles.timezone),
           avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), profiles.avatar_url),
           updated_at = now()
       RETURNING user_id, display_name, phone, company, timezone, avatar_url, updated_at`,
      [req.auth.sub, displayName, phone, company, timezone, avatarUrl],
    )
    return res.json({ profile: profileResult.rows[0] })
  } catch {
    return res.status(500).json({ error: 'Failed to update profile' })
  }
})

module.exports = { authRouter: router }
