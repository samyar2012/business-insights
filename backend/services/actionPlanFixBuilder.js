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

const LOW_CONFIDENCE_SKIP_IDS = new Set([
  // Soft findings without enough proof should not become hard roadmap actions
])

const CONTRADICTION_PATTERNS = [
  {
    // Do not recommend "add reviews" when evidence shows reviews already exist
    action: /add (?:reviews|testimonials|ratings)|missing review|no (?:on-page )?reviews/i,
    evidenceDenies: /review|testimonial|rating|★|⭐|aggregaterating/i,
    evidenceRequiresPositive: true,
  },
  {
    // Do not recommend "no contact" when phone/email/form evidence exists
    action: /no (?:phone|email|contact)|add (?:phone|email|contact details)/i,
    evidenceDenies: /phone|email|mailto|tel:|contact form|contact cta|contact path exists/i,
    evidenceRequiresPositive: true,
  },
]

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

function evidenceSnippets(fix) {
  const raw = Array.isArray(fix.evidence) ? fix.evidence : []
  return raw
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object') {
        return item.snippet || item.detail || item.text || item.selector || null
      }
      return null
    })
    .filter(Boolean)
}

function resolvePageUrl(fix, scores = {}) {
  const related = Array.isArray(fix.related_pages) ? fix.related_pages : []
  if (related[0]) {
    if (typeof related[0] === 'string') return related[0]
    return related[0].url || related[0].final_url || related[0].page_url || null
  }
  const proofUrl = fix.evidence_objects?.find?.((e) => e.page_url)?.page_url
  if (proofUrl) return proofUrl
  const home =
    scores?.ux_features?.page_url ||
    scores?.visual_audit_status?.page_url ||
    null
  return home
}

function resolveConfidence(fix) {
  if (fix.confidence) return fix.confidence
  if (fix.id === 'mobile_overflow_verify') return 'low'
  if (fix.priority === 'low') return 'low'
  if ((fix.evidence || []).length >= 2) return 'medium'
  if (fix.forcedPriority === 'critical' || fix.priority === 'critical') return 'high'
  return 'medium'
}

function hasEnoughEvidence(fix) {
  const snippets = evidenceSnippets(fix)
  const hasWhy = Boolean(fix.why_it_matters || fix.reason)
  const hasSteps = Array.isArray(fix.steps) && fix.steps.length > 0
  const confidence = resolveConfidence(fix)

  // Low-confidence soft verifies are allowed only when explicitly marked and evidenced
  if (confidence === 'low') {
    return snippets.length >= 1 && hasWhy && hasSteps
  }

  // Strong roadmap actions need concrete evidence + why + steps
  return snippets.length >= 1 && hasWhy && hasSteps
}

function isContradicted(fix) {
  const blob = [
    fix.title,
    fix.action,
    fix.why_it_matters,
    ...(fix.steps || []),
  ]
    .filter(Boolean)
    .join(' ')
  const evidenceBlob = evidenceSnippets(fix).join(' ')

  for (const rule of CONTRADICTION_PATTERNS) {
    if (!rule.action.test(blob)) continue
    if (rule.evidenceRequiresPositive && rule.evidenceDenies.test(evidenceBlob)) {
      // Evidence mentioning contact/reviews while action says "add/missing" can be OK when
      // evidence is the absence claim itself. Only contradict when evidence is clearly positive.
      const positiveProof =
        /detected|found|exists|present|visible|phone=true|emails=true|aggregaterating|testimonial_block|tel_link|mailto/i.test(
          evidenceBlob,
        ) && !/not (?:found|detected|clearly)|no (?:phone|email|review|on-page)/i.test(evidenceBlob)
      if (positiveProof) return true
    }
  }

  // Soften: if reviews are present strongly, skip "add reviews" retain loops
  if (
    /retain_reviews_loop|add reviews|add .*testimonials/i.test(`${fix.id || ''} ${blob}`) &&
    /structured review|testimonial evidence|has_strong_reviews|review_strength.: .strong/i.test(evidenceBlob)
  ) {
    return true
  }

  return false
}

function shouldIncludeFix(fix) {
  if (!fix) return false
  if (LOW_CONFIDENCE_SKIP_IDS.has(fix.id)) return false
  if (!hasEnoughEvidence(fix)) return false
  if (isContradicted(fix)) return false
  return true
}

function normalizeFixesFromScores(scores = {}) {
  const source = scores.growth_plan?.length
    ? scores.growth_plan
    : scores.fix_plan?.length
      ? scores.fix_plan
      : scores.priority_fixes
  if (source?.length) {
    return source
      .map((fix) => {
        // Legacy priority_fixes often only have action/reason — synthesize minimal evidence
        // so the roadmap still works, while still dropping contradicted/empty engine items.
        const evidence = evidenceSnippets(fix)
        if (!evidence.length && (fix.action || fix.reason || fix.why_it_matters)) {
          return {
            ...fix,
            evidence: [fix.reason || fix.why_it_matters || fix.action].filter(Boolean),
            why_it_matters: fix.why_it_matters || fix.reason || fix.action || null,
            steps: Array.isArray(fix.steps) && fix.steps.length
              ? fix.steps
              : [fix.owner_action || fix.action || 'Review this finding on the live site.'].filter(Boolean),
            confidence: fix.confidence || 'medium',
          }
        }
        return fix
      })
      .filter(shouldIncludeFix)
      .map((fix, index) => ({
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
    evidence: [String(action)],
    why_it_matters: String(action),
    steps: [String(action)],
    confidence: 'low',
  }))
}

function buildFixMetadata(fix, { business_id, scan_id, scores } = {}) {
  const category = fix.category || 'overall'
  const priority = fix.priority || 'medium'
  const reportPath = business_id ? `/app/businesses/${business_id}/website-report` : null
  const difficulty = fix.difficulty ? normalizeDifficultyForDisplay(fix.difficulty) : inferDifficulty(priority, category)
  const confidence = resolveConfidence(fix)
  const pageUrl = resolvePageUrl(fix, scores)
  const snippets = evidenceSnippets(fix)

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
    // Evidence-based fix-plan engine fields
    evidence: snippets.slice(0, 6),
    evidence_snippet: snippets[0] || null,
    page_url: pageUrl,
    confidence,
    why_it_matters: fix.why_it_matters || fix.reason || null,
    steps: Array.isArray(fix.steps) ? fix.steps.slice(0, 6) : [],
    expected_score_lift: fix.expected_score_lift || null,
    unlock_reason: fix.unlock_reason || null,
    expected_business_outcome: fix.expected_business_outcome || null,
    ask_ai_prompt: fix.ask_ai_prompt || null,
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
  shouldIncludeFix,
  hasEnoughEvidence,
  CATEGORY_LABELS,
}
