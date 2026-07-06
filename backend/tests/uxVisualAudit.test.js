const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  extractUxFeatures,
  READABILITY_BLOCK_SOFT,
} = require('../services/uxFeatureExtractor')
const { scoreReadability } = require('../services/uxVisualScorer')
const {
  calculatePriorityScores,
  scoreUxUiPoints,
  scoreUxUiPointsStatic,
} = require('../services/priorityWebsiteScoring')
const {
  buildUxDatasetRow,
  buildUxDatasetCsv,
  CSV_COLUMNS,
} = require('../services/uxDatasetExportService')
const { isVisualAuditEnabled, resolveMobileDeviceConfig } = require('../services/visualAuditService')

const BASE_AGG = {
  content_signals: {
    total_text_length: 1200,
    navigation_labels: ['Home', 'Services', 'Contact'],
    ctas: ['Book now'],
  },
  contact_signals: { emails: ['hello@example.com'], phones: [] },
}

function denseLongParagraphPages() {
  const longBlock = 'Lorem ipsum dolor sit amet. '.repeat(120)
  return [
    {
      page_type: 'homepage',
      extracted_text: `${longBlock}\n\n${longBlock}`,
      extracted_data_json: {
        headings: { h1: ['Welcome'] },
        has_mobile_viewport: true,
        image_count: 2,
        ctas: ['Book now'],
      },
    },
  ]
}

function visualAuditWithCtaAboveFold() {
  return {
    ok: true,
    enabled: true,
    summary: {
      desktop_text_density: 0.001,
      mobile_text_density: 0.0012,
      avg_text_block_length: 180,
      max_text_block_length: 260,
      cta_above_fold: true,
      nav_above_fold: true,
      horizontal_overflow_desktop: false,
      horizontal_overflow_mobile: false,
      image_count: 4,
    },
    desktop: {
      metrics: {
        text_density: 0.001,
        cta_above_fold: true,
        nav_above_fold: true,
        horizontal_overflow: false,
        headings: [{ tag: 'h1', above_fold: true }],
        cta_elements: [{ text: 'Book now', above_fold: true }],
        nav_elements: [{ text: 'Services', above_fold: true }],
      },
      contrast: { min_ratio: 5.1, average_ratio: 6.2 },
    },
    mobile: {
      metrics: {
        text_density: 0.0012,
        cta_above_fold: true,
        horizontal_overflow: false,
      },
    },
  }
}

function premiumRetailVisualAudit() {
  return {
    ok: true,
    enabled: true,
    summary: {
      desktop_text_density: 0.0007,
      mobile_text_density: 0.0009,
      avg_text_block_length: 140,
      max_text_block_length: 220,
      cta_above_fold: true,
      nav_above_fold: true,
      horizontal_overflow_desktop: false,
      horizontal_overflow_mobile: false,
      image_count: 12,
      nav_link_count: 7,
      primary_nav_link_count: 5,
      icon_count: 10,
      icons_above_fold: 4,
      icons_in_nav: 3,
      has_structured_header: true,
      above_fold_image_count: 4,
    },
    desktop: {
      metrics: {
        text_density: 0.0007,
        cta_above_fold: true,
        nav_above_fold: true,
        horizontal_overflow: false,
        nav_link_count: 7,
      primary_nav_link_count: 5,
        icon_count: 10,
        icons_above_fold: 4,
        icons_in_nav: 3,
        has_structured_header: true,
        above_fold_image_count: 4,
        headings: [{ tag: 'h1', above_fold: true }, { tag: 'h2', above_fold: true }],
        cta_elements: [{ text: 'Shop now', above_fold: true }],
        nav_elements: [
          { text: 'Shop', above_fold: true },
          { text: 'Collections', above_fold: true },
          { text: 'Inspiration', above_fold: true },
          { text: 'Stores', above_fold: true },
          { text: 'Account', above_fold: true },
        ],
      },
      contrast: { min_ratio: 5.4, average_ratio: 6.8, wcag_aa_likely: true },
    },
    mobile: {
      metrics: {
        text_density: 0.0009,
        cta_above_fold: true,
        horizontal_overflow: false,
        nav_link_count: 5,
        icon_count: 6,
        icons_above_fold: 2,
        has_structured_header: true,
      },
    },
  }
}

function basicServiceVisualAudit() {
  return {
    ok: true,
    enabled: true,
    summary: {
      desktop_text_density: 0.0014,
      mobile_text_density: 0.0018,
      avg_text_block_length: 280,
      max_text_block_length: 520,
      cta_above_fold: true,
      nav_above_fold: true,
      horizontal_overflow_desktop: false,
      horizontal_overflow_mobile: false,
      image_count: 3,
      nav_link_count: 3,
      icon_count: 1,
      icons_above_fold: 0,
      icons_in_nav: 0,
      has_structured_header: false,
      above_fold_image_count: 1,
    },
    desktop: {
      metrics: {
        text_density: 0.0014,
        cta_above_fold: true,
        nav_above_fold: true,
        horizontal_overflow: false,
        nav_link_count: 3,
        icon_count: 1,
        headings: [{ tag: 'h1', above_fold: true }],
        nav_elements: [
          { text: 'Services', above_fold: true },
          { text: 'Gallery', above_fold: true },
          { text: 'Contact', above_fold: true },
        ],
      },
      contrast: { min_ratio: 3.2, average_ratio: 4.1 },
    },
    mobile: {
      metrics: {
        text_density: 0.0018,
        horizontal_overflow: false,
        nav_link_count: 3,
      },
    },
  }
}

function visualAuditWithMobileOverflow() {
  return {
    ok: true,
    enabled: true,
    summary: {
      desktop_text_density: 0.001,
      mobile_text_density: 0.002,
      avg_text_block_length: 220,
      max_text_block_length: 400,
      cta_above_fold: false,
      nav_above_fold: true,
      horizontal_overflow_desktop: false,
      horizontal_overflow_mobile: true,
      image_count: 2,
    },
    desktop: {
      metrics: {
        horizontal_overflow: false,
        headings: [{ tag: 'h1', above_fold: true }],
      },
    },
    mobile: {
      metrics: {
        horizontal_overflow: true,
      },
    },
  }
}

describe('uxFeatureExtractor', () => {
  it('lowers readability for dense long-paragraph HTML', () => {
    const features = extractUxFeatures({
      pages: denseLongParagraphPages(),
      aggregated: BASE_AGG,
    })
    assert.ok(features.max_text_block_length > READABILITY_BLOCK_SOFT)
    assert.ok(features.readability_score < 85)
    assert.ok(scoreReadability({
      avgParagraphLength: features.avg_paragraph_length,
      maxTextBlockLength: features.max_text_block_length,
      textDensity: 0,
      headingCount: 1,
      visualVerified: false,
    }).score < 85)
  })

  it('increases CTA visibility when CTA is above the fold', () => {
    const withoutFold = extractUxFeatures({
      visualAudit: {
        ok: true,
        summary: { cta_above_fold: false },
        desktop: { metrics: { cta_above_fold: false, cta_elements: [] } },
      },
      pages: denseLongParagraphPages(),
      aggregated: BASE_AGG,
    })
    const withFold = extractUxFeatures({
      visualAudit: visualAuditWithCtaAboveFold(),
      pages: denseLongParagraphPages(),
      aggregated: BASE_AGG,
    })

    assert.ok(withFold.conversion_path_score > withoutFold.conversion_path_score)
    assert.equal(withFold.cta_above_fold, true)
  })

  it('lowers layout balance when viewport meta is missing', () => {
    const pages = [
      {
        extracted_text: 'Short homepage copy.',
        extracted_data_json: {
          headings: { h1: ['Hello'] },
          has_mobile_viewport: false,
          image_count: 1,
        },
      },
    ]
    const withViewport = extractUxFeatures({
      pages: pages.map((p) => ({
        ...p,
        extracted_data_json: { ...p.extracted_data_json, has_mobile_viewport: true },
      })),
      aggregated: BASE_AGG,
    })
    const features = extractUxFeatures({ pages, aggregated: BASE_AGG })
    assert.equal(features.signals.has_mobile_viewport, false)
    assert.ok(features.layout_balance_score <= withViewport.layout_balance_score)
  })

  it('lowers layout score when mobile overflow is present', () => {
    const features = extractUxFeatures({
      visualAudit: visualAuditWithMobileOverflow(),
      pages: denseLongParagraphPages(),
      aggregated: BASE_AGG,
    })
    const clean = extractUxFeatures({
      visualAudit: visualAuditWithCtaAboveFold(),
      pages: denseLongParagraphPages(),
      aggregated: BASE_AGG,
    })
    assert.equal(features.signals.horizontal_overflow_mobile, true)
    assert.ok(features.layout_balance_score < clean.layout_balance_score)
  })
})

describe('priorityWebsiteScoring visual audit integration', () => {
  const business = { store_url: 'https://example.com', business_model: 'local_service_business' }

  it('uses feature-based scoring instead of checkbox heuristics when layout signals exist', () => {
    const pages = denseLongParagraphPages()
    const aggregated = BASE_AGG
    const staticScore = scoreUxUiPointsStatic(pages, aggregated, {}, [])
    const featureScore = scoreUxUiPoints(pages, aggregated, {}, [], {
      visualAudit: { enabled: false, ok: false },
      uxFeatures: extractUxFeatures({ pages, aggregated }),
    })
    assert.notEqual(featureScore, staticScore)
    assert.ok(featureScore >= 0 && featureScore <= 20)
  })

  it('uses visual features when visual audit data exists', () => {
    const pages = denseLongParagraphPages()
    const aggregated = BASE_AGG
    const uxFeatures = extractUxFeatures({
      visualAudit: visualAuditWithCtaAboveFold(),
      pages,
      aggregated,
    })
    const explanations = []
    const visualPoints = scoreUxUiPoints(pages, aggregated, {}, explanations, {
      visualAudit: visualAuditWithCtaAboveFold(),
      uxFeatures,
    })
    assert.ok(visualPoints >= 0 && visualPoints <= 20)
    assert.ok(explanations.some((item) => /UX\/UI score from visual layout audit/i.test(item.reason)))
  })

  it('does not break overall scoring when visual audit is disabled', () => {
    const pages = denseLongParagraphPages()
    const scores = calculatePriorityScores(BASE_AGG, business, pages, {
      safetyResult: { status: 'safe', message: 'ok' },
      crawlMeta: { homepage_fetch_ok: true, pages_crawled: 1 },
    })
    assert.ok(Number.isFinite(scores.ux_ui_score))
    assert.equal(scores.ux_scoring_mode, 'feature_signals')
    assert.ok(scores.overall_score > 0)
  })

  it('scores premium retail layouts higher than basic service sites', () => {
    const pages = denseLongParagraphPages()
    const premium = extractUxFeatures({
      visualAudit: premiumRetailVisualAudit(),
      pages,
      aggregated: BASE_AGG,
    })
    const basic = extractUxFeatures({
      visualAudit: basicServiceVisualAudit(),
      pages,
      aggregated: BASE_AGG,
    })

    assert.ok(premium.overall_static_ux_score > basic.overall_static_ux_score)
    assert.ok(premium.navbar_score > basic.navbar_score)
    assert.ok(premium.hero_score >= basic.hero_score)
  })

  it('marks visual scoring mode when audit succeeds', () => {
    const pages = denseLongParagraphPages()
    const visualAudit = visualAuditWithCtaAboveFold()
    const uxFeatures = extractUxFeatures({ visualAudit, pages, aggregated: BASE_AGG })
    const scores = calculatePriorityScores(BASE_AGG, business, pages, {
      safetyResult: { status: 'safe', message: 'ok' },
      crawlMeta: { homepage_fetch_ok: true, pages_crawled: 1 },
      visualAudit,
      uxFeatures,
    })
    assert.equal(scores.ux_scoring_mode, 'visual_audit')
    assert.ok(scores.ux_features)
  })
})

describe('uxDatasetExportService', () => {
  it('exports UX features to ML dataset row format', () => {
    const uxFeatures = extractUxFeatures({
      visualAudit: visualAuditWithCtaAboveFold(),
      pages: denseLongParagraphPages(),
      aggregated: BASE_AGG,
    })
    const row = buildUxDatasetRow({
      url: 'https://example.com',
      business: { business_model: 'local_service_business' },
      scores: {
        scoring_rubric: 'local_service_business',
        safety_score: 30,
        functionality_score: 16,
        ux_ui_score: 14,
        business_fit_score: 15,
        customer_attraction_score: 8,
      },
      uxFeatures,
    })

    for (const column of CSV_COLUMNS) {
      assert.ok(Object.prototype.hasOwnProperty.call(row, column))
    }
    assert.equal(row.human_ux_score, '')
    assert.equal(row.human_notes, '')
    assert.equal(row.cta_above_fold, true)

    const csv = buildUxDatasetCsv([row])
    assert.match(csv, /^url,business_model,scoring_rubric/)
    assert.match(csv, /https:\/\/example\.com/)
  })
})

describe('visualAuditService config gate', () => {
  it('reports disabled when VISUAL_AUDIT_ENABLED is not true', () => {
    const original = process.env.VISUAL_AUDIT_ENABLED
    process.env.VISUAL_AUDIT_ENABLED = 'false'
    assert.equal(isVisualAuditEnabled(), false)
    process.env.VISUAL_AUDIT_ENABLED = original
  })
})

describe('visualAuditService mobile emulation', () => {
  it('resolves a Playwright mobile device profile', () => {
    if (!require('../services/visualAuditService').isPlaywrightAvailable()) return
    const { name, device } = resolveMobileDeviceConfig('iPhone 13')
    assert.equal(name, 'iPhone 13')
    assert.equal(device.isMobile, true)
    assert.ok(device.userAgent.includes('iPhone'))
    assert.ok(device.viewport.width > 0)
    assert.ok(device.hasTouch)
  })

  it('throws for unknown mobile device names', () => {
    if (!require('../services/visualAuditService').isPlaywrightAvailable()) return
    assert.throws(() => resolveMobileDeviceConfig('Not A Real Phone'), /Unknown Playwright mobile device/)
  })
})
