const FETCH_TIMEOUT_MS = 12000
const MAX_TEXT_SAMPLE = 2500
const MAX_EXTRA_PAGES = 4

const SOCIAL_HOSTS = [
  'instagram.com',
  'tiktok.com',
  'facebook.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'pinterest.com',
]

const POLICY_HINTS = [
  { key: 'shipping_policy', patterns: [/ship/i, /delivery/i] },
  { key: 'return_policy', patterns: [/return/i, /refund/i] },
  { key: 'privacy_policy', patterns: [/privacy/i] },
  { key: 'contact_page', patterns: [/contact/i, /support/i] },
  { key: 'about_page', patterns: [/about/i, /our-story/i, /story/i] },
]

function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  try {
    return new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTag(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = html.match(re)
  return match ? stripHtml(match[1]) : ''
}

function extractMeta(html, name) {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`,
    'i',
  )
  const match = html.match(re)
  if (match) return match[1].trim()
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    'i',
  )
  const match2 = html.match(re2)
  return match2 ? match2[1].trim() : ''
}

function extractHeadings(html, tag, limit = 6) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi')
  const out = []
  let match
  while ((match = re.exec(html)) && out.length < limit) {
    const text = stripHtml(match[1])
    if (text) out.push(text)
  }
  return out
}

function extractLinks(html, baseUrl) {
  const links = []
  const re = /<a[^>]+href=["']([^"']+)["']/gi
  let match
  while ((match = re.exec(html))) {
    try {
      const href = match[1].trim()
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        continue
      }
      const url = new URL(href, baseUrl).href
      links.push(url)
    } catch {
      // skip invalid
    }
  }
  return [...new Set(links)]
}

function detectSocialLinks(links) {
  return links.filter((url) => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '')
      return SOCIAL_HOSTS.some((s) => host.includes(s))
    } catch {
      return false
    }
  })
}

function detectPolicyPages(links) {
  const found = {}
  for (const link of links) {
    let path = ''
    try {
      path = new URL(link).pathname + new URL(link).hash
    } catch {
      continue
    }
    for (const hint of POLICY_HINTS) {
      if (found[hint.key]) continue
      if (hint.patterns.some((p) => p.test(path) || p.test(link))) {
        found[hint.key] = link
      }
    }
  }
  return found
}

function keywordHits(text, keywords) {
  const lower = text.toLowerCase()
  return keywords.filter((k) => lower.includes(k.toLowerCase()))
}

async function fetchHtml(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'BusinessInsights-Research/1.0 (+https://business-insights.local)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    const html = await res.text()
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      html: html.slice(0, 500000),
    }
  } catch (err) {
    return { ok: false, status: 0, finalUrl: url, error: err.message, html: '' }
  } finally {
    clearTimeout(timer)
  }
}

function parsePage(html, pageUrl) {
  const visibleText = stripHtml(html).slice(0, MAX_TEXT_SAMPLE)
  const links = extractLinks(html, pageUrl)
  const policyPages = detectPolicyPages(links)
  const socialLinks = detectSocialLinks(links)

  const productKeywords = keywordHits(visibleText, [
    'shop',
    'buy',
    'product',
    'collection',
    'add to cart',
    'price',
    'subscribe',
    'book now',
  ])
  const trustKeywords = keywordHits(visibleText, [
    'review',
    'testimonial',
    'trusted',
    'guarantee',
    'secure checkout',
    'customer',
  ])
  const ctaKeywords = keywordHits(visibleText, [
    'buy',
    'shop',
    'book',
    'start',
    'subscribe',
    'get started',
    'order',
  ])

  return {
    url: pageUrl,
    title: extractTag(html, 'title'),
    meta_description: extractMeta(html, 'description') || extractMeta(html, 'og:description'),
    h1: extractHeadings(html, 'h1'),
    h2: extractHeadings(html, 'h2'),
    text_sample: visibleText,
    text_length: visibleText.length,
    links_count: links.length,
    links: links.slice(0, 40),
    social_links: socialLinks,
    policy_pages: policyPages,
    product_keywords: productKeywords,
    trust_keywords: trustKeywords,
    cta_keywords: ctaKeywords,
    blog_links: links.filter((l) => /blog|article|news|journal/i.test(l)).slice(0, 5),
  }
}

async function scanWebsite(storeUrl) {
  const parsed = normalizeUrl(storeUrl)
  if (!parsed) {
    return { status: 'invalid_url', url: storeUrl, pages: [], summary: {} }
  }

  const homepage = await fetchHtml(parsed.href)
  if (!homepage.ok || !homepage.html) {
    return {
      status: 'fetch_failed',
      url: parsed.href,
      https: parsed.protocol === 'https:',
      error: homepage.error || `HTTP ${homepage.status}`,
      pages: [],
      summary: {},
    }
  }

  const homeData = parsePage(homepage.html, homepage.finalUrl || parsed.href)
  const pages = [homeData]

  const policyTargets = Object.values(homeData.policy_pages).slice(0, MAX_EXTRA_PAGES)
  for (const target of policyTargets) {
    if (pages.length >= MAX_EXTRA_PAGES + 1) break
    if (pages.some((p) => p.url === target)) continue
    const fetched = await fetchHtml(target)
    if (fetched.ok && fetched.html) {
      pages.push(parsePage(fetched.html, fetched.finalUrl || target))
    }
  }

  const allText = pages.map((p) => p.text_sample).join(' ')
  const allPolicies = pages.reduce((acc, p) => ({ ...acc, ...p.policy_pages }), {})
  const allSocial = [...new Set(pages.flatMap((p) => p.social_links))]

  const summary = {
    https: parsed.protocol === 'https:',
    title: homeData.title,
    meta_description: homeData.meta_description,
    h1: homeData.h1[0] || null,
    h2_count: homeData.h2.length,
    text_length: allText.length,
    social_links: allSocial,
    policy_pages: allPolicies,
    has_shipping_policy: Boolean(allPolicies.shipping_policy),
    has_return_policy: Boolean(allPolicies.return_policy),
    has_privacy_policy: Boolean(allPolicies.privacy_policy),
    has_contact_page: Boolean(allPolicies.contact_page),
    has_about_page: Boolean(allPolicies.about_page),
    product_keywords: [...new Set(pages.flatMap((p) => p.product_keywords))],
    trust_keywords: [...new Set(pages.flatMap((p) => p.trust_keywords))],
    cta_keywords: [...new Set(pages.flatMap((p) => p.cta_keywords))],
    blog_links: [...new Set(pages.flatMap((p) => p.blog_links))].slice(0, 5),
  }

  return {
    status: 'ok',
    url: parsed.href,
    https: summary.https,
    pages_scanned: pages.length,
    pages,
    summary,
  }
}

module.exports = { scanWebsite, normalizeUrl }
