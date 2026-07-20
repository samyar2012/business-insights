/**
 * Strict evidence filtering — keeps positive/contradictory notes and pillar filler
 * out of customer-facing problems, evidence, and growth moves.
 */

const CONTENT_RUBRICS = new Set(['blog', 'content_business'])
const STORE_RUBRICS = new Set(['ecommerce_store', 'online_plus_offline_store'])
const SERVICE_RUBRICS = new Set([
  'online_plus_physical_service',
  'local_service_business',
  'online_gallery_physical_service',
])

const POSITIVE_NOTE_RE =
  /^no .+ (?:issue|problem|overflow|misalignment) detected\.?$/i

const PILLAR_FILLER_RE =
  /pillar_backfill_|weekly discovery-growth routine|this growth pillar has no explicit step|balanced growth requires consistent execution across all four pillars|document operations for demand spikes/i

const GENERIC_COMMERCE_CTA_RE =
  /buy, book, or contact|book, shop, or contact|business model \(book|phone number and email in the header|add a visible phone number and email|click-to-call phone number in the header|make the phone number clickable and (?:more )?visible in the header/i

const GENERIC_FILLER_STEP_RE =
  /^address:|ask the ai growth coach|review this area on both desktop and mobile/i

const VAGUE_CATCHALL_RE =
  /polish remaining|strengthen remaining|shore up remaining|resolve remaining technical/i

function isContentRubric(rubric) {
  return CONTENT_RUBRICS.has(rubric)
}

function isStoreRubric(rubric) {
  return STORE_RUBRICS.has(rubric)
}

function isServiceRubric(rubric) {
  return SERVICE_RUBRICS.has(rubric)
}

function isPositiveEvidenceNote(text) {
  const t = String(text || '').trim()
  if (!t) return false
  if (POSITIVE_NOTE_RE.test(t)) return true
  if (/^no (?:image alignment|overflow|layout) issue/i.test(t)) return true
  if (/could not be reliably evaluated/i.test(t) && /alignment/i.test(t)) return true
  // Positive notes must never appear inside longer problem strings
  if (/no image alignment issue detected/i.test(t) && !/misaligned|poorly fitted|poorly integrated/i.test(t)) {
    return true
  }
  return false
}

function isPillarFillerText(text) {
  return PILLAR_FILLER_RE.test(String(text || ''))
}

function isGenericFillerStep(text) {
  return GENERIC_FILLER_STEP_RE.test(String(text || '').trim())
}

function isGenericCommerceAdvice(text, rubric) {
  const blob = String(text || '')
  if (!blob) return false

  if (GENERIC_COMMERCE_CTA_RE.test(blob)) {
    if (isContentRubric(rubric)) return true
    if (isStoreRubric(rubric) && /phone|click-to-call|header/i.test(blob)) return true
    if (isContentRubric(rubric) && /buy|book|shop|contact/i.test(blob)) return true
  }

  if (isContentRubric(rubric)) {
    if (/buy, book|book, shop|shop, or contact|move reviews next to the decision|add reviews|understand the offer in 5 seconds/i.test(blob)) {
      return true
    }
  }

  if (isStoreRubric(rubric)) {
    if (/phone number clickable|click-to-call phone|visible in the header|phone and email in the header/i.test(blob)) {
      return true
    }
  }

  return false
}

function filterEvidenceLines(lines, rubric = null) {
  return (lines || [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .filter((line) => !isPositiveEvidenceNote(line))
    .filter((line) => !isPillarFillerText(line))
    .filter((line) => !isGenericFillerStep(line))
    .filter((line) => !(rubric && isGenericCommerceAdvice(line, rubric)))
}

function filterProblemLines(lines, rubric = null) {
  return filterEvidenceLines(lines, rubric)
}

function filterSteps(steps, rubric = null) {
  return filterEvidenceLines(steps, rubric).filter((step) => !/^address:/i.test(step))
}

function sanitizeCategoryDetail(detail, rubric = null) {
  if (!detail) return detail
  detail.problems = filterProblemLines(detail.problems || [], rubric)
  detail.recommended_fixes = filterSteps(detail.recommended_fixes || [], rubric)
  detail.strengths = (detail.strengths || []).filter((line) => !isPillarFillerText(line))
  if (Array.isArray(detail.point_breakdown)) {
    detail.point_breakdown = detail.point_breakdown.map((item) => ({
      ...item,
      note: isPositiveEvidenceNote(item.note) ? '' : item.note,
    }))
  }
  return detail
}

function shouldDropFixForRubric(item, rubric) {
  if (!item) return true
  if (/^pillar_backfill_/i.test(item.id || '')) return true
  if (/^catchall_/i.test(item.id || '') && isContentRubric(rubric)) return true
  if (item.id === 'retain_reviews_loop' && isContentRubric(rubric)) return true
  if (item.id === 'operate_response_playbook' && isContentRubric(rubric)) return true

  const blob = [
    item.id,
    item.title,
    item.action,
    item.why_it_matters,
    ...(item.evidence || []),
    ...(item.steps || []),
    ...(item.implementation_steps || []),
  ]
    .filter(Boolean)
    .join(' ')

  if (isPillarFillerText(blob)) return true
  if (isGenericCommerceAdvice(blob, rubric)) return true
  if (VAGUE_CATCHALL_RE.test(item.title || '') && /^catchall_/i.test(item.id || '')) return true

  if (isContentRubric(rubric)) {
    if (/buy, book|book, shop|shop, or contact|move reviews next to the decision|add reviews/i.test(blob)) return true
    if (/understand the (?:offer|service) in 5 seconds/i.test(blob) && !/categor|navigation|recipe|subscribe/i.test(blob)) {
      return true
    }
  }

  if (isStoreRubric(rubric)) {
    if (/phone number clickable|click-to-call phone|visible in the header|phone and email in the header/i.test(blob)) {
      return true
    }
  }

  if (/fix misaligned images|misaligned or poorly fitted/i.test(item.title || '')) {
    if (isPositiveEvidenceNote(blob) || /no image alignment issue detected/i.test(blob)) return true
  }

  if ((item.evidence || []).some((line) => isPositiveEvidenceNote(line))) {
    if (/misaligned|alignment|layout|visual polish/i.test(blob)) return true
  }

  return false
}

function assessCrawlExtraction({ crawlTextLen = 0, visualAudit = null, uxFeatures = null } = {}) {
  const visualSummary = visualAudit?.summary || {}
  const visualDesktop = visualAudit?.desktop || {}
  const visualMobile = visualAudit?.mobile || {}
  const visualTextLen = Math.max(
    Number(visualSummary.visible_text_length) || 0,
    Number(visualSummary.above_fold_text_length) || 0,
    Number(visualDesktop.visible_text_length) || 0,
    Number(visualMobile.visible_text_length) || 0,
    Number(uxFeatures?.signals?.visible_text_length) || 0,
    Number(uxFeatures?.visual_evidence_summary?.visible_text_length) || 0,
  )
  const visualScore = Number(uxFeatures?.visual_score) || 0
  const visualOk = Boolean(visualAudit?.ok)
  const sparseCrawl = crawlTextLen < 120
  const jsRendered = Boolean(visualOk) && sparseCrawl
  const visualShowsContent = visualOk && (visualTextLen >= 200 || visualScore >= 70)

  let level = 'high'
  let warning = null

  if (sparseCrawl && visualShowsContent) {
    level = 'low'
    warning =
      'Crawler extracted very little HTML text, but the visual audit found substantial rendered content. Treat this as a crawl-extraction limitation — not proof the live site is empty or low quality.'
  } else if (sparseCrawl || visualScore < 50) {
    level = visualOk ? 'medium' : 'low'
    if (sparseCrawl) {
      warning =
        'Very little text was extracted from crawl HTML. Scores may understate the live site until server-rendered copy is available to crawlers.'
    }
  }

  return {
    level,
    warning,
    sparse_crawl: sparseCrawl,
    visual_shows_content: visualShowsContent,
    js_rendered_gap: jsRendered,
    crawl_text_length: crawlTextLen,
    visual_text_length: visualTextLen,
    visual_score: visualScore || null,
  }
}

module.exports = {
  CONTENT_RUBRICS,
  STORE_RUBRICS,
  SERVICE_RUBRICS,
  isContentRubric,
  isStoreRubric,
  isServiceRubric,
  isPositiveEvidenceNote,
  isPillarFillerText,
  isGenericFillerStep,
  isGenericCommerceAdvice,
  filterEvidenceLines,
  filterProblemLines,
  filterSteps,
  sanitizeCategoryDetail,
  shouldDropFixForRubric,
  assessCrawlExtraction,
}
