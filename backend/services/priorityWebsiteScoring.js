const { resolveScoringRubric } = require('./businessModelConfig')
const { unknownResult } = require('./safeBrowsingService')
const {
  detectOperationalSignals,
  detectMismatchWarnings,
  scoreForRubric,
  scoreBusinessFitWeighted,
  validateWeightedScore,
} = require('./businessScoringRubrics')
const { buildUxFeatureExplanations, extractUxFeatures } = require('./uxFeatureExtractor')

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

const WEIGHTED_EXPLANATION_CATEGORIES = new Set([
  'safety',
  'functionality',
  'ux_ui',
  'business_fit',
  'customer_attraction',
  'mismatch',
])

function filterWeightedExplanations(explanations) {
  return explanations.filter((item) => WEIGHTED_EXPLANATION_CATEGORIES.has(item.category))
}

function inferCrawlHealth(pages, startUrl, crawlMeta = {}) {
  const homepage = pages.find((p) => p.page_type === 'homepage') || pages[0] || null
  const homepageOk =
    crawlMeta.homepage_fetch_ok !== undefined
      ? Boolean(crawlMeta.homepage_fetch_ok)
      : Boolean(homepage && (homepage.status_code === undefined || homepage.status_code < 400))

  const discovered = crawlMeta.pages_discovered || pages.length
  const crawled = crawlMeta.pages_crawled ?? pages.length
  const pagesFailed = Math.max(0, Number(crawlMeta.pages_failed ?? crawlMeta.fetch_failures ?? 0) || 0)
  const attemptedFetches = crawled + pagesFailed
  const skippedDueToLimit = Math.max(0, discovered - crawled - pagesFailed)
  const fetchFailureRate =
    attemptedFetches > 0 ? pagesFailed / attemptedFetches : pages.length === 0 && pagesFailed > 0 ? 1 : 0

  const hasContact = pages.some((p) => p.page_type === 'contact')
  const hasServices = pages.some((p) => p.page_type === 'services')
  const hasGallery = pages.some(
    (p) => /gallery|portfolio/i.test(String(p.url || '')) || p.page_type === 'gallery',
  )

  const keyPageTypes = [hasContact, hasServices, hasGallery].filter(Boolean).length
  const keyPagesMostlyFailed =
    !homepageOk ||
    (pagesFailed >= 3 && fetchFailureRate > 0.5) ||
    (attemptedFetches >= 3 && crawled === 0 && pagesFailed > 0) ||
    (pages.length > 0 && keyPageTypes === 0 && pagesFailed >= 2 && fetchFailureRate > 0.5)

  return {
    homepageOk,
    homepage,
    discovered,
    crawled,
    pagesFailed,
    skippedDueToLimit,
    attemptedFetches,
    fetchFailureRate,
    hasContact,
    hasServices,
    hasGallery,
    keyPageTypes,
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

function scoreSafetyPoints(safetyResult, explanations, crawlContext = {}) {
  const result = safetyResult || unknownResult()
  const { aggregated = {}, crawlHealth = {} } = crawlContext
  const https = Boolean(aggregated.trust_signals?.https)
  const homepageOk = crawlHealth.homepageOk !== false
  const fetchHealthy = (crawlHealth.pagesFailed ?? 0) === 0

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

  const crawlTrustScore = scoreCrawlTrustSafety({ https, homepageOk, fetchHealthy, crawlHealth })
  const points = clamp(crawlTrustScore, SAFETY_MAX)

  if (points >= SAFETY_MAX) {
    addExplanation(
      explanations,
      'safety',
      SAFETY_MAX,
      result.configured
        ? 'Safe Browsing could not verify this URL, but HTTPS and crawl checks passed with no security red flags.'
        : 'Site is served over HTTPS, loads successfully, and passed crawl security checks.',
    )
    return { points: SAFETY_MAX, status: 'verified' }
  }

  addExplanation(
    explanations,
    'safety',
    points,
    buildPartialSafetyReason({ https, homepageOk, fetchHealthy, configured: result.configured }),
  )
  return { points, status: 'unknown' }
}

function scoreCrawlTrustSafety({ https, homepageOk, fetchHealthy, crawlHealth = {} }) {
  if (!https) return 8
  if (!homepageOk) return 10
  if (!fetchHealthy) return 12

  let score = SAFETY_MAX
  if ((crawlHealth.pagesFailed ?? 0) >= 2) score -= 6
  else if ((crawlHealth.fetchFailureRate ?? 0) >= 0.25) score -= 4

  return score
}

function buildPartialSafetyReason({ https, homepageOk, fetchHealthy, configured }) {
  if (!https) return 'HTTPS was not detected — safety score is reduced until the site uses a secure connection.'
  if (!homepageOk) return 'Homepage did not load reliably — safety score is reduced until the site is reachable.'
  if (!fetchHealthy) return 'Multiple page fetch failures during crawl reduced the safety score.'
  if (configured) return 'Safe Browsing verification was inconclusive; partial safety credit applied.'
  return 'Crawl security checks passed partially; some signals were missing.'
}

function scoreFunctionalityPoints(aggregated, pages, crawlHealth, explanations) {
  let points = 0

  if (crawlHealth.homepageOk) {
    points += 4
    addExplanation(explanations, 'functionality', 4, 'Homepage loaded successfully.')
  } else {
    addExplanation(explanations, 'functionality', 0, 'Homepage failed to load or returned an error.')
  }

  if (aggregated.trust_signals?.https) {
    points += 2
    addExplanation(explanations, 'functionality', 2, 'Site is served over HTTPS.')
  } else {
    addExplanation(explanations, 'functionality', 0, 'HTTPS was not detected on crawled pages.')
  }

  const pageCount = pages.length
  if (pageCount >= 5) {
    points += 3
    addExplanation(explanations, 'functionality', 3, 'Several supporting pages were crawled successfully.')
  } else if (pageCount >= 3) {
    points += 2
    addExplanation(explanations, 'functionality', 2, 'Multiple main pages crawled successfully.')
  } else if (pageCount >= 1) {
    points += 1
    addExplanation(explanations, 'functionality', 1, 'Only a limited set of pages was crawled.')
  } else {
    addExplanation(explanations, 'functionality', 0, 'No pages were crawled from the submitted URL.')
  }

  if (crawlHealth.pagesFailed === 0 && pageCount >= 2) {
    points += 1
    addExplanation(explanations, 'functionality', 1, 'No page fetch failures during crawl.')
  } else if (crawlHealth.fetchFailureRate >= 0.5) {
    addExplanation(
      explanations,
      'functionality',
      0,
      `${crawlHealth.pagesFailed} page fetch failure(s) reported during crawl.`,
    )
  } else if (crawlHealth.pagesFailed > 0) {
    addExplanation(
      explanations,
      'functionality',
      0,
      `${crawlHealth.pagesFailed} page fetch failure(s) reduced functionality confidence.`,
    )
  }

  const reachableKeyPages = [
    crawlHealth.hasContact,
    crawlHealth.hasServices,
    crawlHealth.hasGallery,
  ].filter(Boolean).length
  if (reachableKeyPages >= 2) {
    points += 2
    addExplanation(explanations, 'functionality', 2, 'Contact, services, or gallery pages are reachable.')
  } else if (reachableKeyPages === 1) {
    points += 1
    addExplanation(explanations, 'functionality', 1, 'One supporting page (contact, services, or gallery) was crawled.')
  } else {
    addExplanation(explanations, 'functionality', 0, 'No contact, services, or gallery page was discovered.')
  }

  const ux = collectUxSignals(pages, aggregated)
  if (ux.hasMobileViewport) {
    points += 1
    addExplanation(explanations, 'functionality', 1, 'Mobile viewport meta tag detected.')
  } else {
    addExplanation(explanations, 'functionality', 0, 'No mobile viewport meta tag detected.')
  }

  if (ux.textLength >= 1500) {
    points += 2
    addExplanation(explanations, 'functionality', 2, 'Enough readable content extracted for analysis.')
  } else if (ux.textLength >= 700) {
    points += 1
    addExplanation(explanations, 'functionality', 1, 'Readable content depth is moderate.')
  } else {
    addExplanation(explanations, 'functionality', 0, 'Very little readable content on crawled pages.')
  }

  if (pageCount <= 1) {
    points = Math.max(0, points - 2)
    addExplanation(explanations, 'functionality', -2, 'Only one page was analyzed, so site depth is limited.')
  }

  if (crawlHealth.skippedDueToLimit > 0) {
    addExplanation(
      explanations,
      'functionality',
      0,
      `Crawl page limit reached (${crawlHealth.crawled} pages analyzed); ${crawlHealth.skippedDueToLimit} additional URLs were discovered but not fetched.`,
    )
  }

  return clamp(points, FUNCTIONALITY_MAX)
}

function scoreUxUiFromFeatureSignals(uxFeatures, explanations, usedVisualAudit = false) {
  const points = clamp(Math.round((uxFeatures.overall_static_ux_score / 100) * UX_UI_MAX), UX_UI_MAX)

  addExplanation(
    explanations,
    'ux_ui',
    points,
    usedVisualAudit
      ? `UX/UI score from visual layout audit and page signals (${uxFeatures.overall_static_ux_score}/100 → ${points}/${UX_UI_MAX}).`
      : `UX/UI score from page layout and readability signals (${uxFeatures.overall_static_ux_score}/100 → ${points}/${UX_UI_MAX}).`,
  )

  for (const reason of buildUxFeatureExplanations(uxFeatures)) {
    addExplanation(explanations, 'ux_ui', 0, reason)
  }

  return points
}

function scoreUxUiFromVisualFeatures(uxFeatures, explanations) {
  return scoreUxUiFromFeatureSignals(uxFeatures, explanations, true)
}

function scoreUxUiPointsStatic(pages, aggregated, signals, explanations) {
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

  return clamp(points, UX_UI_MAX)
}

function scoreUxUiPoints(pages, aggregated, signals, explanations, options = {}) {
  const { uxFeatures, visualAudit } = options
  if (uxFeatures?.overall_static_ux_score != null) {
    return scoreUxUiFromFeatureSignals(uxFeatures, explanations, Boolean(visualAudit?.ok))
  }
  return scoreUxUiPointsStatic(pages, aggregated, signals, explanations)
}

function scoreCustomerAttractionPoints(aggregated, signals, explanations, options = {}) {
  const rubric = options.rubric || 'ecommerce_store'
  const ux = options.uxSignals || {}
  const isService = ['online_plus_physical_service', 'local_service_business'].includes(rubric)
  let points = 0

  if (isService) {
    if (signals.has_quote_cta || signals.has_booking_cta) {
      points += 2
      addExplanation(
        explanations,
        'customer_attraction',
        2,
        'Quote or booking CTA gives visitors a clear next step.',
      )
    } else {
      addExplanation(explanations, 'customer_attraction', 0, 'No strong quote or booking CTA detected.')
    }
    if (signals.has_consultation) {
      points += 1
      addExplanation(
        explanations,
        'customer_attraction',
        1,
        'Consultation language lowers friction for high-intent leads.',
      )
    }
    if (signals.has_phone || signals.has_contact_page) {
      points += 1
      addExplanation(
        explanations,
        'customer_attraction',
        1,
        'Phone number or contact page makes it easier to reach you.',
      )
    } else {
      addExplanation(explanations, 'customer_attraction', 0, 'No phone number or contact page detected.')
    }
    if (aggregated.trust_signals?.review_indicators) {
      points += 2
      addExplanation(explanations, 'customer_attraction', 2, 'Reviews or testimonials build trust.')
    } else {
      addExplanation(explanations, 'customer_attraction', 0, 'No review or testimonial proof detected.')
    }
    if (signals.has_gallery) {
      points += 1
      addExplanation(
        explanations,
        'customer_attraction',
        1,
        'Gallery or portfolio proof supports conversion.',
      )
    }
    if (signals.has_service_area || signals.has_local_city) {
      points += 1
      addExplanation(
        explanations,
        'customer_attraction',
        1,
        'Service-area or local city wording helps nearby customers find you.',
      )
    }
    if (signals.has_service_categories) {
      points += 1
      addExplanation(
        explanations,
        'customer_attraction',
        1,
        'Dedicated services content clarifies what you offer.',
      )
    }
    if (ux.hasH1 && ux.navLabelCount >= 2) {
      points += 1
      addExplanation(
        explanations,
        'customer_attraction',
        1,
        'Clear hero message and navigation help visitors understand your offer quickly.',
      )
    }
    return clamp(points, CUSTOMER_ATTRACTION_MAX)
  }

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
  const legacyExplanations = []
  const scoreCapsApplied = []
  const signals = detectOperationalSignals(pages, aggregated)
  const rubric = resolveScoringRubric(business, aggregated)
  const mismatchWarnings = detectMismatchWarnings(rubric, aggregated, business)

  for (const warning of mismatchWarnings) {
    addExplanation(explanations, 'mismatch', 0, warning)
  }

  const crawlHealth = inferCrawlHealth(pages, business?.store_url, options.crawlMeta || {})
  const uxFeatures =
    options.uxFeatures ??
    extractUxFeatures({
      visualAudit: options.visualAudit || null,
      pages,
      aggregated,
    })
  const safety = scoreSafetyPoints(options.safetyResult, explanations, {
    aggregated,
    crawlHealth,
  })
  const functionality_score = scoreFunctionalityPoints(aggregated, pages, crawlHealth, explanations)
  const ux_ui_score = scoreUxUiPoints(pages, aggregated, signals, explanations, {
    uxFeatures,
    visualAudit: options.visualAudit,
  })
  const rubricCtx = { aggregated, business, pages, signals }
  const categoryScores = scoreForRubric(rubric, { ...rubricCtx, explanations: legacyExplanations })
  const business_fit_score = scoreBusinessFitWeighted(rubric, rubricCtx, explanations)
  const uxSignals = collectUxSignals(pages, aggregated)
  const customer_attraction_score = scoreCustomerAttractionPoints(aggregated, signals, explanations, {
    rubric,
    uxSignals,
  })

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
    score_explanation: filterWeightedExplanations(explanations).slice(0, 24),
    mismatch_warnings: mismatchWarnings,
    ux_scoring_mode: uxFeatures
      ? options.visualAudit?.ok
        ? 'visual_audit'
        : 'feature_signals'
      : 'static_html',
  }

  if (uxFeatures) {
    result.ux_features = uxFeatures
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
  filterWeightedExplanations,
  WEIGHTED_EXPLANATION_CATEGORIES,
  SAFETY_MAX,
  UNKNOWN_SAFETY_SCORE,
  FUNCTIONALITY_MAX,
  UX_UI_MAX,
  BUSINESS_FIT_MAX,
  CUSTOMER_ATTRACTION_MAX,
  inferCrawlHealth,
  scoreSafetyPoints,
  scoreCrawlTrustSafety,
  scoreFunctionalityPoints,
  scoreUxUiPoints,
  scoreUxUiPointsStatic,
  scoreUxUiFromFeatureSignals,
  scoreUxUiFromVisualFeatures,
  collectUxSignals,
}
