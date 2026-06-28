const express = require('express')
const { query } = require('../db')
const { requireAuth } = require('../middleware/auth')
const { validatePublicUrl } = require('../services/crawler/urlSecurity')
const {
  clearBusinessAnalysisData,
  updateBusinessStoreUrl,
} = require('../services/businessAnalysisService')
const { businessCrawlsRouter } = require('./businessCrawls')
const {
  completeOnboarding,
  updateBusinessProfile,
  createBusinessProfile,
} = require('../services/businessUpdateService')

const router = express.Router()

async function getUserPremium(userId) {
  const result = await query(
    `SELECT COALESCE(is_premium, false) AS is_premium,
            COALESCE(onboarding_completed, false) AS onboarding_completed,
            display_name
     FROM profiles WHERE user_id = $1`,
    [userId],
  )
  return result.rows[0] || { is_premium: false, onboarding_completed: false, display_name: null }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, owner_name, business_name, business_type, business_model, product_sold, target_customers,
              store_url, monthly_revenue, customer_count, monthly_orders, created_at, updated_at
       FROM businesses
       WHERE user_id = $1
       ORDER BY created_at ASC`,
      [req.auth.sub],
    )
    return res.json({ businesses: result.rows })
  } catch (err) {
    console.error('list businesses:', err.message)
    return res.status(500).json({ error: 'Failed to load businesses' })
  }
})

router.post('/onboarding', requireAuth, async (req, res) => {
  try {
    const business = await completeOnboarding(req.auth.sub, req.body)
    return res.status(201).json({ business })
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message })
    }
    if (err.code === 'ALREADY_COMPLETED') {
      return res.status(400).json({ error: err.message })
    }
    if (err.code === 'INVALID_URL' || err.code === 'SSRF_BLOCKED') {
      return res.status(400).json({ error: err.message })
    }
    console.error('onboarding:', err.message)
    return res.status(500).json({ error: 'Failed to save onboarding' })
  }
})

router.use(businessCrawlsRouter)

router.patch('/:id/store-url', requireAuth, async (req, res) => {
  const businessId = req.params.id
  const rawUrl = req.body?.store_url

  try {
    let storeUrl = null
    if (rawUrl != null && String(rawUrl).trim() !== '') {
      const parsed = await validatePublicUrl(String(rawUrl).trim())
      storeUrl = parsed.href
    }

    const result = await updateBusinessStoreUrl(req.auth.sub, businessId, storeUrl)
    if (!result) return res.status(404).json({ error: 'Business not found' })

    return res.json({
      business: result.business,
      cleared: result.cleared,
      message: result.cleared
        ? 'Store URL updated. Previous scans and website analysis were cleared.'
        : 'Store URL updated.',
    })
  } catch (err) {
    if (err.code === 'INVALID_URL' || err.code === 'SSRF_BLOCKED') {
      return res.status(400).json({ error: err.message })
    }
    console.error('update store url:', err.message)
    return res.status(500).json({ error: 'Failed to update store URL' })
  }
})

router.delete('/:id/analysis-data', requireAuth, async (req, res) => {
  const businessId = req.params.id
  try {
    const existing = await query(`SELECT id FROM businesses WHERE id = $1 AND user_id = $2`, [
      businessId,
      req.auth.sub,
    ])
    if (!existing.rows[0]) return res.status(404).json({ error: 'Business not found' })

    await clearBusinessAnalysisData(req.auth.sub, businessId)
    return res.json({
      ok: true,
      message: 'Scans, website analysis, and research results were cleared.',
    })
  } catch (err) {
    console.error('clear analysis data:', err.message)
    return res.status(500).json({ error: 'Failed to clear analysis data' })
  }
})

router.patch('/:id', requireAuth, async (req, res) => {
  const id = req.params.id

  try {
    const result = await updateBusinessProfile(req.auth.sub, id, req.body)
    if (!result) return res.status(404).json({ error: 'Business not found' })

    const message = result.storeCleared
      ? 'Profile saved. Store URL changed — previous scans and website analysis were cleared.'
      : 'Business profile saved.'

    return res.json({ business: result.business, cleared: result.storeCleared, message })
  } catch (err) {
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message })
    }
    if (err.code === 'INVALID_URL' || err.code === 'SSRF_BLOCKED') {
      return res.status(400).json({ error: err.message })
    }
    console.error('update business:', err.message)
    return res.status(500).json({ error: 'Failed to update business' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  try {
    const profile = await getUserPremium(req.auth.sub)
    const countResult = await query(`SELECT COUNT(*)::int AS count FROM businesses WHERE user_id = $1`, [
      req.auth.sub,
    ])
    const count = countResult.rows[0]?.count || 0

    const business = await createBusinessProfile(req.auth.sub, req.body, {
      isPremium: profile.is_premium,
      businessCount: count,
    })
    return res.status(201).json({ business })
  } catch (err) {
    if (err.code === 'UPGRADE_REQUIRED') {
      return res.status(402).json({
        error: err.message,
        code: 'UPGRADE_REQUIRED',
      })
    }
    if (err.code === 'VALIDATION') {
      return res.status(400).json({ error: err.message })
    }
    if (err.code === 'INVALID_URL' || err.code === 'SSRF_BLOCKED') {
      return res.status(400).json({ error: err.message })
    }
    console.error('create business:', err.message)
    return res.status(500).json({ error: 'Failed to create business' })
  }
})

module.exports = { businessesRouter: router }
