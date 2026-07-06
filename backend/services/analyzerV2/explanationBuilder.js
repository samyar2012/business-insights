const { CAP_RULES } = require('./scoreCaps')

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

const CATEGORY_LABELS = {
  safety_trust: 'Safety & trust',
  technical_functionality: 'Technical functionality',
  ux_ui_visual: 'UX / UI & visual quality',
  offer_business_fit: 'Offer clarity & business fit',
  customer_attraction: 'Customer attraction & conversion',
}

function gapRatio(detail) {
  if (!detail?.max) return 1
  return 1 - detail.score / detail.max
}

function priorityFromGap(detail, capContext = {}) {
  if (capContext.safetyStatus === 'unsafe') return 'critical'
  const ratio = gapRatio(detail)
  if (ratio >= 0.65) return 'critical'
  if (ratio >= 0.45) return 'high'
  if (ratio >= 0.25) return 'medium'
  return 'low'
}

function expectedImpact(category, priority) {
  const label = CATEGORY_LABELS[category] || category
  if (priority === 'critical') return `Fixing ${label} is essential before driving paid traffic.`
  if (priority === 'high') return `Improving ${label} will noticeably increase trust and conversion.`
  if (priority === 'medium') return `Addressing ${label} helps visitors understand and act faster.`
  return `Polishing ${label} can lift conversion incrementally.`
}

function buildPriorityFixes(categoryDetails, context = {}) {
  const fixes = []
  const seen = new Set()

  for (const cap of context.cap_reasons || []) {
    const rule = CAP_RULES.find((item) => item.id === cap.cap)
    const action =
      rule?.id === 'unsafe_site_cap_30'
        ? 'Resolve Safe Browsing threats and verify the site is clean before marketing.'
        : rule?.id === 'homepage_failure_cap_40'
          ? 'Fix homepage SSL and server errors so the primary URL loads.'
          : rule?.id === 'no_readable_content_cap_45'
            ? 'Add readable HTML content to homepage and key landing pages.'
            : rule?.id === 'business_model_mismatch_cap_65'
              ? 'Use a URL that matches your business model or update onboarding selection.'
              : rule?.id === 'mobile_overflow_cap_70'
                ? 'Fix mobile CSS overflow and horizontal scrolling.'
                : rule?.id === 'no_conversion_path_cap_75'
                  ? 'Add a visible phone, contact, booking, or purchase CTA.'
                  : cap.reason
    if (!seen.has(action)) {
      seen.add(action)
      fixes.push({
        priority: rule?.id?.includes('unsafe') || rule?.id?.includes('homepage') ? 'critical' : 'high',
        category: 'overall',
        action,
        reason: cap.reason,
        expected_impact: 'Removing this cap unlocks a higher overall score.',
      })
    }
  }

  for (const [category, detail] of Object.entries(categoryDetails)) {
    for (const fix of detail.recommended_fixes || []) {
      if (seen.has(fix)) continue
      seen.add(fix)
      const priority = priorityFromGap(detail, context)
      fixes.push({
        priority,
        category,
        action: fix,
        reason: (detail.problems || [])[0] || `Low ${CATEGORY_LABELS[category]} score (${detail.score}/${detail.max}).`,
        expected_impact: expectedImpact(category, priority),
      })
    }
  }

  fixes.sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
      String(a.category).localeCompare(String(b.category)),
  )

  return fixes.slice(0, 10).map((fix, index) => ({ ...fix, rank: index + 1 }))
}

function buildReadableSummary({ overallScore, confidenceScore, rubric, categoryDetails, capReasons, benchmark }) {
  const lines = []
  const human = Math.round((overallScore / 5) * 10) / 10
  lines.push(
    `Your website scores ${overallScore}/100 (${human}/20 on the human benchmark scale) for a ${String(rubric).replace(/_/g, ' ')} business.`,
  )

  if (confidenceScore < 60) {
    lines.push(
      `Confidence is ${confidenceScore}/100 because some checks were limited (visual audit, Safe Browsing, or shallow crawl). Rescan after fixes for a firmer score.`,
    )
  }

  const weakest = Object.entries(categoryDetails)
    .map(([key, detail]) => ({ key, detail, gap: gapRatio(detail) }))
    .sort((a, b) => b.gap - a.gap)[0]
  if (weakest && weakest.gap > 0.3) {
    lines.push(
      `Biggest opportunity: ${CATEGORY_LABELS[weakest.key]} (${weakest.detail.score}/${weakest.detail.max}) — ${(weakest.detail.problems || [])[0] || 'several gaps vs best-practice sites.'}`,
    )
  }

  const strongest = Object.entries(categoryDetails)
    .map(([key, detail]) => ({ key, detail, pct: detail.score / detail.max }))
    .sort((a, b) => b.pct - a.pct)[0]
  if (strongest && strongest.pct >= 0.7) {
    lines.push(`Current strength: ${CATEGORY_LABELS[strongest.key]} is relatively solid (${strongest.detail.score}/${strongest.detail.max}).`)
  }

  if (capReasons?.length) {
    lines.push(`Score capped: ${capReasons[0].reason}`)
  }

  if (benchmark?.enabled && benchmark.target_level) {
    lines.push(
      `Benchmark context: ${benchmark.target_level} (${benchmark.target_human_score}/20). Average competitor sites score ${benchmark.benchmark_average_human_score}/20; strong sites score ${benchmark.benchmark_strong_human_score}/20.`,
    )
  }

  return lines.join(' ')
}

function buildStrengthsList(categoryDetails) {
  return [...new Set(Object.values(categoryDetails).flatMap((detail) => detail.strengths || []))].slice(0, 8)
}

function buildRisksList(categoryDetails, mismatchWarnings = []) {
  const risks = Object.values(categoryDetails).flatMap((detail) => detail.problems || [])
  const merged = [...new Set([...risks, ...mismatchWarnings])]
  if (merged.length === 0) {
    return ['No major risks detected from this crawl.']
  }
  return merged.slice(0, 8)
}

function buildScoreExplanation(categoryDetails) {
  const explanations = []
  for (const [category, detail] of Object.entries(categoryDetails)) {
    explanations.push({
      category: category === 'offer_business_fit' ? 'business_fit' : category.replace('_visual', '').replace('technical_functionality', 'functionality').replace('safety_trust', 'safety'),
      delta: detail.score,
      reason: `${CATEGORY_LABELS[category]}: ${detail.score}/${detail.max} (${detail.confidence}% confidence).`,
    })
    for (const problem of (detail.problems || []).slice(0, 2)) {
      explanations.push({ category: 'ux_ui', delta: 0, reason: problem })
    }
  }
  return explanations.slice(0, 24)
}

module.exports = {
  CATEGORY_LABELS,
  buildPriorityFixes,
  buildReadableSummary,
  buildStrengthsList,
  buildRisksList,
  buildScoreExplanation,
}
