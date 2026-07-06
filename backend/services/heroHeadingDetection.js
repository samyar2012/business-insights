function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function mergeHeroHeadingSignals({
  visualAudit = null,
  pages = [],
  desktopMetrics = {},
  mobileMetrics = {},
} = {}) {
  const headings = [...(desktopMetrics.headings || []), ...(mobileMetrics.headings || [])]
  const h1 = headings.find((h) => h.tag === 'h1')
  const h1Text = h1?.text || ''
  const h1AboveFold = headings.some((h) => h.tag === 'h1' && h.above_fold)

  const auditHero = desktopMetrics.hero_heading || mobileMetrics.hero_heading || visualAudit?.summary?.hero_heading || null

  let heroHeadingText = auditHero?.text || h1Text || ''
  let heroHeadingSource = 'fallback'
  let heroHeadingConfidence = 25
  let heroHeadingAboveFold = Boolean(h1AboveFold)

  if (h1Text && h1AboveFold) {
    heroHeadingText = h1Text
    heroHeadingSource = 'h1'
    heroHeadingConfidence = 92
    heroHeadingAboveFold = true
  } else if (auditHero?.text) {
    heroHeadingText = auditHero.text
    heroHeadingSource = auditHero.source || 'visual_largest_text'
    heroHeadingConfidence = auditHero.confidence || 75
    heroHeadingAboveFold = Boolean(auditHero.above_fold)
  } else if (h1Text) {
    heroHeadingText = h1Text
    heroHeadingSource = 'h1'
    heroHeadingConfidence = 65
    heroHeadingAboveFold = Boolean(h1AboveFold)
  } else {
    for (const page of pages) {
      let data = page?.extracted_data_json || {}
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data)
        } catch {
          data = {}
        }
      }
      const crawlerH1 = (data.headings?.h1 || [])[0] || page?.title || ''
      if (crawlerH1) {
        heroHeadingText = crawlerH1
        heroHeadingSource = 'crawler_h1'
        heroHeadingConfidence = 50
        break
      }
    }
  }

  const hasH1 = Boolean(h1Text || headings.some((h) => h.tag === 'h1'))
  const hasHeroHeading = Boolean(
    heroHeadingText && heroHeadingText.length >= 8 && (heroHeadingAboveFold || heroHeadingConfidence >= 60),
  )
  const weakHero = !hasHeroHeading || heroHeadingText.length < 8

  const issues = []
  const strengths = []

  if (hasHeroHeading && heroHeadingAboveFold) {
    strengths.push(`Hero heading detected above the fold: "${heroHeadingText.slice(0, 80)}".`)
  }
  if (hasHeroHeading && !hasH1) {
    issues.push(
      'Hero heading is visually clear, but semantic H1 markup may be missing (SEO/accessibility improvement).',
    )
  }
  if (weakHero && !hasH1) {
    issues.push('No clear H1 or hero heading was detected above the fold.')
  } else if (weakHero && hasH1 && !h1AboveFold) {
    issues.push('H1 exists but may not be visible above the fold.')
  }

  return {
    has_h1: hasH1,
    has_hero_heading: hasHeroHeading,
    hero_heading_text: heroHeadingText || null,
    hero_heading_source: heroHeadingSource,
    hero_heading_confidence: clamp(heroHeadingConfidence, 0, 100),
    h1_above_fold: h1AboveFold,
    hero_heading_above_fold: heroHeadingAboveFold,
    hero_issues: issues,
    hero_strengths: strengths,
    semantic_h1_missing: hasHeroHeading && !hasH1,
  }
}

module.exports = {
  mergeHeroHeadingSignals,
}
