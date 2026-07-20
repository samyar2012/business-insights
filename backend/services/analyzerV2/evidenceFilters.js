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
  /buy, book, or contact|phone number and email in the header|add a visible phone number and email/i

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
  return false
}

function isPillarFillerText(text) {
  return PILLAR_FILLER_RE.test(String(text || ''))
}

function isGenericCommerceAdvice(text, rubric) {
  const blob = String(text || '')
  if (!GENERIC_COMMERCE_CTA_RE.test(blob)) return false
  if (isContentRubric(rubric)) return true
  if (isStoreRubric(rubric) && /phone number and email in the header/i.test(blob)) return true
  if (isContentRubric(rubric) && /buy, book, or contact/i.test(blob)) return true
  return false
}

function filterEvidenceLines(lines, rubric = null) {
  return (lines || [])
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .filter((line) => !isPositiveEvidenceNote(line))
    .filter((line) => !isPillarFillerText(line))
    .filter((line) => !(rubric && isGenericCommerceAdvice(line, rubric)))
}

function filterProblemLines(lines, rubric = null) {
  return filterEvidenceLines(lines, rubric)
}

function shouldDropFixForRubric(item, rubric) {
  if (!item) return true
  if (/^pillar_backfill_/i.test(item.id || '')) return true

  const blob = [
    item.id,
    item.title,
    item.action,
    item.why_it_matters,
    ...(item.evidence || []),
    ...(item.steps || []),
  ]
    .filter(Boolean)
    .join(' ')

  if (isPillarFillerText(blob)) return true
  if (isGenericCommerceAdvice(blob, rubric)) return true

  if (isContentRubric(rubric)) {
    if (/buy, book, or contact|move reviews next to the decision|add reviews/i.test(blob)) return true
    if (/understand the (?:offer|service) in 5 seconds/i.test(blob) && !/categor|navigation|recipe|subscribe/i.test(blob)) {
      return true
    }
  }

  if (isStoreRubric(rubric)) {
    if (/phone number clickable and visible in the header|add a visible phone number and email/i.test(blob)) {
      return true
    }
  }

  if (/fix misaligned images/i.test(item.title || '') && isPositiveEvidenceNote((item.evidence || []).join(' '))) {
    return true
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
  isGenericCommerceAdvice,
  filterEvidenceLines,
  filterProblemLines,
  shouldDropFixForRubric,
  assessCrawlExtraction,
}
