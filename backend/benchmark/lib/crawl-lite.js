const {
  validatePublicUrl,
  canonicalizeUrl,
  sameOrigin,
  isBlockedCrawlPath,
} = require('../../services/crawler/urlSecurity')
const { DEFAULT_UA } = require('../../services/crawler/crawlerConfig')
const { fetchRobots, isPathDisallowed } = require('../../services/crawler/robotsService')
const { discoverSitemapUrls, detectPageType, scoreUrlPriority } = require('../../services/crawler/sitemapService')
const { fetchPage } = require('../../services/crawler/pageFetcher')
const { extractPage } = require('../../services/crawler/pageExtractor')

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
  for (const url of sitemapUrls.slice(0, 30)) enqueue(url, 1)
  for (const url of homepageLinks.slice(0, 15)) enqueue(url, 1)

  return queue.sort((a, b) => a.priority - b.priority || a.depth - b.depth)
}

function toPageRecord({ url, fetchResult, extracted, pageType }) {
  return {
    url,
    final_url: fetchResult.finalUrl || url,
    status_code: fetchResult.status || 0,
    page_type: pageType,
    title: extracted.title || null,
    meta_description: extracted.meta_description || null,
    extracted_text: extracted.extracted_text || '',
    extracted_data_json: extracted.extracted_data_json || {},
    headings_json: extracted.headings_json || {},
    content_hash: extracted.content_hash || null,
    requires_browser: Boolean(fetchResult.requires_browser),
  }
}

async function crawlWebsiteLite(startUrl, { maxPages = 8, maxDepth = 2 } = {}) {
  const parsed = await validatePublicUrl(startUrl)
  const hostname = parsed.hostname
  const canonicalStart = canonicalizeUrl(parsed).href

  const robots = await fetchRobots(hostname, { userAgent: DEFAULT_UA })
  const sitemapUrls = await discoverSitemapUrls(hostname, robots.sitemaps, { userAgent: DEFAULT_UA })

  const homeFetch = await fetchPage(canonicalStart, {
    allowedHostname: hostname,
    userAgent: DEFAULT_UA,
  })

  let homepageLinks = []
  if (homeFetch.ok && homeFetch.html) {
    const homeExtracted = extractPage(homeFetch.html, homeFetch.finalUrl || canonicalStart, hostname)
    homepageLinks = homeExtracted.extracted_data_json.internal_links || []
  }

  const queue = buildCrawlQueue(canonicalStart, sitemapUrls, homepageLinks)
  const pages = []
  const visitedCanonical = new Set()
  let pagesFailed = 0

  for (const item of queue) {
    if (pages.length >= maxPages) break
    if (item.depth > maxDepth) continue

    let itemParsed
    try {
      itemParsed = await validatePublicUrl(item.url)
    } catch {
      continue
    }

    if (!sameOrigin(itemParsed.hostname, hostname)) continue
    if (isBlockedCrawlPath(itemParsed.pathname)) continue
    if (isPathDisallowed(itemParsed.pathname, robots.disallow || [])) continue

    const canonical = canonicalizeUrl(itemParsed).href
    if (visitedCanonical.has(canonical)) continue
    visitedCanonical.add(canonical)

    const fetchResult = await fetchPage(itemParsed.href, {
      allowedHostname: hostname,
      userAgent: DEFAULT_UA,
    })

    if (!fetchResult.ok || !fetchResult.html) {
      pagesFailed += 1
      continue
    }

    const extracted = extractPage(fetchResult.html, fetchResult.finalUrl || itemParsed.href, hostname)
    const pageType = detectPageType(fetchResult.finalUrl || itemParsed.href)
    pages.push(
      toPageRecord({
        url: canonical,
        fetchResult,
        extracted,
        pageType,
      }),
    )
  }

  return {
    startUrl: canonicalStart,
    hostname: hostname.replace(/^www\./, ''),
    pages,
    pages_failed: pagesFailed,
    pages_discovered: queue.length,
    pages_crawled: pages.length,
    homepage_fetch_ok: Boolean(homeFetch.ok && homeFetch.html),
  }
}

module.exports = {
  crawlWebsiteLite,
}
