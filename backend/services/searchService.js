const PROVIDER = (process.env.SEARCH_PROVIDER || 'mock').toLowerCase()

async function searchMock(query) {
  return {
    provider: 'mock',
    query,
    results: [
      {
        title: `Market snapshot: ${query}`,
        url: 'https://example.com/research',
        snippet:
          'Mock search result. Configure SEARCH_PROVIDER and API keys for live web results.',
      },
      {
        title: 'Industry trends overview',
        url: 'https://example.com/trends',
        snippet: 'Competitors are leaning on bundles, UGC, and faster shipping promises.',
      },
    ],
  }
}

async function searchGoogle(query, { limit = 5 } = {}) {
  const key = process.env.GOOGLE_SEARCH_API_KEY
  const cx = process.env.GOOGLE_SEARCH_CX
  if (!key || !cx) throw new Error('Google Search not configured')

  const url = new URL('https://www.googleapis.com/customsearch/v1')
  url.searchParams.set('key', key)
  url.searchParams.set('cx', cx)
  url.searchParams.set('q', query)
  url.searchParams.set('num', String(Math.min(limit, 10)))

  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Google search failed')

  return {
    provider: 'google',
    query,
    results: (data.items || []).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    })),
  }
}

async function searchSerpApi(query, { limit = 5 } = {}) {
  const key = process.env.SERPAPI_API_KEY
  if (!key) throw new Error('SerpAPI not configured')

  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('api_key', key)
  url.searchParams.set('q', query)
  url.searchParams.set('num', String(limit))

  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data.error || 'SerpAPI search failed')

  return {
    provider: 'serpapi',
    query,
    results: (data.organic_results || []).slice(0, limit).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
    })),
  }
}

async function searchBrave(query, { limit = 5 } = {}) {
  const key = process.env.BRAVE_SEARCH_API_KEY
  if (!key) throw new Error('Brave Search not configured')

  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(limit))

  const res = await fetch(url, { headers: { 'X-Subscription-Token': key } })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || 'Brave search failed')

  return {
    provider: 'brave',
    query,
    results: (data.web?.results || []).slice(0, limit).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.description,
    })),
  }
}

async function searchTavily(query, { limit = 5 } = {}) {
  const key = process.env.TAVILY_API_KEY
  if (!key) throw new Error('Tavily not configured')

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: key, query, max_results: limit }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Tavily search failed')

  return {
    provider: 'tavily',
    query,
    results: (data.results || []).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.content,
    })),
  }
}

async function searchWeb(query, options = {}) {
  const q = String(query || '').trim()
  if (!q) return { provider: PROVIDER, query: '', results: [] }

  const provider = (options.provider || PROVIDER).toLowerCase()

  try {
    if (provider === 'google') return await searchGoogle(q, options)
    if (provider === 'serpapi') return await searchSerpApi(q, options)
    if (provider === 'brave') return await searchBrave(q, options)
    if (provider === 'tavily') return await searchTavily(q, options)
    return await searchMock(q)
  } catch (err) {
    if (provider !== 'mock') {
      console.warn('search fallback to mock:', err.message)
      return searchMock(q)
    }
    throw err
  }
}

module.exports = { searchWeb }
