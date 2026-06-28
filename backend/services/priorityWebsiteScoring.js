const { resolveScoringRubric } = require('./businessModelConfig')
const { unknownResult } = require('./safeBrowsingService')
const {
  detectOperationalSignals,
  detectMismatchWarnings,
  scoreForRubric,
  scoreBusinessFitWeighted,
  validateWeightedScore,
} = require('./businessScoringRubrics')

const SAFETY_MAX = 30
const UNKNOWN_SAFETY_SCORE = 15
const FUNCTIONALITY_MAX = 20
const UX_UI_MAX = 20
const BUSINESS_FIT_MAX = 20
const CUSTOMER_ATTRACTION_MAX = 10

function clamp(value, max = 100) {
  return Math.max(0, Math.min(max, Math.round(value)))
}

function addExplanation(explanations, category, delta, reason) {
  if (!reason) return
  explanations.push({ category, delta, reason })
}

function pageData(page) {
  let data = page?.extracted_data_json || {}
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      data = {}
    }
  }
  return data
}

function inferCrawlHealth(pages, startUrl, crawlMeta = {}) {
  const homepage = pages.find((p) => p.page_type === 'homepage') || pages[0] || null
  const homepageOk =
    crawlMeta.homepage_fetch_ok !== undefined
      ? Boolean(crawlMeta.homepage_fetch_ok)
      : Boolean(homepage && (homepage.status_code === undefined || homepage.status_code < 400))

  const discovered = crawlMeta.pages_discovered || pages.length
  const crawled = crawlMeta.pages_crawled ?? pages.length
  const fetchFailureRate =
    discovered > 0 ? Math.max(0, (discovered - crawled) / discovered) : pages.length === 0 ? 1 : 0

  const hasContact = pages.some((p) => p.page_type === 'contact')
  const hasServices = pages.some((p) => p.page_type === 'services')
  const hasGallery = pages.some(
    (p) => /gallery|portfolio/i.test(String(p.url || '')) || p.page_type === 'gallery',
  )

  const keyPageTypes = [hasContact, hasServices, hasGallery].filter(Boolean).length
  const keyPagesMostlyFailed =
    fetchFailureRate > 0.5 || (discovered >= 4 && crawled < 2) || (pages.length > 0 && keyPageTypes === 0 && discovered >= 6)

  return {
    homepageOk,
    homepage,
    discovered,
    crawled,
    fetchFailureRate,
    hasContact,
    hasServices,
    hasGallery,
    keyPagesMostlyFailed,
    startUrl,
  }
}

function collectUxSignals(pages, aggregated) {
  let hasH1 = false
  let hasMobileViewport = false
  let imageCount = 0
  const phones = new Set(aggregated.contact_signals?.phones || [])

  for (const page of pages) {
    const data = pageData(page)
    const headings = data.headings || page.headings || {}
    if ((headings.h1 || []).length > 0) hasH1 = true
    if (data.has_mobile_viewport) hasMobileViewport = true
    imageCount += data.image_count || 0
    for (const phone of data.phones || []) phones.add(phone)
  }

  return {
    hasH1,
    hasMobileViewport,
    imageCount,
    navLabelCount: (aggregated.content_signals?.navigation_labels || []).length,
    ctaCount: (aggregated.content_signals?.ctas || []).length,
    textLength: aggregated.content_signals?.total_text_length || 0,
    hasContactVisible: phones.size > 0 || (aggregated.contact_signals?.emails || []).length > 0,
    phones: [...phones],
  }
}

function scoreSafetyPoints(safetyResult, explanations) {
  const result = safetyResult || unknownResult()

  if (result.status === 'unsafe') {
    addExplanation(
      explanations,
      'safety',
      0,
      result.message || 'Site flagged as unsafe (malware, phishing, or social engineering).',
    )
    return { points: 0, status: 'unsafe' }
  }

  if (result.status === 'safe') {
    addExplanation(
      explanations,
      'safety',
      SAFETY_MAX,
      result.message || 'No malware or phishing threats reported by Safe Browsing.',
    )
    return { points: SAFETY_MAX, status: 'safe' }
  }

  const partial = clamp(UNKNOWN_SAFETY_SCORE, SAFETY_MAX)
  addExplanation(
    explanations,
    'safety',
    partial,
    result.message || 'Live safety verification is not configured.',
  )
  return { points: partial, status: 'unknown' }
}

function scoreFunctionalityPoints(aggregated, pages, crawlHealth, explanations) {
  let points = 0

  if (crawlHealth.homepageOk) {
    points += 5
    addExplanation(explanations, 'functionality', 5, 'Homepage loaded successfully.')
  } else {
    addExplanation(explanations, 'functionality', 0, 'Homepage failed to load or returned an error.')
  }

  if (aggregated.trust_signals?.https) {
    points += 3
    addExplanation(explanations, 'functionality', 3, 'Site is served over HTTPS.')
  } else {
    addExplanation(explanations, 'functionality', 0, 'HTTPS was not detected on crawled pages.')
  }

  const pageCount = pages.length
  if (pageCount >= 3) {
    points += 4
    addExplanation(explanations, 'functionality', 4, 'Multiple main pages crawled successfully.')
  } else if (pageCount >= 1) {
    points += 2
    addExplanation(explanations, 'functionality', 2, 'At least one page crawled successfully.')
  } else {
    addExplanation(explanations, 'functionality', 0, 'No pages were crawled from the submitted URL.')
  }

  if (crawlHealth.fetchFailureRate < 0.35) {
    points += 2
    addExplanation(explanations, 'functionality', 2, 'Few crawl fetch failures relative to pages discovered.')
  } else if (crawlHealth.fetchFailureRate >= 0.5) {
    addExplanation(explanations, 'functionality', 0, 'Many discovered pages failed to fetch.')
  }

  const reachableKeyPages = [
    crawlHealth.hasContact,
    crawlHealth.hasServices,
    crawlHealth.hasGallery,
  ].filter(Boolean).length
  if (reachableKeyPages >= 2) {
    points += 3
    addExplanation(explanations, 'functionality', 3, 'Contact, services, or gallery pages are reachable.')
  } else if (reachableKeyPages === 1) {
    points += 1
    addExplanation(explanations, 'functionality', 1, 'One supporting page (contact, services, or gallery) was crawled.')
  }

  const ux = collectUxSignals(pages, aggregated)
  if (ux.hasMobileViewport) {
    points += 1
    addExplanation(explanations, 'functionality', 1, 'Mobile viewport meta tag detected.')
  }

  if (ux.textLength >= 800) {
    points += 2
    addExplanation(explanations, 'functionality', 2, 'Enough readable content extracted for analysis.')
  } else if (ux.textLength >= 300) {
    points += 1
    addExplanation(explanations, 'functionality', 1, 'Limited readable content extracted.')
  } else {
    addExplanation(explanations, 'functionality', 0, 'Very little readable content on crawled pages.')
  }

  return clamp(points, FUNCTIONALITY_MAX)
}

function scoreUxUiPoints(pages, aggregated, signals, explanations) {
  const ux = collectUxSignals(pages, aggregated)
  let points = 0

  if (ux.hasH1) {
    points += 4
    addExplanation(explanations, 'ux_ui', 4, 'Clear H1 or hero heading detected.')
  } else {
    addExplanation(explanations, 'ux_ui', 0, 'No clear H1 heading found on crawled pages.')
  }

  if (ux.navLabelCount >= 3) {
    points += 3
    addExplanation(explanations, 'ux_ui', 3, 'Navigation labels detected across the site.')
  } else if (ux.navLabelCount >= 1) {
    points += 1
    addExplanation(explanations, 'ux_ui', 1, 'Limited navigation structure detected.')
  }

  if (ux.ctaCount >= 2 || signals.has_quote_cta || signals.has_booking_cta || signals.has_add_to_cart) {
    points += 4
    addExplanation(explanations, 'ux_ui', 4, 'Primary call-to-action text detected.')
  } else if (ux.ctaCount >= 1) {
    points += 2
    addExplanation(explanations, 'ux_ui', 2, 'At least one CTA detected.')
  }

  if (ux.textLength >= 1200) {
    points += 3
    addExplanation(explanations, 'ux_ui', 3, 'Readable content length supports clear messaging.')
  } else if (ux.textLength >= 500) {
    points += 1
    addExplanation(explanations, 'ux_ui', 1, 'Content depth is moderate.')
  }

  if (ux.imageCount >= 3) {
    points += 2
    addExplanation(explanations, 'ux_ui', 2, 'Images present to support visual presentation.')
  } else if (ux.imageCount >= 1) {
    points += 1
    addExplanation(explanations, 'ux_ui', 1, 'At least one image detected.')
  }

  if (ux.hasMobileViewport) {
    points += 2
    addExplanation(explanations, 'ux_ui', 2, 'Mobile viewport meta tag supports responsive layout.')
  }

  if (ux.hasContactVisible || signals.has_phone) {
    points += 2
    addExplanation(explanations, 'ux_ui', 2, 'Contact information is visible on crawled pages.')
  }

  if (process.env.VISUAL_AUDIT_ENABLED === 'true') {
    addExplanation(
      explanations,
      'ux_ui',
      0,
      'Visual audit is enabled but screenshot analysis is not wired in this build (static checks only).',
    )
  }

  return clamp(points, UX_UI_MAX)
}

function scoreCustomerAttractionPoints(aggregated, signals, explanations) {
  let points = 0

  const strongCta =
    signals.has_quote_cta ||
    signals.has_booking_cta ||
    signals.has_add_to_cart ||
    (aggregated.content_signals?.ctas || []).length >= 2
  if (strongCta) {
    points += 2
    addExplanation(explanations, 'customer_attraction', 2, 'Strong call-to-action for quote, booking, or purchase.')
  }

  if (aggregated.trust_signals?.review_indicators) {
    points += 2
    addExplanation(explanations, 'customer_attraction', 2, 'Reviews or testimonials detected.')
  }

  if (signals.has_service_area || signals.has_local_city) {
    points += 2
    addExplanation(explanations, 'customer_attraction', 2, 'Local SEO or service-area language detected.')
  }

  if (
    aggregated.pricing_signals?.length > 0 ||
    signals.has_product_categories ||
    signals.has_service_categories ||
    signals.has_quote_cta
  ) {
    points += 2
    addExplanation(explanations, 'customer_attraction', 2, 'Clear offer or service categories are visible.')
  }

  if (signals.has_gallery) {
    points += 1
    addExplanation(explanations, 'customer_attraction', 1, 'Gallery or portfolio proof supports trust.')
  }

  if (signals.has_phone || signals.has_booking_cta || signals.has_add_to_cart) {
    points += 1
    addExplanation(explanations, 'customer_attraction', 1, 'Easy contact, book, or buy path detected.')
  }

  return clamp(points, CUSTOMER_ATTRACTION_MAX)
}

function legacyScoresFromCategories(categoryScores) {
  const product_clarity = clamp(categoryScores.product_clarity)
  const offer_clarity = clamp(categoryScores.offer_clarity)
  const trust = clamp(categoryScores.trust)
  const policies = clamp(categoryScores.policies)
  const social_proof = clamp(categoryScores.social_proof)
  const content = clamp(categoryScores.content)
  const technical = clamp(categoryScores.technical)

  return {
    store_score: clamp(product_clarity * 0.55 + offer_clarity * 0.45),
    trust_score: clamp(trust * 0.45 + policies * 0.35 + social_proof * 0.2),
    offer_score: offer_clarity,
    content_score: content,
    technical_score: technical,
    category_scores: {
      product_clarity,
      offer_clarity,
      trust,
      policies,
      social_proof,
      content,
      technical_crawlability: technical,
    },
  }
}

function applyScoreCaps({
  overall,
  safetyStatus,
  homepageOk,
  keyPagesMostlyFailed,
  scoreCapsApplied,
}) {
  let capped = overall

  if (safetyStatus === 'unsafe' && capped > 30) {
    capped = 30
    scoreCapsApplied.push('unsafe_site_cap_30')
  }
  if (!homepageOk && capped > 40) {
    capped = 40
    scoreCapsApplied.push('homepage_failure_cap_40')
  }
  if (keyPagesMostlyFailed && capped > 60) {
    capped = 60
    scoreCapsApplied.push('key_pages_failure_cap_60')
  }

  return capped
}

function calculatePriorityScores(aggregated, business, pages, options = {}) {
  const explanations = []
  const scoreCapsApplied = []
  const signals = detectOperationalSignals(pages, aggregated)
  const rubric = resolveScoringRubric(business, aggregated)
  const mismatchWarnings = detectMismatchWarnings(rubric, aggregated, business)

  for (const warning of mismatchWarnings) {
    addExplanation(explanations, 'mismatch', 0, warning)
  }

  const crawlHealth = inferCrawlHealth(pages, business?.store_url, options.crawlMeta || {})
  const safety = scoreSafetyPoints(options.safetyResult, explanations)
  const functionality_score = scoreFunctionalityPoints(aggregated, pages, crawlHealth, explanations)
  const ux_ui_score = scoreUxUiPoints(pages, aggregated, signals, explanations)
  const rubricCtx = { aggregated, business, pages, signals, explanations }
  const categoryScores = scoreForRubric(rubric, rubricCtx)
  const business_fit_score = scoreBusinessFitWeighted(rubric, rubricCtx, explanations)
  const customer_attraction_score = scoreCustomerAttractionPoints(aggregated, signals, explanations)

  let overall_score =
    safety.points +
    functionality_score +
    ux_ui_score +
    business_fit_score +
    customer_attraction_score

  overall_score = applyScoreCaps({
    overall: overall_score,
    safetyStatus: safety.status,
    homepageOk: crawlHealth.homepageOk,
    keyPagesMostlyFailed: crawlHealth.keyPagesMostlyFailed,
    scoreCapsApplied,
  })

  const legacy = legacyScoresFromCategories(categoryScores)

  const result = {
    overall_score,
    safety_score: safety.points,
    functionality_score,
    ux_ui_score,
    business_fit_score,
    customer_attraction_score,
    safety_status: safety.status,
    score_caps_applied: scoreCapsApplied,
    ...legacy,
    scoring_rubric: rubric,
    score_explanation: explanations.slice(0, 32),
    mismatch_warnings: mismatchWarnings,
  }

  const validation = validateWeightedScore(result)
  if (!validation.valid) {
    result.score_validation_errors = validation.errors
  }

  return result
}

module.exports = {
  calculatePriorityScores,
  validateWeightedScore,
  SAFETY_MAX,
  UNKNOWN_SAFETY_SCORE,
  FUNCTIONALITY_MAX,
  UX_UI_MAX,
  BUSINESS_FIT_MAX,
  CUSTOMER_ATTRACTION_MAX,
  inferCrawlHealth,
  scoreSafetyPoints,
  scoreFunctionalityPoints,
}
