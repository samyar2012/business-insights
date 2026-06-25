const express = require('express')
const { requireAuth } = require('../middleware/auth')
const {
  getCrawlRun,
  getCrawlPages,
  deleteCrawlData,
} = require('../services/crawler/crawlerService')
const { getBusinessWebProfile } = require('../services/businessProfileService')
const { query } = require('../db')

const router = express.Router()

async function loadOwnedBusiness(userId, businessId) {
  const result = await query(`SELECT * FROM businesses WHERE id = $1 AND user_id = $2`, [
    businessId,
    userId,
  ])
  return result.rows[0] || null
}

router.get('/crawls/:crawlId', requireAuth, async (req, res) => {
  try {
    const crawlRun = await getCrawlRun(req.auth.sub, req.params.crawlId)
    if (!crawlRun) return res.status(404).json({ error: 'Crawl not found' })

    const pages = await getCrawlPages(req.auth.sub, crawlRun.id)
    const profile = await getBusinessWebProfile(req.auth.sub, crawlRun.business_id)

    return res.json({
      crawl: crawlRun,
      pages,
      profile,
    })
  } catch (err) {
    console.error('get crawl:', err.message)
    return res.status(500).json({ error: 'Failed to load crawl' })
  }
})

router.delete('/businesses/:businessId/crawl-data', requireAuth, async (req, res) => {
  try {
    const business = await loadOwnedBusiness(req.auth.sub, req.params.businessId)
    if (!business) return res.status(404).json({ error: 'Business not found' })

    await deleteCrawlData(req.auth.sub, business.id)
    return res.json({ ok: true })
  } catch (err) {
    console.error('delete crawl data:', err.message)
    return res.status(500).json({ error: 'Failed to delete crawl data' })
  }
})

module.exports = { crawlsRouter: router }
