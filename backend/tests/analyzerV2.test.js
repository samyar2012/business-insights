const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { calculateAnalyzerV2Scores } = require('../services/analyzerV2')
const { interpretBenchmarkLevel, humanEquivalentFromOverall } = require('../services/analyzerV2/benchmarkInterpreter')
const { buildProfileScoresPayload } = require('../services/businessProfileLogic')
const { validateWeightedScore } = require('../services/businessScoringRubrics')

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

const SERVICE_AGG = {
  products: [],
  product_names: [],
  high_confidence_products: [],
  social_channels: ['https://instagram.com/plumber'],
  policy_signals: { shipping: false, returns: false, privacy: true, terms: false },
  trust_signals: { https: true, review_indicators: true, policy_count: 1 },
  content_signals: {
    total_text_length: 2200,
    page_count: 4,
    ctas: ['Book now', 'Get a quote'],
    navigation_labels: ['Services', 'Gallery', 'Contact'],
  },
  platform: 'WordPress',
  extraction_meta: {
    high_confidence_product_count: 0,
    js_rendered_pages: 0,
  },
  site_classification: { classification: 'service', confidence: 75, indicators: [] },
  pricing_signals: [],
  services: ['Drain cleaning', 'Water heater repair'],
  contact_signals: { emails: ['help@plumber.com'], phones: ['(555) 123-4567'] },
}

function richEcommercePages() {
  return [
    {
      page_type: 'homepage',
      status_code: 200,
      title: 'Acme Shop — Buy quality goods',
      meta_description: 'Shop our catalog online.',
      final_url: 'https://shop.com/',
      extracted_text: 'Welcome. Add to cart. Shop now. Customer reviews.',
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
      },
    },
    {
      page_type: 'contact',
      status_code: 200,
      final_url: 'https://shop.com/contact',
      extracted_text: 'Contact hello@shop.com',
      extracted_data_json: { emails: ['hello@shop.com'], has_mobile_viewport: true },
    },
    {
      page_type: 'services',
      status_code: 200,
      final_url: 'https://shop.com/gallery',
      extracted_text: 'Gallery',
      extracted_data_json: { headings: { h1: ['Gallery'] }, has_mobile_viewport: true, image_count: 3 },
    },
  ]
}

function servicePages() {
  return [
    {
      page_type: 'homepage',
      status_code: 200,
      title: 'City Plumber — Book today',
      extracted_text:
        'Book now. Get a quote. Serving Austin. Call us at (555) 123-4567. Gallery of our work. Customer reviews.',
      extracted_data_json: {
        headings: { h1: ['City Plumber'] },
        has_mobile_viewport: true,
        image_count: 6,
        ctas: ['Book now', 'Get a quote'],
        phones: ['(555) 123-4567'],
        navigation_labels: ['Services', 'Gallery', 'Contact'],
        review_indicators: true,
      },
    },
    {
      page_type: 'contact',
      status_code: 200,
      url: 'https://plumber.com/contact',
      extracted_text: 'Contact us',
      extracted_data_json: { phones: ['(555) 123-4567'], emails: ['help@plumber.com'] },
    },
    {
      page_type: 'services',
      status_code: 200,
      url: 'https://plumber.com/services',
      extracted_text: 'Drain cleaning and water heater repair',
      extracted_data_json: { headings: { h1: ['Our Services'] } },
    },
  ]
}

function emptyEcommercePages() {
  return [
    {
      page_type: 'homepage',
      status_code: 200,
      extracted_text: 'Welcome to our blog about life.',
      extracted_data_json: {
        headings: { h1: ['Welcome'] },
        has_mobile_viewport: true,
        navigation_labels: ['Home', 'About'],
      },
    },
  ]
}

const EMPTY_ECOMMERCE_AGG = {
  products: [],
  product_names: [],
  high_confidence_products: [],
  social_channels: [],
  policy_signals: { shipping: false, returns: false, privacy: false, terms: false },
  trust_signals: { https: true, review_indicators: false, policy_count: 0 },
  content_signals: {
    total_text_length: 400,
    page_count: 1,
    ctas: [],
    navigation_labels: ['Home', 'About'],
  },
  platform: 'unknown',
  extraction_meta: {
    high_confidence_product_count: 0,
    has_reliable_product_cards: false,
    has_product_detail_page: false,
    js_rendered_pages: 0,
  },
  site_classification: { classification: 'unknown', confidence: 40, indicators: [] },
  pricing_signals: [],
  services: [],
  contact_signals: { emails: [], phones: [] },
}

describe('analyzerV2', () => {
  it('ecommerce site with no products cannot score high', () => {
    const scores = calculateAnalyzerV2Scores(
      EMPTY_ECOMMERCE_AGG,
      { store_url: 'https://example.com', business_model: 'ecommerce_store' },
      emptyEcommercePages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 1, pages_discovered: 1 },
      },
    )

    assert.equal(scores.scoring_version, 'business_insights_analyzer_v2_roadmap_1')
    assert.ok(scores.overall_score <= 55)
    assert.ok(scores.business_fit_score <= 10)
    assert.ok(scores.category_details.offer_business_fit.problems.some((p) => /product/i.test(p)))
  })

  it('service site with booking, phone, and gallery signals can score well', () => {
    const scores = calculateAnalyzerV2Scores(
      SERVICE_AGG,
      { store_url: 'https://plumber.com', business_model: 'local_service_business' },
      servicePages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 3, pages_discovered: 3 },
      },
    )

    assert.ok(scores.overall_score >= 55)
    assert.ok(scores.business_fit_score >= 10)
    assert.ok(scores.customer_attraction_score >= 8)
  })

  it('63/100 converts to 12.6/20 and is major issue — not average', () => {
    const human = humanEquivalentFromOverall(63)
    assert.equal(human, 12.6)
    const level = interpretBenchmarkLevel(human)
    assert.equal(level.id, 'major_issue')
    assert.equal(level.is_average, false)
    assert.ok(level.is_major_issue)
    assert.ok(human < 17)
  })

  it('17/20 is average benchmark level', () => {
    const level = interpretBenchmarkLevel(17)
    assert.equal(level.id, 'average')
    assert.equal(level.is_average, true)
  })

  it('16/20 is below average benchmark level', () => {
    const level = interpretBenchmarkLevel(16)
    assert.equal(level.id, 'below_average')
    assert.equal(level.is_below_average, true)
  })

  it('12/20 is major issue benchmark level', () => {
    const level = interpretBenchmarkLevel(12)
    assert.equal(level.id, 'major_issue')
    assert.equal(level.is_major_issue, true)
  })

  it('unsafe site is capped at 30', () => {
    const scores = calculateAnalyzerV2Scores(
      STRONG_ECOMMERCE_AGG,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      richEcommercePages(),
      {
        safetyResult: {
          status: 'unsafe',
          configured: true,
          threats: ['MALWARE'],
          message: 'Unsafe.',
        },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 3 },
      },
    )
    assert.ok(scores.overall_score <= 30)
    assert.ok(scores.score_caps_applied.includes('unsafe_site_cap_30'))
  })

  it('homepage failure is capped at 40', () => {
    const scores = calculateAnalyzerV2Scores(
      STRONG_ECOMMERCE_AGG,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      [],
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: false, pages_crawled: 0 },
      },
    )
    assert.ok(scores.overall_score <= 40)
    assert.ok(scores.score_caps_applied.includes('homepage_failure_cap_40'))
  })

  it('no CTA or contact path caps score at 75', () => {
    const scores = calculateAnalyzerV2Scores(
      {
        ...EMPTY_ECOMMERCE_AGG,
        contact_signals: { emails: [], phones: [] },
        content_signals: {
          ...EMPTY_ECOMMERCE_AGG.content_signals,
          ctas: [],
          total_text_length: 2500,
          navigation_labels: ['Shop', 'About', 'Blog', 'FAQ'],
        },
        trust_signals: { https: true, review_indicators: true, policy_count: 2 },
        policy_signals: { shipping: true, returns: true, privacy: true, terms: false },
        products: STRONG_ECOMMERCE_AGG.products,
        high_confidence_products: STRONG_ECOMMERCE_AGG.high_confidence_products,
        extraction_meta: STRONG_ECOMMERCE_AGG.extraction_meta,
        pricing_signals: ['$29.99', '$39.99'],
        social_channels: ['https://instagram.com/brand'],
      },
      { store_url: 'https://example.com', business_model: 'ecommerce_store' },
      [
        {
          page_type: 'homepage',
          status_code: 200,
          title: 'Premium Brand — Quality goods',
          meta_description: 'Shop our catalog of premium goods online.',
          extracted_text: 'x'.repeat(2500),
          extracted_data_json: {
            headings: { h1: ['Premium Brand'] },
            has_mobile_viewport: true,
            image_count: 8,
            navigation_labels: ['Shop', 'About', 'Blog', 'FAQ'],
            review_indicators: true,
            policies: { shipping: true, returns: true, privacy: true },
            products: STRONG_ECOMMERCE_AGG.products,
            extraction_meta: STRONG_ECOMMERCE_AGG.extraction_meta,
          },
        },
        {
          page_type: 'services',
          status_code: 200,
          url: 'https://example.com/shop',
          extracted_text: 'Browse our catalog.',
          extracted_data_json: {
            headings: { h1: ['Shop'] },
            has_mobile_viewport: true,
            image_count: 4,
            products: STRONG_ECOMMERCE_AGG.products,
          },
        },
        {
          page_type: 'about',
          status_code: 200,
          url: 'https://example.com/about',
          extracted_text: 'About our brand story.',
          extracted_data_json: { headings: { h1: ['About'] }, has_mobile_viewport: true },
        },
      ],
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 3, pages_discovered: 3 },
      },
    )
    assert.ok(scores.score_caps_applied.includes('no_conversion_path_cap_75'))
    assert.ok(scores.overall_score <= 75)
  })

  it('mobile overflow lowers UX score', () => {
    const scores = calculateAnalyzerV2Scores(
      STRONG_ECOMMERCE_AGG,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      richEcommercePages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 3 },
        visualAudit: {
          ok: true,
          summary: {
            horizontal_overflow_mobile: true,
            overflow_severity_mobile: 'major',
            cta_above_fold: true,
            nav_above_fold: true,
          },
          desktop: { metrics: { horizontal_overflow: false, headings: [{ tag: 'h1', above_fold: true }] } },
          mobile: { metrics: { horizontal_overflow: true, overflow_severity: 'major' } },
        },
      },
    )
    assert.ok(scores.ux_ui_score < 20)
    assert.ok(
      scores.category_details.ux_ui_visual.problems.some((p) => /overflow|mobile/i.test(p)) ||
        scores.score_caps_applied.includes('mobile_overflow_cap_70'),
    )
  })

  it('visual audit unavailable lowers confidence but does not crash', () => {
    const scores = calculateAnalyzerV2Scores(
      STRONG_ECOMMERCE_AGG,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      richEcommercePages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 3 },
        visualAudit: { ok: false, enabled: true, reason: 'skipped' },
      },
    )
    assert.ok(scores.confidence_score < 80)
    assert.ok(scores.category_details.ux_ui_visual.confidence < 70)
    assert.equal(scores.scoring_version, 'business_insights_analyzer_v2_roadmap_1')
  })

  it('preserves legacy frontend-compatible fields', () => {
    const payload = buildProfileScoresPayload(
      STRONG_ECOMMERCE_AGG,
      { store_url: 'https://shop.com', business_model: 'ecommerce_store' },
      richEcommercePages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 3 },
      },
    )

    for (const key of [
      'safety_score',
      'functionality_score',
      'ux_ui_score',
      'business_fit_score',
      'customer_attraction_score',
      'overall_score',
      'strengths',
      'risks',
      'recommended_actions',
      'score_explanation',
    ]) {
      assert.ok(key in payload, `missing ${key}`)
    }

    const validation = validateWeightedScore(payload)
    assert.equal(validation.valid, true, validation.errors?.join('; '))
  })

  it('gallery business model scores well when catalog and consultation signals exist', () => {
    const scores = calculateAnalyzerV2Scores(
      {
        ...STRONG_ECOMMERCE_AGG,
        services: ['Custom blinds', 'Motorized shades'],
      },
      { store_url: 'https://shades.com', business_model: 'online_gallery_physical_service' },
      richEcommercePages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 3, pages_discovered: 3 },
        visualAudit: {
          ok: true,
          summary: {
            product_grid_image_count: 8,
            image_count: 40,
            evidence_confidence: 0.8,
          },
        },
      },
    )

    assert.ok(scores.business_fit_score >= 12)
    assert.ok(
      scores.category_details.offer_business_fit.strengths.some((item) =>
        /catalog|gallery|consultation|contact|quote/i.test(item),
      ),
    )
  })

  it('ecommerce business fit uses catalog fallbacks when product extraction is incomplete', () => {
    const scores = calculateAnalyzerV2Scores(
      {
        ...EMPTY_ECOMMERCE_AGG,
        platform: 'Shopify',
        content_signals: {
          total_text_length: 1800,
          page_count: 4,
          ctas: ['Shop now', 'Browse collection'],
          navigation_labels: ['Shop', 'Curtains', 'Blinds', 'Contact'],
        },
        site_classification: { classification: 'shopify_dtc', confidence: 70, indicators: [] },
      },
      { store_url: 'https://curtains.com', business_model: 'ecommerce_store' },
      [
        {
          page_type: 'homepage',
          status_code: 200,
          final_url: 'https://curtains.com/',
          extracted_text: 'Shop curtains and blinds. Browse collection. Free consultation.',
          extracted_data_json: { headings: { h1: ['Custom Curtains'] }, ctas: ['Shop now'] },
        },
        {
          page_type: 'collection',
          status_code: 200,
          final_url: 'https://curtains.com/collections/curtains',
          extracted_text: 'Shop all curtains. Prices from $99.',
        },
      ],
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 2, pages_discovered: 2 },
        visualAudit: {
          ok: true,
          summary: {
            product_grid_image_count: 6,
            image_count: 24,
            evidence_confidence: 0.8,
          },
        },
      },
    )

    assert.ok(scores.business_fit_score >= 8)
    assert.ok(
      !scores.category_details.offer_business_fit.problems.some((item) =>
        /severely limited/i.test(item),
      ),
    )
  })

  it('does not claim missing service pages when consultation and shop categories exist', () => {
    const scores = calculateAnalyzerV2Scores(
      {
        ...EMPTY_ECOMMERCE_AGG,
        content_signals: {
          total_text_length: 1600,
          page_count: 2,
          ctas: ['Free Consultation', 'Shop Curtains'],
          navigation_labels: [],
        },
      },
      { store_url: 'https://curtains.com', business_model: 'online_plus_physical_service' },
      [
        {
          page_type: 'homepage',
          status_code: 200,
          final_url: 'https://curtains.com/',
          extracted_text: 'Custom curtains and blinds. Free consultation available.',
          extracted_data_json: {
            headings: { h1: ['Custom Curtains'], h2: ['Blinds', 'Shades'] },
            ctas: ['Free Consultation'],
          },
        },
        {
          page_type: 'collection',
          status_code: 200,
          final_url: 'https://curtains.com/collections/curtains',
          extracted_text: 'Shop all curtains.',
        },
      ],
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 2, pages_discovered: 2 },
        visualAudit: {
          ok: true,
          summary: {
            product_grid_image_count: 6,
            has_structured_header: true,
            primary_nav_link_count: 4,
          },
          evidence_snippets: {
            desktop_nav: ['Curtains', 'Blinds', 'Consultation', 'Contact'],
          },
        },
      },
    )

    const fit = scores.category_details.offer_business_fit
    assert.ok(
      !fit.problems.some((item) =>
        /service pages|shop categories|cannot quickly tell what products/i.test(item),
      ),
    )
    assert.ok(
      fit.strengths.some((item) =>
        /quote|consultation|product lines|shop categories|matches how customers buy/i.test(item),
      ),
    )
  })
})
