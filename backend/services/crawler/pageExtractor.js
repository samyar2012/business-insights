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
]

const MARKETPLACE_HOSTS = [
  'amazon.com',
  'amazon.co.uk',
  'amazon.ca',
  'amazon.de',
  'ebay.com',
  'walmart.com',
  'aliexpress.com',
  'alibaba.com',
  'target.com',
  'wayfair.com',
]

const COOKIE_BANNER_PATTERNS = [
  /cookie/i,
  /gdpr/i,
  /consent/i,
  /accept all/i,
]

const NON_PRODUCT_NAME_PATTERNS = [
  /^(shop|buy|sale|new arrivals|best sellers|featured|trending|popular|top rated)/i,
  /^(you may also like|customers also|recommended|related products|sponsored|advertisement)/i,
  /^(browse|categories|departments|collections|sign in|cart|checkout|subscribe|newsletter)/i,
  /^(free shipping|limited time|shop now|learn more|view all|see all)/i,
  /^(men|women|kids|home|electronics|gift cards|deals|clearance)$/i,
]

const PRODUCT_CARD_SELECTORS = [
  '.product-card',
  '.product-item',
  '.product-grid-item',
  '.collection-product',
  '[data-product-id]',
  '[data-product-handle]',
  '.grid__item .card-wrapper',
  '.product-card-wrapper',
  'li.product',
  '.woocommerce-LoopProduct-link',
  '.product-small',
  '.card--product',
]

const EXCLUDED_ANCESTOR_SELECTORS =
  'nav, header, footer, aside, [role="navigation"], [class*="promo"], [class*="banner"], [class*="recommend"], [class*="carousel"], [class*="newsletter"], [class*="cookie"], [class*="advert"], [class*="sponsor"], [id*="cookie"]'

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

function normalizeProductName(name) {
  return cleanText(name).toLowerCase()
}

function isValidProductName(name, navLabels = []) {
  const text = cleanText(name)
  if (text.length < 3 || text.length > 120) return false
  if (NON_PRODUCT_NAME_PATTERNS.some((p) => p.test(text))) return false
  const normalized = normalizeProductName(text)
  if (navLabels.some((n) => normalizeProductName(n) === normalized)) return false
  if (/^\$|€|£/.test(text)) return false
  if (/^\d+([.,]\d{2})?$/.test(text)) return false
  return true
}

function isInsideExcludedRegion($, el) {
  return $(el).closest(EXCLUDED_ANCESTOR_SELECTORS).length > 0
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

function flattenJsonLdNodes(items) {
  const nodes = []
  const visit = (node) => {
    if (!node) return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (typeof node !== 'object') return
    nodes.push(node)
    if (node['@graph']) visit(node['@graph'])
    if (node.itemListElement) visit(node.itemListElement)
    if (node.hasVariant) visit(node.hasVariant)
    if (node.variesBy) visit(node.variesBy)
  }
  items.forEach(visit)
  return nodes
}

function jsonLdTypeMatches(type, expected) {
  if (!type) return false
  const types = Array.isArray(type) ? type : [type]
  return types.some((t) => String(t).toLowerCase().includes(expected))
}

function parseJsonLdPrice(offers) {
  if (!offers) return null
  const offer = Array.isArray(offers) ? offers[0] : offers
  if (!offer) return null
  const price = offer.price ?? offer.lowPrice ?? offer.highPrice
  const currency = offer.priceCurrency || ''
  if (price == null) return null
  return currency ? `${currency} ${price}` : String(price)
}

function parseJsonLdImage(image) {
  if (!image) return null
  if (typeof image === 'string') return image
  if (Array.isArray(image)) return parseJsonLdImage(image[0])
  if (image.url) return image.url
  return null
}

function buildProductRecord({ name, price, image, url, source, confidence, signals = {} }) {
  return {
    name: cleanText(name),
    price: price || null,
    image: image || null,
    url: url || null,
    source,
    confidence: Math.max(0, Math.min(100, Math.round(confidence))),
    signals: {
      has_price: Boolean(price),
      has_image: Boolean(image),
      has_link: Boolean(url),
      add_to_cart: Boolean(signals.add_to_cart),
      variants: Boolean(signals.variants),
      availability: signals.availability || null,
      reviews: Boolean(signals.reviews),
    },
  }
}

function extractProductsFromJsonLd(jsonLdItems, baseUrl) {
  const products = []
  const nodes = flattenJsonLdNodes(jsonLdItems)

  for (const node of nodes) {
    const type = node['@type']
    if (jsonLdTypeMatches(type, 'productgroup')) {
      const variants = node.hasVariant || node.variesBy || []
      const variantList = Array.isArray(variants) ? variants : [variants]
      for (const variant of variantList) {
        if (!variant || typeof variant !== 'object') continue
        const name = variant.name || node.name
        if (!name || !isValidProductName(name)) continue
        products.push(
          buildProductRecord({
            name,
            price: parseJsonLdPrice(variant.offers || node.offers),
            image: parseJsonLdImage(variant.image || node.image),
            url: variant.url || node.url || null,
            source: 'json_ld_product_group',
            confidence: 88,
            signals: {
              variants: true,
              availability: variant.availability || node.availability || null,
              reviews: Boolean(variant.aggregateRating || node.aggregateRating),
            },
          }),
        )
      }
      continue
    }

    if (jsonLdTypeMatches(type, 'product')) {
      const name = node.name
      if (!name || !isValidProductName(name)) continue
      products.push(
        buildProductRecord({
          name,
          price: parseJsonLdPrice(node.offers),
          image: parseJsonLdImage(node.image),
          url: node.url || null,
          source: 'json_ld_product',
          confidence: 92,
          signals: {
            variants: Boolean(node.hasVariant || node.variesBy),
            availability: node.availability || null,
            reviews: Boolean(node.aggregateRating),
          },
        }),
      )
      continue
    }

    if (jsonLdTypeMatches(type, 'itemlist')) {
      const elements = node.itemListElement || []
      for (const entry of elements) {
        const item = entry?.item || entry
        if (!item || typeof item !== 'object') continue
        const itemType = item['@type']
        if (!jsonLdTypeMatches(itemType, 'product') && !item.name) continue
        const name = item.name
        if (!name || !isValidProductName(name)) continue
        products.push(
          buildProductRecord({
            name,
            price: parseJsonLdPrice(item.offers),
            image: parseJsonLdImage(item.image),
            url: item.url || entry.url || null,
            source: 'json_ld_item_list',
            confidence: 80,
            signals: {
              reviews: Boolean(item.aggregateRating),
            },
          }),
        )
      }
    }
  }

  return products
}

function extractPriceFromElement($, el) {
  const priceText = cleanText(
    $(el)
      .find(
        '[itemprop="price"], .price, .product-price, .product__price, .money, .woocommerce-Price-amount, [class*="price"]',
      )
      .first()
      .text(),
  )
  if (!priceText) return null
  const match = priceText.match(
    /(?:USD|EUR|GBP|CAD|AUD|\$|€|£)\s?\d{1,5}(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?\s?(?:USD|EUR|GBP)/i,
  )
  return match ? match[0] : null
}

function extractImageFromElement($, el, baseUrl) {
  const img = $(el).find('img[src], img[data-src]').first()
  const src = img.attr('src') || img.attr('data-src')
  if (!src) return null
  try {
    return canonicalizeUrl(new URL(src, baseUrl)).href
  } catch {
    return src
  }
}

function extractProductLinkFromElement($, el, baseUrl) {
  const href =
    $(el).find('a[href*="/products"], a[href*="/product/"], a[href*="/collections/"]').attr('href') ||
    $(el).closest('a[href]').attr('href') ||
    $(el).find('a[href]').first().attr('href')
  if (!href) return null
  try {
    return canonicalizeUrl(new URL(href, baseUrl)).href
  } catch {
    return href
  }
}

function scoreCardConfidence({ price, image, link, addToCart }) {
  let confidence = 45
  const signals = [price, image, link].filter(Boolean).length
  if (signals >= 3) confidence = 82
  else if (signals === 2 && price) confidence = 74
  else if (signals === 2) confidence = 62
  else confidence = 0
  if (addToCart) confidence += 8
  return Math.min(confidence, 90)
}

function extractProductsFromCards($, baseUrl, navLabels) {
  const products = []
  const seen = new Set()

  for (const selector of PRODUCT_CARD_SELECTORS) {
    $(selector).each((_, el) => {
      if (isInsideExcludedRegion($, el)) return

      const $card = $(el)
      const name = cleanText(
        $card
          .find(
            '[itemprop="name"], .product-title, .product__title, .product-name, .product-card__title, .card__heading, h2, h3',
          )
          .first()
          .text(),
      )
      if (!isValidProductName(name, navLabels)) return

      const price = extractPriceFromElement($, el)
      const image = extractImageFromElement($, el, baseUrl)
      const link = extractProductLinkFromElement($, el, baseUrl)
      const addToCart = $card
        .find(
          '[class*="add-to-cart"], button[name="add"], button[type="submit"][name="add"], form[action*="/cart"]',
        )
        .length > 0

      const signalCount = [price, image, link].filter(Boolean).length
      if (signalCount < 2) return

      const confidence = scoreCardConfidence({ price, image, link, addToCart })
      if (confidence < 60) return

      const key = normalizeProductName(name)
      if (seen.has(key)) return
      seen.add(key)

      products.push(
        buildProductRecord({
          name,
          price,
          image,
          url: link,
          source: 'product_card',
          confidence,
          signals: { add_to_cart: addToCart },
        }),
      )
    })
  }

  return products
}

function isProductDetailUrl(pageUrl) {
  try {
    const path = new URL(pageUrl).pathname
    return /\/products?\//i.test(path) || /\/collections\/[^/]+\/products\//i.test(path)
  } catch {
    return false
  }
}

function extractProductDetailSignals($, baseUrl, pageUrl, navLabels) {
  if (!isProductDetailUrl(pageUrl)) return null

  const name = cleanText(
    $('[itemprop="name"], .product__title, .product-title, .product-name, h1')
      .first()
      .text(),
  )
  if (!isValidProductName(name, navLabels)) return null

  const price =
    extractPriceFromElement($, 'body') ||
    cleanText($('meta[property="product:price:amount"]').attr('content') || '')
  const image =
    extractImageFromElement($, 'body') ||
    $('meta[property="og:image"]').attr('content') ||
    null
  const addToCart =
    $(
      '[class*="add-to-cart"], button[name="add"], button[type="submit"][name="add"], form[action*="/cart/add"]',
    ).length > 0
  const variants =
    $('select[name*="option"], .product-form__option, [data-variant-id], .variant-picker, .swatch')
      .length > 0
  const availability = cleanText(
    $('[itemprop="availability"], .product__inventory, .stock, .availability').first().text(),
  )
  const reviews = /review|testimonial|rated|stars|trustpilot/i.test(cleanText($('body').text()))

  let confidence = 70
  if (price) confidence += 8
  if (image) confidence += 6
  if (addToCart) confidence += 8
  if (variants) confidence += 4
  if (availability) confidence += 2
  if (reviews) confidence += 2

  return buildProductRecord({
    name,
    price: price || null,
    image,
    url: pageUrl,
    source: 'product_detail',
    confidence: Math.min(confidence, 95),
    signals: {
      add_to_cart: addToCart,
      variants,
      availability: availability || null,
      reviews,
    },
  })
}

function mergeProducts(...lists) {
  const byName = new Map()
  for (const list of lists) {
    for (const product of list) {
      const key = normalizeProductName(product.name)
      const existing = byName.get(key)
      if (!existing || product.confidence > existing.confidence) {
        byName.set(key, product)
      }
    }
  }
  return [...byName.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 30)
}

function extractPrices(text) {
  const matches = text.match(
    /(?:USD|EUR|GBP|CAD|AUD|\$|€|£)\s?\d{1,5}(?:[.,]\d{2})?|\d{1,5}(?:[.,]\d{2})?\s?(?:USD|EUR|GBP)/gi,
  )
  return [...new Set((matches || []).slice(0, 20))]
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
  if ($('[data-product], .product-card, .add-to-cart').length > 0) return 'custom storefront'
  return 'unknown'
}

function classifyPageHints($, html, url, products, platform, navLabels) {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    } catch {
      return ''
    }
  })()
  const pathname = (() => {
    try {
      return new URL(url).pathname
    } catch {
      return ''
    }
  })()
  const text = cleanText($('body').text()).toLowerCase()
  const indicators = []

  const isMarketplaceHost = MARKETPLACE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  if (isMarketplaceHost) indicators.push('marketplace_host')

  const marketplaceCopyStrong =
    /sold by|fulfilled by amazon|compare with similar|ships from|seller information|marketplace seller|ad feedback/i.test(
      text,
    )
  if (marketplaceCopyStrong) indicators.push('marketplace_copy')

  const hasMarketplaceListingUrl = /\/dp\/|\/itm\/|\/gp\/product|\/listing\//i.test(
    `${pathname} ${url}`,
  )
  if (hasMarketplaceListingUrl) indicators.push('marketplace_listing_url')

  if (
    /sponsored/i.test(text) &&
    (isMarketplaceHost || marketplaceCopyStrong || hasMarketplaceListingUrl)
  ) {
    indicators.push('marketplace_sponsored')
  }

  const headingCount = $('h2, h3').length
  const lowConfidenceProducts = products.filter((p) => p.confidence < 65).length
  if (headingCount >= 8 && lowConfidenceProducts === 0 && products.length === 0) {
    indicators.push('heading_heavy_no_products')
  }

  if (platform === 'Shopify') indicators.push('shopify_platform')
  if (/\/book\b|schedule a call|get a quote|our services|book now|consultation/i.test(text)) {
    indicators.push('service_language')
  }
  if ((text.match(/blog|article|read more/gi) || []).length >= 3) indicators.push('content_heavy')

  const marketplaceSignals = [
    'marketplace_copy',
    'marketplace_listing_url',
    'marketplace_sponsored',
  ].filter((signal) => indicators.includes(signal))
  const pageIsMarketplace =
    indicators.includes('marketplace_host') ||
    marketplaceSignals.length >= 2 ||
    (indicators.includes('marketplace_copy') && indicators.includes('marketplace_listing_url'))

  let hint = 'unknown'
  if (pageIsMarketplace && !indicators.includes('service_language')) {
    hint = 'marketplace'
  } else if (indicators.includes('service_language')) {
    hint = 'service'
  } else if (pageIsMarketplace) {
    hint = 'marketplace'
  } else if (indicators.includes('shopify_platform') && !indicators.includes('marketplace_host')) {
    hint = 'shopify_dtc'
  } else if (products.some((p) => p.confidence >= 70)) {
    hint = 'single_brand_ecommerce'
  } else if (indicators.includes('content_heavy')) {
    hint = 'content_social'
  }

  return { hint, indicators, host }
}

function buildExtractionMeta(
  products,
  prices,
  headings,
  navLabels,
  pageHints,
  extractedText,
  extractionSources = {},
) {
  const highConfidence = products.filter((p) => p.confidence >= 75)
  const avgConfidence = products.length
    ? products.reduce((sum, p) => sum + p.confidence, 0) / products.length
    : 0

  const headingTexts = [...(headings.h1 || []), ...(headings.h2 || []), ...(headings.h3 || [])]
  const headingPromoNoise =
    headingTexts.filter((h) => !isValidProductName(h, navLabels)).length >=
      Math.max(3, headingTexts.length * 0.6) && products.length === 0

  return {
    product_count: products.length,
    high_confidence_product_count: highConfidence.length,
    avg_product_confidence: Math.round(avgConfidence),
    has_reliable_product_cards: Boolean(extractionSources.has_reliable_product_cards),
    has_product_detail_signals: Boolean(extractionSources.has_product_detail_signals),
    has_json_ld_products: Boolean(extractionSources.has_json_ld_products),
    heading_promo_noise: headingPromoNoise,
    prices_without_products: prices.length > 0 && products.length === 0,
    sparse_content: extractedText.length < 400,
    page_classification_hint: pageHints.hint,
    page_classification_indicators: pageHints.indicators,
  }
}

const CONTACT_CTA_PATTERN =
  /\b(?:call|contact|book|schedule|estimate|quote|consultation|get\s+in\s+touch|reach\s+us|request\s+(?:a\s+)?(?:quote|estimate|callback)|speak\s+(?:with|to)|talk\s+to\s+us)\b/i
const CONTACT_HREF_PATTERN = /contact|get[-_\s]?in[-_\s]?touch|reach[-_\s]?us|book(?:ing)?|schedule|quote|estimate|appoint/i
const PHONE_TEXT_PATTERN =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g
const REVIEW_FALSE_POSITIVE =
  /review\s+(?:our|the)\s+(?:privacy|terms|policy|cookie)|policy\s+review|under\s+review/i

function elementPlacement($, el) {
  const node = $(el)
  if (node.closest('header, [role="banner"], .site-header, #header, .navbar, .nav-bar').length) {
    return 'header'
  }
  if (node.closest('footer, [role="contentinfo"], .site-footer, #footer').length) {
    return 'footer'
  }
  if (node.closest('main, [role="main"], .hero, .banner, #hero, .above-fold').length) {
    return 'hero'
  }
  return 'body'
}

function bestPlacement(placements) {
  if (placements.has('header') || placements.has('hero')) return placements.has('header') ? 'header' : 'hero'
  if (placements.has('body')) return 'body'
  if (placements.has('footer')) return 'footer'
  return 'unknown'
}

function extractEmailsAndContacts($) {
  const emails = new Set()
  const phones = new Set()
  const contactLinks = new Set()
  const contactCtas = new Set()
  const phoneMethods = new Set()
  const placements = new Set()
  let hasMailto = false
  let hasTel = false
  let hasTextPhone = false
  let hasContactForm = false

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const email = href.replace(/^mailto:/i, '').split('?')[0].trim()
    if (email) {
      emails.add(email)
      hasMailto = true
      placements.add(elementPlacement($, el))
    }
  })

  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const phone = href.replace(/^tel:/i, '').trim()
    if (phone) {
      phones.add(phone)
      hasTel = true
      phoneMethods.add('tel')
      placements.add(elementPlacement($, el))
    }
  })

  const text = cleanText($('body').text())
  const emailMatches = text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []
  emailMatches.slice(0, 5).forEach((e) => emails.add(e))

  const phoneMatches = text.match(PHONE_TEXT_PATTERN) || []
  for (const match of phoneMatches.slice(0, 5)) {
    const digits = match.replace(/\D/g, '')
    if (digits.length >= 7 && digits.length <= 15) {
      phones.add(match.trim())
      hasTextPhone = true
      phoneMethods.add('text')
    }
  }

  // Prefer placement from the region that actually contains the phone/email text
  $('header, [role="banner"], .site-header, #header, footer, [role="contentinfo"], .site-footer, #footer, main, [role="main"], .hero').each(
    (_, el) => {
      const regionText = cleanText($(el).text())
      const regionPlacement = elementPlacement($, el)
      if (PHONE_TEXT_PATTERN.test(regionText) || /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(regionText)) {
        placements.add(regionPlacement)
      }
      // reset lastIndex for global regex reuse
      PHONE_TEXT_PATTERN.lastIndex = 0
    },
  )

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim()
    const label = cleanText($(el).text())
    if (CONTACT_HREF_PATTERN.test(href) || CONTACT_HREF_PATTERN.test(label)) {
      contactLinks.add(href.startsWith('http') || href.startsWith('/') ? href : label || href)
      placements.add(elementPlacement($, el))
    }
    if (CONTACT_CTA_PATTERN.test(label) && label.length <= 48) {
      contactCtas.add(label)
      placements.add(elementPlacement($, el))
    }
  })

  $('button').each((_, el) => {
    const label = cleanText($(el).text())
    if (CONTACT_CTA_PATTERN.test(label) && label.length <= 48) {
      contactCtas.add(label)
      placements.add(elementPlacement($, el))
    }
  })

  $('form').each((_, el) => {
    const form = $(el)
    const hasEmailInput = form.find('input[type="email"], input[name*="email" i], input[id*="email" i]').length > 0
    const hasPhoneInput = form.find('input[type="tel"], input[name*="phone" i], input[id*="phone" i]').length > 0
    const hasMessage = form.find('textarea, input[name*="message" i]').length > 0
    const action = (form.attr('action') || '').toLowerCase()
    const formText = cleanText(form.text()).toLowerCase()
    const looksLikeContact =
      hasEmailInput ||
      hasPhoneInput ||
      hasMessage ||
      /contact|inquiry|enquire|quote|estimate|book/i.test(action) ||
      /contact|send message|get in touch|request/i.test(formText)
    if (looksLikeContact) {
      hasContactForm = true
      placements.add(elementPlacement($, el))
    }
  })

  return {
    emails: [...emails],
    phones: [...phones],
    contact_links: [...contactLinks].slice(0, 10),
    contact_ctas: [...contactCtas].slice(0, 10),
    phone_methods: [...phoneMethods],
    has_mailto: hasMailto,
    has_tel: hasTel,
    has_text_phone: hasTextPhone,
    has_contact_form: hasContactForm,
    has_contact_page_link: contactLinks.size > 0,
    has_contact_cta: contactCtas.size > 0,
    contact_placement: bestPlacement(placements),
  }
}

function extractReviewSignals($, extractedText, jsonLd, socialLinks = []) {
  const evidence = []
  let hasReviewSchema = false
  let hasReviewWidget = false
  let hasTestimonialBlock = false
  let hasStarRating = false
  let keywordHit = false

  const walkLd = (nodes) => {
    const list = Array.isArray(nodes) ? nodes : nodes ? [nodes] : []
    for (const node of list) {
      if (!node || typeof node !== 'object') continue
      const type = node['@type']
      const types = (Array.isArray(type) ? type : [type]).map((t) => String(t || '').toLowerCase())
      if (types.some((t) => ['review', 'aggregaterating', 'rating'].includes(t))) {
        hasReviewSchema = true
        evidence.push({ type: 'schema', method: 'json_ld', confidence: 'high' })
      }
      if (node.aggregateRating || node.reviewRating || node.review) {
        hasReviewSchema = true
        evidence.push({ type: 'schema', method: 'json_ld_field', confidence: 'high' })
      }
      if (Array.isArray(node['@graph'])) walkLd(node['@graph'])
    }
  }
  walkLd(jsonLd)

  const widgetHosts =
    /trustpilot|yelp\.com|google\.com\/maps|g\.page|birdeye|podium|grade\.us|sitejabber|reviews?\./i
  $('iframe[src], script[src], a[href]').each((_, el) => {
    const src = $(el).attr('src') || $(el).attr('href') || ''
    if (widgetHosts.test(src)) {
      hasReviewWidget = true
      evidence.push({ type: 'widget', method: 'embed_or_link', confidence: 'high' })
    }
  })
  for (const link of socialLinks) {
    if (widgetHosts.test(String(link))) {
      hasReviewWidget = true
      evidence.push({ type: 'widget', method: 'social_host', confidence: 'medium' })
    }
  }

  const testimonialSelectors =
    '[class*="testimonial" i], [id*="testimonial" i], [class*="review" i], [id*="review" i], blockquote'
  $(testimonialSelectors).each((_, el) => {
    const text = cleanText($(el).text())
    if (!text || text.length < 24) return
    if (REVIEW_FALSE_POSITIVE.test(text)) return
    if (/testimonial|review|customer|client|rated|stars|★|⭐/i.test(text) || $(el).is('blockquote')) {
      hasTestimonialBlock = true
      evidence.push({
        type: 'testimonial_block',
        method: 'markup',
        snippet: text.slice(0, 120),
        confidence: 'high',
      })
    }
  })

  if (/[★⭐]|stars?\b|rated\s+\d(?:\.\d)?\s*\/\s*5|\d(?:\.\d)?\s*out of\s*5/i.test(extractedText)) {
    hasStarRating = true
    evidence.push({ type: 'stars', method: 'text', confidence: 'medium' })
  }

  if (!REVIEW_FALSE_POSITIVE.test(extractedText)) {
    if (/\b(?:testimonial|customer\s+reviews?|client\s+reviews?|what\s+our\s+customers\s+say)\b/i.test(extractedText)) {
      keywordHit = true
      evidence.push({ type: 'keyword', method: 'text', confidence: 'low' })
    } else if (/\breviews?\b/i.test(extractedText)) {
      keywordHit = true
      evidence.push({ type: 'keyword', method: 'text_weak', confidence: 'low' })
    }
  }

  const strength = hasReviewSchema || hasReviewWidget || hasTestimonialBlock
    ? 'strong'
    : hasStarRating || keywordHit
      ? 'medium'
      : 'none'

  return {
    review_indicators: strength !== 'none',
    review_strength: strength,
    has_review_schema: hasReviewSchema,
    has_review_widget: hasReviewWidget,
    has_testimonial_block: hasTestimonialBlock,
    has_star_rating: hasStarRating,
    review_evidence: evidence.slice(0, 8),
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

function extractCtas($) {
  const ctas = []
  $('a, button').each((_, el) => {
    const text = cleanText($(el).text())
    if (!text || text.length > 40) return
    if (
      /buy|shop|order|subscribe|book|get started|add to cart|learn more|call|contact|schedule|estimate|quote|consultation/i.test(
        text,
      )
    ) {
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
  const rawHtml = html || ''
  const $ = cheerio.load(rawHtml)
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
  const contacts = extractEmailsAndContacts($)
  const jsonLd = extractJsonLd(cheerio.load(rawHtml))
  const openGraph = extractOpenGraph($)
  const platform = detectPlatform($, rawHtml, pageUrl)

  const jsonLdProducts = extractProductsFromJsonLd(jsonLd, pageUrl)
  const cardProducts = extractProductsFromCards($, pageUrl, links.navigation_labels)
  const detailProduct = extractProductDetailSignals($, pageUrl, pageUrl, links.navigation_labels)
  const products = mergeProducts(
    jsonLdProducts,
    cardProducts,
    detailProduct ? [detailProduct] : [],
  )

  const prices = extractPrices(extractedText)
  const ctas = extractCtas($)
  const policies = extractPolicyIndicators(extractedText, links.internal_links)
  const reviewSignals = extractReviewSignals($, extractedText, jsonLd, links.social_links)
  const newsletterIndicators = /newsletter|subscribe|join our list|email list/i.test(extractedText)
  const pageHints = classifyPageHints($, rawHtml, pageUrl, products, platform, links.navigation_labels)
  const extractionMeta = buildExtractionMeta(
    products,
    prices,
    headings,
    links.navigation_labels,
    pageHints,
    extractedText,
    {
      has_reliable_product_cards: cardProducts.some((p) => p.confidence >= 70),
      has_product_detail_signals: Boolean(detailProduct),
      has_json_ld_products: jsonLdProducts.length > 0,
    },
  )

  const extractedData = {
    social_links: links.social_links,
    internal_links: links.internal_links.slice(0, 50),
    navigation_labels: links.navigation_labels,
    emails: contacts.emails,
    phones: contacts.phones,
    contact_links: contacts.contact_links,
    contact_ctas: contacts.contact_ctas,
    phone_methods: contacts.phone_methods,
    has_mailto: contacts.has_mailto,
    has_tel: contacts.has_tel,
    has_text_phone: contacts.has_text_phone,
    has_contact_form: contacts.has_contact_form,
    has_contact_page_link: contacts.has_contact_page_link,
    has_contact_cta: contacts.has_contact_cta,
    contact_placement: contacts.contact_placement,
    products,
    product_names: products.map((p) => p.name),
    prices,
    ctas,
    json_ld: jsonLd,
    open_graph: openGraph,
    platform,
    policies,
    review_indicators: reviewSignals.review_indicators,
    review_strength: reviewSignals.review_strength,
    has_review_schema: reviewSignals.has_review_schema,
    has_review_widget: reviewSignals.has_review_widget,
    has_testimonial_block: reviewSignals.has_testimonial_block,
    has_star_rating: reviewSignals.has_star_rating,
    review_evidence: reviewSignals.review_evidence,
    newsletter_indicators: newsletterIndicators,
    headings,
    has_mobile_viewport: Boolean($('meta[name="viewport"]').attr('content')),
    image_count: $('img').length,
    extraction_meta: extractionMeta,
    page_classification_hint: pageHints.hint,
    page_classification_indicators: pageHints.indicators,
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
  isValidProductName,
  extractProductsFromJsonLd,
  mergeProducts,
  classifyPageHints,
}
