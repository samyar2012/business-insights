const { fetchPage } = require('./pageFetcher')

const PAGE_PRIORITY_PATTERNS = [
  { type: 'homepage', patterns: [/^\/$/, /^\/home\/?$/i] },
  { type: 'products', patterns: [/\/products?\b/i, /\/shop\b/i, /\/collections?\b/i, /\/catalog\b/i] },
  { type: 'services', patterns: [/\/services?\b/i] },
  { type: 'pricing', patterns: [/\/pricing\b/i, /\/plans?\b/i] },
  { type: 'about', patterns: [/\/about\b/i, /\/our-story\b/i, /\/story\b/i] },
  { type: 'contact', patterns: [/\/contact\b/i, /\/support\b/i] },
  { type: 'reviews', patterns: [/\/reviews?\b/i, /\/testimonials?\b/i] },
  { type: 'faq', patterns: [/\/faq\b/i, /\/help\b/i] },
  { type: 'shipping', patterns: [/\/shipping\b/i, /\/delivery\b/i] },
  { type: 'returns', patterns: [/\/returns?\b/i, /\/refunds?\b/i] },
  { type: 'privacy', patterns: [/\/privacy\b/i] },
  { type: 'terms', patterns: [/\/terms\b/i, /\/tos\b/i] },
  { type: 'blog', patterns: [/\/blog\b/i, /\/articles?\b/i, /\/news\b/i] },
]

function detectPageType(url) {
  let pathname = '/'
  try {
    pathname = new URL(url).pathname
  } catch {
    return 'unknown'
  }
  for (const entry of PAGE_PRIORITY_PATTERNS) {
    if (entry.patterns.some((p) => p.test(pathname))) return entry.type
  }
  return 'page'
}

function scoreUrlPriority(url) {
  const type = detectPageType(url)
  const order = PAGE_PRIORITY_PATTERNS.map((p) => p.type)
  const idx = order.indexOf(type)
  return idx === -1 ? 50 : idx
}

function parseSitemapXml(xml, hostname) {
  const urls = []
  const locMatches = String(xml || '').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)
  for (const match of locMatches) {
    try {
      const url = new URL(match[1].trim())
      if (url.hostname.replace(/^www\./, '') === hostname.replace(/^www\./, '')) {
        urls.push(url.href)
      }
    } catch {
      // skip
    }
  }

  const isIndex = /<sitemapindex/i.test(xml)
  return { urls, isIndex }
}

async function fetchSitemapUrls(sitemapUrl, hostname, options = {}) {
  const visited = new Set()
  const collected = []

  async function walk(url, depth = 0) {
    if (depth > 3 || visited.has(url)) return
    visited.add(url)

    const result = await fetchPage(url, {
      allowedHostname: hostname,
      userAgent: options.userAgent,
      skipDelay: true,
    })
    if (!result.ok || !result.html) return

    const { urls, isIndex } = parseSitemapXml(result.html, hostname)
    if (isIndex) {
      for (const child of urls.slice(0, 10)) {
        await walk(child, depth + 1)
      }
    } else {
      collected.push(...urls)
    }
  }

  await walk(sitemapUrl)
  return [...new Set(collected)]
}

async function discoverSitemapUrls(hostname, robotsSitemaps = [], options = {}) {
  const candidates = [...new Set(robotsSitemaps)]
  if (candidates.length === 0) {
    candidates.push(`https://${hostname}/sitemap.xml`)
  }

  const allUrls = []
  for (const sitemapUrl of candidates.slice(0, 5)) {
    try {
      const urls = await fetchSitemapUrls(sitemapUrl, hostname, options)
      allUrls.push(...urls)
    } catch {
      // continue
    }
  }

  return [...new Set(allUrls)].sort((a, b) => scoreUrlPriority(a) - scoreUrlPriority(b))
}

module.exports = {
  PAGE_PRIORITY_PATTERNS,
  detectPageType,
  scoreUrlPriority,
  parseSitemapXml,
  discoverSitemapUrls,
}
