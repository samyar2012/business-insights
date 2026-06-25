function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeProductEntry(product) {
  if (!product) return null
  if (typeof product === 'string') {
    return {
      name: product,
      confidence: 40,
      source: 'legacy_string',
      signals: {},
    }
  }
  if (typeof product === 'object' && product.name) return product
  return null
}

function productKey(product) {
  return String(product.name || '')
    .trim()
    .toLowerCase()
}

function classifySite(pages, aggregated) {
  const hints = aggregated.page_classification_hints || []
  const indicators = new Set(aggregated.page_classification_indicators || [])
  const marketplaceVotes = hints.filter((h) => h === 'marketplace').length
  const shopifyVotes = hints.filter((h) => h === 'shopify_dtc').length
  const ecommerceVotes = hints.filter((h) => h === 'single_brand_ecommerce').length
  const serviceVotes = hints.filter((h) => h === 'service').length
  const contentVotes = hints.filter((h) => h === 'content_social').length

  let classification = 'unknown'
  let confidence = 40

  if (marketplaceVotes > 0 || indicators.has('marketplace_host') || indicators.has('marketplace_copy')) {
    classification = 'marketplace'
    confidence = 85
  } else if (shopifyVotes > 0 && aggregated.platform === 'Shopify') {
    classification = 'shopify_dtc'
    confidence = 80
  } else if (ecommerceVotes > 0 || aggregated.high_confidence_products.length >= 2) {
    classification = 'single_brand_ecommerce'
    confidence = 75
  } else if (serviceVotes > 0 && serviceVotes >= contentVotes) {
    classification = 'service'
    confidence = 70
  }

  if (classification === 'unknown' && contentVotes > 0) {
    classification = 'content_social'
    confidence = 65
  }

  if (
    classification === 'unknown' &&
    aggregated.products.length > 0 &&
    aggregated.extraction_meta.avg_product_confidence >= 65
  ) {
    classification = 'single_brand_ecommerce'
    confidence = 60
  }

  return {
    classification,
    confidence,
    indicators: [...indicators],
    hint_counts: {
      marketplace: marketplaceVotes,
      shopify_dtc: shopifyVotes,
      single_brand_ecommerce: ecommerceVotes,
      service: serviceVotes,
      content_social: contentVotes,
    },
  }
}

function aggregatePages(pages) {
  const productsByKey = new Map()
  const services = new Set()
  const social = new Set()
  const emails = new Set()
  const prices = new Set()
  const ctas = new Set()
  const navLabels = new Set()
  const policies = { shipping: false, returns: false, privacy: false, terms: false }
  const pageClassificationHints = []
  const pageClassificationIndicators = new Set()

  let platform = 'unknown'
  let reviewIndicators = false
  let newsletterIndicators = false
  let totalText = 0
  let https = false
  let jsRenderedPages = 0
  let noisyPages = 0
  let pricesWithoutProductsPages = 0
  let hasProductDetailPage = false
  let hasReliableProductCards = false
  let hasJsonLdProducts = false
  let confidenceTotal = 0
  let confidenceCount = 0

  for (const page of pages) {
    let data = page.extracted_data_json || {}
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        data = {}
      }
    }

    const pageProducts = (data.products || [])
      .map(normalizeProductEntry)
      .filter(Boolean)

    for (const product of pageProducts) {
      const key = productKey(product)
      const existing = productsByKey.get(key)
      if (!existing || (product.confidence || 0) > (existing.confidence || 0)) {
        productsByKey.set(key, product)
      }
      confidenceTotal += product.confidence || 0
      confidenceCount += 1
    }

    if (page.page_type === 'services') services.add(page.title)
    ;(data.social_links || []).forEach((s) => social.add(s))
    ;(data.emails || []).forEach((e) => emails.add(e))
    ;(data.prices || []).forEach((p) => prices.add(p))
    ;(data.ctas || []).forEach((c) => ctas.add(c))
    ;(data.navigation_labels || []).forEach((n) => navLabels.add(n))

    if (data.policies) {
      Object.keys(policies).forEach((k) => {
        if (data.policies[k]) policies[k] = true
      })
    }
    if (data.platform && data.platform !== 'unknown') platform = data.platform
    if (data.review_indicators) reviewIndicators = true
    if (data.newsletter_indicators) newsletterIndicators = true

    const meta = data.extraction_meta || {}
    if (meta.has_product_detail_signals) hasProductDetailPage = true
    if (meta.has_reliable_product_cards) hasReliableProductCards = true
    if (meta.has_json_ld_products) hasJsonLdProducts = true
    if (meta.heading_promo_noise) noisyPages += 1
    if (meta.prices_without_products) pricesWithoutProductsPages += 1

    if (data.page_classification_hint) pageClassificationHints.push(data.page_classification_hint)
    ;(data.page_classification_indicators || []).forEach((i) => pageClassificationIndicators.add(i))

    totalText += (page.extracted_text || '').length
    if ((page.final_url || page.url || '').startsWith('https://')) https = true
    if (page.requires_browser || meta.sparse_content) jsRenderedPages += 1
  }

  const products = [...productsByKey.values()].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
  const highConfidenceProducts = products.filter((p) => (p.confidence || 0) >= 75)
  const avgProductConfidence = confidenceCount
    ? Math.round(confidenceTotal / confidenceCount)
    : 0

  const extractionMeta = {
    product_count: products.length,
    high_confidence_product_count: highConfidenceProducts.length,
    avg_product_confidence: avgProductConfidence,
    has_reliable_product_cards: hasReliableProductCards,
    has_product_detail_page: hasProductDetailPage,
    has_json_ld_products: hasJsonLdProducts,
    noisy_pages: noisyPages,
    prices_without_products_pages: pricesWithoutProductsPages,
    js_rendered_pages: jsRenderedPages,
    low_confidence_extraction: products.length > 0 && avgProductConfidence < 60,
  }

  const partialAggregated = {
    products,
    high_confidence_products: highConfidenceProducts,
    platform,
    extraction_meta: extractionMeta,
    page_classification_hints: pageClassificationHints,
    page_classification_indicators: [...pageClassificationIndicators],
  }

  const siteClassification = classifySite(pages, partialAggregated)

  return {
    products,
    product_names: products.map((p) => p.name),
    high_confidence_products: highConfidenceProducts,
    services: [...services].slice(0, 15),
    social_channels: [...social],
    contact_signals: { emails: [...emails], phones: [] },
    pricing_signals: [...prices].slice(0, 20),
    policy_signals: policies,
    trust_signals: {
      review_indicators: reviewIndicators,
      https,
      policy_count: Object.values(policies).filter(Boolean).length,
    },
    content_signals: {
      total_text_length: totalText,
      page_count: pages.length,
      navigation_labels: [...navLabels].slice(0, 20),
      ctas: [...ctas].slice(0, 15),
      newsletter_indicators: newsletterIndicators,
    },
    platform,
    extraction_meta: extractionMeta,
    site_classification: siteClassification,
    page_classification_hints: pageClassificationHints,
    page_classification_indicators: [...pageClassificationIndicators],
  }
}

function inferBusinessType(business, aggregated) {
  if (business?.business_type) return business.business_type
  if (aggregated.site_classification?.classification === 'marketplace') return 'marketplace'
  if (aggregated.products.length > 0 || aggregated.site_classification?.classification?.includes('ecommerce')) {
    return 'ecommerce'
  }
  if (aggregated.services.length > 0 || aggregated.site_classification?.classification === 'service') {
    return 'services'
  }
  return 'unknown'
}

function buildValueProposition(pages, business) {
  const home = pages.find((p) => p.page_type === 'homepage') || pages[0]
  if (home?.meta_description) return home.meta_description
  if (home?.title) return home.title
  return business?.product_sold || null
}

function addExplanation(explanations, category, delta, reason) {
  if (!delta) return
  explanations.push({ category, delta, reason })
}

function calculateScores(aggregated, business, pages) {
  const explanations = []
  const meta = aggregated.extraction_meta || {}
  const siteClass = aggregated.site_classification?.classification || 'unknown'
  const isEcommerceContext =
    inferBusinessType(business, aggregated) === 'ecommerce' ||
    ['single_brand_ecommerce', 'shopify_dtc'].includes(siteClass)

  let product_clarity = 28
  let offer_clarity = 25
  let trust = 28
  let policies = 20
  let social_proof = 18
  let content = 25
  let technical = 30

  const highConfidenceCount = meta.high_confidence_product_count || 0
  const avgConfidence = meta.avg_product_confidence || 0

  if (highConfidenceCount >= 3) {
    product_clarity += 18
    addExplanation(explanations, 'product_clarity', 18, 'Multiple high-confidence products extracted.')
  } else if (highConfidenceCount >= 1) {
    product_clarity += 10
    addExplanation(explanations, 'product_clarity', 10, 'At least one high-confidence product found.')
  }

  if (meta.has_json_ld_products) {
    product_clarity += 8
    addExplanation(explanations, 'product_clarity', 8, 'Structured JSON-LD product data detected.')
  }
  if (meta.has_reliable_product_cards) {
    product_clarity += 10
    addExplanation(explanations, 'product_clarity', 10, 'Reliable product cards with name and price/image/link.')
  }
  if (meta.has_product_detail_page) {
    product_clarity += 8
    offer_clarity += 6
    addExplanation(explanations, 'product_clarity', 8, 'Product detail page signals were crawled.')
    addExplanation(explanations, 'offer_clarity', 6, 'Product detail page improves offer clarity.')
  }

  if (aggregated.pricing_signals.length > 0 && highConfidenceCount > 0) {
    offer_clarity += 10
    addExplanation(explanations, 'offer_clarity', 10, 'Prices align with extracted products.')
  }
  if (aggregated.content_signals.ctas.some((c) => /add to cart|buy|shop now/i.test(c))) {
    offer_clarity += 8
    addExplanation(explanations, 'offer_clarity', 8, 'Primary purchase CTA detected.')
  }

  if (aggregated.trust_signals.https) {
    trust += 12
    technical += 10
    addExplanation(explanations, 'trust', 12, 'Site uses HTTPS.')
    addExplanation(explanations, 'technical', 10, 'HTTPS improves crawlability trust.')
  }
  if (aggregated.policy_signals.shipping) {
    policies += 14
    addExplanation(explanations, 'policies', 14, 'Shipping policy signals found.')
  }
  if (aggregated.policy_signals.returns) {
    policies += 14
    addExplanation(explanations, 'policies', 14, 'Return policy signals found.')
  }
  if (aggregated.policy_signals.privacy) {
    policies += 8
    addExplanation(explanations, 'policies', 8, 'Privacy policy signals found.')
  }
  if (aggregated.trust_signals.review_indicators) {
    social_proof += 16
    addExplanation(explanations, 'social_proof', 16, 'Review or testimonial language detected.')
  }
  if (aggregated.social_channels.length > 0) {
    social_proof += 8
    addExplanation(explanations, 'social_proof', 8, 'Social profile links found.')
  }

  if (aggregated.content_signals.total_text_length > 1500) {
    content += 14
    addExplanation(explanations, 'content', 14, 'Substantial readable content extracted.')
  }
  if (aggregated.content_signals.page_count >= 3) {
    content += 8
    addExplanation(explanations, 'content', 8, 'Multiple pages crawled.')
  }

  if (aggregated.platform !== 'unknown') {
    technical += 8
    addExplanation(explanations, 'technical', 8, `Platform detected: ${aggregated.platform}.`)
  }
  if (pages.length >= 3) {
    technical += 6
    addExplanation(explanations, 'technical', 6, 'Crawler reached multiple site pages.')
  }

  if (meta.low_confidence_extraction) {
    product_clarity -= 18
    offer_clarity -= 12
    addExplanation(
      explanations,
      'product_clarity',
      -18,
      'Product extraction confidence is low across crawled pages.',
    )
    addExplanation(explanations, 'offer_clarity', -12, 'Low-confidence products weaken offer clarity.')
  }
  if (meta.noisy_pages > 0) {
    product_clarity -= 10
    addExplanation(
      explanations,
      'product_clarity',
      -10,
      'Headings or promo copy dominated pages without reliable product cards.',
    )
  }
  if (!meta.has_reliable_product_cards && isEcommerceContext) {
    product_clarity -= 12
    addExplanation(
      explanations,
      'product_clarity',
      -12,
      'No reliable product cards with adjacent name, price, and link/image.',
    )
  }
  if (meta.prices_without_products_pages > 0) {
    offer_clarity -= 10
    addExplanation(
      explanations,
      'offer_clarity',
      -10,
      'Crawler found prices but no reliable product cards.',
    )
  }
  if (isEcommerceContext && !meta.has_product_detail_page) {
    offer_clarity -= 8
    addExplanation(explanations, 'offer_clarity', -8, 'No product detail page was crawled.')
  }
  if (meta.js_rendered_pages > 0) {
    technical -= 12
    content -= 8
    addExplanation(
      explanations,
      'technical',
      -12,
      'Sparse or JS-rendered HTML reduced crawlability confidence.',
    )
    addExplanation(explanations, 'content', -8, 'Limited server-rendered content extracted.')
  }
  if (siteClass === 'marketplace' && business?.business_type !== 'marketplace') {
    product_clarity -= 20
    offer_clarity -= 15
    addExplanation(
      explanations,
      'product_clarity',
      -20,
      'Marketplace page detected; this does not look like a single SMB storefront.',
    )
    addExplanation(
      explanations,
      'offer_clarity',
      -15,
      'Marketplace listing patterns are not scored as a direct-to-consumer storefront.',
    )
  }
  if (isEcommerceContext && aggregated.products.length === 0) {
    product_clarity -= 15
    offer_clarity -= 10
    addExplanation(explanations, 'product_clarity', -15, 'No products extracted from crawled pages.')
    addExplanation(explanations, 'offer_clarity', -10, 'Missing primary product offer on crawled pages.')
  }
  if (!business?.store_url) {
    technical -= 6
    addExplanation(explanations, 'technical', -6, 'No store URL saved on the business record.')
  }

  product_clarity = clamp(product_clarity)
  offer_clarity = clamp(offer_clarity)
  trust = clamp(trust)
  policies = clamp(policies)
  social_proof = clamp(social_proof)
  content = clamp(content)
  technical = clamp(technical)

  const store_score = clamp(product_clarity * 0.55 + offer_clarity * 0.45)
  const trust_score = clamp(trust * 0.45 + policies * 0.35 + social_proof * 0.2)
  const offer_score = offer_clarity
  const content_score = content
  const technical_score = technical

  const overall_score = clamp(
    product_clarity * 0.2 +
      offer_clarity * 0.18 +
      trust * 0.14 +
      policies * 0.1 +
      social_proof * 0.1 +
      content * 0.14 +
      technical * 0.14,
  )

  return {
    overall_score,
    store_score,
    trust_score,
    offer_score,
    content_score,
    technical_score,
    category_scores: {
      product_clarity,
      offer_clarity,
      trust,
      policies,
      social_proof,
      content,
      technical_crawlability: technical,
    },
    score_explanation: explanations.slice(0, 20),
  }
}

function buildStrengths(aggregated, scores) {
  const strengths = []
  const meta = aggregated.extraction_meta || {}

  if (aggregated.trust_signals.https) strengths.push('Website is served over HTTPS.')
  if (meta.has_json_ld_products) strengths.push('Structured product data (JSON-LD) is present.')
  if (meta.high_confidence_product_count >= 2) {
    strengths.push(`${meta.high_confidence_product_count} high-confidence products extracted.`)
  }
  if (aggregated.platform !== 'unknown') {
    strengths.push(`Detected platform: ${aggregated.platform}.`)
  }
  if (aggregated.site_classification?.classification === 'shopify_dtc') {
    strengths.push('Site matches Shopify/DTC storefront patterns.')
  }
  if (aggregated.social_channels.length) strengths.push('Social profiles are linked from the site.')
  if (aggregated.policy_signals.shipping && aggregated.policy_signals.returns) {
    strengths.push('Shipping and return policies are discoverable.')
  }
  if (scores.overall_score >= 70) strengths.push('Overall website presentation score is solid.')
  return [...new Set(strengths)].slice(0, 6)
}

function buildRisks(aggregated, pages) {
  const risks = []
  const meta = aggregated.extraction_meta || {}
  const siteClass = aggregated.site_classification?.classification

  if (pages.length === 0) risks.push('No pages could be crawled from the submitted URL.')
  if (!aggregated.trust_signals.https) risks.push('Site may not use HTTPS consistently.')
  if (meta.prices_without_products_pages > 0) {
    risks.push('Crawler found prices but no reliable product cards.')
  }
  if (siteClass === 'marketplace') {
    risks.push('Marketplace page detected; this does not look like a single SMB storefront.')
  }
  if (meta.low_confidence_extraction) {
    risks.push(
      'Product extraction confidence is low because headings/promos dominated the page.',
    )
  }
  if (meta.noisy_pages > 0 && meta.high_confidence_product_count === 0) {
    risks.push('Promo headings and navigation labels were noisy but no product cards were confirmed.')
  }
  if (!meta.has_reliable_product_cards && aggregated.products.length > 0) {
    risks.push('Products were inferred weakly without card-level name, price, and link/image signals.')
  }
  if (!meta.has_product_detail_page && inferBusinessType(null, aggregated) === 'ecommerce') {
    risks.push('No product detail page was crawled.')
  }
  if (meta.js_rendered_pages > 0) {
    risks.push('Very little readable content extracted — site may be JavaScript-heavy.')
  }
  if (!aggregated.policy_signals.returns) risks.push('Return policy page not detected.')
  if (!aggregated.policy_signals.shipping) risks.push('Shipping policy page not detected.')
  if (!aggregated.trust_signals.review_indicators) {
    risks.push('No review or testimonial signals detected on crawled pages.')
  }
  if (aggregated.social_channels.length === 0) risks.push('No social profile links found.')
  return [...new Set(risks)].slice(0, 8)
}

function buildRecommendedActions(aggregated, scores) {
  const actions = []
  const meta = aggregated.extraction_meta || {}
  const explanations = scores.score_explanation || []

  const penalized = (category) =>
    explanations.some((e) => e.category === category && e.delta < 0)

  if (meta.prices_without_products_pages > 0 || penalized('offer_clarity')) {
    actions.push('Expose product names beside prices in product cards or JSON-LD Product markup.')
  }
  if (!meta.has_reliable_product_cards) {
    actions.push('Use consistent product card markup with title, price, image, and product link together.')
  }
  if (!meta.has_product_detail_page) {
    actions.push('Ensure product detail URLs are linked internally so the crawler can reach PDPs.')
  }
  if (meta.low_confidence_extraction || penalized('product_clarity')) {
    actions.push('Reduce promo/section headings that look like product names in listing pages.')
  }
  if (meta.js_rendered_pages > 0 || penalized('technical')) {
    actions.push('Improve server-rendered HTML for key storefront pages (title, products, policies).')
  }
  if (!aggregated.policy_signals.shipping) actions.push('Publish and link a shipping policy page.')
  if (!aggregated.policy_signals.returns) {
    actions.push('Add a clear return policy to reduce purchase hesitation.')
  }
  if (!aggregated.trust_signals.review_indicators || penalized('social_proof')) {
    actions.push('Add customer reviews or testimonials above the fold.')
  }
  if (aggregated.social_channels.length === 0) {
    actions.push('Link Instagram or TikTok from your homepage footer.')
  }
  if (aggregated.site_classification?.classification === 'marketplace') {
    actions.push('Submit your own brand storefront URL instead of a marketplace listing page.')
  }
  return [...new Set(actions)].slice(0, 8)
}

module.exports = {
  aggregatePages,
  inferBusinessType,
  buildValueProposition,
  calculateScores,
  buildStrengths,
  buildRisks,
  buildRecommendedActions,
  classifySite,
}
