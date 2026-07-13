
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

function isStrongMarketplaceSite(aggregated) {
  const indicators = new Set(aggregated.page_classification_indicators || [])
  const hints = aggregated.page_classification_hints || []
  const marketplaceVotes = hints.filter((h) => h === 'marketplace').length
  const serviceVotes = hints.filter((h) => h === 'service').length
  const hasStrongService = serviceVotes > 0 || indicators.has('service_language')

  if (indicators.has('marketplace_host')) return true
  if (marketplaceVotes >= 2) return true

  const listingSignals = ['marketplace_copy', 'marketplace_listing_url'].filter((signal) =>
    indicators.has(signal),
  )
  if (hasStrongService) return false
  if (marketplaceVotes >= 1 && listingSignals.length >= 2) return true
  if (indicators.has('marketplace_copy') && indicators.has('marketplace_listing_url')) return true

  return false
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

  if (isStrongMarketplaceSite(aggregated)) {
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
  const phones = new Set()
  const contactLinks = new Set()
  const contactCtas = new Set()
  const contactPlacements = new Set()
  const prices = new Set()
  const ctas = new Set()
  const navLabels = new Set()
  const policies = { shipping: false, returns: false, privacy: false, terms: false }
  const pageClassificationHints = []
  const pageClassificationIndicators = new Set()
  const reviewEvidence = []

  let platform = 'unknown'
  let reviewIndicators = false
  let reviewStrength = 'none'
  let hasStrongReviews = false
  let hasStarRating = false
  let newsletterIndicators = false
  let hasMailto = false
  let hasTel = false
  let hasTextPhone = false
  let hasContactForm = false
  let hasContactPageLink = false
  let hasContactCta = false
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
    ;(data.phones || []).forEach((p) => phones.add(p))
    ;(data.contact_links || []).forEach((l) => contactLinks.add(l))
    ;(data.contact_ctas || []).forEach((c) => contactCtas.add(c))
    if (data.has_mailto) hasMailto = true
    if (data.has_tel) hasTel = true
    if (data.has_text_phone) hasTextPhone = true
    if (data.has_contact_form) hasContactForm = true
    if (data.has_contact_page_link || page.page_type === 'contact') hasContactPageLink = true
    if (data.has_contact_cta) hasContactCta = true
    if (data.contact_placement) contactPlacements.add(data.contact_placement)
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
    if (data.has_review_schema || data.has_review_widget || data.has_testimonial_block) {
      hasStrongReviews = true
    }
    if (data.has_star_rating) hasStarRating = true
    if (data.review_strength === 'strong') reviewStrength = 'strong'
    else if (data.review_strength === 'medium' && reviewStrength !== 'strong') reviewStrength = 'medium'
    else if (data.review_indicators && reviewStrength === 'none') reviewStrength = 'weak'
    ;(data.review_evidence || []).forEach((item) => {
      reviewEvidence.push({ ...item, page_url: item.page_url || page.final_url || page.url || null })
    })
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
    contact_signals: {
      emails: [...emails],
      phones: [...phones],
      contact_links: [...contactLinks].slice(0, 10),
      contact_ctas: [...contactCtas].slice(0, 10),
      has_mailto: hasMailto,
      has_tel: hasTel,
      has_text_phone: hasTextPhone,
      has_contact_form: hasContactForm,
      has_contact_page_link: hasContactPageLink,
      has_contact_cta: hasContactCta,
      placements: [...contactPlacements].filter((p) => p && p !== 'unknown'),
    },
    pricing_signals: [...prices].slice(0, 20),
    policy_signals: policies,
    trust_signals: {
      review_indicators: reviewIndicators || hasStrongReviews || hasStarRating,
      review_strength: hasStrongReviews ? 'strong' : reviewStrength,
      has_strong_reviews: hasStrongReviews,
      has_star_rating: hasStarRating,
      review_evidence: reviewEvidence.slice(0, 12),
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

const { calculateAnalyzerV2Scores } = require('./analyzerV2')

function calculateScores(aggregated, business, pages, options = {}) {
  return calculateAnalyzerV2Scores(aggregated, business, pages, options)
}

function buildProfileScoresPayload(aggregated, business, pages, options = {}) {
  const scores = calculateScores(aggregated, business, pages, options)
  const priorityFixes =
    scores.priority_fixes?.length > 0
      ? scores.priority_fixes
      : buildPriorityFixes(aggregated, pages, scores)
  return {
    ...scores,
    strengths: scores.strengths?.length ? scores.strengths : buildStrengths(aggregated, scores),
    risks: scores.risks?.length ? scores.risks : buildRisks(aggregated, pages, scores),
    recommended_actions: priorityFixes.map((fix) => fix.action),
    priority_fixes: priorityFixes,
  }
}

function isEcommerceRubric(rubric) {
  return rubric === 'ecommerce_store'
}

function isServiceRubric(rubric) {
  return ['online_plus_physical_service', 'local_service_business'].includes(rubric)
}

const FIX_PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

function addPriorityFix(fixes, seen, { priority, category, action, impact }) {
  const text = String(action || '').trim()
  if (!text || text === '-' || seen.has(text)) return
  seen.add(text)
  fixes.push({
    priority,
    category,
    action: text,
    impact: impact || 'Improves how well your site attracts and converts visitors.',
  })
}

function buildPriorityFixes(aggregated, pages, scores) {
  const fixes = []
  const seen = new Set()
  const meta = aggregated.extraction_meta || {}
  const explanations = scores.score_explanation || []
  const rubric = scores.scoring_rubric || 'ecommerce_store'
  const ecommerceRubric = isEcommerceRubric(rubric)
  const serviceRubric = isServiceRubric(rubric)

  const penalized = (category) =>
    explanations.some((e) => e.category === category && e.delta < 0)
  const categoryLow = (key, threshold) =>
    typeof scores[key] === 'number' && scores[key] < threshold

  if (scores.safety_status === 'unsafe') {
    addPriorityFix(fixes, seen, {
      priority: 'critical',
      category: 'safety',
      action:
        'Resolve malware or phishing flags with your host and request a Safe Browsing review before driving traffic.',
      impact: 'Unsafe sites lose customer trust immediately and may be blocked by browsers.',
    })
  }
  if (scores.score_caps_applied?.includes('homepage_failure_cap_40')) {
    addPriorityFix(fixes, seen, {
      priority: 'critical',
      category: 'functionality',
      action: 'Fix homepage availability and SSL so the primary URL loads over HTTPS without errors.',
      impact: 'If the homepage fails, most visitors never see your offer.',
    })
  }
  if (scores.score_caps_applied?.includes('key_pages_failure_cap_60')) {
    addPriorityFix(fixes, seen, {
      priority: 'high',
      category: 'functionality',
      action:
        'Repair unreachable contact, services, or gallery pages so key conversion paths load reliably.',
      impact: 'Broken supporting pages block leads from learning about and contacting you.',
    })
  }
  if (categoryLow('safety_score', 10)) {
    addPriorityFix(fixes, seen, {
      priority: 'high',
      category: 'safety',
      action: 'Verify site safety with Google Safe Browsing and remove any security warnings.',
      impact: 'Safety concerns stop customers before they evaluate your business.',
    })
  }
  if (categoryLow('functionality_score', 12)) {
    addPriorityFix(fixes, seen, {
      priority: 'high',
      category: 'functionality',
      action:
        'Improve crawlability: ensure key pages return HTML (not blank JS shells) and link contact/services pages internally.',
      impact: 'Broken or thin pages make the business look inactive or untrustworthy.',
    })
  }
  if (serviceRubric && !aggregated.trust_signals?.https) {
    addPriorityFix(fixes, seen, {
      priority: 'high',
      category: 'functionality',
      action: 'Enable HTTPS across your domain so visitors see a secure connection.',
      impact: 'Local service buyers expect a professional, secure website before calling.',
    })
  }
  if (serviceRubric && penalized('business_fit')) {
    addPriorityFix(fixes, seen, {
      priority: 'high',
      category: 'business_fit',
      action: 'Add phone, address, hours, and a contact page so local customers can reach you.',
      impact: 'Service businesses convert when contact paths are obvious.',
    })
  }
  if (serviceRubric && (penalized('business_fit') || categoryLow('business_fit_score', 12))) {
    addPriorityFix(fixes, seen, {
      priority: 'high',
      category: 'business_fit',
      action: 'Add a clear quote or booking CTA and describe your service area on the homepage.',
      impact: 'Clarifying how to hire you turns visitors into leads.',
    })
  }
  if (categoryLow('ux_ui_score', 12)) {
    addPriorityFix(fixes, seen, {
      priority: 'medium',
      category: 'ux_ui',
      action:
        'Add a clear H1 hero message, navigation labels, visible contact info, and a mobile viewport meta tag.',
      impact: 'Clear UX helps visitors understand your offer in the first few seconds.',
    })
  }
  if (categoryLow('customer_attraction_score', 5)) {
    addPriorityFix(fixes, seen, {
      priority: 'medium',
      category: 'customer_attraction',
      action: 'Add customer reviews or testimonials above the fold.',
      impact: 'Social proof is one of the fastest ways to increase conversion on service sites.',
    })
  }
  if (serviceRubric && !aggregated.trust_signals?.review_indicators) {
    addPriorityFix(fixes, seen, {
      priority: 'medium',
      category: 'customer_attraction',
      action: 'Publish client reviews or project testimonials near your primary CTA.',
      impact: 'Proof from past customers reduces hesitation before contact.',
    })
  }
  if (ecommerceRubric && (meta.prices_without_products_pages > 0 || penalized('business_fit'))) {
    addPriorityFix(fixes, seen, {
      priority: 'medium',
      category: 'business_fit',
      action: 'Expose product names beside prices in product cards or JSON-LD Product markup.',
      impact: 'Shoppers need to see what they are buying before they add to cart.',
    })
  }
  if (ecommerceRubric && !meta.has_reliable_product_cards) {
    addPriorityFix(fixes, seen, {
      priority: 'medium',
      category: 'business_fit',
      action: 'Use consistent product card markup with title, price, image, and product link together.',
      impact: 'Reliable product cards improve discovery and purchase confidence.',
    })
  }
  if (ecommerceRubric && !meta.has_product_detail_page) {
    addPriorityFix(fixes, seen, {
      priority: 'medium',
      category: 'business_fit',
      action: 'Ensure product detail URLs are linked internally so shoppers can reach product pages.',
      impact: 'Detail pages answer buyer questions and support conversion.',
    })
  }
  if (meta.js_rendered_pages > 0 || penalized('functionality')) {
    addPriorityFix(fixes, seen, {
      priority: 'medium',
      category: 'functionality',
      action: 'Improve server-rendered HTML for key pages (headings, services, contact details).',
      impact: 'Readable HTML helps both visitors and analyzers understand your site.',
    })
  }
  if (ecommerceRubric && !aggregated.policy_signals.shipping) {
    addPriorityFix(fixes, seen, {
      priority: 'low',
      category: 'business_fit',
      action: 'Publish and link a shipping policy page.',
      impact: 'Shipping clarity reduces checkout hesitation.',
    })
  }
  if (ecommerceRubric && !aggregated.policy_signals.returns) {
    addPriorityFix(fixes, seen, {
      priority: 'low',
      category: 'business_fit',
      action: 'Add a clear return policy to reduce purchase hesitation.',
      impact: 'Return policies build trust for first-time buyers.',
    })
  }
  if (aggregated.social_channels.length === 0 && rubric === 'content_business') {
    addPriorityFix(fixes, seen, {
      priority: 'medium',
      category: 'customer_attraction',
      action: 'Link Instagram or TikTok from your homepage footer.',
      impact: 'Content businesses need visible social proof and audience paths.',
    })
  }
  if (siteClassMismatch(aggregated, rubric)) {
    addPriorityFix(fixes, seen, {
      priority: 'high',
      category: 'business_fit',
      action: 'Submit your own brand storefront URL instead of a marketplace listing page.',
      impact: 'You can only optimize conversion on a site you control.',
    })
  }
  // Note: an "unknown" safety status reflects our own Safe Browsing configuration, not something
  // the business owner can act on, so it must not appear as a customer-facing fix.

  fixes.sort(
    (a, b) =>
      (FIX_PRIORITY_ORDER[a.priority] ?? 9) - (FIX_PRIORITY_ORDER[b.priority] ?? 9) ||
      a.category.localeCompare(b.category),
  )

  if (fixes.length === 0) {
    addPriorityFix(fixes, seen, {
      priority: 'low',
      category: 'customer_attraction',
      action: 'Maintain current strengths and A/B test primary CTAs to improve customer attraction.',
      impact: 'Small CTA experiments often produce the next conversion lift.',
    })
  }

  return fixes.slice(0, 8).map((fix, index) => ({ ...fix, rank: index + 1 }))
}

function buildRecommendedActions(aggregated, pages, scores) {
  return buildPriorityFixes(aggregated, pages, scores).map((fix) => fix.action)
}

function buildStrengths(aggregated, scores) {
  const strengths = []
  const meta = aggregated.extraction_meta || {}
  const rubric = scores.scoring_rubric || 'ecommerce_store'
  const positiveReasons = (scores.score_explanation || [])
    .filter((e) => e.delta > 0 && e.category !== 'mismatch')
    .map((e) => e.reason)

  if (aggregated.trust_signals.https) strengths.push('Website is served over HTTPS.')
  if (isEcommerceRubric(rubric) && meta.has_json_ld_products) {
    strengths.push('Structured product data (JSON-LD) is present.')
  }
  if (isEcommerceRubric(rubric) && meta.high_confidence_product_count >= 2) {
    strengths.push(`${meta.high_confidence_product_count} high-confidence products extracted.`)
  }
  if (aggregated.platform !== 'unknown') {
    strengths.push(`Detected platform: ${aggregated.platform}.`)
  }
  if (aggregated.social_channels.length) strengths.push('Social profiles are linked from the site.')
  if (
    isEcommerceRubric(rubric) &&
    aggregated.policy_signals.shipping &&
    aggregated.policy_signals.returns
  ) {
    strengths.push('Shipping and return policies are discoverable.')
  }
  if (scores.overall_score >= 70) strengths.push('Overall website presentation score is solid.')
  for (const reason of positiveReasons.slice(0, 3)) {
    strengths.push(reason)
  }
  return [...new Set(strengths)].slice(0, 6)
}

function buildRisks(aggregated, pages, scores = {}) {
  const risks = []
  const meta = aggregated.extraction_meta || {}
  const siteClass = aggregated.site_classification?.classification
  const rubric = scores.scoring_rubric || 'ecommerce_store'
  const ecommerceRubric = isEcommerceRubric(rubric)
  const categoryMax = require('./businessScoringRubrics').resolveCategoryMax(scores)

  if (scores.safety_status === 'unsafe') {
    risks.push(
      scores.score_explanation?.find((e) => e.category === 'safety' && /flagged|unsafe|phishing|malware/i.test(e.reason))
        ?.reason || 'Site was flagged as unsafe by security checks (malware, phishing, or social engineering).',
    )
  }
  if (scores.safety_status === 'unknown') {
    risks.push(
      'Some safety signals were missing or inconclusive — HTTPS, homepage reachability, or crawl health may need attention.',
    )
  }
  if (scores.score_caps_applied?.includes('homepage_failure_cap_40')) {
    risks.push('Homepage failed to load; overall score is capped until the site is reachable.')
  }
  if (scores.score_caps_applied?.includes('key_pages_failure_cap_60')) {
    risks.push('Many key pages failed to crawl; contact, services, or gallery pages may be missing or unreachable.')
  }
  if (
    scores.functionality_score != null &&
    scores.functionality_score < Math.round(categoryMax.functionality_score * 0.55)
  ) {
    risks.push('Website functionality score is low — HTTPS, crawl success, or readable content may be failing.')
  }

  if (pages.length === 0) risks.push('No pages could be crawled from the submitted URL.')
  if (!aggregated.trust_signals.https) risks.push('Site may not use HTTPS consistently.')

  if (ecommerceRubric && meta.prices_without_products_pages > 0) {
    risks.push('Crawler found prices but no reliable product cards.')
  }
  if (isStrongMarketplaceSite(aggregated) && rubric !== 'listing') {
    risks.push('Marketplace page detected; this does not look like a single SMB storefront.')
  }
  if (ecommerceRubric && meta.low_confidence_extraction) {
    risks.push(
      'Product extraction confidence is low because headings/promos dominated the page.',
    )
  }
  if (ecommerceRubric && meta.noisy_pages > 0 && meta.high_confidence_product_count === 0) {
    risks.push('Promo headings and navigation labels were noisy but no product cards were confirmed.')
  }
  if (ecommerceRubric && !meta.has_reliable_product_cards && aggregated.products.length > 0) {
    risks.push('Products were inferred weakly without card-level name, price, and link/image signals.')
  }
  if (ecommerceRubric && !meta.has_product_detail_page) {
    risks.push('No product detail page was crawled.')
  }
  if (meta.js_rendered_pages > 0) {
    risks.push('Very little readable content extracted — site may be JavaScript-heavy.')
  }
  if (ecommerceRubric && !aggregated.policy_signals.returns) {
    risks.push('Return policy page not detected.')
  }
  if (ecommerceRubric && !aggregated.policy_signals.shipping) {
    risks.push('Shipping policy page not detected.')
  }
  if (!aggregated.trust_signals.review_indicators && !isServiceRubric(rubric)) {
    risks.push('No review or testimonial signals detected on crawled pages.')
  }
  if (
    isServiceRubric(rubric) &&
    !aggregated.trust_signals.review_indicators &&
    (scores.customer_attraction_score ?? 10) < 6
  ) {
    risks.push('No review or testimonial signals detected — social proof may be limiting conversions.')
  }
  if (aggregated.social_channels.length === 0 && rubric === 'content_business') {
    risks.push('No social profile links found.')
  }
  for (const warning of scores.mismatch_warnings || []) {
    risks.push(warning)
  }
  if (risks.length === 0) {
    risks.push('No major risks detected from this crawl.')
  }
  return [...new Set(risks)].slice(0, 8)
}

function buildRecommendedActions(aggregated, pages, scores) {
  return buildPriorityFixes(aggregated, pages, scores).map((fix) => fix.action)
}

function siteClassMismatch(aggregated, rubric) {
  if (rubric === 'listing') return false
  return isStrongMarketplaceSite(aggregated)
}

module.exports = {
  aggregatePages,
  inferBusinessType,
  buildValueProposition,
  calculateScores,
  buildProfileScoresPayload,
  buildStrengths,
  buildRisks,
  buildRecommendedActions,
  buildPriorityFixes,
  classifySite,
  isStrongMarketplaceSite,
}
