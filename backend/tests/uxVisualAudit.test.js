const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  extractUxFeatures,
  scoreReadability,
  scoreCtaVisibility,
  scoreMobileUsability,
  scoreLayoutOverflow,
  READABILITY_BLOCK_SOFT,
} = require('../services/uxFeatureExtractor')
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
const { isVisualAuditEnabled } = require('../services/visualAuditService')

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
    assert.ok(features.readability_score < 70)
    assert.ok(scoreReadability({
      avgParagraphLength: features.avg_paragraph_length,
      maxTextBlockLength: features.max_text_block_length,
    }) < 70)
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

    assert.ok(withFold.cta_visibility_score > withoutFold.cta_visibility_score)
    assert.equal(withFold.cta_above_fold, true)
    assert.ok(scoreCtaVisibility({ ctaAboveFold: true, ctaCount: 2 }) > scoreCtaVisibility({ ctaAboveFold: false, ctaCount: 1 }))
  })

  it('lowers mobile usability when viewport meta is missing', () => {
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
    const features = extractUxFeatures({ pages, aggregated: BASE_AGG })
    assert.equal(features.signals.has_mobile_viewport, false)
    assert.ok(features.mobile_usability_score < scoreMobileUsability({
      hasMobileViewport: true,
      mobileOverflow: false,
      mobileTextDensity: 0.001,
      desktopTextDensity: 0.001,
    }))
  })

  it('lowers layout score when mobile overflow is present', () => {
    const features = extractUxFeatures({
      visualAudit: visualAuditWithMobileOverflow(),
      pages: denseLongParagraphPages(),
      aggregated: BASE_AGG,
    })
    assert.equal(features.signals.horizontal_overflow_mobile, true)
    assert.ok(features.layout_overflow_score < scoreLayoutOverflow({
      desktopOverflow: false,
      mobileOverflow: false,
    }))
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
    assert.ok(explanations.some((item) => item.reason === 'Navigation is visible.'))
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
