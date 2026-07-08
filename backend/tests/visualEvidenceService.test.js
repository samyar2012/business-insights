const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  detectImageAlignmentIssues,
  calculateAboveFoldTextDensity,
  summarizeVisualEvidence,
  HIGH_CONFIDENCE,
} = require('../services/visualEvidenceService')
const { buildVisualUxScore } = require('../services/uxVisualScorer')
const { mergeUxUiWithBenchmark } = require('../services/websiteBenchmarkService')

function alignedGridImages() {
  return [
    {
      id: 'a1',
      visible: true,
      in_grid: true,
      in_product_grid: true,
      bbox: { left: 0, top: 100, width: 200, height: 200, bottom: 300, right: 200 },
    },
    {
      id: 'a2',
      visible: true,
      in_grid: true,
      in_product_grid: true,
      bbox: { left: 220, top: 102, width: 198, height: 198, bottom: 300, right: 418 },
    },
    {
      id: 'a3',
      visible: true,
      in_grid: true,
      in_product_grid: true,
      bbox: { left: 440, top: 101, width: 199, height: 199, bottom: 300, right: 639 },
    },
  ]
}

function misalignedGridImages() {
  return [
    {
      id: 'm1',
      visible: true,
      in_grid: true,
      in_product_grid: true,
      bbox: { left: 0, top: 100, width: 200, height: 200, bottom: 300, right: 200 },
    },
    {
      id: 'm2',
      visible: true,
      in_grid: true,
      in_product_grid: true,
      bbox: { left: 220, top: 102, width: 200, height: 200, bottom: 302, right: 420 },
    },
    {
      id: 'm3',
      visible: true,
      in_grid: true,
      in_product_grid: true,
      bbox: { left: 440, top: 101, width: 110, height: 200, bottom: 301, right: 550 },
    },
  ]
}

describe('visualEvidenceService image alignment', () => {
  it('aligned image grid does not trigger misaligned image problem', () => {
    const result = detectImageAlignmentIssues(alignedGridImages(), [{ id: 'section-1', bbox: { left: 0, top: 0, width: 700, height: 500 } }])
    assert.equal(result.misaligned_image_count, 0)
    assert.ok(result.misalignment_confidence < HIGH_CONFIDENCE)
  })

  it('clearly misaligned image grid does trigger misalignment', () => {
    const result = detectImageAlignmentIssues(
      misalignedGridImages(),
      [{ id: 'section-1', bbox: { left: 0, top: 0, width: 700, height: 500 } }],
    )
    assert.ok(result.misaligned_image_count >= 3)
    assert.ok(result.misalignment_confidence >= HIGH_CONFIDENCE)
    assert.match(result.issues[0].message, /alignment issue detected/i)
  })
})

describe('visualEvidenceService text density', () => {
  it('normal mobile paragraph layout does not trigger high density', () => {
    const viewport = { width: 390, height: 844 }
    const blocks = [
      {
        visible: true,
        characters: 180,
        bbox: { left: 20, top: 120, width: 350, height: 80, bottom: 200, right: 370 },
        line_height_tight: false,
      },
      {
        visible: true,
        characters: 140,
        bbox: { left: 20, top: 260, width: 350, height: 70, bottom: 330, right: 370 },
        line_height_tight: false,
      },
    ]
    const headings = [{ above_fold: true }, { above_fold: true }]
    const result = calculateAboveFoldTextDensity(viewport, blocks, headings)
    assert.equal(result.high_density, false)
    assert.ok(result.density_confidence >= 0.6)
  })

  it('dense mobile wall of text does trigger high density', () => {
    const viewport = { width: 390, height: 844 }
    const longText = 'Lorem ipsum dolor sit amet. '.repeat(28).trim()
    const blocks = [
      {
        visible: true,
        characters: longText.length,
        bbox: { left: 10, top: 40, width: 360, height: 420, bottom: 460, right: 370 },
        line_height_tight: true,
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        visible: true,
        characters: 180,
        bbox: { left: 10, top: 480 + index * 50, width: 360, height: 45, bottom: 525 + index * 50, right: 370 },
        line_height_tight: true,
      })),
    ]
    const result = calculateAboveFoldTextDensity(viewport, blocks, [])
    assert.equal(result.high_density, true)
    assert.ok(result.density_confidence >= HIGH_CONFIDENCE)
    assert.match(result.issue.message, /Largest above-fold text block/i)
  })
})

describe('visualEvidenceService summary', () => {
  it('does not count misaligned images when confidence is low', () => {
    const summary = summarizeVisualEvidence(
      { image_alignment: { misaligned_image_count: 12, misalignment_confidence: 0.4 }, issues: [] },
      { image_alignment: { misaligned_image_count: 8, misalignment_confidence: 0.2 }, issues: [] },
    )
    assert.equal(summary.misaligned_image_count, 0)
  })
})

describe('benchmark UX calibration', () => {
  it('cannot flatten scores by more than 2 points', () => {
    const merged = mergeUxUiWithBenchmark(18, 12)
    assert.equal(merged.finalScore, 16)
    assert.equal(merged.adjustment, -2)

    const mergedUp = mergeUxUiWithBenchmark(12, 18)
    assert.equal(mergedUp.finalScore, 14)
    assert.equal(mergedUp.adjustment, 2)
  })

  it('skips benchmark blend when benchmark confidence is low', () => {
    const merged = mergeUxUiWithBenchmark(15, 12, { benchmarkConfidenceLow: true })
    assert.equal(merged.finalScore, 15)
    assert.equal(merged.usedBenchmark, false)
  })
})

describe('evidence-based UX scoring spread', () => {
  function premiumAudit() {
    return {
      ok: true,
      summary: {
        nav_link_count: 5,
        primary_nav_link_count: 5,
        nav_above_fold: true,
        has_structured_header: true,
        cta_above_fold: true,
        horizontal_overflow_mobile: false,
        horizontal_overflow_desktop: false,
        image_count: 12,
        hero_image_present: true,
        section_count: 5,
        avg_text_block_length: 180,
        max_text_block_length: 320,
        desktop_text_density: 0.001,
        mobile_text_density: 0.0011,
        misaligned_image_count: 0,
        misalignment_confidence: 0,
        evidence_confidence: 0.82,
        product_grid_image_count: 10,
        layout_fitted_image_count: 10,
      },
      visual_evidence: {
        misaligned_image_count: 0,
        misalignment_confidence: 0,
        density_confidence: 0.82,
        evidence_confidence: 0.82,
        high_confidence_issues: [],
        medium_confidence_issues: [],
      },
      desktop: {
        metrics: {
          headings: [{ tag: 'h1', text: 'Premium Store', above_fold: true }],
          nav_link_count: 5,
          primary_nav_link_count: 5,
          cta_elements: [{ text: 'Shop now', above_fold: true }],
          section_count: 5,
          image_count: 12,
          layout_fitted_image_count: 10,
          product_grid_image_count: 10,
          misaligned_image_count: 0,
          text_density: 0.001,
          hero_image_present: true,
          hero_heading: { text: 'Premium Store', above_fold: true, source: 'h1', confidence: 90 },
        },
      },
      mobile: {
        metrics: {
          headings: [{ tag: 'h1', text: 'Premium Store', above_fold: true }],
          nav_link_count: 4,
          primary_nav_link_count: 4,
          cta_elements: [{ text: 'Shop now', above_fold: true }],
          section_count: 4,
          image_count: 10,
          layout_fitted_image_count: 8,
          product_grid_image_count: 8,
          misaligned_image_count: 0,
          mobile_text_density: 0.0011,
          horizontal_overflow: false,
        },
      },
    }
  }

  function templateAudit() {
    return {
      ok: true,
      summary: {
        nav_link_count: 1,
        primary_nav_link_count: 1,
        nav_above_fold: true,
        has_structured_header: false,
        cta_above_fold: false,
        horizontal_overflow_mobile: true,
        overflow_severity_mobile: 'major',
        image_count: 2,
        hero_image_present: false,
        section_count: 0,
        avg_text_block_length: 520,
        max_text_block_length: 900,
        desktop_text_density: 0.004,
        mobile_text_density: 0.0045,
        misaligned_image_count: 0,
        template_debt_signals: ['squarespace_demo_footer'],
        duplicate_copy_count: 2,
        evidence_confidence: 0.8,
      },
      visual_evidence: {
        misaligned_image_count: 0,
        misalignment_confidence: 0,
        density_confidence: 0.8,
        evidence_confidence: 0.8,
        high_confidence_issues: [],
        medium_confidence_issues: [],
      },
      desktop: {
        metrics: {
          headings: [],
          nav_link_count: 1,
          primary_nav_link_count: 1,
          section_count: 0,
          image_count: 2,
          misaligned_image_count: 0,
          text_density: 0.004,
          template_debt_signals: ['squarespace_demo_footer'],
          duplicate_copy_count: 2,
          max_text_block_length: 900,
          avg_text_block_length: 520,
        },
      },
      mobile: {
        metrics: {
          headings: [],
          nav_link_count: 1,
          section_count: 0,
          horizontal_overflow: true,
          overflow_severity: 'major',
          mobile_text_density: 0.0045,
        },
      },
    }
  }

  it('two visually different sites do not both land on 14/20 or 15/20', () => {
    const premium = buildVisualUxScore({
      businessModel: 'ecommerce_store',
      visualAuditOk: true,
      visualAudit: premiumAudit(),
      desktop: premiumAudit().desktop,
      mobile: premiumAudit().mobile,
      summary: premiumAudit().summary,
      pages: [],
      aggregated: {},
      signals: { has_add_to_cart: true },
    })
    const template = buildVisualUxScore({
      businessModel: 'online_gallery_physical_service',
      visualAuditOk: true,
      visualAudit: templateAudit(),
      desktop: templateAudit().desktop,
      mobile: templateAudit().mobile,
      summary: templateAudit().summary,
      pages: [],
      aggregated: {},
      signals: {},
    })

    const premiumLegacy = Math.round(premium.visual_score / 5)
    const templateLegacy = Math.round(template.visual_score / 5)
    assert.ok(Math.abs(premiumLegacy - templateLegacy) >= 3, `expected spread, got ${premiumLegacy} vs ${templateLegacy}`)
    assert.ok(premiumLegacy >= 16 || premium.visual_score >= 78)
    assert.ok(templateLegacy <= 13 || template.visual_score <= 68)
  })

  it('phone CTA is valid for service businesses', () => {
    const result = buildVisualUxScore({
      businessModel: 'online_gallery_physical_service',
      visualAuditOk: true,
      visualAudit: {
        ok: true,
        summary: {
          nav_link_count: 1,
          primary_nav_link_count: 1,
          nav_above_fold: true,
          cta_above_fold: true,
          evidence_confidence: 0.8,
        },
        visual_evidence: { evidence_confidence: 0.8, high_confidence_issues: [], medium_confidence_issues: [] },
        desktop: {
          metrics: {
            nav_link_count: 1,
            primary_nav_link_count: 1,
            nav_above_fold: true,
            cta_elements: [{ text: 'Call (555) 555-5555', above_fold: true }],
            hero_heading: { text: 'Custom Shades', above_fold: true, source: 'h1', confidence: 85 },
            headings: [{ tag: 'h1', text: 'Custom Shades', above_fold: true }],
            section_count: 2,
          },
        },
        mobile: { metrics: { nav_link_count: 1, cta_elements: [{ text: 'Call now', above_fold: true }] } },
      },
      desktop: {
        metrics: {
          nav_link_count: 1,
          primary_nav_link_count: 1,
          nav_above_fold: true,
          cta_elements: [{ text: 'Call (555) 555-5555', above_fold: true }],
          hero_heading: { text: 'Custom Shades', above_fold: true, source: 'h1', confidence: 85 },
          headings: [{ tag: 'h1', text: 'Custom Shades', above_fold: true }],
          section_count: 2,
        },
      },
      mobile: { metrics: { nav_link_count: 1, cta_elements: [{ text: 'Call now', above_fold: true }] } },
      summary: { nav_link_count: 1, primary_nav_link_count: 1, nav_above_fold: true, cta_above_fold: true, evidence_confidence: 0.8 },
      pages: [],
      aggregated: { contact_signals: { phones: ['555-555-5555'] } },
      signals: { has_phone: true, has_contact_page: true },
    })

    const joined = [...result.visual_strengths, ...result.visual_problems].join(' ')
    assert.match(joined, /phone|CTA|service/i)
    assert.ok(!result.visual_problems.some((item) => /replace real navigation/i.test(item)))
  })

  it('low-confidence visual problems are not shown as high severity', () => {
    const result = buildVisualUxScore({
      businessModel: 'ecommerce_store',
      visualAuditOk: true,
      visualAudit: {
        ok: true,
        summary: { evidence_confidence: 0.5, misaligned_image_count: 0 },
        visual_evidence: {
          evidence_confidence: 0.5,
          high_confidence_issues: [],
          medium_confidence_issues: [
            {
              category: 'image_alignment',
              confidence: 0.62,
              message: 'Possible image alignment inconsistency in section-1 (3 images, confidence 0.62).',
            },
          ],
        },
        desktop: { metrics: { image_count: 6, misaligned_image_count: 6, layout_fitted_image_count: 0, product_grid_image_count: 6 } },
        mobile: { metrics: { image_count: 6, misaligned_image_count: 6 } },
      },
      desktop: { metrics: { image_count: 6, misaligned_image_count: 6, layout_fitted_image_count: 0, product_grid_image_count: 6 } },
      mobile: { metrics: { image_count: 6, misaligned_image_count: 6 } },
      summary: { image_count: 6, misaligned_image_count: 0, evidence_confidence: 0.5, product_grid_image_count: 6 },
      pages: [],
      aggregated: {},
      signals: {},
    })

    assert.ok(
      !result.visual_problems.some((item) => /alignment issue detected with 0\.8/i.test(item)),
      'should not surface low-confidence alignment as high severity fact',
    )
  })
})
