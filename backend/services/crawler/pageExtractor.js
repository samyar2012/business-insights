const cheerio = require('cheerio')
const crypto = require('crypto')
const { canonicalizeUrl } = require('./urlSecurity')

const SOCIAL_HOSTS = [
  'instagram.com',
  'tiktok.com',
  'facebook.com',
  'youtube.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'pinterest.com',
  'etsy.com',
]

const COOKIE_BANNER_PATTERNS = [
  /cookie/i,
  /gdpr/i,
  /consent/i,
  /accept all/i,
]

function hashContent(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex')
}

function cleanText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isCookieBannerText(text) {
  const sample = text.slice(0, 200)
  return COOKIE_BANNER_PATTERNS.some((p) => p.test(sample)) && text.length < 800
}

function extractJsonLd($) {
  const items = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).html() || '{}')
      items.push(parsed)
    } catch {
      // skip invalid JSON-LD
    }
  })
  return items
}

function extractOpenGraph($) {
  const og = {}
  $('meta[property^="og:"]').each((_, el) => {
    const key = $(el).attr('property')
    const value = $(el).attr('content')
    if (key && value) og[key] = value
  })
  return og
}

function detectPlatform($, html, url) {
  const lower = String(html || '').toLowerCase()
  const host = (() => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  })()

  if (lower.includes('cdn.shopify.com') || lower.includes('shopify')) return 'Shopify'
  if (lower.includes('woocommerce') || lower.includes('wp-content')) return 'WooCommerce'
  if (lower.includes('wix.com') || host.endsWith('wixsite.com')) return 'Wix'
  if (lower.includes('squarespace')) return 'Squarespace'
  if (host.includes('etsy.com')) return 'Etsy'
  if (lower.includes('bigcommerce')) return 'BigCommerce'
  if ($('[data-product], .product, .product-card, .add-to-cart').length > 0) return 'custom storefront'
  return 'unknown'
}

function extractPrices(text) {
  const matches = text.match(
    /(?:USD|EUR|GBP|CAD|AUD|\$|€|£)\s?\d{1,5}(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?\s?(?:USD|EUR|GBP)/gi,
  )
  return [...new Set((matches || []).slice(0, 20))]
}

function extractEmailsAndContacts($, baseUrl) {
  const emails = new Set()
  const phones = new Set()
  const contacts = []

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const email = href.replace(/^mailto:/i, '').split('?')[0]
    if (email) emails.add(email)
  })

  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const phone = href.replace(/^tel:/i, '')
    if (phone) phones.add(phone)
  })

  const text = cleanText($('body').text())
  const emailMatches = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []
  emailMatches.slice(0, 5).forEach((e) => emails.add(e))

  return {
    emails: [...emails],
    phones: [...phones],
    contact_links: contacts,
  }
}

function extractLinks($, baseUrl, allowedHostname) {
  const internal = new Set()
  const social = new Set()
  const navLabels = []

  $('nav a, header a').each((_, el) => {
    const label = cleanText($(el).text())
    if (label && label.length < 60) navLabels.push(label)
  })

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim()
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return
    try {
      const url = new URL(href, baseUrl)
      const host = url.hostname.replace(/^www\./, '')
      const allowed = allowedHostname.replace(/^www\./, '')
      if (host === allowed) {
        internal.add(canonicalizeUrl(url).href)
      } else if (SOCIAL_HOSTS.some((s) => host.includes(s))) {
        social.add(url.href)
      }
    } catch {
      // skip
    }
  })

  return {
    internal_links: [...internal],
    social_links: [...social],
    navigation_labels: [...new Set(navLabels)].slice(0, 30),
  }
}

function extractProducts($) {
  const names = new Set()
  $('[itemprop="name"], .product-title, .product__title, .product-name, h2, h3').each((_, el) => {
    const text = cleanText($(el).text())
    if (text.length >= 3 && text.length <= 120) names.add(text)
  })
  return [...names].slice(0, 30)
}

function extractCtas($) {
  const ctas = []
  $('a, button').each((_, el) => {
    const text = cleanText($(el).text())
    if (!text || text.length > 40) return
    if (/buy|shop|order|subscribe|book|get started|add to cart|learn more/i.test(text)) {
      ctas.push(text)
    }
  })
  return [...new Set(ctas)].slice(0, 15)
}

function extractPolicyIndicators(text, links) {
  const lower = text.toLowerCase()
  return {
    shipping: /shipping|delivery/i.test(lower) || links.some((l) => /ship|delivery/i.test(l)),
    returns: /return|refund/i.test(lower) || links.some((l) => /return|refund/i.test(l)),
    privacy: /privacy/i.test(lower) || links.some((l) => /privacy/i.test(l)),
    terms: /terms|conditions/i.test(lower) || links.some((l) => /terms/i.test(l)),
  }
}

function extractPage(html, pageUrl, allowedHostname) {
  const $ = cheerio.load(html || '')
  $('script, style, noscript').remove()

  const title = cleanText($('title').first().text())
  const metaDescription =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    ''

  let canonicalUrl = null
  const canonicalHref = $('link[rel="canonical"]').attr('href')
  if (canonicalHref) {
    try {
      canonicalUrl = canonicalizeUrl(new URL(canonicalHref, pageUrl)).href
    } catch {
      canonicalUrl = null
    }
  }

  const headings = { h1: [], h2: [], h3: [] }
  ;['h1', 'h2', 'h3'].forEach((tag) => {
    $(tag).each((_, el) => {
      const text = cleanText($(el).text())
      if (text && !isCookieBannerText(text)) headings[tag].push(text)
    })
    headings[tag] = headings[tag].slice(0, 10)
  })

  const bodyText = cleanText($('body').text())
  const extractedText = isCookieBannerText(bodyText) ? '' : bodyText.slice(0, 12000)

  const links = extractLinks($, pageUrl, allowedHostname)
  const contacts = extractEmailsAndContacts($, pageUrl)
  const jsonLd = extractJsonLd($)
  const openGraph = extractOpenGraph($)
  const platform = detectPlatform($, html, pageUrl)
  const products = extractProducts($)
  const prices = extractPrices(extractedText)
  const ctas = extractCtas($)
  const policies = extractPolicyIndicators(extractedText, links.internal_links)
  const reviewIndicators = /review|testimonial|rated|stars|trustpilot/i.test(extractedText)
  const newsletterIndicators = /newsletter|subscribe|join our list|email list/i.test(extractedText)

  const extractedData = {
    social_links: links.social_links,
    internal_links: links.internal_links.slice(0, 50),
    navigation_labels: links.navigation_labels,
    emails: contacts.emails,
    phones: contacts.phones,
    products,
    prices,
    ctas,
    json_ld: jsonLd,
    open_graph: openGraph,
    platform,
    policies,
    review_indicators: reviewIndicators,
    newsletter_indicators: newsletterIndicators,
  }

  return {
    title,
    meta_description: cleanText(metaDescription),
    canonical_url: canonicalUrl,
    headings_json: [...headings.h1, ...headings.h2, ...headings.h3].map((text, i) => ({
      level: i < headings.h1.length ? 1 : i < headings.h1.length + headings.h2.length ? 2 : 3,
      text,
    })),
    headings,
    extracted_text: extractedText,
    extracted_data_json: extractedData,
    content_hash: hashContent(extractedText || title),
    platform,
  }
}

function chunkText(text, chunkSize = 500) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const chunks = []
  let current = []

  for (const word of words) {
    current.push(word)
    if (current.join(' ').length >= chunkSize) {
      chunks.push(current.join(' '))
      current = []
    }
  }
  if (current.length) chunks.push(current.join(' '))
  return chunks.length ? chunks : text ? [text] : []
}

module.exports = {
  extractPage,
  hashContent,
  chunkText,
  detectPlatform,
  cleanText,
}
