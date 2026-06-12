const express = require('express')
const { query } = require('../db')
const { requireAuth } = require('../middleware/auth')
const { saveBusinessContextFromOnboarding } = require('../services/memoryService')

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
      `SELECT id, owner_name, business_name, business_type, product_sold, target_customers,
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
  const ownerName = String(req.body?.owner_name || '').trim()
  const businessName = String(req.body?.business_name || '').trim()
  const businessType = String(req.body?.business_type || '').trim()
  const productSold = String(req.body?.product_sold || '').trim()
  const targetCustomers = String(req.body?.target_customers || '').trim()
  const storeUrl = String(req.body?.store_url || '').trim()
  const monthlyRevenue = req.body?.monthly_revenue != null ? Number(req.body.monthly_revenue) : null
  const customerCount = req.body?.customer_count != null ? Number(req.body.customer_count) : null
  const monthlyOrders = req.body?.monthly_orders != null ? Number(req.body.monthly_orders) : null

  if (!ownerName || !businessName || !businessType) {
    return res.status(400).json({ error: 'Name, business name, and business type are required' })
  }

  try {
    const profile = await getUserPremium(req.auth.sub)
    if (profile.onboarding_completed) {
      return res.status(400).json({ error: 'Onboarding already completed' })
    }

    await query(
      `UPDATE profiles
       SET display_name = $2, onboarding_completed = true, updated_at = now()
       WHERE user_id = $1`,
      [req.auth.sub, ownerName],
    )

    const business = await query(
      `INSERT INTO businesses (
         user_id, owner_name, business_name, business_type, product_sold,
         target_customers, store_url, monthly_revenue, customer_count, monthly_orders
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        req.auth.sub,
        ownerName,
        businessName,
        businessType,
        productSold,
        targetCustomers,
        storeUrl || null,
        monthlyRevenue,
        customerCount,
        monthlyOrders,
      ],
    )

    const savedBusiness = business.rows[0]
    try {
      await saveBusinessContextFromOnboarding(req.auth.sub, savedBusiness)
    } catch (memErr) {
      console.warn('onboarding memory save:', memErr.message)
    }

    return res.status(201).json({ business: savedBusiness })
  } catch (err) {
    console.error('onboarding:', err.message)
    return res.status(500).json({ error: 'Failed to save onboarding' })
  }
})

router.patch('/:id', requireAuth, async (req, res) => {
  const id = req.params.id
  const fields = {
    owner_name: String(req.body?.owner_name || '').trim(),
    business_name: String(req.body?.business_name || '').trim(),
    business_type: String(req.body?.business_type || '').trim(),
    product_sold: String(req.body?.product_sold || '').trim(),
    target_customers: String(req.body?.target_customers || '').trim(),
    store_url: String(req.body?.store_url || '').trim(),
    monthly_revenue: req.body?.monthly_revenue != null ? Number(req.body.monthly_revenue) : null,
    customer_count: req.body?.customer_count != null ? Number(req.body.customer_count) : null,
    monthly_orders: req.body?.monthly_orders != null ? Number(req.body.monthly_orders) : null,
  }

  try {
    const result = await query(
      `UPDATE businesses
       SET owner_name = COALESCE(NULLIF($3, ''), owner_name),
           business_name = COALESCE(NULLIF($4, ''), business_name),
           business_type = COALESCE(NULLIF($5, ''), business_type),
           product_sold = COALESCE(NULLIF($6, ''), product_sold),
           target_customers = COALESCE(NULLIF($7, ''), target_customers),
           store_url = COALESCE(NULLIF($8, ''), store_url),
           monthly_revenue = COALESCE($9, monthly_revenue),
           customer_count = COALESCE($10, customer_count),
           monthly_orders = COALESCE($11, monthly_orders),
           updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        id,
        req.auth.sub,
        fields.owner_name,
        fields.business_name,
        fields.business_type,
        fields.product_sold,
        fields.target_customers,
        fields.store_url,
        fields.monthly_revenue,
        fields.customer_count,
        fields.monthly_orders,
      ],
    )
    if (!result.rows[0]) return res.status(404).json({ error: 'Business not found' })
    return res.json({ business: result.rows[0] })
  } catch (err) {
    console.error('update business:', err.message)
    return res.status(500).json({ error: 'Failed to update business' })
  }
})

router.post('/', requireAuth, async (req, res) => {
  const profile = await getUserPremium(req.auth.sub)
  const countResult = await query(`SELECT COUNT(*)::int AS count FROM businesses WHERE user_id = $1`, [
    req.auth.sub,
  ])
  const count = countResult.rows[0]?.count || 0

  if (count >= 1 && !profile.is_premium) {
    return res.status(402).json({
      error: 'Upgrade required to add another business',
      code: 'UPGRADE_REQUIRED',
    })
  }

  const businessName = String(req.body?.business_name || '').trim()
  if (!businessName) return res.status(400).json({ error: 'Business name is required' })

  try {
    const result = await query(
      `INSERT INTO businesses (user_id, business_name, business_type, product_sold, target_customers, store_url)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.auth.sub,
        businessName,
        String(req.body?.business_type || '').trim() || null,
        String(req.body?.product_sold || '').trim() || null,
        String(req.body?.target_customers || '').trim() || null,
        String(req.body?.store_url || '').trim() || null,
      ],
    )
    return res.status(201).json({ business: result.rows[0] })
  } catch (err) {
    console.error('create business:', err.message)
    return res.status(500).json({ error: 'Failed to create business' })
  }
})

module.exports = { businessesRouter: router }
