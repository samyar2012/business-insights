const { CTA_PATTERN } = require('./visualAuditService')

const READABILITY_BLOCK_SOFT = 400
const READABILITY_BLOCK_HARD = 900
const DENSE_PARAGRAPH_THRESHOLD = 350

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

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

function scoreReadability({ avgParagraphLength, maxTextBlockLength }) {
  let score = 100
  if (maxTextBlockLength > READABILITY_BLOCK_HARD) score -= 35
  else if (maxTextBlockLength > READABILITY_BLOCK_SOFT) score -= 20

  if (avgParagraphLength > DENSE_PARAGRAPH_THRESHOLD) score -= 20
  else if (avgParagraphLength > 220) score -= 10

  return clampScore(score)
}

function scoreCtaVisibility({ ctaAboveFold, ctaCount }) {
  let score = 35
  if (ctaAboveFold) score += 45
  if (ctaCount >= 2) score += 15
  else if (ctaCount >= 1) score += 8
  return clampScore(score)
}

function scoreNavVisibility({ navAboveFold, navCount }) {
  let score = 30
  if (navAboveFold) score += 50
  if (navCount >= 3) score += 20
  else if (navCount >= 1) score += 10
  return clampScore(score)
}

function scoreVisualHierarchy({ hasH1, h1AboveFold, headingLevels }) {
  let score = 40
  if (hasH1) score += 25
  if (h1AboveFold) score += 20
  if (headingLevels >= 2) score += 15
  return clampScore(score)
}

function scoreMobileUsability({ hasMobileViewport, mobileOverflow, mobileTextDensity, desktopTextDensity }) {
  let score = 40
  if (hasMobileViewport) score += 20
  else score -= 25
  if (!mobileOverflow) score += 25
  else score -= 30
  if (mobileTextDensity > 0 && desktopTextDensity > 0) {
    const ratio = mobileTextDensity / desktopTextDensity
    if (ratio > 2.5) score -= 15
    else if (ratio <= 1.8) score += 10
  }
  return clampScore(score)
}

function scoreImageSupport(imageCount) {
  if (imageCount >= 5) return 90
  if (imageCount >= 3) return 75
  if (imageCount >= 1) return 55
  return 25
}

function scoreLayoutOverflow({ desktopOverflow, mobileOverflow }) {
  let score = 100
  if (desktopOverflow) score -= 25
  if (mobileOverflow) score -= 45
  return clampScore(score)
}

function scoreContrast(contrast) {
  if (!contrast) return 60
  if (contrast.min_ratio >= 4.5) return 92
  if (contrast.min_ratio >= 3) return 72
  if (contrast.average_ratio >= 4.5) return 78
  return 45
}

function scoreTextDensity(density) {
  if (density <= 0) return 70
  if (density < 0.0008) return 85
  if (density < 0.0015) return 70
  if (density < 0.0025) return 55
  return 35
}

function collectCrawlerSignals(pages = [], aggregated = {}) {
  let hasH1 = false
  let hasMobileViewport = false
  let imageCount = 0
  let ctaCount = 0

  for (const page of pages) {
    const data = pageData(page)
    const headings = data.headings || page.headings || {}
    if ((headings.h1 || []).length > 0) hasH1 = true
    if (data.has_mobile_viewport) hasMobileViewport = true
    imageCount += data.image_count || 0
    ctaCount += (data.ctas || []).length
  }

  const aggregatedCtas = aggregated.content_signals?.ctas || []
  ctaCount = Math.max(ctaCount, aggregatedCtas.length)

  return {
    hasH1,
    hasMobileViewport,
    imageCount,
    ctaCount,
    navCount: (aggregated.content_signals?.navigation_labels || []).length,
  }
}

function extractUxFeatures({ visualAudit = null, pages = [], aggregated = {} } = {}) {
  const crawlerStats = crawlerParagraphStats(pages)
  const crawlerSignals = collectCrawlerSignals(pages, aggregated)
  const visualSummary = visualAudit?.summary || {}
  const desktopMetrics = visualAudit?.desktop?.metrics || {}
  const mobileMetrics = visualAudit?.mobile?.metrics || {}

  const avgParagraphLength =
    visualSummary.avg_text_block_length || crawlerStats.avg_paragraph_length || 0
  const maxTextBlockLength =
    visualSummary.max_text_block_length || crawlerStats.max_text_block_length || 0

  const desktopTextDensity =
    visualSummary.desktop_text_density ?? desktopMetrics.text_density ?? 0
  const mobileTextDensity =
    visualSummary.mobile_text_density ?? mobileMetrics.text_density ?? 0

  const ctaAboveFold = Boolean(
    visualSummary.cta_above_fold ??
      desktopMetrics.cta_above_fold ??
      mobileMetrics.cta_above_fold ??
      false,
  )

  const navAboveFold = Boolean(
    visualSummary.nav_above_fold ??
      desktopMetrics.nav_above_fold ??
      mobileMetrics.nav_above_fold ??
      crawlerSignals.navCount >= 2,
  )

  const desktopOverflow = Boolean(
    visualSummary.horizontal_overflow_desktop ?? desktopMetrics.horizontal_overflow ?? false,
  )
  const mobileOverflow = Boolean(
    visualSummary.horizontal_overflow_mobile ?? mobileMetrics.horizontal_overflow ?? false,
  )

  const imageCount = Math.max(
    visualSummary.image_count || 0,
    desktopMetrics.image_count || 0,
    mobileMetrics.image_count || 0,
    crawlerSignals.imageCount,
  )

  const h1AboveFold = (desktopMetrics.headings || []).some(
    (heading) => heading.tag === 'h1' && heading.above_fold,
  )

  const headingLevels = new Set(
    [...(desktopMetrics.headings || []), ...(mobileMetrics.headings || [])].map((h) => h.tag),
  ).size

  const contrast = visualAudit?.desktop?.contrast || visualAudit?.mobile?.contrast || null

  const readability_score = scoreReadability({ avgParagraphLength, maxTextBlockLength })
  const cta_visibility_score = scoreCtaVisibility({
    ctaAboveFold,
    ctaCount: Math.max(
      crawlerSignals.ctaCount,
      (desktopMetrics.cta_elements || []).length,
      (mobileMetrics.cta_elements || []).length,
    ),
  })
  const nav_visibility_score = scoreNavVisibility({
    navAboveFold,
    navCount: Math.max(crawlerSignals.navCount, (desktopMetrics.nav_elements || []).length),
  })
  const visual_hierarchy_score = scoreVisualHierarchy({
    hasH1: crawlerSignals.hasH1 || (desktopMetrics.headings || []).some((h) => h.tag === 'h1'),
    h1AboveFold,
    headingLevels,
  })
  const mobile_usability_score = scoreMobileUsability({
    hasMobileViewport: crawlerSignals.hasMobileViewport,
    mobileOverflow,
    mobileTextDensity,
    desktopTextDensity,
  })
  const image_support_score = scoreImageSupport(imageCount)
  const layout_overflow_score = scoreLayoutOverflow({ desktopOverflow, mobileOverflow })
  const contrast_score = scoreContrast(contrast)
  const desktop_text_density_score = scoreTextDensity(desktopTextDensity)
  const mobile_text_density_score = scoreTextDensity(mobileTextDensity)

  const overall_static_ux_score = clampScore(
    readability_score * 0.16 +
      cta_visibility_score * 0.14 +
      nav_visibility_score * 0.1 +
      visual_hierarchy_score * 0.12 +
      mobile_usability_score * 0.16 +
      image_support_score * 0.08 +
      layout_overflow_score * 0.12 +
      contrast_score * 0.06 +
      desktop_text_density_score * 0.03 +
      mobile_text_density_score * 0.03,
  )

  return {
    source: visualAudit?.ok ? 'visual_audit+crawler' : 'crawler_static',
    desktop_text_density: Number(desktopTextDensity.toFixed(6)),
    mobile_text_density: Number(mobileTextDensity.toFixed(6)),
    desktop_text_density_score,
    mobile_text_density_score,
    avg_paragraph_length: avgParagraphLength,
    average_paragraph_length: avgParagraphLength,
    max_text_block_length: maxTextBlockLength,
    cta_above_fold: ctaAboveFold,
    cta_visibility_score,
    nav_visibility_score,
    navbar_visibility_score: nav_visibility_score,
    visual_hierarchy_score,
    readability_score,
    mobile_usability_score,
    image_support_score,
    layout_overflow_score,
    contrast_score,
    ui_score: overall_static_ux_score,
    overall_static_ux_score,
    signals: {
      has_mobile_viewport: crawlerSignals.hasMobileViewport,
      horizontal_overflow_desktop: desktopOverflow,
      horizontal_overflow_mobile: mobileOverflow,
      image_count: imageCount,
      nav_above_fold: navAboveFold,
      cta_count: crawlerSignals.ctaCount,
    },
  }
}

function buildUxFeatureExplanations(features) {
  const explanations = []
  if (!features) return explanations

  if (features.max_text_block_length > READABILITY_BLOCK_SOFT) {
    explanations.push('Large text blocks reduce readability.')
  }
  if (features.avg_paragraph_length > DENSE_PARAGRAPH_THRESHOLD) {
    explanations.push('Paragraphs are dense and may be hard to scan.')
  }
  if (!features.cta_above_fold) {
    explanations.push('CTA is not visible above the fold.')
  }
  if (features.signals?.nav_above_fold) {
    explanations.push('Navigation is visible.')
  }
  if (features.image_support_score >= 55) {
    explanations.push('Images support service proof.')
  }
  if (features.signals?.horizontal_overflow_mobile) {
    explanations.push('Mobile layout has horizontal overflow.')
  }
  if (!features.signals?.has_mobile_viewport) {
    explanations.push('No mobile viewport meta tag detected.')
  }

  return explanations
}

module.exports = {
  extractUxFeatures,
  buildUxFeatureExplanations,
  crawlerParagraphStats,
  scoreReadability,
  scoreCtaVisibility,
  scoreMobileUsability,
  scoreLayoutOverflow,
  READABILITY_BLOCK_SOFT,
  DENSE_PARAGRAPH_THRESHOLD,
  CTA_PATTERN,
}
