const CATEGORY_LABELS = {
  // core analyzer categories (legacy priority_fixes shape)
  safety_trust: 'Safety & trust',
  technical_functionality: 'Technical functionality',
  ux_ui_visual: 'UX / UI & visual quality',
  offer_business_fit: 'Offer clarity & business fit',
  customer_attraction: 'Customer attraction & conversion',
  overall: 'Overall site health',
  // granular fix-plan-engine categories
  safety: 'Safety',
  functionality: 'Functionality',
  ux_ui: 'UX / UI',
  business_fit: 'Business fit',
  trust: 'Trust & proof',
  content: 'Content',
  seo: 'SEO',
  mobile: 'Mobile experience',
}

const PILLAR_LABELS = {
  acquire: 'Acquire',
  convert: 'Convert',
  retain: 'Retain',
  operate: 'Operate',
}

const OWNER_ACTIONS = {
  safety_trust: 'Review trust signals on your homepage - HTTPS, policies, contact info, and reviews.',
  technical_functionality: 'Work with your developer or hosting provider to fix load, crawl, and mobile issues.',
  ux_ui_visual: 'Improve layout, readability, CTAs, and mobile spacing on your highest-traffic pages.',
  offer_business_fit: 'Clarify what you sell and align page content with your selected business model.',
  customer_attraction: 'Strengthen conversion paths - booking, contact forms, phone, or checkout.',
  overall: 'Resolve this blocker before investing in ads or outbound marketing.',
  safety: 'Resolve safety flags and enable HTTPS before driving traffic.',
  functionality: 'Work with your developer or hosting provider to fix load and crawl issues.',
  ux_ui: 'Improve layout, spacing, and visual polish on your highest-traffic pages.',
  business_fit: 'Clarify what you sell and align page content with your selected business model.',
  trust: 'Add contact details, policies, and proof so new visitors trust the business.',
  content: 'Add more substantive, readable content to key pages.',
  seo: 'Strengthen page titles, meta descriptions, and headings.',
  mobile: 'Fix mobile layout, readability, or viewport issues.',
}

// Difficulty vocabulary used across the app's UI is easy/moderate/hard. The fix-plan engine
// emits easy/medium/hard - normalize "medium" to "moderate" for display without touching the
// canonical easy/medium/hard values stored on the fix itself.
function normalizeDifficultyForDisplay(difficulty) {
  return difficulty === 'medium' ? 'moderate' : difficulty
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
  const source = scores.growth_plan?.length
    ? scores.growth_plan
    : scores.fix_plan?.length
      ? scores.fix_plan
      : scores.priority_fixes
  if (source?.length) {
    return source.map((fix, index) => ({
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
  const difficulty = fix.difficulty ? normalizeDifficultyForDisplay(fix.difficulty) : inferDifficulty(priority, category)

  return {
    plan_type: 'website_fix',
    plan_name: fix.pillar ? 'growth_plan' : 'fix_plan',
    fix_rank: fix.rank ?? null,
    step_label: fix.step_label || (fix.rank ? `Step ${fix.rank}` : null),
    pillar: fix.pillar || null,
    pillar_label: fix.pillar ? PILLAR_LABELS[fix.pillar] || fix.pillar : null,
    category,
    category_label: CATEGORY_LABELS[category] || String(category).replace(/_/g, ' '),
    reason: fix.reason || fix.why_it_matters || null,
    expected_impact: fix.expected_impact || fix.expected_score_lift || fix.impact || null,
    difficulty,
    owner_action: suggestOwnerAction(fix, category),
    // Evidence-based fix-plan engine fields (optional — absent on legacy fixes).
    evidence: Array.isArray(fix.evidence) ? fix.evidence.slice(0, 6) : [],
    why_it_matters: fix.why_it_matters || null,
    steps: Array.isArray(fix.steps) ? fix.steps.slice(0, 6) : [],
    expected_score_lift: fix.expected_score_lift || null,
    // Sequencing: "do this first, so it unlocks the next fix" instead of a flat priority label.
    unlock_reason: fix.unlock_reason || null,
    expected_business_outcome: fix.expected_business_outcome || null,
    ask_ai_prompt: fix.ask_ai_prompt || null,
    // Attributed UX/conversion research grounding, varied by business model - not a made-up stat.
    research_basis: fix.research_basis || null,
    affected_scores: Array.isArray(fix.affected_scores) ? fix.affected_scores : [],
    related_pages: Array.isArray(fix.related_pages) ? fix.related_pages.slice(0, 3) : [],
    report_path: reportPath,
    scan_id: scan_id || null,
    scoring_version: scores?.scoring_version || null,
    business_model: scores?.business_model || scores?.rubric || scores?.scoring_rubric || null,
    source_section: fix.evidence?.length ? 'fix_plan_engine' : 'priority_fixes',
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
