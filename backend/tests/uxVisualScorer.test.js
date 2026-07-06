const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  buildVisualUxScore,
  mapVisualScoreToCategoryPoints,
  classifyCtaQuality,
  scoreNavbar,
  scoreHero,
  scoreReadability,
  scoreConversionPath,
} = require('../services/uxVisualScorer')
const { extractUxFeatures } = require('../services/uxFeatureExtractor')
const { calculateAnalyzerV2Scores } = require('../services/analyzerV2')
const { calculateScores } = require('../services/businessProfileLogic')

function premiumVisualAudit() {
  return {
    ok: true,
    enabled: true,
    summary: {
      nav_link_count: 7,
      nav_above_fold: true,
      cta_above_fold: true,
      hero_image_present: true,
      image_count: 14,
      above_fold_image_count: 4,
      avg_text_block_length: 140,
      max_text_block_length: 220,
      desktop_text_density: 0.001,
      mobile_text_density: 0.0011,
      horizontal_overflow_mobile: false,
      overflow_severity_mobile: 'none',
      has_structured_header: true,
    },
    desktop: {
      metrics: {
        nav_link_count: 7,
        nav_above_fold: true,
        headings: [{ tag: 'h1', text: 'Custom Window Shades in Los Angeles', above_fold: true }],
        cta_elements: [{ text: 'Book a free consultation', above_fold: true }],
        section_count: 5,
        hero_image_present: true,
        image_count: 14,
        quality_images: [{ width: 300, height: 200, has_alt: true }],
        images_with_alt_count: 6,
      },
      contrast: { median_ratio: 4.8 },
    },
    mobile: {
      metrics: {
        nav_link_count: 5,
        horizontal_overflow: false,
        overflow_severity: 'none',
        section_count: 4,
      },
      contrast: { median_ratio: 4.2 },
    },
    evidence_snippets: {
      h1: 'Custom Window Shades in Los Angeles',
      cta_samples: ['Book a free consultation'],
      desktop_nav: ['Services', 'Gallery', 'Reviews', 'Contact'],
    },
  }
}

function sparseVisualAudit() {
  return {
    ok: true,
    enabled: true,
    summary: {
      nav_link_count: 1,
      nav_above_fold: false,
      cta_above_fold: false,
      hero_image_present: false,
      image_count: 0,
      avg_text_block_length: 480,
      max_text_block_length: 920,
      desktop_text_density: 0.0032,
      horizontal_overflow_mobile: true,
      overflow_severity_mobile: 'major',
    },
    desktop: {
      metrics: {
        nav_link_count: 1,
        headings: [],
        cta_elements: [{ text: 'Learn more', above_fold: false }, { text: 'Learn more', above_fold: false }],
        section_count: 0,
        max_text_block_length: 920,
        avg_text_block_length: 480,
      },
      contrast: { median_ratio: 2.4 },
    },
    mobile: { metrics: { horizontal_overflow: true, overflow_severity: 'major' } },
  }
}

describe('uxVisualScorer', () => {
  it('two different visual inputs produce different ux scores', () => {
    const premium = buildVisualUxScore({
      businessModel: 'online_plus_physical_service',
      visualAuditOk: true,
      visualAudit: premiumVisualAudit(),
      desktop: premiumVisualAudit().desktop,
      mobile: premiumVisualAudit().mobile,
      summary: premiumVisualAudit().summary,
      signals: { has_booking_cta: true, has_phone: true, has_gallery: true },
      aggregated: { trust_signals: { review_indicators: true }, contact_signals: { phones: ['555'] } },
    })
    const sparse = buildVisualUxScore({
      businessModel: 'online_plus_physical_service',
      visualAuditOk: true,
      desktop: sparseVisualAudit().desktop,
      mobile: sparseVisualAudit().mobile,
      summary: sparseVisualAudit().summary,
      signals: {},
      aggregated: {},
    })

    assert.ok(Math.abs(premium.visual_score - sparse.visual_score) >= 15)
    assert.ok(premium.visual_score > sparse.visual_score)
  })

  it('dense text lowers readability and overall visual score', () => {
    const readable = scoreReadability({
      avgParagraphLength: 120,
      maxTextBlockLength: 200,
      textDensity: 0.001,
      headingCount: 4,
      visualVerified: true,
    })
    const dense = scoreReadability({
      avgParagraphLength: 420,
      maxTextBlockLength: 950,
      textDensity: 0.003,
      headingCount: 0,
      visualVerified: true,
    })
    assert.ok(dense.score < readable.score)
  })

  it('missing nav lowers navbar score', () => {
    const weak = scoreNavbar({
      navLinkCount: 0,
      navAboveFold: false,
      hasStructuredHeader: false,
      mobileNavOverflow: false,
      phoneInBannerOnly: false,
      brandInHeader: false,
      visualVerified: true,
    })
    const strong = scoreNavbar({
      navLinkCount: 6,
      navAboveFold: true,
      hasStructuredHeader: true,
      mobileNavOverflow: false,
      phoneInBannerOnly: false,
      brandInHeader: true,
      visualVerified: true,
    })
    assert.ok(weak.score < strong.score)
  })

  it('phone CTA counts for service businesses without punishing missing gallery', () => {
    const service = scoreConversionPath({
      businessModel: 'local_service_business',
      ctaElements: [],
      phoneVisible: true,
      hasContactPage: true,
      hasBookingCta: false,
      hasQuoteCta: false,
      hasAddToCart: false,
      ctaSpamCount: 0,
      genericCtaOnly: false,
      primaryCtaAboveFold: false,
    })
    assert.ok(service.score >= 40)
    assert.ok(service.notes.some((n) => /phone/i.test(n)))
  })

  it('repeated spammy generic CTAs do not over-score', () => {
    const spam = scoreConversionPath({
      businessModel: 'ecommerce_store',
      ctaElements: Array.from({ length: 6 }, () => ({ text: 'Learn more', quality: 'generic' })),
      phoneVisible: false,
      hasAddToCart: false,
      ctaSpamCount: 6,
      genericCtaOnly: true,
      primaryCtaAboveFold: true,
    })
    const strong = scoreConversionPath({
      businessModel: 'ecommerce_store',
      ctaElements: [{ text: 'Add to cart', quality: 'strong' }],
      phoneVisible: false,
      hasAddToCart: true,
      ctaSpamCount: 1,
      genericCtaOnly: false,
      primaryCtaAboveFold: true,
    })
    assert.ok(spam.score < strong.score)
    assert.ok(classifyCtaQuality('Learn more', 'ecommerce_store') === 'generic')
  })

  it('mobile overflow lowers layout balance score via extractUxFeatures', () => {
    const overflow = extractUxFeatures({
      visualAudit: sparseVisualAudit(),
      pages: [],
      aggregated: {},
      businessModel: 'local_service_business',
      signals: {},
    })
    const premium = extractUxFeatures({
      visualAudit: premiumVisualAudit(),
      pages: [],
      aggregated: { trust_signals: { review_indicators: true } },
      businessModel: 'online_plus_physical_service',
      signals: { has_phone: true, has_booking_cta: true },
    })
    assert.ok(overflow.layout_balance_score < premium.layout_balance_score)
  })

  it('visual audit unavailable lowers confidence but still produces a score', () => {
    const features = extractUxFeatures({
      visualAudit: { ok: false, enabled: true, reason: 'skipped' },
      pages: [
        {
          extracted_text: 'Welcome to our HVAC company. Book now. Call us.',
          extracted_data_json: {
            headings: { h1: ['HVAC Pro'] },
            has_mobile_viewport: true,
            navigation_labels: ['Services', 'Contact'],
            image_count: 2,
          },
        },
      ],
      aggregated: { content_signals: { navigation_labels: ['Services', 'Contact'] } },
      businessModel: 'local_service_business',
      signals: { has_phone: true, has_booking_cta: true },
    })
    assert.ok(features.visual_score > 0)
    assert.ok(features.ux_confidence < 70)
  })

  it('gallery missing does not destroy functionality score', () => {
    const pages = [
      {
        page_type: 'homepage',
        status_code: 200,
        extracted_text: 'Book a quote. Call (555) 123-4567. Serving Austin. Our plumbing services.',
        extracted_data_json: {
          headings: { h1: ['Austin Plumbing'] },
          has_mobile_viewport: true,
          phones: ['(555) 123-4567'],
          ctas: ['Get a quote'],
          navigation_labels: ['Services', 'Contact'],
        },
      },
      {
        page_type: 'contact',
        status_code: 200,
        extracted_text: 'Contact us today',
        extracted_data_json: { phones: ['(555) 123-4567'] },
      },
    ]
    const aggregated = require('../services/businessProfileLogic').aggregatePages(pages)
    const scores = calculateAnalyzerV2Scores(
      aggregated,
      { store_url: 'https://plumber.com', business_model: 'local_service_business' },
      pages,
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 2, pages_discovered: 2 },
      },
    )
    assert.ok(scores.functionality_score >= 6)
    assert.ok(!scores.category_details.technical_functionality.problems.some((p) => /gallery/i.test(p)))
  })

  it('ecommerce without products is penalized in business fit, not functionality', () => {
    const pages = [
      {
        page_type: 'homepage',
        status_code: 200,
        extracted_text: 'Welcome to our blog.',
        extracted_data_json: {
          headings: { h1: ['Welcome'] },
          has_mobile_viewport: true,
          navigation_labels: ['Home', 'About'],
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
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 1 },
      },
    )
    assert.ok(scores.business_fit_score <= 10)
    assert.ok(scores.functionality_score >= 4)
  })

  it('maps visual score to category points on 25-point scale', () => {
    assert.equal(mapVisualScoreToCategoryPoints(80, 25), 20)
    assert.equal(mapVisualScoreToCategoryPoints(40, 25), 10)
  })
})
