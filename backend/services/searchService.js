const { query } = require('../db')

const PROVIDER = (process.env.SEARCH_PROVIDER || 'mock').toLowerCase()
const DAILY_SEARCH_LIMIT = Number(process.env.DAILY_SEARCH_LIMIT || 20)
const CACHE_HOURS = 24

function normalizeResult(item, provider) {
  return {
    title: item.title || '',
    url: item.url || '',
    snippet: item.snippet || '',
    source: provider,
    provider,
    raw: item.raw ?? item,
  }
}

function buildMockResults(q) {
  const topic = q.slice(0, 80)
  return [
    normalizeResult(
      {
        title: `${topic} - market overview`,
        url: 'https://example.com/market-overview',
        snippet:
          'Growing demand in this category. Successful brands emphasize bundles, social proof, and fast shipping.',
        raw: { mock: true },
      },
      'mock',
    ),
    normalizeResult(
      {
        title: `Top ${topic} brand examples`,
        url: 'https://example.com/brand-examples',
        snippet:
          'Leading competitors invest in UGC, email retention flows, and clear product education content.',
        raw: { mock: true },
      },
      'mock',
    ),
    normalizeResult(
      {
        title: `${topic} ecommerce trends`,
        url: 'https://example.com/trends',
        snippet:
          'Trend signals: subscription offers, TikTok discovery, and trust pages (shipping, returns, reviews).',
        raw: { mock: true },
      },
      'mock',
    ),
  ]
}

async function getCachedSearch({ userId, businessId, q, provider }) {
  if (!userId) return null
  const result = await query(
    `SELECT result_json FROM research_events
     WHERE user_id = $1
       AND ($2::uuid IS NULL OR business_id = $2)
       AND query = $3
       AND provider = $4
       AND created_at > now() - ($5::text || ' hours')::interval
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, businessId || null, q, provider, String(CACHE_HOURS)],
  )
  const row = result.rows[0]
  if (!row?.result_json?.results) return null
  return {
    provider,
    query: q,
    cached: true,
    results: row.result_json.results,
    limit_reached: Boolean(row.result_json.limit_reached),
  }
}

async function countDailyApiCalls(userId) {
  if (!userId) return 0
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM research_events
     WHERE user_id = $1
       AND provider = 'google'
       AND COALESCE((result_json->>'api_call')::boolean, false) = true
       AND created_at > now() - interval '24 hours'`,
    [userId],
  )
  return result.rows[0]?.count || 0
}

async function saveSearchEvent({ userId, businessId, q, provider, payload }) {
  if (!userId) return
  await query(
    `INSERT INTO research_events (user_id, business_id, query, provider, result_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, businessId || null, q, provider, JSON.stringify(payload)],
  )
}

async function searchGoogleRaw(q, { limit = 5 } = {}) {
  const key = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_CX
  if (!key || !cx) {
    const err = new Error('Google Search API not configured. Set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX.')
    err.code = 'NOT_CONFIGURED'
    throw err
  }

  const url = new URL('https://www.googleapis.com/customsearch/v1')
  url.searchParams.set('key', key)
  url.searchParams.set('cx', cx)
  url.searchParams.set('q', q)
  url.searchParams.set('num', String(Math.min(limit, 10)))

  const res = await fetch(url)
  const data = await res.json()

  if (!res.ok) {
    const message = data.error?.message || 'Google search request failed'
    const err = new Error(message)
    err.code = data.error?.code === 429 ? 'QUOTA_EXCEEDED' : 'SEARCH_FAILED'
    throw err
  }

  return (data.items || []).map((item) =>
    normalizeResult(
      {
        title: item.title,
        url: item.link,
        snippet: item.snippet,
        raw: { displayLink: item.displayLink },
      },
      'google',
    ),
  )
}

async function searchWeb(searchQuery, options = {}) {
  const q = String(searchQuery || '').trim()
  const provider = (options.provider || PROVIDER).toLowerCase()
  const limit = options.limit || 5
  const userId = options.userId || null
  const businessId = options.businessId || null
  const skipCache = Boolean(options.skipCache)

  if (!q) {
    return { provider, query: '', cached: false, results: [], limit_reached: false }
  }

  if (!skipCache && userId) {
    const cached = await getCachedSearch({ userId, businessId, q, provider })
    if (cached) return cached
  }

  if (provider === 'mock') {
    const results = buildMockResults(q).slice(0, limit)
    const payload = { results, api_call: false, cached: false, limit_reached: false }
    await saveSearchEvent({ userId, businessId, q, provider: 'mock', payload })
    return { provider: 'mock', query: q, cached: false, limit_reached: false, results }
  }

  if (provider === 'google') {
    const dailyCount = userId ? await countDailyApiCalls(userId) : 0
    if (userId && dailyCount >= DAILY_SEARCH_LIMIT) {
      const staleCache = await getCachedSearch({ userId, businessId, q, provider: 'google' })
      if (staleCache) {
        return { ...staleCache, limit_reached: true }
      }
      const results = buildMockResults(q).slice(0, limit)
      const payload = {
        results,
        api_call: false,
        cached: false,
        limit_reached: true,
        note: 'Daily search limit reached - mock fallback',
      }
      await saveSearchEvent({ userId, businessId, q, provider: 'mock', payload })
      return {
        provider: 'mock',
        query: q,
        cached: false,
        limit_reached: true,
        results,
      }
    }

    try {
      const results = (await searchGoogleRaw(q, { limit })).slice(0, limit)
      const payload = { results, api_call: true, cached: false, limit_reached: false }
      await saveSearchEvent({ userId, businessId, q, provider: 'google', payload })
      return { provider: 'google', query: q, cached: false, limit_reached: false, results }
    } catch (err) {
      console.warn('Google search error:', err.message)
      const staleCache = await getCachedSearch({ userId, businessId, q, provider: 'google' })
      if (staleCache) {
        return { ...staleCache, error: err.message }
      }
      const results = buildMockResults(q).slice(0, limit)
      const payload = {
        results,
        api_call: false,
        cached: false,
        limit_reached: false,
        error: err.message,
        fallback: 'mock',
      }
      await saveSearchEvent({ userId, businessId, q, provider: 'mock', payload })
      return {
        provider: 'mock',
        query: q,
        cached: false,
        limit_reached: false,
        results,
        error: err.message,
      }
    }
  }

  const results = buildMockResults(q).slice(0, limit)
  return { provider: 'mock', query: q, cached: false, limit_reached: false, results }
}

module.exports = { searchWeb, DAILY_SEARCH_LIMIT }
