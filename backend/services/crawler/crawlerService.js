const crypto = require('crypto')
const { query } = require('../../db')
const {
  validatePublicUrl,
  canonicalizeUrl,
  sameOrigin,
  isBlockedCrawlPath,
} = require('./urlSecurity')
const { DEFAULT_UA } = require('./crawlerConfig')
const { fetchRobots, isPathDisallowed } = require('./robotsService')
const { discoverSitemapUrls, detectPageType, scoreUrlPriority } = require('./sitemapService')
const { fetchPage } = require('./pageFetcher')
const { extractPage, chunkText } = require('./pageExtractor')
const { buildBusinessWebProfile, formatWebProfile, rehydrateWebProfileScores } = require('../businessProfileService')
const { checkUrlSafety } = require('../safeBrowsingService')
const {
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_DEPTH,
  CRAWL_CACHE_HOURS,
  DAILY_CRAWL_LIMIT,
  GLOBAL_CRAWL_CONCURRENCY,
} = require('./crawlerLimits')

let activeCrawls = 0
const crawlQueue = []

async function acquireCrawlSlot() {
  if (activeCrawls < GLOBAL_CRAWL_CONCURRENCY) {
    activeCrawls += 1
    return
  }
  await new Promise((resolve) => crawlQueue.push(resolve))
  activeCrawls += 1
}

function releaseCrawlSlot() {
  activeCrawls = Math.max(0, activeCrawls - 1)
  const next = crawlQueue.shift()
  if (next) next()
}

async function countDailyCrawls(userId) {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM website_crawl_runs
     WHERE user_id = $1 AND created_at > now() - interval '24 hours'`,
    [userId],
  )
  return result.rows[0]?.count || 0
}

async function findRecentCrawl(userId, businessId, normalizedDomain) {
  const result = await query(
    `SELECT * FROM website_crawl_runs
     WHERE user_id = $1 AND business_id = $2 AND normalized_domain = $3
       AND status = 'completed'
       AND created_at > now() - ($4::text || ' hours')::interval
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, businessId, normalizedDomain, String(CRAWL_CACHE_HOURS)],
  )
  return result.rows[0] || null
}

async function createCrawlRun({ userId, businessId, startUrl, normalizedDomain }) {
  const result = await query(
    `INSERT INTO website_crawl_runs (user_id, business_id, start_url, normalized_domain, status, started_at)
     VALUES ($1, $2, $3, $4, 'running', now())
     RETURNING *`,
    [userId, businessId, startUrl, normalizedDomain],
  )
  return result.rows[0]
}

async function updateCrawlRun(id, fields) {
  const sets = []
  const values = []
  let idx = 1
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = $${idx}`)
    values.push(value)
    idx += 1
  }
  values.push(id)
  await query(`UPDATE website_crawl_runs SET ${sets.join(', ')} WHERE id = $${idx}`, values)
}

async function getStoredPageByHash(crawlRunId, url, contentHash) {
  const result = await query(
    `SELECT * FROM website_pages
     WHERE crawl_run_id = $1 AND url = $2 AND content_hash = $3`,
    [crawlRunId, url, contentHash],
  )
  return result.rows[0] || null
}

async function savePage({
  crawlRunId,
  userId,
  businessId,
  url,
  fetchResult,
  extracted,
  pageType,
}) {
  const insert = await query(
    `INSERT INTO website_pages (
       crawl_run_id, user_id, business_id, url, final_url, canonical_url, page_type,
       status_code, title, meta_description, headings_json, extracted_text,
       extracted_data_json, content_hash, requires_browser
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (crawl_run_id, url) DO UPDATE SET
       final_url = EXCLUDED.final_url,
       canonical_url = EXCLUDED.canonical_url,
       page_type = EXCLUDED.page_type,
       status_code = EXCLUDED.status_code,
       title = EXCLUDED.title,
       meta_description = EXCLUDED.meta_description,
       headings_json = EXCLUDED.headings_json,
       extracted_text = EXCLUDED.extracted_text,
       extracted_data_json = EXCLUDED.extracted_data_json,
       content_hash = EXCLUDED.content_hash,
       requires_browser = EXCLUDED.requires_browser,
       crawled_at = now()
     RETURNING *`,
    [
      crawlRunId,
      userId,
      businessId,
      url,
      fetchResult.finalUrl || url,
      extracted.canonical_url,
      pageType,
      fetchResult.status || 0,
      extracted.title,
      extracted.meta_description,
      JSON.stringify(extracted.headings_json),
      extracted.extracted_text,
      JSON.stringify(extracted.extracted_data_json),
      extracted.content_hash,
      Boolean(fetchResult.requires_browser),
    ],
  )

  const page = insert.rows[0]
  const chunks = chunkText(extracted.extracted_text)
  for (let i = 0; i < chunks.length; i += 1) {
    await query(
      `INSERT INTO website_text_chunks (user_id, business_id, page_id, chunk_index, content, metadata_json)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (page_id, chunk_index) DO UPDATE SET content = EXCLUDED.content`,
      [
        userId,
        businessId,
        page.id,
        i,
        chunks[i],
        JSON.stringify({ url, title: extracted.title, page_type: pageType }),
      ],
    )
  }

  return page
}

function buildCrawlQueue(startUrl, sitemapUrls, homepageLinks) {
  const seen = new Set()
  const queue = []

  function enqueue(url, depth) {
    const canonical = canonicalizeUrl(new URL(url)).href
    if (seen.has(canonical)) return
    seen.add(canonical)
    queue.push({ url: canonical, depth, priority: scoreUrlPriority(canonical) })
  }

  enqueue(startUrl, 0)
  for (const url of sitemapUrls.slice(0, 40)) enqueue(url, 1)
  for (const url of homepageLinks.slice(0, 20)) enqueue(url, 1)

  return queue.sort((a, b) => a.priority - b.priority || a.depth - b.depth)
}

async function crawlPages({
  crawlRun,
  userId,
  businessId,
  hostname,
  queue,
  maxPages,
  maxDepth,
  disallowRules,
}) {
  const pages = []
  const visitedCanonical = new Set()
  let discovered = queue.length
  let pagesFailed = 0

  const workers = []
  const pending = [...queue]

  async function processNext() {
    while (pages.length < maxPages) {
      const item = pending.shift()
      if (!item) return
      if (item.depth > maxDepth) continue

      let parsed
      try {
        parsed = await validatePublicUrl(item.url)
      } catch {
        continue
      }

      if (!sameOrigin(parsed.hostname, hostname)) continue
      if (isBlockedCrawlPath(parsed.pathname)) continue
      if (isPathDisallowed(parsed.pathname, disallowRules)) continue

      const canonical = canonicalizeUrl(parsed).href
      if (visitedCanonical.has(canonical)) continue
      visitedCanonical.add(canonical)

      const fetchResult = await fetchPage(parsed.href, {
        allowedHostname: hostname,
        userAgent: DEFAULT_UA,
      })

      if (!fetchResult.ok || !fetchResult.html) {
        pagesFailed += 1
        continue
      }

      const extracted = extractPage(fetchResult.html, fetchResult.finalUrl || parsed.href, hostname)
      const pageType = detectPageType(fetchResult.finalUrl || parsed.href)

      const page = await savePage({
        crawlRunId: crawlRun.id,
        userId,
        businessId,
        url: canonical,
        fetchResult,
        extracted,
        pageType,
      })
      pages.push(page)

      for (const link of extracted.extracted_data_json.internal_links || []) {
        if (pending.length + pages.length < maxPages * 3) {
          pending.push({ url: link, depth: item.depth + 1, priority: scoreUrlPriority(link) })
          discovered += 1
        }
      }

      pending.sort((a, b) => a.priority - b.priority || a.depth - b.depth)

      await updateCrawlRun(crawlRun.id, {
        pages_discovered: discovered,
        pages_crawled: pages.length,
      })
    }
  }

  const concurrency = Math.min(3, maxPages)
  for (let i = 0; i < concurrency; i += 1) {
    workers.push(processNext())
  }
  await Promise.all(workers)

  return { pages, pages_failed: pagesFailed, pages_discovered: discovered }
}

async function crawlBusinessWebsite({
  userId,
  businessId,
  startUrl,
  maxPages = DEFAULT_MAX_PAGES,
  maxDepth = DEFAULT_MAX_DEPTH,
  skipCache = false,
}) {
  const parsed = await validatePublicUrl(startUrl)
  const hostname = parsed.hostname.replace(/^www\./, '')
  const normalizedDomain = hostname.toLowerCase()
  const canonicalStart = canonicalizeUrl(parsed).href

  const dailyCount = await countDailyCrawls(userId)
  if (!skipCache && dailyCount >= DAILY_CRAWL_LIMIT) {
    const err = new Error('Daily crawl limit reached')
    err.code = 'CRAWL_LIMIT'
    throw err
  }

  if (!skipCache) {
    const cached = await findRecentCrawl(userId, businessId, normalizedDomain)
    if (cached) {
      const profileResult = await query(
        `SELECT * FROM business_web_profiles
         WHERE business_id = $1 AND crawl_run_id = $2
         ORDER BY created_at DESC LIMIT 1`,
        [businessId, cached.id],
      )
      const businessRow = await query(`SELECT * FROM businesses WHERE id = $1`, [businessId])
      const pages = await getCrawlPages(userId, cached.id)
      let profile = profileResult.rows[0] ? formatWebProfile(profileResult.rows[0]) : null
      if (profile && pages.length) {
        profile = await rehydrateWebProfileScores({
          profile,
          business: businessRow.rows[0],
          pages,
          crawlRun: cached,
          startUrl: cached.start_url || businessRow.rows[0]?.store_url,
        })
      }
      return {
        cached: true,
        crawlRun: cached,
        profile,
        pages,
      }
    }
  }

  await acquireCrawlSlot()
  let crawlRun
  try {
    crawlRun = await createCrawlRun({
      userId,
      businessId,
      startUrl: canonicalStart,
      normalizedDomain,
    })

    const robots = await fetchRobots(parsed.hostname, { userAgent: DEFAULT_UA })
    const sitemapUrls = await discoverSitemapUrls(parsed.hostname, robots.sitemaps, {
      userAgent: DEFAULT_UA,
    })

    const homeFetch = await fetchPage(canonicalStart, {
      allowedHostname: parsed.hostname,
      userAgent: DEFAULT_UA,
    })
    let homepageLinks = []
    if (homeFetch.ok && homeFetch.html) {
      const homeExtracted = extractPage(
        homeFetch.html,
        homeFetch.finalUrl || canonicalStart,
        parsed.hostname,
      )
      homepageLinks = homeExtracted.extracted_data_json.internal_links || []
    }

    const queue = buildCrawlQueue(canonicalStart, sitemapUrls, homepageLinks)
    const crawlResult = await crawlPages({
      crawlRun,
      userId,
      businessId,
      hostname: parsed.hostname,
      queue,
      maxPages: Math.min(maxPages, DEFAULT_MAX_PAGES),
      maxDepth: Math.min(maxDepth, DEFAULT_MAX_DEPTH),
      disallowRules: robots.disallow,
    })
    const pages = crawlResult.pages
    const pagesFailed = crawlResult.pages_failed
    const pagesDiscovered = crawlResult.pages_discovered

    const businessRow = await query(`SELECT * FROM businesses WHERE id = $1`, [businessId])
    const safetyResult = await checkUrlSafety(canonicalStart)
    const profile = await buildBusinessWebProfile({
      userId,
      businessId,
      business: businessRow.rows[0],
      crawlRunId: crawlRun.id,
      pages,
      startUrl: canonicalStart,
      crawlMeta: {
        homepage_fetch_ok: Boolean(homeFetch.ok && homeFetch.html),
        bot_protection_bypassed: Boolean(homeFetch.fetched_via_browser && homeFetch.bot_blocked),
        bot_blocked: Boolean(homeFetch.bot_blocked && !homeFetch.fetched_via_browser),
        crawl_blocked: Boolean(
          homeFetch.crawl_blocked || (homeFetch.bot_blocked && !homeFetch.fetched_via_browser),
        ),
        block_reason: homeFetch.block_reason || null,
        user_message: homeFetch.user_message || null,
        fetched_via_browser: Boolean(homeFetch.fetched_via_browser),
        pages_discovered: pagesDiscovered,
        pages_crawled: pages.length,
        pages_failed: pagesFailed,
        fetch_failures: pagesFailed,
      },
      safetyResult,
    })

    await updateCrawlRun(crawlRun.id, {
      status: 'completed',
      pages_discovered: pagesDiscovered,
      pages_crawled: pages.length,
      completed_at: new Date().toISOString(),
    })

    const updatedRun = await query(`SELECT * FROM website_crawl_runs WHERE id = $1`, [crawlRun.id])

    return {
      cached: false,
      crawlRun: updatedRun.rows[0],
      profile,
      pages,
    }
  } catch (err) {
    if (crawlRun?.id) {
      await updateCrawlRun(crawlRun.id, {
        status: 'failed',
        error_message: err.message,
        completed_at: new Date().toISOString(),
      })
    }
    throw err
  } finally {
    releaseCrawlSlot()
  }
}

async function getCrawlRun(userId, crawlId) {
  const result = await query(
    `SELECT * FROM website_crawl_runs WHERE id = $1 AND user_id = $2`,
    [crawlId, userId],
  )
  return result.rows[0] || null
}

async function listCrawlRuns(userId, businessId) {
  const result = await query(
    `SELECT * FROM website_crawl_runs
     WHERE user_id = $1 AND business_id = $2
     ORDER BY created_at DESC
     LIMIT 20`,
    [userId, businessId],
  )
  return result.rows
}

async function getCrawlPages(userId, crawlRunId) {
  const result = await query(
    `SELECT wp.* FROM website_pages wp
     JOIN website_crawl_runs wcr ON wcr.id = wp.crawl_run_id
     WHERE wcr.id = $1 AND wcr.user_id = $2
     ORDER BY wp.crawled_at ASC`,
    [crawlRunId, userId],
  )
  return result.rows
}

async function deleteCrawlData(userId, businessId) {
  await query(
    `DELETE FROM website_crawl_runs WHERE user_id = $1 AND business_id = $2`,
    [userId, businessId],
  )
}

module.exports = {
  crawlBusinessWebsite,
  getCrawlRun,
  listCrawlRuns,
  getCrawlPages,
  deleteCrawlData,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_DEPTH,
  DAILY_CRAWL_LIMIT,
}
