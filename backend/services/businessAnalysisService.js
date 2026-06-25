const { query } = require('../db')
const { upsertMemory } = require('./memoryService')
const { normalizeUrlForCompare } = require('./businessAnalysisLogic')

async function clearBusinessAnalysisData(userId, businessId) {
  await query(`DELETE FROM business_scans WHERE user_id = $1 AND business_id = $2`, [
    userId,
    businessId,
  ])
  await query(`DELETE FROM website_crawl_runs WHERE user_id = $1 AND business_id = $2`, [
    userId,
    businessId,
  ])
  await query(`DELETE FROM business_web_profiles WHERE user_id = $1 AND business_id = $2`, [
    userId,
    businessId,
  ])
  await query(`DELETE FROM business_research_profiles WHERE user_id = $1 AND business_id = $2`, [
    userId,
    businessId,
  ])
  await query(`DELETE FROM website_scan_events WHERE user_id = $1 AND business_id = $2`, [
    userId,
    businessId,
  ])
  await query(`DELETE FROM research_events WHERE user_id = $1 AND business_id = $2`, [
    userId,
    businessId,
  ])

  const memoryPatterns = [
    'store_url',
    `research_signals_${businessId}`,
    `research_strengths_${businessId}`,
    `research_risks_${businessId}`,
    `research_next_actions_${businessId}`,
    `social_links_${businessId}`,
  ]

  await query(
    `DELETE FROM user_memory
     WHERE user_id = $1 AND key = ANY($2::text[])`,
    [userId, memoryPatterns],
  )
}

async function updateBusinessStoreUrl(userId, businessId, storeUrl) {
  const normalized = storeUrl == null || storeUrl === '' ? null : String(storeUrl).trim() || null

  const existing = await query(`SELECT * FROM businesses WHERE id = $1 AND user_id = $2`, [
    businessId,
    userId,
  ])
  const business = existing.rows[0]
  if (!business) return null

  const oldNormalized = normalizeUrlForCompare(business.store_url)
  const newNormalized = normalizeUrlForCompare(normalized)
  const urlChanged = oldNormalized !== newNormalized

  if (urlChanged) {
    await clearBusinessAnalysisData(userId, businessId)
  }

  const result = await query(
    `UPDATE businesses SET store_url = $3, updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [businessId, userId, normalized],
  )
  const updated = result.rows[0]

  if (normalized) {
    await upsertMemory(userId, {
      memory_type: 'business_context',
      key: 'store_url',
      value: { url: normalized },
    })
  } else {
    await query(`DELETE FROM user_memory WHERE user_id = $1 AND key = 'store_url'`, [userId])
  }

  return { business: updated, cleared: urlChanged }
}

module.exports = {
  clearBusinessAnalysisData,
  updateBusinessStoreUrl,
  normalizeUrlForCompare,
}
