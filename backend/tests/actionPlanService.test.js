const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  buildFixMetadata,
  normalizeFixesFromScores,
  mapFixPriority,
  inferDifficulty,
  isWebsiteFixAction,
} = require('../services/actionPlanFixBuilder')

describe('actionPlanService fix plan helpers', () => {
  it('normalizes priority_fixes from scores', () => {
    const fixes = normalizeFixesFromScores({
      priority_fixes: [
        { rank: 1, priority: 'critical', category: 'safety_trust', action: 'Fix HTTPS' },
      ],
    })
    assert.equal(fixes.length, 1)
    assert.equal(fixes[0].action, 'Fix HTTPS')
  })

  it('falls back to recommended_actions when priority_fixes missing', () => {
    const fixes = normalizeFixesFromScores({
      recommended_actions: ['Add contact CTA', 'Improve mobile layout'],
    })
    assert.equal(fixes.length, 2)
    assert.equal(fixes[0].priority, 'high')
    assert.equal(fixes[1].priority, 'medium')
  })

  it('builds structured metadata for a fix', () => {
    const meta = buildFixMetadata(
      {
        rank: 2,
        priority: 'high',
        category: 'ux_ui_visual',
        action: 'Increase CTA contrast',
        reason: 'Primary button is hard to see on mobile.',
        expected_impact: 'Improving UX / UI & visual quality will noticeably increase trust and conversion.',
      },
      {
        business_id: 'biz-1',
        scan_id: 'scan-1',
        scores: { scoring_version: 'business_insights_analyzer_v2', business_model: 'ecommerce_store' },
      },
    )

    assert.equal(meta.plan_type, 'website_fix')
    assert.equal(meta.fix_rank, 2)
    assert.equal(meta.difficulty, 'moderate')
    assert.equal(meta.report_path, '/app/businesses/biz-1/website-report')
    assert.ok(meta.owner_action.includes('layout'))
    assert.equal(meta.scan_id, 'scan-1')
  })

  it('maps analyzer priority to action item priority', () => {
    assert.equal(mapFixPriority('critical'), 'high')
    assert.equal(mapFixPriority('medium'), 'medium')
    assert.equal(mapFixPriority('low'), 'low')
  })

  it('infers difficulty from priority and category', () => {
    assert.equal(inferDifficulty('critical', 'customer_attraction'), 'hard')
    assert.equal(inferDifficulty('high', 'technical_functionality'), 'hard')
    assert.equal(inferDifficulty('low', 'ux_ui_visual'), 'easy')
  })

  it('detects website fix actions safely for legacy rows', () => {
    assert.equal(isWebsiteFixAction({ source: 'website-report', metadata: {} }), true)
    assert.equal(isWebsiteFixAction({ source: 'manual', metadata: { plan_type: 'website_fix' } }), true)
    assert.equal(isWebsiteFixAction({ source: 'scan', metadata: {} }), false)
    assert.equal(isWebsiteFixAction({ source: 'manual' }), false)
  })
})
