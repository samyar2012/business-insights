const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  calculatePriorityScores,
  SAFETY_MAX,
  UNKNOWN_SAFETY_SCORE,
  inferCrawlHealth,
} = require('../services/priorityWebsiteScoring')
const { validateWeightedScore, needsWeightedScoreRehydration } = require('../services/businessScoringRubrics')
const { unknownResult } = require('../services/safeBrowsingService')
const {
  calculateScores,
  buildRisks,
  buildRecommendedActions,
  buildProfileScoresPayload,
} = require('../services/businessProfileLogic')

const STRONG_ECOMMERCE_AGG = {
  products: [
    { name: 'A', confidence: 85, source: 'json_ld_product' },
    { name: 'B', confidence: 80, source: 'product_card' },
    { name: 'C', confidence: 78, source: 'product_card' },
  ],
  product_names: ['A', 'B', 'C'],
  high_confidence_products: [
    { name: 'A', confidence: 85 },
    { name: 'B', confidence: 80 },
    { name: 'C', confidence: 78 },
  ],
  social_channels: ['https://instagram.com/x'],
  policy_signals: { shipping: true, returns: true, privacy: true, terms: false },
  trust_signals: { https: true, review_indicators: true, policy_count: 3 },
  content_signals: {
    total_text_length: 2000,
    page_count: 5,
    ctas: ['Add to cart', 'Shop'],
    navigation_labels: ['Shop', 'About', 'Contact'],
  },
  platform: 'Shopify',
  extraction_meta: {
    high_confidence_product_count: 3,
    avg_product_confidence: 81,
    has_reliable_product_cards: true,
    has_product_detail_page: true,
    has_json_ld_products: true,
    low_confidence_extraction: false,
    noisy_pages: 0,
    prices_without_products_pages: 0,
    js_rendered_pages: 0,
  },
  site_classification: { classification: 'shopify_dtc', confidence: 80, indicators: [] },
  pricing_signals: ['$29.99'],
  services: [],
  contact_signals: { emails: ['hello@shop.com'], phones: [] },
}

function richPages(overrides = {}) {
  return [
    {
      page_type: 'homepage',
      status_code: 200,
      final_url: 'https://shop.com/',
      extracted_text: 'Welcome to our shop. Add to cart. Shop now. Customer reviews.',
      extracted_data_json: {
        headings: { h1: ['Welcome to Acme Shop'] },
        has_mobile_viewport: true,
        image_count: 5,
        ctas: ['Add to cart', 'Shop now'],
        navigation_labels: ['Shop', 'About', 'Contact'],
        review_indicators: true,
        policies: { shipping: true, returns: true, privacy: true },
        products: STRONG_ECOMMERCE_AGG.products,
        extraction_meta: STRONG_ECOMMERCE_AGG.extraction_meta,
        page_classification_hint: 'shopify_dtc',
      },
      ...overrides,
    },
    {
      page_type: 'contact',
      status_code: 200,
      final_url: 'https://shop.com/contact',
      extracted_text: 'Contact us at hello@shop.com',
      extracted_data_json: {
        emails: ['hello@shop.com'],
        headings: { h1: ['Contact'] },
        has_mobile_viewport: true,
        image_count: 1,
      },
    },
    {
      page_type: 'services',
      status_code: 200,
      final_url: 'https://shop.com/pages/services',
      extracted_text: 'Our services and gallery of work.',
      extracted_data_json: {
        headings: { h1: ['Services'] },
        has_mobile_viewport: true,
        image_count: 2,
      },
    },
  ]
}

describe('priorityWebsiteScoring', () => {
  it('caps overall score at 30 when safety status is unsafe', () => {
    const scores = calculatePriorityScores(
      STRONG_ECOMMERCE_AGG,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      richPages(),
      {
        safetyResult: {
          status: 'unsafe',
          configured: true,
          threats: ['MALWARE'],
          message: 'Site flagged by Google Safe Browsing: MALWARE.',
        },
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 3, pages_crawled: 3 },
      },
    )

    assert.equal(scores.safety_status, 'unsafe')
    assert.equal(scores.safety_score, 0)
    assert.ok(scores.overall_score <= 30)
    assert.ok(scores.score_caps_applied.includes('unsafe_site_cap_30'))
  })

  it('caps overall score at 40 when homepage fetch fails', () => {
    const scores = calculatePriorityScores(
      STRONG_ECOMMERCE_AGG,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      [],
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: false, pages_discovered: 5, pages_crawled: 0 },
      },
    )

    assert.ok(scores.overall_score <= 40)
    assert.ok(scores.score_caps_applied.includes('homepage_failure_cap_40'))
  })

  it('does not award full safety points when status is unknown', () => {
    const scores = calculatePriorityScores(
      STRONG_ECOMMERCE_AGG,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      richPages(),
      {
        safetyResult: unknownResult(),
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 3, pages_crawled: 3 },
      },
    )

    assert.equal(scores.safety_status, 'unknown')
    assert.equal(scores.safety_score, UNKNOWN_SAFETY_SCORE)
    assert.ok(scores.safety_score < SAFETY_MAX)
    assert.ok(scores.safety_score > 0)
    assert.ok(
      scores.score_explanation.some((e) =>
        /not configured/i.test(e.reason),
      ),
    )
  })

  it('service-business fixture returns weighted fields and overall equals the sum', () => {
    const pages = [
      {
        page_type: 'homepage',
        status_code: 200,
        final_url: 'https://hvacpro.com/',
        extracted_text:
          'Request a free quote. Serving Dallas and Fort Worth. Call us at (214) 555-0100. View our project gallery. Customer reviews and testimonials. Schedule service today.',
        extracted_data_json: {
          products: [],
          phones: ['(214) 555-0100'],
          ctas: ['Request a quote', 'Schedule service'],
          review_indicators: true,
          headings: { h1: ['HVAC Pro Services'] },
          has_mobile_viewport: true,
          image_count: 4,
          navigation_labels: ['Services', 'Gallery', 'Contact'],
          policies: {},
          extraction_meta: {
            has_reliable_product_cards: false,
            has_product_detail_page: false,
          },
          page_classification_hint: 'service',
        },
      },
      {
        page_type: 'contact',
        status_code: 200,
        final_url: 'https://hvacpro.com/contact',
        extracted_text: 'Contact us for a consultation.',
        extracted_data_json: {
          headings: { h1: ['Contact'] },
          has_mobile_viewport: true,
          image_count: 1,
        },
      },
      {
        page_type: 'services',
        status_code: 200,
        final_url: 'https://hvacpro.com/services',
        extracted_text: 'Our HVAC services and gallery.',
        extracted_data_json: {
          headings: { h1: ['Services'] },
          has_mobile_viewport: true,
          image_count: 2,
        },
      },
    ]

    const aggregated = require('../services/businessProfileLogic').aggregatePages(pages)
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://hvacpro.com', business_model: 'online_plus_physical_service' },
      pages,
      {
        safetyResult: unknownResult(),
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 3, pages_crawled: 3 },
      },
    )

    assert.ok(scores.safety_score > 0)
    assert.ok(scores.functionality_score > 0)
    assert.ok(scores.ux_ui_score > 0)
    assert.ok(scores.business_fit_score > 0)
    assert.ok(scores.customer_attraction_score > 0)
    assert.equal(
      scores.overall_score,
      scores.safety_score +
        scores.functionality_score +
        scores.ux_ui_score +
        scores.business_fit_score +
        scores.customer_attraction_score,
    )
    assert.equal(validateWeightedScore(scores).valid, true)
  })

  it('fails validation when weighted fields are missing', () => {
    const validation = validateWeightedScore({
      overall_score: 63,
      safety_score: 15,
      functionality_score: 12,
    })
    assert.equal(validation.valid, false)
    assert.ok(validation.errors.some((e) => /ux_ui_score/.test(e)))
    assert.ok(validation.errors.some((e) => /business_fit_score/.test(e)))
    assert.ok(validation.errors.some((e) => /customer_attraction_score/.test(e)))
  })

  it('unknown safety does not produce safety_score 0', () => {
    const scores = calculatePriorityScores(
      STRONG_ECOMMERCE_AGG,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      richPages(),
      {
        safetyResult: unknownResult(),
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 3, pages_crawled: 3 },
      },
    )
    assert.notEqual(scores.safety_score, 0)
    assert.equal(scores.safety_status, 'unknown')
  })

  it('scores la-shades-like physical service with HTTPS, booking, gallery, and multiple pages', () => {
    const pages = [
      {
        page_type: 'homepage',
        status_code: 200,
        final_url: 'https://la-shades.com/',
        extracted_text:
          'Custom window shades and blinds. Serving Los Angeles. Call (310) 555-0199. Book a free in-home consultation. View our gallery. Customer reviews and testimonials.',
        extracted_data_json: {
          phones: ['(310) 555-0199'],
          ctas: ['Book a consultation', 'Request a quote'],
          review_indicators: true,
          headings: { h1: ['LA Shades — Custom Window Treatments'] },
          has_mobile_viewport: true,
          image_count: 6,
          navigation_labels: ['Services', 'Gallery', 'Reviews', 'Contact'],
          page_classification_hint: 'service',
        },
      },
      {
        page_type: 'services',
        status_code: 200,
        final_url: 'https://la-shades.com/services',
        extracted_text: 'Motorized shades, roller blinds, and consultation services.',
        extracted_data_json: {
          headings: { h1: ['Our Services'] },
          has_mobile_viewport: true,
          image_count: 3,
        },
      },
      {
        page_type: 'contact',
        status_code: 200,
        final_url: 'https://la-shades.com/contact',
        extracted_text: 'Schedule your consultation. Serving the greater Los Angeles area.',
        extracted_data_json: {
          headings: { h1: ['Contact'] },
          has_mobile_viewport: true,
          image_count: 1,
        },
      },
      {
        page_type: 'gallery',
        status_code: 200,
        final_url: 'https://la-shades.com/gallery',
        extracted_text: 'Project gallery and before and after photos.',
        extracted_data_json: {
          headings: { h1: ['Gallery'] },
          has_mobile_viewport: true,
          image_count: 8,
        },
      },
    ]

    const aggregated = require('../services/businessProfileLogic').aggregatePages(pages)
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://la-shades.com', business_model: 'online_plus_physical_service' },
      pages,
      {
        safetyResult: unknownResult(),
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 4, pages_crawled: 4 },
      },
    )

    assert.equal(scores.scoring_rubric, 'online_plus_physical_service')
    assert.ok(scores.overall_score >= 55)
    assert.ok(scores.safety_score > 0)
    assert.ok(scores.functionality_score > 0)
    assert.ok(scores.ux_ui_score > 0)
    assert.ok(scores.business_fit_score > 0)
    assert.ok(scores.customer_attraction_score > 0)
    assert.equal(
      scores.overall_score,
      scores.safety_score +
        scores.functionality_score +
        scores.ux_ui_score +
        scores.business_fit_score +
        scores.customer_attraction_score,
    )
    assert.equal(
      scores.score_explanation.some((e) => /shipping policy/i.test(e.reason)),
      false,
    )
  })

  it('scores online + physical service well with quote, phone, gallery, and reviews', () => {
    const pages = [
      {
        page_type: 'homepage',
        status_code: 200,
        final_url: 'https://hvacpro.com/',
        extracted_text:
          'Request a free quote. Serving Dallas and Fort Worth. Call us at (214) 555-0100. View our project gallery. Customer reviews and testimonials. Schedule service today.',
        extracted_data_json: {
          products: [],
          phones: ['(214) 555-0100'],
          ctas: ['Request a quote', 'Schedule service'],
          review_indicators: true,
          headings: { h1: ['HVAC Pro Services'] },
          has_mobile_viewport: true,
          image_count: 4,
          navigation_labels: ['Services', 'Gallery', 'Contact'],
          policies: {},
          extraction_meta: {
            has_reliable_product_cards: false,
            has_product_detail_page: false,
          },
          page_classification_hint: 'service',
        },
      },
    ]

    const aggregated = require('../services/businessProfileLogic').aggregatePages(pages)
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://hvacpro.com', business_model: 'online_plus_physical_service' },
      pages,
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 1, pages_crawled: 1 },
      },
    )

    assert.equal(scores.scoring_rubric, 'online_plus_physical_service')
    assert.ok(scores.overall_score >= 58)
    assert.ok(scores.business_fit_score >= 10)
    assert.equal(
      scores.score_explanation.some((e) => /shipping policy/i.test(e.reason)),
      false,
    )
  })

  it('requires ecommerce features for ecommerce_store rubric', () => {
    const pages = [
      {
        final_url: 'https://bare.example/',
        page_type: 'homepage',
        status_code: 200,
        extracted_text: 'Welcome to our shop. About us. Contact.',
        extracted_data_json: {
          products: [],
          headings: { h1: ['Welcome'] },
          has_mobile_viewport: true,
          platform: 'unknown',
          extraction_meta: {
            has_reliable_product_cards: false,
            has_product_detail_page: false,
            high_confidence_product_count: 0,
            avg_product_confidence: 0,
          },
          page_classification_hint: 'unknown',
        },
      },
    ]

    const aggregated = require('../services/businessProfileLogic').aggregatePages(pages)
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://bare.example', business_model: 'ecommerce_store' },
      pages,
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 1, pages_crawled: 1 },
      },
    )

    assert.ok(scores.overall_score < 55)
    assert.ok(scores.business_fit_score < 12)
    assert.ok(
      scores.score_explanation.some((e) => e.delta < 0 && /product/i.test(e.reason)),
    )
  })

  it('detects legacy stored scores that need weighted rehydration', () => {
    assert.equal(
      needsWeightedScoreRehydration({
        overall_score: 65,
        scoring_rubric: 'online_plus_physical_service',
        store_score: 58,
      }),
      true,
    )
    assert.equal(
      needsWeightedScoreRehydration({
        overall_score: 72,
        safety_score: 15,
        functionality_score: 14,
        ux_ui_score: 16,
        business_fit_score: 18,
        customer_attraction_score: 9,
      }),
      false,
    )
  })

  it('rebuilds weighted score payload from crawled pages for legacy profiles', () => {
    const pages = richPages()
    const aggregated = require('../services/businessProfileLogic').aggregatePages(pages)
    const payload = buildProfileScoresPayload(
      aggregated,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      pages,
      {
        safetyResult: unknownResult(),
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 3, pages_crawled: 3 },
      },
    )

    assert.equal(needsWeightedScoreRehydration(payload), false)
    assert.ok(payload.safety_score > 0)
    assert.ok(payload.functionality_score > 0)
    assert.ok(payload.ux_ui_score > 0)
    assert.ok(payload.business_fit_score > 0)
    assert.ok(payload.customer_attraction_score > 0)
    assert.equal(
      payload.overall_score,
      payload.safety_score +
        payload.functionality_score +
        payload.ux_ui_score +
        payload.business_fit_score +
        payload.customer_attraction_score,
    )
  })

  it('does not apply key_pages_failure_cap_60 when discovered exceeds crawled but pages_failed is 0', () => {
    const pages = richPages()
    const crawlMeta = {
      homepage_fetch_ok: true,
      pages_discovered: 40,
      pages_crawled: 3,
      pages_failed: 0,
    }

    const health = inferCrawlHealth(pages, 'https://shop.com', crawlMeta)
    assert.equal(health.keyPagesMostlyFailed, false)
    assert.ok(health.skippedDueToLimit > 0)

    const scores = calculatePriorityScores(
      STRONG_ECOMMERCE_AGG,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      pages,
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta,
      },
    )

    assert.equal(scores.score_caps_applied.includes('key_pages_failure_cap_60'), false)
    assert.ok(
      scores.score_explanation.some((e) => /page limit reached|discovered but not fetched/i.test(e.reason)),
    )
  })

  it('score_explanation only includes weighted scoring categories', () => {
    const pages = richPages()
    const aggregated = require('../services/businessProfileLogic').aggregatePages(pages)
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      pages,
      {
        safetyResult: unknownResult(),
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 3, pages_crawled: 3, pages_failed: 0 },
      },
    )

    const allowed = new Set([
      'safety',
      'functionality',
      'ux_ui',
      'business_fit',
      'customer_attraction',
      'mismatch',
    ])
    assert.ok(scores.score_explanation.length > 0)
    assert.ok(scores.score_explanation.every((e) => allowed.has(e.category)))
    assert.equal(
      scores.score_explanation.some((e) =>
        ['product_clarity', 'offer_clarity', 'trust', 'policies', 'social_proof', 'content', 'technical'].includes(
          e.category,
        ),
      ),
      false,
    )
  })

  it('does not recommend marketplace storefront action for service sites with sponsored wording', () => {
    const pages = [
      {
        final_url: 'https://la-shades.com/',
        page_type: 'homepage',
        extracted_text:
          'Custom window shades. Book a consultation. We sponsored a local home show. Customer reviews.',
        extracted_data_json: {
          phones: ['(310) 555-0199'],
          ctas: ['Book a consultation'],
          review_indicators: true,
          headings: { h1: ['LA Shades'] },
          has_mobile_viewport: true,
          image_count: 4,
          navigation_labels: ['Services', 'Gallery', 'Contact'],
          page_classification_hint: 'service',
          page_classification_indicators: ['service_language'],
        },
      },
    ]

    const aggregated = require('../services/businessProfileLogic').aggregatePages(pages)
    assert.notEqual(aggregated.site_classification.classification, 'marketplace')
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://la-shades.com', business_model: 'online_plus_physical_service' },
      pages,
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 1, pages_crawled: 1, pages_failed: 0 },
      },
    )
    const actions = buildRecommendedActions(aggregated, pages, scores)
    assert.equal(
      actions.some((a) => /submit your own brand storefront url/i.test(a)),
      false,
    )
  })

  it('returns ranked priority fixes with impact and no placeholder dashes', () => {
    const pages = richPages()
    const aggregated = require('../services/businessProfileLogic').aggregatePages(pages)
    const payload = require('../services/businessProfileLogic').buildProfileScoresPayload(
      aggregated,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      pages,
      {
        safetyResult: unknownResult(),
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 3, pages_crawled: 3, pages_failed: 0 },
      },
    )

    assert.ok(payload.priority_fixes.length > 0)
    assert.ok(payload.priority_fixes.every((fix) => fix.rank >= 1 && fix.action && fix.action !== '-'))
    assert.ok(payload.priority_fixes.every((fix) => ['critical', 'high', 'medium', 'low'].includes(fix.priority)))
    assert.deepEqual(
      payload.recommended_actions,
      payload.priority_fixes.map((fix) => fix.action),
    )
    assert.ok(payload.risks.every((risk) => risk !== '-'))
  })

  it('uses crawl fallback risk copy when no serious issues are found', () => {
    const pages = [
      {
        page_type: 'homepage',
        status_code: 200,
        final_url: 'https://hvacpro.com/',
        extracted_text:
          'Request a free quote. Serving Dallas. Call (214) 555-0100. Gallery. Reviews. Schedule service.',
        extracted_data_json: {
          phones: ['(214) 555-0100'],
          ctas: ['Request a quote', 'Schedule service'],
          review_indicators: true,
          headings: { h1: ['HVAC Pro'] },
          has_mobile_viewport: true,
          image_count: 4,
          navigation_labels: ['Services', 'Gallery', 'Contact'],
          page_classification_hint: 'service',
        },
      },
      {
        page_type: 'contact',
        status_code: 200,
        final_url: 'https://hvacpro.com/contact',
        extracted_text: 'Contact HVAC Pro for service in Dallas.',
        extracted_data_json: {
          phones: ['(214) 555-0100'],
          headings: { h1: ['Contact'] },
          has_mobile_viewport: true,
          navigation_labels: ['Home', 'Services', 'Contact'],
        },
      },
      {
        page_type: 'services',
        status_code: 200,
        final_url: 'https://hvacpro.com/services',
        extracted_text: 'AC repair, heating installation, and maintenance plans.',
        extracted_data_json: {
          headings: { h1: ['Services'] },
          has_mobile_viewport: true,
          navigation_labels: ['Home', 'Services', 'Contact'],
        },
      },
    ]
    const aggregated = require('../services/businessProfileLogic').aggregatePages(pages)
    aggregated.trust_signals = { ...aggregated.trust_signals, https: true }
    const risks = buildRisks(
      aggregated,
      pages,
      calculateScores(
        aggregated,
        { store_url: 'https://hvacpro.com', business_model: 'online_plus_physical_service' },
        pages,
        {
          safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
          crawlMeta: { homepage_fetch_ok: true, pages_discovered: 3, pages_crawled: 3, pages_failed: 0 },
        },
      ),
    )
    assert.ok(risks.some((risk) => /No major risks detected from this crawl/i.test(risk)))
  })

  it('returns specific risks and recommended actions (never placeholder dashes)', () => {
    const pages = richPages()
    const aggregated = require('../services/businessProfileLogic').aggregatePages(pages)
    const scores = calculateScores(
      aggregated,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      pages,
      {
        safetyResult: unknownResult(),
        crawlMeta: { homepage_fetch_ok: true, pages_discovered: 3, pages_crawled: 3 },
      },
    )

    const risks = buildRisks(aggregated, pages, scores)
    const actions = buildRecommendedActions(aggregated, pages, scores)

    assert.ok(risks.length > 0)
    assert.ok(actions.length > 0)
    assert.equal(risks.includes('-'), false)
    assert.equal(actions.includes('-'), false)
    assert.ok(risks.every((r) => typeof r === 'string' && r.trim().length > 3))
    assert.ok(actions.every((a) => typeof a === 'string' && a.trim().length > 3))
  })
})
