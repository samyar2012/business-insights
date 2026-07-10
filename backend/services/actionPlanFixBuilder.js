const CATEGORY_LABELS = {
  safety_trust: 'Safety & trust',
  technical_functionality: 'Technical functionality',
  ux_ui_visual: 'UX / UI & visual quality',
  offer_business_fit: 'Offer clarity & business fit',
  customer_attraction: 'Customer attraction & conversion',
  overall: 'Overall site health',
}

const OWNER_ACTIONS = {
  safety_trust: 'Review trust signals on your homepage — HTTPS, policies, contact info, and reviews.',
  technical_functionality: 'Work with your developer or hosting provider to fix load, crawl, and mobile issues.',
  ux_ui_visual: 'Improve layout, readability, CTAs, and mobile spacing on your highest-traffic pages.',
  offer_business_fit: 'Clarify what you sell and align page content with your selected business model.',
  customer_attraction: 'Strengthen conversion paths — booking, contact forms, phone, or checkout.',
  overall: 'Resolve this blocker before investing in ads or outbound marketing.',
}

function mapFixPriority(priority) {
  if (priority === 'critical' || priority === 'high') return 'high'
  if (priority === 'low') return 'low'
  return 'medium'
}

function inferDifficulty(priority, category) {
  if (priority === 'critical') return 'hard'
  if (category === 'technical_functionality' || category === 'safety_trust') {
    return priority === 'high' ? 'hard' : 'moderate'
  }
  if (priority === 'low') return 'easy'
  return 'moderate'
}

function suggestOwnerAction(fix, category) {
  if (fix.owner_action) return String(fix.owner_action).trim()
  const key = category || 'overall'
  return OWNER_ACTIONS[key] || OWNER_ACTIONS.overall
}

function normalizeFixesFromScores(scores = {}) {
  if (scores.priority_fixes?.length) {
    return scores.priority_fixes.map((fix, index) => ({
      ...fix,
      rank: fix.rank ?? index + 1,
    }))
  }
  return (scores.recommended_actions || []).map((action, index) => ({
    rank: index + 1,
    priority: index === 0 ? 'high' : 'medium',
    category: 'customer_attraction',
    action: String(action),
    reason: null,
    expected_impact: null,
  }))
}

function buildFixMetadata(fix, { business_id, scan_id, scores } = {}) {
  const category = fix.category || 'overall'
  const priority = fix.priority || 'medium'
  const reportPath = business_id ? `/app/businesses/${business_id}/website-report` : null

  return {
    plan_type: 'website_fix',
    fix_rank: fix.rank ?? null,
    category,
    category_label: CATEGORY_LABELS[category] || String(category).replace(/_/g, ' '),
    reason: fix.reason || null,
    expected_impact: fix.expected_impact || fix.impact || null,
    difficulty: inferDifficulty(priority, category),
    owner_action: suggestOwnerAction(fix, category),
    report_path: reportPath,
    scan_id: scan_id || null,
    scoring_version: scores?.scoring_version || null,
    business_model: scores?.business_model || scores?.rubric || null,
    source_section: 'priority_fixes',
  }
}

function isWebsiteFixAction(action) {
  return action?.metadata?.plan_type === 'website_fix' || action?.source === 'website-report'
}

module.exports = {
  buildFixMetadata,
  normalizeFixesFromScores,
  mapFixPriority,
  inferDifficulty,
  isWebsiteFixAction,
  CATEGORY_LABELS,
}
