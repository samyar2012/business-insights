const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  filterEvidenceLines,
  shouldDropFixForRubric,
  isPositiveEvidenceNote,
  isPillarFillerText,
  assessCrawlExtraction,
} = require('../services/analyzerV2/evidenceFilters')

describe('evidenceFilters', () => {
  it('drops positive alignment notes from evidence', () => {
    const lines = filterEvidenceLines(
      ['No image alignment issue detected.', 'Hero spacing feels cramped on mobile.'],
      'local_service_business',
    )
    assert.deepEqual(lines, ['Hero spacing feels cramped on mobile.'])
    assert.equal(isPositiveEvidenceNote('No image alignment issue detected.'), true)
  })

  it('drops pillar filler and generic commerce advice for blogs', () => {
    assert.equal(isPillarFillerText('Create a weekly discovery-growth routine'), true)
    const drop = shouldDropFixForRubric(
      {
        id: 'weak_cta',
        title: 'Buy, book, or contact from the homepage',
        evidence: ['No clear action path.'],
      },
      'blog',
    )
    assert.equal(drop, true)
  })

  it('drops phone-in-header advice for ecommerce stores', () => {
    const drop = shouldDropFixForRubric(
      {
        id: 'missing_contact_trust',
        title: 'Make the phone number clickable and visible in the header',
        evidence: ['No phone found.'],
      },
      'ecommerce_store',
    )
    assert.equal(drop, true)
  })

  it('flags sparse crawl with strong visual content as extraction limitation', () => {
    const result = assessCrawlExtraction({
      crawlTextLen: 40,
      visualAudit: {
        ok: true,
        summary: { visible_text_length: 4200, above_fold_text_length: 900 },
      },
      uxFeatures: { visual_score: 96 },
    })
    assert.equal(result.sparse_crawl, true)
    assert.equal(result.visual_shows_content, true)
    assert.match(String(result.warning || ''), /crawl-extraction limitation/i)
  })
})
