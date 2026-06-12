const express = require('express')
const { query } = require('../db')
const { requireAuth } = require('../middleware/auth')
const {
  researchBusiness,
  getLatestResearchProfile,
} = require('../services/businessResearchService')

const router = express.Router()

async function loadOwnedBusiness(userId, businessId) {
  const result = await query(`SELECT * FROM businesses WHERE id = $1 AND user_id = $2`, [
    businessId,
    userId,
  ])
  return result.rows[0] || null
}

router.get('/business/:businessId', requireAuth, async (req, res) => {
  try {
    const business = await loadOwnedBusiness(req.auth.sub, req.params.businessId)
    if (!business) return res.status(404).json({ error: 'Business not found' })

    const profile = await getLatestResearchProfile(req.auth.sub, business.id)
    if (!profile) {
      return res.json({ business, profile: null })
    }
    return res.json({ business, profile })
  } catch (err) {
    console.error('get research:', err.message)
    return res.status(500).json({ error: 'Failed to load research profile' })
  }
})

async function runResearch(req, res) {
  try {
    const business = await loadOwnedBusiness(req.auth.sub, req.params.businessId)
    if (!business) return res.status(404).json({ error: 'Business not found' })

    const profile = await researchBusiness({ userId: req.auth.sub, business })
    return res.status(201).json({ business, profile })
  } catch (err) {
    console.error('run research:', err.message)
    return res.status(500).json({ error: 'Failed to run business research' })
  }
}

router.post('/business/:businessId/run', requireAuth, runResearch)
router.post('/business/:businessId/rescan', requireAuth, runResearch)

module.exports = { researchRouter: router }
