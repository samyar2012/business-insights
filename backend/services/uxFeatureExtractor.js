const { CTA_PATTERN } = require('./visualAuditService')
const {
  buildVisualUxScore,
  mapVisualScoreToCategoryPoints,
  mapVisualScoreToLegacy20,
} = require('./uxVisualScorer')

const READABILITY_BLOCK_SOFT = 400
const DENSE_PARAGRAPH_THRESHOLD = 350

function pageData(page) {
  let data = page?.extracted_data_json || {}
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch {
      data = {}
    }
  }
  return data
}

function textBlocksFromPages(pages = []) {
  const blocks = []
  for (const page of pages) {
    const text = String(page.extracted_text || '').trim()
    if (!text) continue
    const parts = text.split(/\n{2,}|(?:\.\s+){2,}/).map((part) => part.replace(/\s+/g, ' ').trim())
    for (const part of parts) {
      if (part.length >= 40) blocks.push(part.length)
    }
  }
  return blocks
}

function crawlerParagraphStats(pages = []) {
  const blocks = textBlocksFromPages(pages)
  if (!blocks.length) {
    return { avg_paragraph_length: 0, max_text_block_length: 0, block_count: 0 }
  }
  const total = blocks.reduce((sum, n) => sum + n, 0)
  return {
    avg_paragraph_length: Math.round(total / blocks.length),
    max_text_block_length: Math.max(...blocks),
    block_count: blocks.length,
  }
}

function collectCrawlerSignals(pages = [], aggregated = {}) {
  let hasH1 = false
  let h1Text = ''
  let hasMobileViewport = false
  let imageCount = 0
  let ctaCount = 0
  let pageText = ''

  for (const page of pages) {
    pageText += ` ${page.extracted_text || ''}`
    const data = pageData(page)
    const headings = data.headings || page.headings || {}
    const h1s = headings.h1 || []
    if (h1s.length > 0) {
      hasH1 = true
      h1Text = h1Text || h1s[0]
    }
    if (data.has_mobile_viewport) hasMobileViewport = true
    imageCount += data.image_count || 0
    ctaCount += (data.ctas || []).length
  }

  const aggregatedCtas = aggregated.content_signals?.ctas || []
  ctaCount = Math.max(ctaCount, aggregatedCtas.length)
  const navLabels = aggregated.content_signals?.navigation_labels || []

  return {
    hasH1,
    h1Text,
    hasMobileViewport,
    imageCount,
    ctaCount,
    navCount: navLabels.length,
    navAboveFold: navLabels.length >= 2,
    pageText,
    sectionCount: pages.filter((p) => (p.extracted_text || '').length > 200).length,
  }
}

function computeVisitorAppealIndex(components, visualScore) {
  const layout = components.layout_balance_score ?? visualScore
  const readability = components.readability_score ?? visualScore
  const hierarchy = components.visual_hierarchy_score ?? visualScore
  const images = components.image_quality_score ?? visualScore
  const polish = Math.round(
    (components.layout_balance_score ?? visualScore) * 0.4 +
      (components.trust_visual_score ?? visualScore) * 0.35 +
      (components.navbar_score ?? visualScore) * 0.25,
  )
  return Math.round(
    visualScore * 0.3 +
      layout * 0.25 +
      readability * 0.2 +
      polish * 0.15 +
      hierarchy * 0.05 +
      images * 0.05,
  )
}

function extractUxFeatures({
  visualAudit = null,
  pages = [],
  aggregated = {},
  businessModel = 'ecommerce_store',
  signals = {},
} = {}) {
  const crawlerStats = crawlerParagraphStats(pages)
  const crawlerSignals = collectCrawlerSignals(pages, aggregated)
  const visualAuditOk = Boolean(visualAudit?.ok)

  const visualResult = buildVisualUxScore({
    businessModel,
    visualAuditOk,
    visualAuditFailed: Boolean(visualAudit?.enabled && !visualAudit?.ok && !visualAudit?.skipped),
    desktop: visualAudit?.desktop || {},
    mobile: visualAudit?.mobile || {},
    summary: visualAudit?.summary || {},
    crawler: {
      ...crawlerStats,
      ...crawlerSignals,
      avgParagraphLength: crawlerStats.avg_paragraph_length,
      maxTextBlockLength: crawlerStats.max_text_block_length,
      blockCount: crawlerStats.block_count,
    },
    aggregated,
    signals,
    pages,
    visualAudit,
  })

  const components = visualResult.ux_score_components
  const visualScore = visualResult.visual_score

  return {
    source: visualAuditOk ? 'visual_audit+crawler' : 'crawler_static',
    scoring_model: 'ux_visual_v2',
    visual_score: visualScore,
    overall_static_ux_score: visualScore,
    ui_score: visualScore,
    ux_score_components: components,
    ux_confidence: visualResult.ux_confidence,
    visual_strengths: visualResult.visual_strengths,
    visual_problems: visualResult.visual_problems,
    visual_recommended_fixes: visualResult.visual_recommended_fixes,
    ux_scoring_inputs: visualResult.scoring_inputs,
    component_weights: visualResult.component_weights,
    component_notes: visualResult.component_notes,
    navbar_score: components.navbar_score,
    hero_score: components.hero_score,
    readability_score: components.readability_score,
    visual_hierarchy_score: components.visual_hierarchy_score,
    image_quality_score: components.image_quality_score,
    layout_balance_score: components.layout_balance_score,
    conversion_path_score: components.conversion_path_score,
    trust_visual_score: components.trust_visual_score,
    legacy_ux_score_on_20_scale: mapVisualScoreToLegacy20(visualScore),
    visual_score_100: visualScore,
    ux_ui_score: visualResult.ux_ui_score,
    ux_component_scores: visualResult.ux_component_scores,
    ux_component_explanations: visualResult.ux_component_explanations,
    ux_evidence: visualResult.ux_evidence,
    hero_heading: visualResult.hero_heading,
    readability_factors: visualResult.readability_factors,
    readability_strengths: visualResult.readability_strengths,
    readability_problems: visualResult.readability_problems,
    readability_confidence: visualResult.readability_confidence,
    layout_strengths: visualResult.layout_strengths,
    layout_problems: visualResult.layout_problems,
    layout_evidence: visualResult.layout_evidence,
    avg_paragraph_length: visualResult.scoring_inputs.avg_paragraph_length,
    average_paragraph_length: visualResult.scoring_inputs.avg_paragraph_length,
    max_text_block_length: visualResult.scoring_inputs.max_text_block_length,
    cta_above_fold: Boolean(visualResult.scoring_inputs.cta_above_fold_count > 0),
    nav_link_count: visualResult.scoring_inputs.nav_link_count,
    primary_nav_link_count: visualResult.scoring_inputs.primary_nav_link_count,
    nav_visibility_score: components.navbar_score,
    navbar_visibility_score: components.navbar_score,
    cta_visibility_score: components.conversion_path_score,
    mobile_usability_score: components.layout_balance_score,
    layout_overflow_score: components.layout_balance_score,
    contrast_score: components.trust_visual_score,
    image_support_score: components.image_quality_score,
    visual_richness_score: components.image_quality_score,
    display_polish_score: Math.round(
      components.layout_balance_score * 0.4 +
        components.trust_visual_score * 0.35 +
        components.navbar_score * 0.25,
    ),
    layout_fitted_image_count: visualResult.scoring_inputs?.layout_fitted_image_count ?? 0,
    misaligned_image_count: visualResult.scoring_inputs?.misaligned_image_count ?? 0,
    visitor_appeal_index: computeVisitorAppealIndex(components, visualScore),
    desktop_text_density: visualAudit?.summary?.desktop_text_density ?? 0,
    mobile_text_density: visualAudit?.summary?.mobile_text_density ?? 0,
    signals: {
      has_h1: visualResult.hero_heading?.has_h1 || crawlerSignals.hasH1,
      has_hero_heading: visualResult.hero_heading?.has_hero_heading,
      hero_heading_text: visualResult.hero_heading?.hero_heading_text,
      hero_heading_source: visualResult.hero_heading?.hero_heading_source,
      hero_heading_confidence: visualResult.hero_heading?.hero_heading_confidence,
      h1_above_fold: visualResult.hero_heading?.h1_above_fold,
      hero_heading_above_fold: visualResult.hero_heading?.hero_heading_above_fold,
      has_mobile_viewport: crawlerSignals.hasMobileViewport || visualAuditOk,
      horizontal_overflow_desktop: visualAudit?.summary?.horizontal_overflow_desktop,
      horizontal_overflow_mobile: visualAudit?.summary?.horizontal_overflow_mobile,
      overflow_severity_mobile: visualAudit?.summary?.overflow_severity_mobile,
      image_count: visualResult.scoring_inputs.image_count,
      nav_above_fold: visualResult.scoring_inputs.nav_link_count >= 2,
      cta_count: visualResult.scoring_inputs.cta_above_fold_count,
      nav_link_count: visualResult.scoring_inputs.nav_link_count,
    },
    visual_audit_evidence: visualAudit?.evidence_snippets || null,
  }
}

function buildUxFeatureExplanations(features) {
  if (!features) return []
  const explanations = []

  for (const problem of features.visual_problems || []) {
    explanations.push(problem)
  }
  for (const strength of (features.visual_strengths || []).slice(0, 4)) {
    explanations.push(strength)
  }

  if (!explanations.length && features.max_text_block_length > READABILITY_BLOCK_SOFT) {
    explanations.push(`Large text blocks reduce readability (${features.max_text_block_length} chars).`)
  }

  return [...new Set(explanations)].slice(0, 12)
}

function buildUxFeatureSnapshot(features) {
  if (!features) return null
  return {
    visual_score: features.visual_score,
    ux_confidence: features.ux_confidence,
    scoring_model: features.scoring_model,
    components: features.ux_score_components,
    inputs: features.ux_scoring_inputs,
    source: features.source,
  }
}

module.exports = {
  extractUxFeatures,
  buildUxFeatureExplanations,
  buildUxFeatureSnapshot,
  crawlerParagraphStats,
  mapVisualScoreToCategoryPoints,
  READABILITY_BLOCK_SOFT,
  DENSE_PARAGRAPH_THRESHOLD,
  CTA_PATTERN,
}
