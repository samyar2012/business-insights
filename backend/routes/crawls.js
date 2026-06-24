const express = require('express')
const { query } = require('../db')
const { requireAuth } = require('../middleware/auth')
const {
  crawlBusinessWebsite,
  getCrawlRun,
  listCrawlRuns,
  getCrawlPages,
  deleteCrawlData,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_DEPTH,
} = require('../services/crawler/crawlerService')
const { getBusinessWebProfile } = require('../services/businessProfileService')
const { validatePublicUrl } = require('../services/crawler/urlSecurity')

const router = express.Router()

async function loadOwnedBusiness(userId, businessId) {
  const result = await query(`SELECT * FROM businesses WHERE id = $1 AND user_id = $2`, [
    businessId,
    userId,
  ])
  return result.rows[0] || null
}

function formatCrawlSummary(crawlRun, profile, pages = []) {
  return {
    crawl: crawlRun
      ? {
          id: crawlRun.id,
          status: crawlRun.status,
          start_url: crawlRun.start_url,
          normalized_domain: crawlRun.normalized_domain,
          pages_discovered: crawlRun.pages_discovered,
          pages_crawled: crawlRun.pages_crawled,
          error_message: crawlRun.error_message,
          started_at: crawlRun.started_at,
          completed_at: crawlRun.completed_at,
          created_at: crawlRun.created_at,
        }
      : null,
    profile: profile || null,
    pages_count: pages.length,
  }
}

router.post('/businesses/:businessId/crawls', requireAuth, async (req, res) => {
  try {
    const business = await loadOwnedBusiness(req.auth.sub, req.params.businessId)
    if (!business) return res.status(404).json({ error: 'Business not found' })

    const rawUrl = req.body?.url || business.store_url
    if (!rawUrl) {
      return res.status(400).json({ error: 'No store URL provided. Add a store URL to your business first.' })
    }

    await validatePublicUrl(rawUrl)

    const maxPages = Math.min(Number(req.body?.max_pages) || DEFAULT_MAX_PAGES, DEFAULT_MAX_PAGES)
    const maxDepth = Math.min(Number(req.body?.max_depth) || DEFAULT_MAX_DEPTH, DEFAULT_MAX_DEPTH)
    const skipCache = Boolean(req.body?.skip_cache)

    const result = await crawlBusinessWebsite({
      userId: req.auth.sub,
      businessId: business.id,
      startUrl: rawUrl,
      maxPages,
      maxDepth,
      skipCache,
    })

    return res.status(result.cached ? 200 : 201).json({
      cached: result.cached,
      ...formatCrawlSummary(result.crawlRun, result.profile, result.pages),
    })
  } catch (err) {
    if (err.code === 'CRAWL_LIMIT') {
      return res.status(429).json({ error: err.message })
    }
    if (err.code === 'INVALID_URL' || err.code === 'SSRF_BLOCKED') {
      return res.status(400).json({ error: err.message })
    }
    console.error('start crawl:', err.message)
    return res.status(500).json({ error: 'Failed to crawl website' })
  }
})

router.get('/businesses/:businessId/crawls', requireAuth, async (req, res) => {
  try {
    const business = await loadOwnedBusiness(req.auth.sub, req.params.businessId)
    if (!business) return res.status(404).json({ error: 'Business not found' })

    const crawls = await listCrawlRuns(req.auth.sub, business.id)
    return res.json({ business, crawls })
  } catch (err) {
    console.error('list crawls:', err.message)
    return res.status(500).json({ error: 'Failed to list crawls' })
  }
})

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

router.get('/businesses/:businessId/web-profile', requireAuth, async (req, res) => {
  try {
    const business = await loadOwnedBusiness(req.auth.sub, req.params.businessId)
    if (!business) return res.status(404).json({ error: 'Business not found' })

    const profile = await getBusinessWebProfile(req.auth.sub, business.id)
    const crawls = await listCrawlRuns(req.auth.sub, business.id)
    const latestCrawl = crawls[0] || null
    let pages = []
    if (latestCrawl) {
      pages = await getCrawlPages(req.auth.sub, latestCrawl.id)
    }

    return res.json({
      business,
      profile,
      latest_crawl: latestCrawl,
      pages,
    })
  } catch (err) {
    console.error('get web profile:', err.message)
    return res.status(500).json({ error: 'Failed to load web profile' })
  }
})

router.post('/businesses/:businessId/rescan', requireAuth, async (req, res) => {
  try {
    const business = await loadOwnedBusiness(req.auth.sub, req.params.businessId)
    if (!business) return res.status(404).json({ error: 'Business not found' })
    if (!business.store_url) {
      return res.status(400).json({ error: 'No store URL on file for this business.' })
    }

    await validatePublicUrl(business.store_url)

    const result = await crawlBusinessWebsite({
      userId: req.auth.sub,
      businessId: business.id,
      startUrl: business.store_url,
      maxPages: DEFAULT_MAX_PAGES,
      maxDepth: DEFAULT_MAX_DEPTH,
      skipCache: true,
    })

    return res.status(201).json({
      cached: false,
      ...formatCrawlSummary(result.crawlRun, result.profile, result.pages),
    })
  } catch (err) {
    if (err.code === 'CRAWL_LIMIT') {
      return res.status(429).json({ error: err.message })
    }
    if (err.code === 'INVALID_URL' || err.code === 'SSRF_BLOCKED') {
      return res.status(400).json({ error: err.message })
    }
    console.error('rescan:', err.message)
    return res.status(500).json({ error: 'Failed to rescan website' })
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
