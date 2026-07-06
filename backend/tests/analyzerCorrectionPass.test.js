const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { mergeHeroHeadingSignals } = require('../services/heroHeadingDetection')
const {
  buildVisualUxScore,
  scoreHero,
  scoreReadability,
  scoreLayoutBalance,
  scoreConversionPath,
  mapVisualScoreToCategoryPoints,
} = require('../services/uxVisualScorer')
const { interpretBenchmarkLevel, humanEquivalentFromOverall } = require('../services/analyzerV2/benchmarkInterpreter')
const { getBenchmarkLevel, buildGaps } = require('../services/websiteBenchmarkService')
const { scoreOfferBusinessFit } = require('../services/analyzerV2/businessModelRubrics')
const { scoreTechnicalFunctionality, scoreCustomerAttraction } = require('../services/analyzerV2/categoryScorers')

function heroCtx(overrides = {}) {
  return {
    heroHeading: {
      has_h1: false,
      has_hero_heading: true,
      hero_heading_text: 'Custom Window Treatments for Los Angeles Homes',
      hero_heading_source: 'visual_largest_text',
      hero_heading_confidence: 82,
      h1_above_fold: false,
      hero_heading_above_fold: true,
      semantic_h1_missing: true,
      ...overrides.heroHeading,
    },
    heroImagePresent: true,
    primaryCtaAboveFold: true,
    ctaSpamCount: 1,
    maxAboveFoldBlock: 180,
    aboveFoldTextLength: 220,
    ...overrides,
  }
}

describe('hero heading correction pass', () => {
  it('visual hero heading prevents false no-clear-H1 penalty', () => {
    const result = scoreHero(heroCtx())
    assert.ok(result.score >= 70)
    assert.ok(!result.problems.some((p) => /No clear H1 or hero heading/i.test(p)))
  })

  it('missing semantic H1 with visual hero is minor, not major', () => {
    const result = scoreHero(heroCtx())
    const semanticIssue = result.problems.find((p) => /semantic H1/i.test(p))
    assert.ok(semanticIssue)
    assert.ok(result.score >= 65)
  })

  it('mergeHeroHeadingSignals prefers visual hero when no semantic h1', () => {
    const merged = mergeHeroHeadingSignals({
      desktopMetrics: {
        headings: [],
        hero_heading: {
          text: 'Premium Handmade Leather Goods',
          source: 'visual_largest_text',
          above_fold: true,
          confidence: 80,
        },
      },
      pages: [],
    })
    assert.equal(merged.has_hero_heading, true)
    assert.equal(merged.semantic_h1_missing, true)
  })
})

describe('benchmark human scale interpretation', () => {
  it('labels 17/20 as average', () => {
    assert.equal(getBenchmarkLevel(17).id, 'average')
  })

  it('labels 16/20 as below average', () => {
    assert.equal(getBenchmarkLevel(16).id, 'below_average')
  })

  it('labels 13/20 as low', () => {
    assert.equal(getBenchmarkLevel(13).id, 'low')
  })

  it('labels 12/20 as major issue', () => {
    assert.equal(getBenchmarkLevel(12).id, 'major_issue')
  })

  it('converts 63/100 to 12.6/20 and marks it low/major, not average', () => {
    const human = humanEquivalentFromOverall(63)
    assert.equal(human, 12.6)
    const level = interpretBenchmarkLevel(human)
    assert.equal(level.is_average, false)
    assert.ok(level.is_low || level.is_major_issue)
    const gap = buildGaps(human)
    assert.ok(gap.gap_to_average > 0)
  })
})

describe('business model scoring expectations', () => {
  const baseCtx = {
    aggregated: {
      extraction_meta: { high_confidence_product_count: 2, has_reliable_product_cards: true, has_json_ld_products: true },
      pricing_signals: ['$19'],
      products: [{ name: 'Shirt' }, { name: 'Hat' }],
      policy_signals: { shipping: true, returns: true },
      trust_signals: { review_indicators: true },
      social_channels: [],
      content_signals: { navigation_labels: ['Shop', 'About'], total_text_length: 2000 },
      images: [{}, {}, {}, {}],
    },
    signals: {
      has_add_to_cart: true,
      has_gallery: true,
      has_quote_cta: true,
      has_contact_page: true,
      has_phone: true,
      has_service_pages: true,
      has_service_area: true,
    },
  }

  it('ecommerce_store expects product/cart/checkout signals', () => {
    const result = scoreOfferBusinessFit('ecommerce_store', baseCtx, 20)
    assert.ok(result.score >= 12)
    assert.ok(result.strengths.some((s) => /product|cart|price/i.test(s)))
  })

  it('online_gallery_physical_service expects gallery/inquiry but not checkout', () => {
    const noCart = {
      ...baseCtx,
      signals: { ...baseCtx.signals, has_add_to_cart: false },
    }
    const result = scoreOfferBusinessFit('online_gallery_physical_service', noCart, 20)
    assert.ok(result.score >= 10)
    assert.ok(result.strengths.some((s) => /gallery|portfolio|inquiry|consultation|contact/i.test(s)))
  })

  it('blog does not get punished for long structured text in readability', () => {
    const result = scoreReadability({
      businessModel: 'blog',
      avgParagraphLength: 260,
      maxTextBlockLength: 900,
      textDensity: 0.002,
      mobileTextDensity: 0.002,
      headingCount: 6,
      h2Count: 4,
      sectionCount: 5,
      bulletCount: 8,
      headingToBodyRatio: 0.02,
      contrastScore: 80,
      fontSizeStats: { median: 16 },
      visualVerified: true,
      paragraphCount: 12,
    })
    assert.ok(result.score >= 75)
    assert.ok((result.strengths || []).some((s) => /sections|bullets|scannable/i.test(s)))
  })

  it('readability penalizes huge unbroken text blocks', () => {
    const result = scoreReadability({
      businessModel: 'ecommerce_store',
      avgParagraphLength: 420,
      maxTextBlockLength: 1600,
      textDensity: 0.0038,
      mobileTextDensity: 0.004,
      headingCount: 0,
      h2Count: 0,
      sectionCount: 0,
      bulletCount: 0,
      headingToBodyRatio: 0,
      contrastScore: 50,
      visualVerified: true,
      paragraphCount: 2,
    })
    assert.ok(result.score <= 55)
    assert.ok((result.problems || []).some((p) => /unbroken|block|heading|tiring/i.test(p)))
  })

  it('does not flag nav overcrowding from dropdown links alone', () => {
    const { scoreNavbar } = require('../services/uxVisualScorer')
    const crowdedDropdowns = scoreNavbar({
      primaryNavLinkCount: 0,
      navLinkCount: 22,
      navAboveFold: true,
      hasStructuredHeader: true,
      mobileNavOverflow: false,
      phoneInBannerOnly: false,
      brandInHeader: true,
      visualVerified: true,
    })
    const crowdedPrimary = scoreNavbar({
      primaryNavLinkCount: 8,
      navLinkCount: 22,
      navAboveFold: true,
      hasStructuredHeader: true,
      mobileNavOverflow: false,
      phoneInBannerOnly: false,
      brandInHeader: true,
      visualVerified: true,
    })
    assert.ok(!crowdedDropdowns.problems?.some((p) => /overcrowd/i.test(p)))
    assert.ok(crowdedPrimary.problems?.some((p) => /overcrowd/i.test(p)))
  })

  it('layout rewards organized sections and spacing', () => {
    const result = scoreLayoutBalance({
      desktopOverflow: false,
      mobileOverflow: false,
      mobileOverflowSeverity: 'none',
      desktopOverflowSeverity: 'none',
      textDensity: 0.0018,
      sectionCount: 4,
      ctaSpamCount: 2,
      heroImagePresent: true,
      avgParagraphLength: 180,
      aboveFoldElementCount: 14,
      layoutFittedImageCount: 4,
      misalignedImageCount: 0,
      imageCount: 6,
      conversionPathScore: 72,
    })
    assert.ok(result.score >= 68)
    assert.ok((result.strengths || []).length >= 2)
  })

  it('messy layout with misaligned images scores lower than a polished site', () => {
    const { buildVisualUxScore } = require('../services/uxVisualScorer')
    const messy = buildVisualUxScore({
      businessModel: 'ecommerce_store',
      visualAuditOk: true,
      summary: {
        nav_link_count: 18,
        primary_nav_link_count: 8,
        image_count: 12,
        hero_image_present: true,
        desktop_text_density: 0.003,
      },
      desktop: {
        metrics: {
          nav_link_count: 18,
          primary_nav_link_count: 8,
          section_count: 2,
          image_count: 12,
          layout_fitted_image_count: 1,
          misaligned_image_count: 7,
          headings: [{ tag: 'h2', text: 'Sale', above_fold: true, in_chrome: true }],
          cta_elements: Array.from({ length: 5 }, () => ({ text: 'Shop Now', above_fold: true })),
        },
      },
      mobile: { metrics: { horizontal_overflow: true, overflow_severity: 'major', section_count: 1 } },
      signals: { has_add_to_cart: false },
      aggregated: {},
      crawler: { homepageSectionEstimate: 0, sectionCount: 0 },
      pages: Array.from({ length: 6 }, (_, i) => ({
        page_type: i === 0 ? 'homepage' : 'other',
        extracted_text: 'x'.repeat(400),
      })),
    })
    const polished = buildVisualUxScore({
      businessModel: 'ecommerce_store',
      visualAuditOk: true,
      summary: {
        nav_link_count: 5,
        primary_nav_link_count: 5,
        image_count: 10,
        hero_image_present: true,
        desktop_text_density: 0.0012,
      },
      desktop: {
        metrics: {
          nav_link_count: 5,
          primary_nav_link_count: 5,
          section_count: 4,
          image_count: 10,
          layout_fitted_image_count: 8,
          misaligned_image_count: 0,
          headings: [
            { tag: 'h1', text: 'Premium Curtains', above_fold: true, in_chrome: false },
            { tag: 'h2', text: 'Best Sellers', above_fold: false, in_chrome: false },
          ],
          cta_elements: [{ text: 'Shop collection', above_fold: true }],
        },
        contrast: { median_ratio: 4.6 },
      },
      mobile: { metrics: { horizontal_overflow: false, overflow_severity: 'none', section_count: 4 } },
      signals: { has_add_to_cart: true },
      aggregated: { trust_signals: { review_indicators: true } },
      crawler: { homepageSectionEstimate: 3, sectionCount: 0 },
      pages: [{ page_type: 'homepage', extracted_text: 'Shop curtains. Add to cart.' }],
    })

    assert.ok(messy.visual_score < polished.visual_score)
    assert.ok(messy.visual_score <= 72)
    assert.ok(polished.visual_score >= messy.visual_score + 10)
    assert.ok(mapVisualScoreToCategoryPoints(polished.visual_score, 25) > mapVisualScoreToCategoryPoints(messy.visual_score, 25))
  })
})

describe('functionality vs business content expectations', () => {
  it('gallery missing does not destroy functionality', () => {
    const result = scoreTechnicalFunctionality({
      aggregated: { extraction_meta: {} },
      pages: [
        { url: 'https://example.com/', status: 200, extracted_text: 'Welcome' },
        { url: 'https://example.com/about', status: 200, extracted_text: 'About us' },
      ],
      crawlHealth: { homepageOk: true, pagesFailed: 0, sameDomainOk: true },
      visualAudit: null,
      options: {},
    })
    assert.ok(result.score >= 8)
  })
})

describe('customer attraction visual downside factors', () => {
  const strongSignals = {
    has_testimonials: true,
    has_service_categories: true,
    has_niche_language: true,
    has_service_area: true,
    has_phone: true,
    has_contact_page: true,
    has_quote_cta: true,
  }

  const richAggregated = {
    trust_signals: { review_indicators: true },
    pricing_signals: ['$99'],
    products: [],
    social_channels: ['instagram', 'facebook'],
    content_signals: { total_text_length: 4200, newsletter_indicators: true },
  }

  const pages = [
    {
      page_type: 'homepage',
      title: 'Premium Plumbing in Austin',
      meta_description: 'Licensed plumbers serving Austin.',
      extracted_data_json: { headings: { h1: ['Premium Plumbing'] } },
    },
  ]

  it('applies appearance and layout penalties when visitor appeal is weak', () => {
    const result = scoreCustomerAttraction({
      aggregated: richAggregated,
      pages,
      signals: strongSignals,
      rubric: 'local_service_business',
      uxFeatures: {
        source: 'visual_audit+crawler',
        ux_confidence: 88,
        visual_score: 48,
        layout_balance_score: 38,
        readability_score: 40,
        display_polish_score: 35,
        visual_hierarchy_score: 42,
        image_quality_score: 40,
        visitor_appeal_index: 41,
        layout_problems: ['Mobile layout overflow detected.', 'Too many competing CTAs crowd the above-fold layout.'],
        visual_problems: ['Dense text blocks hurt readability.'],
        signals: { horizontal_overflow_mobile: true, overflow_severity_mobile: 'major' },
        primary_nav_link_count: 8,
        misaligned_image_count: 4,
        hero_heading: { has_hero_heading: false },
      },
      crawlHealth: { crawled: 3 },
    })

    const penalties = result.point_breakdown.filter((row) => row.type === 'penalty')
    assert.ok(penalties.length >= 2)
    assert.ok(result.score < 14)
    assert.ok(result.problems.some((p) => /appearance|layout|pleasantness|penalt/i.test(p)))
  })

  it('does not max out when content is strong but visual appeal is only average', () => {
    const result = scoreCustomerAttraction({
      aggregated: richAggregated,
      pages,
      signals: strongSignals,
      rubric: 'local_service_business',
      uxFeatures: {
        source: 'visual_audit+crawler',
        ux_confidence: 85,
        visual_score: 66,
        layout_balance_score: 58,
        readability_score: 62,
        display_polish_score: 60,
        visual_hierarchy_score: 58,
        image_quality_score: 55,
        visitor_appeal_index: 61,
        layout_fitted_image_count: 1,
        hero_heading: { has_hero_heading: true },
        signals: {},
        primary_nav_link_count: 4,
      },
      crawlHealth: { crawled: 3 },
    })

    assert.ok(result.score <= 17)
    assert.ok(result.point_breakdown.some((row) => row.type === 'penalty'))
  })
})
