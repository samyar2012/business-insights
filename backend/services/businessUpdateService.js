const { query } = require('../db')
const { saveBusinessContextFromOnboarding } = require('./memoryService')
const { parseBusinessFormBody } = require('./businessFormService')
const { updateBusinessStoreUrl } = require('./businessAnalysisService')

async function syncOwnerDisplayName(userId, ownerName) {
  if (!ownerName) return
  await query(
    `UPDATE profiles SET display_name = $2, updated_at = now() WHERE user_id = $1`,
    [userId, ownerName],
  )
}

async function completeOnboarding(userId, body) {
  const fields = await parseBusinessFormBody(body, { requireCore: true })

  const profileResult = await query(
    `SELECT COALESCE(onboarding_completed, false) AS onboarding_completed
     FROM profiles WHERE user_id = $1`,
    [userId],
  )
  if (profileResult.rows[0]?.onboarding_completed) {
    const err = new Error('Onboarding already completed')
    err.code = 'ALREADY_COMPLETED'
    throw err
  }

  await query(
    `UPDATE profiles
     SET display_name = $2, onboarding_completed = true, updated_at = now()
     WHERE user_id = $1`,
    [userId, fields.ownerName],
  )

  const existing = await query(
    `SELECT id FROM businesses WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [userId],
  )

  let saved
  if (existing.rows[0]) {
    const updated = await query(
      `UPDATE businesses
       SET owner_name = $3,
           business_name = $4,
           business_type = $5,
           business_model = $6,
           product_sold = $7,
           target_customers = $8,
           store_url = $9,
           monthly_revenue = $10,
           customer_count = $11,
           monthly_orders = $12,
           updated_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [
        existing.rows[0].id,
        userId,
        fields.ownerName,
        fields.businessName,
        fields.businessType,
        fields.businessModel,
        fields.productSold,
        fields.targetCustomers,
        fields.storeUrl,
        fields.monthlyRevenue,
        fields.customerCount,
        fields.monthlyOrders,
      ],
    )
    saved = updated.rows[0]
  } else {
    const inserted = await query(
      `INSERT INTO businesses (
         user_id, owner_name, business_name, business_type, business_model, product_sold,
         target_customers, store_url, monthly_revenue, customer_count, monthly_orders
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        userId,
        fields.ownerName,
        fields.businessName,
        fields.businessType,
        fields.businessModel,
        fields.productSold,
        fields.targetCustomers,
        fields.storeUrl,
        fields.monthlyRevenue,
        fields.customerCount,
        fields.monthlyOrders,
      ],
    )
    saved = inserted.rows[0]
  }

  try {
    await saveBusinessContextFromOnboarding(userId, saved)
  } catch (memErr) {
    console.warn('onboarding memory save:', memErr.message)
  }

  return saved
}

async function updateBusinessProfile(userId, businessId, body) {
  const existing = await query(`SELECT * FROM businesses WHERE id = $1 AND user_id = $2`, [
    businessId,
    userId,
  ])
  const business = existing.rows[0]
  if (!business) return null

  const fields = await parseBusinessFormBody(body, { requireCore: true })

  let storeCleared = false
  if (body.store_url !== undefined) {
    const storeResult = await updateBusinessStoreUrl(userId, businessId, fields.storeUrl)
    if (storeResult) storeCleared = storeResult.cleared
  }

  const updated = await query(
    `UPDATE businesses
     SET owner_name = $3,
         business_name = $4,
         business_type = $5,
         business_model = $6,
         product_sold = $7,
         target_customers = $8,
         monthly_revenue = $9,
         customer_count = $10,
         monthly_orders = $11,
         updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [
      businessId,
      userId,
      fields.ownerName,
      fields.businessName,
      fields.businessType,
      fields.businessModel,
      fields.productSold,
      fields.targetCustomers,
      fields.monthlyRevenue,
      fields.customerCount,
      fields.monthlyOrders,
    ],
  )

  const saved = updated.rows[0]
  await syncOwnerDisplayName(userId, fields.ownerName)

  try {
    await saveBusinessContextFromOnboarding(userId, saved)
  } catch (memErr) {
    console.warn('profile memory save:', memErr.message)
  }

  return { business: saved, storeCleared }
}

async function createBusinessProfile(userId, body, { isPremium = false, businessCount = 0 } = {}) {
  if (businessCount >= 1 && !isPremium) {
    const err = new Error('Upgrade required to add another business')
    err.code = 'UPGRADE_REQUIRED'
    throw err
  }

  const fields = await parseBusinessFormBody(body, { requireCore: true })

  const inserted = await query(
    `INSERT INTO businesses (
       user_id, owner_name, business_name, business_type, business_model, product_sold,
       target_customers, store_url, monthly_revenue, customer_count, monthly_orders
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      userId,
      fields.ownerName,
      fields.businessName,
      fields.businessType,
      fields.businessModel,
      fields.productSold,
      fields.targetCustomers,
      fields.storeUrl,
      fields.monthlyRevenue,
      fields.customerCount,
      fields.monthlyOrders,
    ],
  )

  const saved = inserted.rows[0]
  await syncOwnerDisplayName(userId, fields.ownerName)

  try {
    await saveBusinessContextFromOnboarding(userId, saved)
  } catch (memErr) {
    console.warn('create business memory save:', memErr.message)
  }

  return saved
}

module.exports = {
  completeOnboarding,
  updateBusinessProfile,
  createBusinessProfile,
}
