const { resolveScoringRubric } = require('./businessModelConfig')

const WEIGHTED_CATEGORY_MAX = {
  safety_score: 30,
  functionality_score: 20,
  ux_ui_score: 20,
  business_fit_score: 20,
  customer_attraction_score: 10,
}

const WEIGHTED_SCORE_FIELDS = Object.keys(WEIGHTED_CATEGORY_MAX)

function clamp(value, max = 100) {
  return Math.max(0, Math.min(max, Math.round(value)))
}

function validateWeightedScore(scores) {
  const errors = []

  for (const key of WEIGHTED_SCORE_FIELDS) {
    if (typeof scores?.[key] !== 'number' || Number.isNaN(scores[key])) {
      errors.push(`Missing or invalid ${key}`)
    } else if (scores[key] < 0 || scores[key] > WEIGHTED_CATEGORY_MAX[key]) {
      errors.push(`${key} (${scores[key]}) is outside 0–${WEIGHTED_CATEGORY_MAX[key]}`)
    }
  }

  if (typeof scores?.overall_score !== 'number' || Number.isNaN(scores.overall_score)) {
    errors.push('Missing or invalid overall_score')
  } else if (errors.length === 0) {
    const sum = WEIGHTED_SCORE_FIELDS.reduce((total, key) => total + scores[key], 0)
    const caps = scores.score_caps_applied || []
    if (caps.length === 0 && scores.overall_score !== sum) {
      errors.push(`overall_score (${scores.overall_score}) does not equal category sum (${sum})`)
    } else if (caps.length > 0 && scores.overall_score > sum) {
      errors.push(`overall_score (${scores.overall_score}) exceeds category sum (${sum})`)
    }
  }

  return { valid: errors.length === 0, errors }
}

function needsWeightedScoreRehydration(scores) {
  if (!scores || typeof scores !== 'object') return true
  return WEIGHTED_SCORE_FIELDS.some(
    (key) => typeof scores[key] !== 'number' || Number.isNaN(scores[key]),
  )
}

function addWeightedExplanation(explanations, category, delta, reason) {
  if (!reason) return
  explanations.push({ category, delta, reason })
}

function addExplanation(explanations, category, delta, reason) {
  if (!delta) return
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

function detectOperationalSignals(pages, aggregated) {
  const text = pages.map((p) => String(p.extracted_text || '')).join(' ')
  const lower = text.toLowerCase()
  const ctaText = (aggregated.content_signals?.ctas || []).join(' ').toLowerCase()
  const blob = `${lower} ${ctaText}`

  const phones = new Set()
  for (const page of pages) {
    for (const phone of pageData(page).phones || []) phones.add(phone)
  }

  return {
    has_phone: phones.size > 0 || /\(\d{3}\)|\d{3}-\d{3}-\d{4}|call us|phone:/i.test(blob),
    has_address:
      /\d{1,5}\s+\w+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|lane|dr|drive)\b/i.test(text) ||
      /our location|visit us at|address:/i.test(lower),
    has_hours:
      /business hours|store hours|open (mon|tue|wed|thu|fri)|monday|tuesday|closed sunday/i.test(lower),
    has_map_directions: /get directions|google maps|find us|directions to/i.test(lower),
    has_contact_page: pages.some((p) => p.page_type === 'contact'),
    has_service_area:
      /\bserving\b|service area|serving the|we serve|coverage area|areas we serve/i.test(lower),
    has_quote_cta: /quote|free estimate|request a quote|get a quote|request estimate/i.test(blob),
    has_booking_cta: /book now|schedule|appointment|book online|schedule service/i.test(blob),
    has_consultation: /consultation|free consult|book a consult/i.test(lower),
    has_gallery:
      /gallery|portfolio|our work|before and after|project gallery/i.test(lower) ||
      pages.some((p) => /gallery|portfolio/i.test(String(p.url || ''))),
    has_local_city: /\b(serving|located in|proudly serving)\s+[A-Z][a-z]+/i.test(text),
    has_add_to_cart: /add to cart|buy now|shop now|checkout/i.test(blob),
    has_product_categories: (aggregated.content_signals?.navigation_labels || []).some((n) =>
      /product|collection|shop|catalog/i.test(n),
    ),
    has_service_categories:
      (aggregated.services || []).length > 0 ||
      pages.some((p) => p.page_type === 'services' || /services?/i.test(String(p.url || ''))),
    has_niche_language: Boolean(aggregated.content_signals?.total_text_length > 800),
    has_creator_links: (aggregated.social_channels || []).length >= 2,
  }
}

function detectMismatchWarnings(rubric, aggregated, business) {
  const warnings = []
  const site = aggregated.site_classification?.classification || 'unknown'
  const ecommerceSites = ['shopify_dtc', 'single_brand_ecommerce']
  const serviceSites = ['service']
  const marketplaceSites = ['marketplace']

  if (rubric === 'ecommerce_store' && marketplaceSites.includes(site)) {
    warnings.push(
      'Onboarding says ecommerce store, but the crawler detected a marketplace listing page.',
    )
  }
  if (
    ['online_plus_physical_service', 'local_service_business'].includes(rubric) &&
    ecommerceSites.includes(site)
  ) {
    warnings.push(
      'Onboarding says service business, but the crawler detected Shopify/ecommerce storefront patterns.',
    )
  }
  if (rubric === 'marketplace_listing' && ecommerceSites.includes(site) && !marketplaceSites.includes(site)) {
    warnings.push(
      'Onboarding says marketplace listing, but the crawler detected a direct brand storefront.',
    )
  }
  if (rubric === 'content_social_business' && ecommerceSites.includes(site)) {
    warnings.push(
      'Onboarding says content/social business, but the crawler found strong ecommerce storefront signals.',
    )
  }
  return [...new Set(warnings)]
}

function applySharedBasics(scores, aggregated, pages, signals, explanations, business) {
  const meta = aggregated.extraction_meta || {}

  if (aggregated.trust_signals?.https) {
    scores.trust += 12
    scores.technical += 10
    addExplanation(explanations, 'trust', 12, 'Site uses HTTPS.')
    addExplanation(explanations, 'technical', 10, 'HTTPS improves crawlability trust.')
  }
  if (aggregated.trust_signals?.review_indicators) {
    scores.social_proof += 16
    addExplanation(explanations, 'social_proof', 16, 'Review or testimonial language detected.')
  }
  if ((aggregated.social_channels || []).length > 0) {
    scores.social_proof += 8
    addExplanation(explanations, 'social_proof', 8, 'Social profile links found.')
  }
  if (aggregated.content_signals?.total_text_length > 1500) {
    scores.content += 14
    addExplanation(explanations, 'content', 14, 'Substantial readable content extracted.')
  }
  if (aggregated.content_signals?.page_count >= 3) {
    scores.content += 8
    addExplanation(explanations, 'content', 8, 'Multiple pages crawled.')
  }
  if (aggregated.platform && aggregated.platform !== 'unknown') {
    scores.technical += 8
    addExplanation(explanations, 'technical', 8, `Platform detected: ${aggregated.platform}.`)
  }
  if (pages.length >= 3) {
    scores.technical += 6
    addExplanation(explanations, 'technical', 6, 'Crawler reached multiple site pages.')
  }
  if (meta.js_rendered_pages > 0) {
    scores.technical -= 12
    scores.content -= 8
    addExplanation(
      explanations,
      'technical',
      -12,
      'Sparse or JS-rendered HTML reduced crawlability confidence.',
    )
    addExplanation(explanations, 'content', -8, 'Limited server-rendered content extracted.')
  }
  if (aggregated.policy_signals?.privacy) {
    scores.policies += 8
    addExplanation(explanations, 'policies', 8, 'Privacy policy signals found.')
  }
  if (!business?.store_url) {
    scores.technical -= 6
    addExplanation(explanations, 'technical', -6, 'No store URL saved on the business record.')
  }
}

function scoreEcommerceStore(ctx) {
  const { aggregated, explanations } = ctx
  const meta = aggregated.extraction_meta || {}
  const scores = {
    product_clarity: 28,
    offer_clarity: 25,
    trust: 28,
    policies: 20,
    social_proof: 18,
    content: 25,
    technical: 30,
  }

  const highConfidenceCount = meta.high_confidence_product_count || 0

  if (highConfidenceCount >= 3) {
    scores.product_clarity += 18
    addExplanation(explanations, 'product_clarity', 18, 'Multiple high-confidence products extracted.')
  } else if (highConfidenceCount >= 1) {
    scores.product_clarity += 10
    addExplanation(explanations, 'product_clarity', 10, 'At least one high-confidence product found.')
  }
  if (meta.has_json_ld_products) {
    scores.product_clarity += 8
    addExplanation(explanations, 'product_clarity', 8, 'Structured JSON-LD product data detected.')
  }
  if (meta.has_reliable_product_cards) {
    scores.product_clarity += 10
    addExplanation(explanations, 'product_clarity', 10, 'Reliable product cards with name and price/image/link.')
  }
  if (meta.has_product_detail_page) {
    scores.product_clarity += 8
    scores.offer_clarity += 6
    addExplanation(explanations, 'product_clarity', 8, 'Product detail page signals were crawled.')
    addExplanation(explanations, 'offer_clarity', 6, 'Product detail page improves offer clarity.')
  }
  if (aggregated.pricing_signals?.length > 0 && highConfidenceCount > 0) {
    scores.offer_clarity += 10
    addExplanation(explanations, 'offer_clarity', 10, 'Prices align with extracted products.')
  }
  if (ctx.signals.has_add_to_cart) {
    scores.offer_clarity += 8
    addExplanation(explanations, 'offer_clarity', 8, 'Primary purchase CTA detected.')
  }
  if (aggregated.policy_signals?.shipping) {
    scores.policies += 14
    addExplanation(explanations, 'policies', 14, 'Shipping policy signals found.')
  }
  if (aggregated.policy_signals?.returns) {
    scores.policies += 14
    addExplanation(explanations, 'policies', 14, 'Return policy signals found.')
  }

  if (meta.low_confidence_extraction) {
    scores.product_clarity -= 18
    scores.offer_clarity -= 12
    addExplanation(explanations, 'product_clarity', -18, 'Product extraction confidence is low.')
    addExplanation(explanations, 'offer_clarity', -12, 'Low-confidence products weaken offer clarity.')
  }
  if (!meta.has_reliable_product_cards) {
    scores.product_clarity -= 12
    addExplanation(explanations, 'product_clarity', -12, 'No reliable product cards detected.')
  }
  if (meta.prices_without_products_pages > 0) {
    scores.offer_clarity -= 10
    addExplanation(explanations, 'offer_clarity', -10, 'Prices found without reliable product cards.')
  }
  if (!meta.has_product_detail_page) {
    scores.offer_clarity -= 8
    addExplanation(explanations, 'offer_clarity', -8, 'No product detail page was crawled.')
  }
  if ((aggregated.products || []).length === 0) {
    scores.product_clarity -= 15
    scores.offer_clarity -= 10
    addExplanation(explanations, 'product_clarity', -15, 'No products extracted from crawled pages.')
    addExplanation(explanations, 'offer_clarity', -10, 'Missing primary product offer on crawled pages.')
  }

  applySharedBasics(scores, aggregated, ctx.pages, ctx.signals, explanations, ctx.business)
  return scores
}

function scoreOnlinePlusOfflineStore(ctx) {
  const { aggregated, signals, explanations } = ctx
  const scores = {
    product_clarity: 50,
    offer_clarity: 48,
    trust: 42,
    policies: 30,
    social_proof: 32,
    content: 40,
    technical: 38,
  }

  if (signals.has_address) {
    scores.trust += 12
    addExplanation(explanations, 'trust', 12, 'Physical address or location wording detected.')
  }
  if (signals.has_hours) {
    scores.trust += 10
    addExplanation(explanations, 'trust', 10, 'Business hours detected.')
  }
  if (signals.has_phone) {
    scores.trust += 10
    addExplanation(explanations, 'trust', 10, 'Phone contact detected.')
  }
  if (signals.has_contact_page) {
    scores.trust += 8
    addExplanation(explanations, 'trust', 8, 'Contact page crawled.')
  }
  if (signals.has_map_directions) {
    scores.trust += 8
    addExplanation(explanations, 'trust', 8, 'Directions/map language detected.')
  }
  if (signals.has_local_city) {
    scores.content += 10
    addExplanation(explanations, 'content', 10, 'Local city/area SEO wording detected.')
  }
  if (signals.has_product_categories || signals.has_service_categories) {
    scores.offer_clarity += 10
    addExplanation(explanations, 'offer_clarity', 10, 'Product or service categories are discoverable.')
  }
  if ((aggregated.high_confidence_products || []).length > 0) {
    scores.product_clarity += 8
    addExplanation(explanations, 'product_clarity', 8, 'Some product offers detected online.')
  }

  const localHits = [
    signals.has_address,
    signals.has_hours,
    signals.has_phone,
    signals.has_contact_page,
    signals.has_map_directions,
  ].filter(Boolean).length
  if (localHits >= 3) {
    scores.trust += 10
    scores.offer_clarity += 8
    scores.content += 8
    addExplanation(
      explanations,
      'trust',
      10,
      'Strong local presence across address, hours, and contact signals.',
    )
    addExplanation(explanations, 'offer_clarity', 8, 'Local storefront signals improve offer clarity.')
    addExplanation(explanations, 'content', 8, 'Local business details strengthen on-site content.')
  }

  applySharedBasics(scores, aggregated, ctx.pages, signals, explanations, ctx.business)
  return scores
}

function scorePhysicalService(ctx) {
  const { aggregated, signals, explanations } = ctx
  const scores = {
    product_clarity: 48,
    offer_clarity: 42,
    trust: 40,
    policies: 26,
    social_proof: 30,
    content: 36,
    technical: 34,
  }

  if (signals.has_quote_cta) {
    scores.offer_clarity += 14
    addExplanation(explanations, 'offer_clarity', 14, 'Quote or estimate CTA detected.')
  }
  if (signals.has_booking_cta) {
    scores.offer_clarity += 12
    addExplanation(explanations, 'offer_clarity', 12, 'Booking or scheduling CTA detected.')
  }
  if (signals.has_consultation) {
    scores.offer_clarity += 8
    addExplanation(explanations, 'offer_clarity', 8, 'Consultation language detected.')
  }
  if (signals.has_phone) {
    scores.trust += 12
    addExplanation(explanations, 'trust', 12, 'Phone contact detected.')
  }
  if (signals.has_service_area) {
    scores.offer_clarity += 10
    addExplanation(explanations, 'offer_clarity', 10, 'Service area language detected.')
  }
  if (signals.has_service_categories) {
    scores.offer_clarity += 10
    addExplanation(explanations, 'offer_clarity', 10, 'Service categories/pages detected.')
  }
  if (signals.has_gallery) {
    scores.content += 12
    addExplanation(explanations, 'content', 12, 'Gallery or portfolio proof detected.')
  }
  if (signals.has_address || signals.has_map_directions) {
    scores.trust += 8
    addExplanation(explanations, 'trust', 8, 'Location or directions signals detected.')
  }

  const serviceHits = [
    signals.has_quote_cta,
    signals.has_booking_cta,
    signals.has_phone,
    signals.has_service_area,
    signals.has_gallery,
    aggregated.trust_signals?.review_indicators,
  ].filter(Boolean).length
  if (serviceHits >= 4) {
    scores.offer_clarity += 10
    scores.trust += 8
    scores.content += 8
    addExplanation(
      explanations,
      'offer_clarity',
      10,
      'Strong service-business signals across quote, contact, proof, and reviews.',
    )
    addExplanation(explanations, 'trust', 8, 'Service proof and contact signals build trust.')
    addExplanation(explanations, 'content', 8, 'Service portfolio and proof content detected.')
  }

  applySharedBasics(scores, aggregated, ctx.pages, signals, explanations, ctx.business)
  return scores
}

function scoreLocalService(ctx) {
  return scorePhysicalService(ctx)
}

function scoreContentSocial(ctx) {
  const { aggregated, signals, explanations } = ctx
  const scores = {
    product_clarity: 45,
    offer_clarity: 40,
    trust: 28,
    policies: 18,
    social_proof: 22,
    content: 32,
    technical: 30,
  }

  if ((aggregated.social_channels || []).length >= 2) {
    scores.social_proof += 14
    addExplanation(explanations, 'social_proof', 14, 'Multiple social/creator links detected.')
  } else if ((aggregated.social_channels || []).length === 1) {
    scores.social_proof += 8
    addExplanation(explanations, 'social_proof', 8, 'At least one social profile linked.')
  }
  if (aggregated.content_signals?.newsletter_indicators) {
    scores.offer_clarity += 10
    addExplanation(explanations, 'offer_clarity', 10, 'Newsletter or list-building CTA detected.')
  }
  if (signals.has_niche_language) {
    scores.content += 12
    addExplanation(explanations, 'content', 12, 'Clear niche/audience content depth detected.')
  }
  if ((aggregated.content_signals?.navigation_labels || []).length >= 4) {
    scores.content += 8
    addExplanation(explanations, 'content', 8, 'Consistent content/navigation categories found.')
  }
  if (signals.has_creator_links) {
    scores.social_proof += 6
    addExplanation(explanations, 'social_proof', 6, 'Creator/platform links support content business model.')
  }

  applySharedBasics(scores, aggregated, ctx.pages, signals, explanations, ctx.business)
  return scores
}

function scoreMarketplaceListing(ctx) {
  const { aggregated, explanations, business } = ctx
  const site = aggregated.site_classification?.classification
  const scores = {
    product_clarity: 30,
    offer_clarity: 28,
    trust: 25,
    policies: 15,
    social_proof: 15,
    content: 22,
    technical: 28,
  }

  if (site === 'marketplace') {
    scores.product_clarity += 10
    scores.offer_clarity += 8
    addExplanation(
      explanations,
      'product_clarity',
      10,
      'Marketplace listing patterns match selected business model.',
    )
    addExplanation(explanations, 'offer_clarity', 8, 'Listing page structure recognized.')
  } else if (business?.business_model === 'marketplace_listing') {
    scores.product_clarity -= 12
    scores.offer_clarity -= 10
    addExplanation(
      explanations,
      'product_clarity',
      -12,
      'URL does not look like a marketplace listing despite selected model.',
    )
    addExplanation(
      explanations,
      'offer_clarity',
      -10,
      'Limited direct brand control signals for marketplace scoring.',
    )
  }

  if (site === 'marketplace' && business?.business_model !== 'marketplace_listing') {
    scores.product_clarity -= 18
    scores.offer_clarity -= 14
    addExplanation(
      explanations,
      'product_clarity',
      -18,
      'Marketplace listing detected — limited direct storefront control.',
    )
    addExplanation(
      explanations,
      'offer_clarity',
      -14,
      'Marketplace pages are scored with lower direct-offer control.',
    )
  }

  applySharedBasics(scores, aggregated, ctx.pages, ctx.signals, explanations, ctx.business)
  return scores
}

function scoreForRubric(rubric, ctx) {
  switch (rubric) {
    case 'online_plus_offline_store':
      return scoreOnlinePlusOfflineStore(ctx)
    case 'online_plus_physical_service':
      return scorePhysicalService(ctx)
    case 'local_service_business':
      return scoreLocalService(ctx)
    case 'content_social_business':
      return scoreContentSocial(ctx)
    case 'marketplace_listing':
      return scoreMarketplaceListing(ctx)
    case 'ecommerce_store':
    default:
      return scoreEcommerceStore(ctx)
  }
}

function scoreBusinessFitWeighted(rubric, ctx, explanations) {
  const { aggregated, signals } = ctx
  const meta = aggregated.extraction_meta || {}
  const max = WEIGHTED_CATEGORY_MAX.business_fit_score
  let points = 0

  if (['online_plus_physical_service', 'local_service_business'].includes(rubric)) {
    points = 6
    addWeightedExplanation(
      explanations,
      'business_fit',
      6,
      'Service-business baseline for a crawlable website.',
    )

    if (signals.has_phone) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Phone contact detected for local service customers.')
    }
    if (signals.has_quote_cta) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Quote or estimate CTA matches service sales flow.')
    }
    if (signals.has_booking_cta) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Booking or scheduling CTA detected.')
    }
    if (signals.has_consultation) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Consultation offer language detected.')
    }
    if (signals.has_service_categories) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Dedicated service pages or categories are discoverable.')
    }
    if (signals.has_gallery) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Gallery or portfolio proof supports a service business.')
    }
    if (aggregated.trust_signals?.review_indicators) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Reviews or testimonials reinforce service credibility.')
    }
    if (signals.has_service_area || signals.has_local_city) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Service-area or local city signals match the business model.')
    }
    if (signals.has_contact_page || signals.has_address) {
      points += 1
      addWeightedExplanation(explanations, 'business_fit', 1, 'Contact page or address helps local customers reach you.')
    }
  } else if (rubric === 'online_plus_offline_store') {
    points = 8
    addWeightedExplanation(
      explanations,
      'business_fit',
      8,
      'Hybrid online + physical store baseline.',
    )
    if (signals.has_phone || signals.has_address) {
      points += 3
      addWeightedExplanation(explanations, 'business_fit', 3, 'Local storefront contact or address signals detected.')
    }
    if (signals.has_product_categories || (aggregated.high_confidence_products || []).length > 0) {
      points += 3
      addWeightedExplanation(explanations, 'business_fit', 3, 'Online product or category offers are visible.')
    }
    if (signals.has_hours || signals.has_map_directions) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Hours or directions support in-person visits.')
    }
    if (aggregated.trust_signals?.review_indicators) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Reviews support both online and local trust.')
    }
    if (signals.has_service_categories) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Service categories complement the hybrid model.')
    }
  } else if (rubric === 'content_social_business') {
    points = 7
    addWeightedExplanation(explanations, 'business_fit', 7, 'Content/social business baseline.')
    if ((aggregated.social_channels || []).length >= 2) {
      points += 4
      addWeightedExplanation(explanations, 'business_fit', 4, 'Multiple social/creator profile links detected.')
    } else if ((aggregated.social_channels || []).length === 1) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'At least one social profile is linked.')
    }
    if (aggregated.content_signals?.newsletter_indicators) {
      points += 3
      addWeightedExplanation(explanations, 'business_fit', 3, 'Newsletter or audience-building CTA detected.')
    }
    if (signals.has_niche_language) {
      points += 3
      addWeightedExplanation(explanations, 'business_fit', 3, 'Niche audience content depth detected.')
    }
    if ((aggregated.content_signals?.navigation_labels || []).length >= 4) {
      points += 3
      addWeightedExplanation(explanations, 'business_fit', 3, 'Consistent content navigation categories found.')
    }
  } else if (rubric === 'marketplace_listing') {
    points = 6
    addWeightedExplanation(explanations, 'business_fit', 6, 'Marketplace listing baseline.')
    if (aggregated.site_classification?.classification === 'marketplace') {
      points += 8
      addWeightedExplanation(explanations, 'business_fit', 8, 'Crawler detected marketplace listing patterns.')
    } else {
      points += 2
      addWeightedExplanation(
        explanations,
        'business_fit',
        2,
        'Limited marketplace listing signals on the submitted URL.',
      )
    }
    if ((aggregated.products || []).length > 0) {
      points += 4
      addWeightedExplanation(explanations, 'business_fit', 4, 'Listing products or offers were extracted.')
    }
  } else {
    points = 5
    addWeightedExplanation(explanations, 'business_fit', 5, 'Ecommerce store baseline.')
    const highConfidenceCount = meta.high_confidence_product_count || 0
    if (highConfidenceCount >= 2) {
      points += 4
      addWeightedExplanation(explanations, 'business_fit', 4, 'Multiple high-confidence products extracted.')
    } else if (highConfidenceCount >= 1) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'At least one high-confidence product found.')
    }
    if (meta.has_reliable_product_cards) {
      points += 3
      addWeightedExplanation(explanations, 'business_fit', 3, 'Reliable product cards with name, price, and link/image.')
    }
    if (meta.has_json_ld_products) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Structured JSON-LD product data detected.')
    }
    if (meta.has_product_detail_page) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Product detail page signals were crawled.')
    }
    if (aggregated.policy_signals?.shipping && aggregated.policy_signals?.returns) {
      points += 3
      addWeightedExplanation(explanations, 'business_fit', 3, 'Shipping and return policies are discoverable.')
    }
    if (ctx.signals.has_add_to_cart) {
      points += 2
      addWeightedExplanation(explanations, 'business_fit', 2, 'Primary purchase CTA detected.')
    }
    if (meta.low_confidence_extraction) {
      points -= 4
      addWeightedExplanation(explanations, 'business_fit', -4, 'Product extraction confidence is low.')
    }
    if (!meta.has_reliable_product_cards && highConfidenceCount === 0) {
      points -= 3
      addWeightedExplanation(explanations, 'business_fit', -3, 'No reliable product cards detected.')
    }
  }

  return clamp(points, max)
}

function finalizeScores(categoryScores, rubric, explanations, mismatchWarnings) {
  const product_clarity = clamp(categoryScores.product_clarity)
  const offer_clarity = clamp(categoryScores.offer_clarity)
  const trust = clamp(categoryScores.trust)
  const policies = clamp(categoryScores.policies)
  const social_proof = clamp(categoryScores.social_proof)
  const content = clamp(categoryScores.content)
  const technical = clamp(categoryScores.technical)

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
    scoring_rubric: rubric,
    score_explanation: explanations.slice(0, 24),
    mismatch_warnings: mismatchWarnings,
  }
}

function calculateScoresWithRubric(aggregated, business, pages, options = {}) {
  return require('./priorityWebsiteScoring').calculatePriorityScores(
    aggregated,
    business,
    pages,
    options,
  )
}

module.exports = {
  detectOperationalSignals,
  detectMismatchWarnings,
  calculateScoresWithRubric,
  scoreForRubric,
  scoreBusinessFitWeighted,
  validateWeightedScore,
  needsWeightedScoreRehydration,
  WEIGHTED_SCORE_FIELDS,
  WEIGHTED_CATEGORY_MAX,
  resolveScoringRubric,
}
