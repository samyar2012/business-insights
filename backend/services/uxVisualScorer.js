const {
  resolveCanonicalBusinessModel,
  ECOMMERCE_MODELS,
  SERVICE_MODELS,
  CONTENT_MODELS,
  GALLERY_SERVICE_MODELS,
  isListingModel,
} = require('./businessModelConfig')
const { mergeHeroHeadingSignals } = require('./heroHeadingDetection')

const COMPONENT_WEIGHTS = {
  navbar_score: 0.1,
  hero_score: 0.15,
  readability_score: 0.15,
  visual_hierarchy_score: 0.15,
  image_quality_score: 0.1,
  layout_balance_score: 0.15,
  conversion_path_score: 0.12,
  trust_visual_score: 0.08,
}

const GENERIC_CTA_PATTERN = /^learn more$|^read more$|^click here$|^more$/i
const SPAM_CTA_THRESHOLD = 5

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function missingDefault(confidence) {
  return confidence >= 70 ? 48 : confidence >= 45 ? 38 : 28
}

const PRIMARY_NAV_OVERCROWD_THRESHOLD = 6

function scoreNavbar(ctx) {
  const {
    primaryNavLinkCount,
    navLinkCount,
    navAboveFold,
    hasStructuredHeader,
    mobileNavOverflow,
    phoneInBannerOnly,
    brandInHeader,
    visualVerified,
  } = ctx
  const topLevelCount =
    primaryNavLinkCount > 0
      ? primaryNavLinkCount
      : Math.min(navLinkCount, PRIMARY_NAV_OVERCROWD_THRESHOLD)
  let score = visualVerified ? 42 : 32
  const notes = []
  const problems = []
  const strengths = []

  if (topLevelCount === 0) {
    score = 22
    problems.push('No navigation links were detected in the header area.')
  } else if (topLevelCount === 1) {
    score = 38
    notes.push('Navigation exists but only 1 useful link was visible.')
  } else if (topLevelCount >= 2 && topLevelCount <= PRIMARY_NAV_OVERCROWD_THRESHOLD) {
    score += 22
    strengths.push(`${topLevelCount} top-level navigation links are visible in the header.`)
  } else if (topLevelCount > PRIMARY_NAV_OVERCROWD_THRESHOLD) {
    score += 10
    problems.push(`Top navigation has ${topLevelCount} primary links — it may feel overcrowded.`)
    score -= 8
  }

  if (navAboveFold) score += 12
  else notes.push('Navigation is not clearly visible above the fold.')

  if (hasStructuredHeader) score += 8
  if (brandInHeader) score += 6

  if (phoneInBannerOnly) {
    score -= 14
    problems.push('Phone/banner CTA appears to replace real navigation.')
  }

  if (mobileNavOverflow) {
    score -= 12
    problems.push('Mobile navigation area shows layout overflow.')
  }

  return { score: clamp(score), notes: [...notes, ...strengths, ...problems], strengths, problems }
}

function scoreHero(ctx) {
  const {
    heroHeading,
    heroImagePresent,
    primaryCtaAboveFold,
    ctaSpamCount,
    maxAboveFoldBlock,
    aboveFoldTextLength,
  } = ctx
  let score = 42
  const notes = []
  const strengths = []
  const problems = []

  const hasHero = Boolean(heroHeading?.has_hero_heading)
  const hasH1 = Boolean(heroHeading?.has_h1)
  const heroAboveFold = Boolean(heroHeading?.hero_heading_above_fold)
  const heroText = heroHeading?.hero_heading_text || ''
  const semanticH1Missing = Boolean(heroHeading?.semantic_h1_missing)

  if (hasHero && heroAboveFold) {
    score += 28
    strengths.push(`Hero heading is clear above the fold: "${heroText.slice(0, 72)}".`)
  } else if (hasHero) {
    score += 16
    strengths.push(`Hero heading detected: "${heroText.slice(0, 72)}".`)
  } else if (hasH1) {
    score += 12
    notes.push('H1 exists but may not read as a strong hero headline above the fold.')
  } else {
    score -= 18
    problems.push('No clear H1 or hero heading was detected above the fold.')
  }

  if (semanticH1Missing) {
    score -= 4
    problems.push('Hero heading is visually clear, but semantic H1 markup may be missing.')
  }

  if (heroText.length >= 20 && heroText.length <= 90) score += 8
  else if (heroText.length > 150) {
    score -= 10
    problems.push(`Hero heading is very long (${heroText.length} characters).`)
  }

  if (heroImagePresent) {
    score += 10
    strengths.push('Hero area includes a relevant visual (image/background).')
  }

  if (primaryCtaAboveFold) {
    score += 10
    strengths.push('Primary CTA is visible above the fold.')
  }

  if (ctaSpamCount >= SPAM_CTA_THRESHOLD) {
    score -= 16
    problems.push(`${ctaSpamCount} CTA-like elements above the fold feel spammy.`)
  } else if (ctaSpamCount >= 4) {
    score -= 6
    problems.push('Multiple competing CTAs above the fold may confuse visitors.')
  }

  if (maxAboveFoldBlock > 520) {
    score -= 12
    problems.push(`Hero text is dense: largest above-fold block is ${maxAboveFoldBlock} characters.`)
  } else if (aboveFoldTextLength > 0 && aboveFoldTextLength < 600) {
    score += 4
  }

  return { score: clamp(score), notes: [...notes, ...strengths, ...problems], strengths, problems }
}

function readabilityTolerance(businessModel) {
  const model = resolveCanonicalBusinessModel(businessModel) || businessModel
  if (model === 'blog' || model === 'content_business') {
    return { maxBlock: 1400, maxAvg: 420, densitySoft: 0.0032, densityHard: 0.0045 }
  }
  if (ECOMMERCE_MODELS.has(model)) {
    return { maxBlock: 700, maxAvg: 280, densitySoft: 0.0022, densityHard: 0.0032 }
  }
  if (SERVICE_MODELS.has(model) || GALLERY_SERVICE_MODELS.has(model)) {
    return { maxBlock: 950, maxAvg: 340, densitySoft: 0.0026, densityHard: 0.0036 }
  }
  if (model === 'listing') {
    return { maxBlock: 1100, maxAvg: 380, densitySoft: 0.003, densityHard: 0.0042 }
  }
  return { maxBlock: 900, maxAvg: 320, densitySoft: 0.0028, densityHard: 0.0038 }
}

function scoreReadability(ctx) {
  const {
    businessModel,
    avgParagraphLength,
    maxTextBlockLength,
    textDensity,
    mobileTextDensity,
    headingCount,
    h2Count,
    sectionCount,
    bulletCount,
    headingToBodyRatio,
    contrastScore,
    fontSizeStats,
    visualVerified,
  } = ctx
  const tolerance = readabilityTolerance(businessModel)
  let score = visualVerified ? 74 : 60
  const notes = []
  const strengths = []
  const problems = []
  const factors = {
    average_paragraph_length: avgParagraphLength,
    max_text_block_length: maxTextBlockLength,
    text_density_above_fold: textDensity,
    mobile_text_density: mobileTextDensity,
    heading_count: headingCount,
    h2_count: h2Count,
    section_count: sectionCount,
    paragraph_count: ctx.paragraphCount || 0,
    heading_to_body_ratio: headingToBodyRatio,
    contrast_score: contrastScore,
    bullet_count: bulletCount,
    font_size_stats: fontSizeStats || null,
    structured_sections: sectionCount >= 3,
    uses_bullets: bulletCount >= 4,
  }

  const structureScore =
    (sectionCount >= 4 ? 12 : sectionCount >= 2 ? 6 : 0) +
    (h2Count >= 2 ? 10 : h2Count === 1 ? 4 : 0) +
    (bulletCount >= 4 ? 8 : bulletCount >= 2 ? 4 : 0) +
    (headingCount >= 3 ? 6 : 0)
  score += structureScore

  if (structureScore >= 18) {
    strengths.push('Long copy is broken into sections, headings, or bullets.')
  }

  const wellStructured =
    sectionCount >= 2 || h2Count >= 2 || bulletCount >= 4 || (headingCount >= 2 && sectionCount >= 1)

  if (maxTextBlockLength > tolerance.maxBlock && !wellStructured) {
    score -= 22
    problems.push(`Largest text block is ${maxTextBlockLength} characters and lacks section breaks.`)
  } else if (maxTextBlockLength > tolerance.maxBlock && wellStructured) {
    score -= 4
    factors.scan_density_note = 'Long copy is readable but dense — extra headings could help scanning.'
  } else if (maxTextBlockLength > tolerance.maxBlock * 0.65 && !wellStructured) {
    score -= 8
    problems.push(`Large text block (${maxTextBlockLength} characters) is harder to scan without more headings.`)
  } else if (maxTextBlockLength > 0 && maxTextBlockLength <= tolerance.maxAvg) {
    score += 6
    strengths.push('Text blocks stay reasonably easy to read.')
  }

  if (avgParagraphLength > tolerance.maxAvg) {
    score -= 14
    problems.push(`Average paragraph length (${avgParagraphLength} characters) makes reading tiring.`)
  } else if (avgParagraphLength > 0 && avgParagraphLength <= tolerance.maxAvg * 0.7) {
    score += 6
    strengths.push('Paragraph length supports comfortable reading.')
  }

  if (textDensity > tolerance.densityHard) {
    score -= 16
    problems.push('Above-fold text density is high on desktop.')
  } else if (textDensity > tolerance.densitySoft) {
    score -= 6
  }

  if (mobileTextDensity > tolerance.densityHard) {
    score -= 12
    problems.push('Mobile text density above the fold is high.')
  }

  if (headingCount === 0 && sectionCount < 2 && maxTextBlockLength > 500 && avgParagraphLength > tolerance.maxAvg * 0.8) {
    score -= 12
    problems.push('Long text lacks headings or section breaks, which hurts both reading and scanning.')
  }

  if (contrastScore < 55) {
    score -= 10
    problems.push('Low contrast makes body text harder to read.')
  } else if (contrastScore >= 75) {
    score += 6
    strengths.push('Text contrast supports readable copy.')
  }

  if (fontSizeStats?.median && fontSizeStats.median < 14) {
    score -= 8
    problems.push('Body font sizes appear small for comfortable reading.')
  }

  const confidence = visualVerified ? 82 : 48
  return {
    score: clamp(score),
    notes: [...strengths, ...problems],
    strengths,
    problems,
    factors,
    confidence,
  }
}

function scoreVisualHierarchy(ctx) {
  const { heroHeading, h2Count, sectionCount, headingLevels } = ctx
  let score = 38
  const notes = []

  const hasHero = Boolean(heroHeading?.has_hero_heading)
  const hasH1 = Boolean(heroHeading?.has_h1)
  const heroAboveFold = Boolean(heroHeading?.hero_heading_above_fold)

  if (hasHero || hasH1) score += 22
  else notes.push('Missing clear hero heading — page purpose is harder to grasp.')

  if (heroAboveFold) score += 14
  if (h2Count >= 2) {
    score += 14
    notes.push('Section headings (H2) create a clear content structure.')
  } else if (h2Count === 1) {
    score += 6
  }

  if (sectionCount >= 4) score += 12
  else if (sectionCount >= 2) score += 6
  else if (sectionCount === 0) score -= 6

  if (headingLevels >= 3) score += 8

  if (heroHeading?.semantic_h1_missing) {
    score -= 3
    notes.push('Visual hierarchy is clear, but semantic H1 markup may be missing.')
  }

  return { score: clamp(score), notes }
}

function scoreImageQuality(ctx) {
  const {
    businessModel,
    imageCount,
    aboveFoldImageCount,
    heroImagePresent,
    imagesWithAlt,
    layoutFittedImageCount,
    misalignedImageCount,
    portfolioSignals,
  } = ctx
  const model = resolveCanonicalBusinessModel(businessModel) || businessModel
  let score = 40
  const notes = []
  const strengths = []
  const problems = []
  const isService = SERVICE_MODELS.has(model)
  const isGallery = GALLERY_SERVICE_MODELS.has(model)
  const isEcommerce = ECOMMERCE_MODELS.has(model)
  const isContent = CONTENT_MODELS.has(model)

  if (imageCount === 0) {
    score = isContent ? 28 : isService ? 35 : 22
    problems.push('Very few images detected — page may feel text-only.')
  } else if (imageCount >= 3) {
    score += 12
    strengths.push(`${imageCount} images support the visual presentation.`)
  }

  if (aboveFoldImageCount >= 2) score += 10
  if (heroImagePresent) score += 8

  if (layoutFittedImageCount >= 2) {
    score += 12
    strengths.push(`${layoutFittedImageCount} images fit the page layout cleanly.`)
  } else if (imageCount >= 3 && layoutFittedImageCount === 0) {
    score -= 8
    problems.push('Images are present but few appear well-fitted to the layout.')
  }

  if (misalignedImageCount >= 3) {
    score -= 12
    problems.push(`${misalignedImageCount} images look misaligned or poorly sized for their containers.`)
  } else if (misalignedImageCount === 1 || misalignedImageCount === 2) {
    score -= 4
  }

  if (imagesWithAlt >= 2) score += 6

  if ((isService || isGallery) && (portfolioSignals || layoutFittedImageCount >= 3)) {
    score += 10
    strengths.push('Images support service proof (portfolio/project style).')
  }

  if (isEcommerce && imageCount < 2) {
    score -= 12
    problems.push('Ecommerce pages need product imagery to build buyer confidence.')
  }

  if (isContent && imageCount < 2) {
    score -= 6
    problems.push('Content businesses benefit from thumbnails or media blocks.')
  }

  return { score: clamp(score), notes: [...strengths, ...problems, ...notes], strengths, problems }
}

function scoreLayoutBalance(ctx) {
  const {
    desktopOverflow,
    mobileOverflow,
    mobileOverflowSeverity,
    desktopOverflowSeverity,
    textDensity,
    sectionCount,
    ctaSpamCount,
    heroImagePresent,
    avgParagraphLength,
    aboveFoldElementCount,
  } = ctx
  let score = 72
  const notes = []
  const strengths = []
  const problems = []
  const evidence = []

  if (mobileOverflowSeverity === 'major' || mobileOverflow) {
    score -= 30
    problems.push('Mobile layout overflow detected: content width exceeds viewport.')
    evidence.push({ type: 'overflow', viewport: 'mobile', severity: mobileOverflowSeverity || 'major' })
  } else if (mobileOverflowSeverity === 'minor') {
    score -= 10
    problems.push('Minor mobile horizontal overflow detected.')
    evidence.push({ type: 'overflow', viewport: 'mobile', severity: 'minor' })
  }

  if (desktopOverflowSeverity === 'major' || desktopOverflow) {
    score -= 16
    problems.push('Desktop layout overflow detected.')
    evidence.push({ type: 'overflow', viewport: 'desktop', severity: desktopOverflowSeverity || 'major' })
  } else if (desktopOverflowSeverity === 'minor') {
    score -= 5
  }

  if (ctaSpamCount >= 5) {
    score -= 14
    problems.push('Too many competing CTAs crowd the above-fold layout.')
    evidence.push({ type: 'cta_crowding', count: ctaSpamCount })
  }

  if (textDensity > 0.0035 && sectionCount < 2) {
    score -= 12
    problems.push('Above-fold area feels crowded without clear section separation.')
  }

  if (sectionCount >= 3) {
    score += 14
    strengths.push('Clear sections organize the page layout.')
    evidence.push({ type: 'sections', count: sectionCount })
  } else if (sectionCount >= 2) {
    score += 8
    strengths.push('Page content is grouped into distinct sections.')
  }

  if (heroImagePresent && sectionCount >= 2) {
    score += 6
    strengths.push('Balanced image and text composition in the layout.')
  }

  if (avgParagraphLength > 0 && avgParagraphLength < 280 && sectionCount >= 2) {
    score += 6
    strengths.push('Spacing and block length keep the layout readable.')
  }

  if (aboveFoldElementCount >= 8 && aboveFoldElementCount <= 28) {
    score += 4
    strengths.push('Above-fold structure looks organized without feeling empty.')
  }

  return { score: clamp(score), notes: [...strengths, ...problems], strengths, problems, evidence }
}

function scoreConversionPath(ctx) {
  const {
    businessModel,
    ctaElements,
    phoneVisible,
    hasContactPage,
    hasBookingCta,
    hasQuoteCta,
    hasAddToCart,
    ctaSpamCount,
    genericCtaOnly,
    primaryCtaAboveFold,
  } = ctx
  let score = 34
  const notes = []
  const model = resolveCanonicalBusinessModel(businessModel) || businessModel
  const isService = SERVICE_MODELS.has(model)
  const isGallery = GALLERY_SERVICE_MODELS.has(model)
  const isEcommerce = ECOMMERCE_MODELS.has(model)
  const isListing = isListingModel(model)
  const isContent = CONTENT_MODELS.has(model)

  const strongCtas = (ctaElements || []).filter((c) => c.quality === 'strong')
  const mediumCtas = (ctaElements || []).filter((c) => c.quality === 'medium')

  if (strongCtas.length >= 1) {
    score += 22
    notes.push(`Strong CTA detected: "${strongCtas[0].text.slice(0, 50)}".`)
  } else if (mediumCtas.length >= 1) {
    score += 12
    notes.push(`CTA present: "${mediumCtas[0].text.slice(0, 50)}".`)
  }

  if ((isService || isGallery) && phoneVisible && (hasBookingCta || hasQuoteCta || hasContactPage)) {
    score += 16
    notes.push('Phone or inquiry path is visible for this service business.')
  } else if ((isService || isGallery) && phoneVisible) {
    score += 10
    notes.push('Phone number is visible — valid contact CTA for services.')
  } else if (isService && !phoneVisible && !hasBookingCta && !hasQuoteCta) {
    score -= 8
    notes.push('Service site lacks a visible phone or booking path.')
  }

  if (isGallery && (hasQuoteCta || hasContactPage || strongCtas.some((c) => /consult|inquiry|quote|contact/i.test(c.text)))) {
    score += 14
    notes.push('Gallery/service site has a clear inquiry or consultation path.')
  }

  if (isEcommerce && hasAddToCart) {
    score += 18
    notes.push('Purchase path (add to cart / shop) is visible.')
  } else if (isEcommerce && !hasAddToCart) {
    score -= 6
  }

  if (isListing && (phoneVisible || strongCtas.length > 0 || hasContactPage)) {
    score += 12
    notes.push('Listing includes contact or buy path within marketplace constraints.')
  }

  if (isContent && (strongCtas.length > 0 || phoneVisible)) {
    score += 8
    notes.push('Audience-building CTA or follow path detected.')
  }

  if (primaryCtaAboveFold) score += 6

  if (genericCtaOnly) {
    score -= 10
    notes.push('Only generic CTAs like "Learn more" were detected — weak conversion guidance.')
  }

  if (ctaSpamCount >= SPAM_CTA_THRESHOLD) {
    score -= 16
    notes.push('Repeated CTA buttons reduce clarity instead of helping conversion.')
  }

  if (
    !isListing &&
    !phoneVisible &&
    strongCtas.length === 0 &&
    mediumCtas.length === 0 &&
    !hasAddToCart &&
    !(isGallery && hasContactPage)
  ) {
    score = Math.min(score, 38)
    notes.push('No clear contact, booking, or purchase path was found.')
  }

  return { score: clamp(score), notes }
}

function scoreTrustVisual(ctx) {
  const { reviewIndicators, contactVisible, policySignals, socialCount, contrastScore, hasStructuredHeader, outdatedSignals } = ctx
  let score = 42
  const notes = []

  if (reviewIndicators) {
    score += 18
    notes.push('Reviews or testimonial proof is visible.')
  }
  if (contactVisible) score += 12
  if (policySignals >= 1) score += 8
  if (socialCount >= 1) score += 6
  if (contrastScore >= 75) score += 10
  else if (contrastScore < 55) {
    score -= 10
    notes.push('Low text contrast makes the design feel less trustworthy.')
  }
  if (hasStructuredHeader) score += 6
  if (outdatedSignals) {
    score -= 12
    notes.push('Layout signals suggest an outdated or unpolished design.')
  }

  return { score: clamp(score), notes }
}

function scoreMotionPolish(ctx) {
  const { animationDetected, disruptiveMotion } = ctx
  if (!animationDetected) {
    return { score: 55, notes: ['Motion not reliably detected — neutral score applied.'], confidence: 25 }
  }
  let score = 70
  const notes = []
  if (disruptiveMotion) {
    score = 35
    notes.push('Disruptive or layout-breaking animation detected.')
  } else {
    score = 78
    notes.push('Animations appear non-disruptive.')
  }
  return { score: clamp(score), notes, confidence: 60 }
}

function classifyCtaQuality(text, businessModel) {
  const raw = String(text || '').trim()
  if (!raw || raw.length < 2) return 'none'
  const model = resolveCanonicalBusinessModel(businessModel) || businessModel
  if (GENERIC_CTA_PATTERN.test(raw)) return 'generic'
  if (GALLERY_SERVICE_MODELS.has(model) && /consult|inquiry|quote|contact|book|call/i.test(raw)) return 'strong'
  if (SERVICE_MODELS.has(model) && /book|quote|schedule|call|contact|consult/i.test(raw)) return 'strong'
  if (ECOMMERCE_MODELS.has(model) && /shop|buy|cart|checkout|order/i.test(raw)) return 'strong'
  if (isListingModel(model) && /contact|buy|message|call|shop/i.test(raw)) return 'strong'
  if (/book|quote|schedule|call|contact|shop|buy|cart|get started|free estimate/i.test(raw)) return 'strong'
  if (/learn more|read more|details|view/i.test(raw)) return 'medium'
  return 'medium'
}

function buildVisualUxScore(input = {}) {
  const {
    businessModel: rawBusinessModel = 'ecommerce_store',
    visualAuditOk = false,
    visualAuditFailed = false,
    desktop = {},
    mobile = {},
    summary = {},
    crawler = {},
    aggregated = {},
    signals = {},
    pages = [],
    visualAudit = null,
  } = input

  const businessModel = resolveCanonicalBusinessModel(rawBusinessModel) || rawBusinessModel

  const confidence = {
    visual_audit: visualAuditOk ? 92 : visualAuditFailed ? 20 : 38,
    desktop_metrics: visualAuditOk && desktop.metrics ? 90 : 0,
    mobile_metrics: visualAuditOk && mobile.metrics ? 88 : 0,
    crawler_fallback: !visualAuditOk ? 55 : 25,
  }
  const avgConfidence = visualAuditOk
    ? Math.round((confidence.visual_audit + confidence.desktop_metrics + confidence.mobile_metrics) / 3)
    : Math.round((confidence.crawler_fallback + confidence.visual_audit) / 2)

  const dm = desktop.metrics || {}
  const mm = mobile.metrics || {}
  const headings = [...(dm.headings || []), ...(mm.headings || [])]
  const h1 = headings.find((h) => h.tag === 'h1')
  const h1AboveFold = headings.some((h) => h.tag === 'h1' && h.above_fold)
  const h1Text = h1?.text || crawler.h1Text || ''
  const h2Count = headings.filter((h) => h.tag === 'h2').length
  const headingLevels = new Set(headings.map((h) => h.tag)).size

  const heroHeading = mergeHeroHeadingSignals({
    visualAudit,
    pages,
    desktopMetrics: dm,
    mobileMetrics: mm,
  })

  const navLinkCount = Math.max(
    summary.nav_link_count || 0,
    dm.nav_link_count || 0,
    mm.nav_link_count || 0,
    crawler.navCount || 0,
  )
  const primaryNavLinkCount = Math.max(
    summary.primary_nav_link_count || 0,
    dm.primary_nav_link_count || 0,
    mm.primary_nav_link_count || 0,
    crawler.primaryNavCount || 0,
  )
  const navAboveFold = Boolean(summary.nav_above_fold || dm.nav_above_fold || mm.nav_above_fold || crawler.navAboveFold)
  const hasStructuredHeader = Boolean(
    summary.has_structured_header || dm.has_structured_header || mm.has_structured_header,
  )

  const ctaRaw = [...(dm.cta_elements || []), ...(mm.cta_elements || [])]
  const ctaAboveFold = ctaRaw.filter((c) => c.above_fold)
  const ctaSpamCount = ctaAboveFold.length
  const ctaElements = ctaRaw.map((c) => ({
    text: c.text || '',
    above_fold: Boolean(c.above_fold),
    quality: classifyCtaQuality(c.text, businessModel),
  }))

  const phoneVisible = Boolean(
    signals.has_phone ||
      aggregated.contact_signals?.phones?.length ||
      /call|phone|\(\d{3}\)/i.test(ctaRaw.map((c) => c.text).join(' ')),
  )
  const phoneInBannerOnly = phoneVisible && primaryNavLinkCount < 2 && navAboveFold

  const avgParagraphLength = summary.avg_text_block_length || crawler.avgParagraphLength || 0
  const maxTextBlockLength = Math.max(
    summary.max_text_block_length || 0,
    dm.max_text_block_length || 0,
    mm.max_text_block_length || 0,
    crawler.maxTextBlockLength || 0,
  )
  const textDensity = Math.max(summary.desktop_text_density || 0, dm.text_density || 0)
  const mobileTextDensity = Math.max(summary.mobile_text_density || 0, mm.mobile_text_density || 0, mm.text_density || 0)
  const aboveFoldTextLength = dm.above_fold_text_length || mm.above_fold_text_length || crawler.aboveFoldTextLength || 0
  const maxAboveFoldBlock = dm.max_above_fold_text_block || mm.max_above_fold_text_block || maxTextBlockLength

  const sectionCount = Math.max(dm.section_count || 0, mm.section_count || 0, crawler.sectionCount || 0)
  const imageCount = Math.max(summary.image_count || 0, dm.image_count || 0, crawler.imageCount || 0)
  const aboveFoldImageCount = Math.max(summary.above_fold_image_count || 0, dm.above_fold_image_count || 0)
  const heroImagePresent = Boolean(summary.hero_image_present || dm.hero_image_present)
  const layoutFittedImageCount = Math.max(
    dm.layout_fitted_image_count || 0,
    mm.layout_fitted_image_count || 0,
    (dm.layout_images || mm.layout_images || []).length,
  )
  const misalignedImageCount = Math.max(dm.misaligned_image_count || 0, mm.misaligned_image_count || 0)
  const imagesWithAlt = dm.images_with_alt_count || mm.images_with_alt_count || 0
  const bulletCount = Math.max(dm.bullet_count || 0, mm.bullet_count || 0)
  const headingToBodyRatio = dm.heading_to_body_ratio || mm.heading_to_body_ratio || 0
  const fontSizeStats = dm.font_size_stats || mm.font_size_stats || null
  const aboveFoldElementCount = (dm.above_fold_elements || mm.above_fold_elements || []).length
  const paragraphCount = (dm.text_block_lengths || mm.text_block_lengths || []).length || crawler.blockCount || 0

  const contrast = desktop.contrast || mobile.contrast || null
  const contrastScore = contrast?.median_ratio >= 4.5 ? 88 : contrast?.median_ratio >= 3.5 ? 74 : contrast ? 52 : missingDefault(avgConfidence)

  const ctx = {
    businessModel,
    visualVerified: visualAuditOk,
    navLinkCount,
    primaryNavLinkCount,
    navAboveFold,
    hasStructuredHeader,
    mobileNavOverflow: Boolean(mm.horizontal_overflow && mm.overflow_severity !== 'none'),
    phoneInBannerOnly,
    brandInHeader: Boolean(heroHeading.hero_heading_text || h1Text || hasStructuredHeader),
    heroHeading,
    h1AboveFold,
    h1Text,
    aboveFoldTextLength,
    heroImagePresent,
    primaryCtaAboveFold: Boolean(summary.cta_above_fold || ctaAboveFold.some((c) => c.quality !== 'generic')),
    ctaSpamCount,
    maxAboveFoldBlock,
    avgParagraphLength,
    maxTextBlockLength,
    textDensity,
    mobileTextDensity,
    headingCount: headings.length,
    h2Count,
    sectionCount,
    headingLevels,
    bulletCount,
    headingToBodyRatio,
    fontSizeStats,
    paragraphCount,
    aboveFoldElementCount,
    imageCount,
    aboveFoldImageCount,
    imagesWithAlt,
    layoutFittedImageCount,
    misalignedImageCount,
    portfolioSignals: signals.has_gallery || /portfolio|gallery|project/i.test(String(crawler.pageText || '')),
    desktopOverflow: Boolean(summary.horizontal_overflow_desktop || dm.horizontal_overflow),
    mobileOverflow: Boolean(summary.horizontal_overflow_mobile || mm.horizontal_overflow),
    mobileOverflowSeverity: summary.overflow_severity_mobile || mm.overflow_severity || 'none',
    desktopOverflowSeverity: summary.overflow_severity_desktop || dm.overflow_severity || 'none',
    ctaElements,
    phoneVisible,
    hasContactPage: signals.has_contact_page,
    hasBookingCta: signals.has_booking_cta,
    hasQuoteCta: signals.has_quote_cta,
    hasAddToCart: signals.has_add_to_cart,
    genericCtaOnly: ctaElements.length > 0 && ctaElements.every((c) => c.quality === 'generic'),
    reviewIndicators: aggregated.trust_signals?.review_indicators,
    contactVisible: phoneVisible || (aggregated.contact_signals?.emails || []).length > 0,
    policySignals: Object.values(aggregated.policy_signals || {}).filter(Boolean).length,
    socialCount: (aggregated.social_channels || []).length,
    contrastScore,
    outdatedSignals: !hasStructuredHeader && navLinkCount < 2 && !heroImagePresent && avgParagraphLength > 300,
  }

  const components = {
    navbar_score: scoreNavbar(ctx),
    hero_score: scoreHero(ctx),
    readability_score: scoreReadability(ctx),
    visual_hierarchy_score: scoreVisualHierarchy(ctx),
    image_quality_score: scoreImageQuality(ctx),
    layout_balance_score: scoreLayoutBalance(ctx),
    conversion_path_score: scoreConversionPath(ctx),
    trust_visual_score: scoreTrustVisual(ctx),
  }

  let visualScore = 0
  for (const [key, weight] of Object.entries(COMPONENT_WEIGHTS)) {
    visualScore += (components[key]?.score ?? missingDefault(avgConfidence)) * weight
  }
  visualScore = clamp(visualScore)

  const componentScores = {}
  const componentNotes = {}
  const uxComponentExplanations = {}
  for (const [key, result] of Object.entries(components)) {
    componentScores[key] = result.score
    componentNotes[key] = result.notes || []
    uxComponentExplanations[key] = result.notes || []
  }

  const problems = []
  const strengths = []
  for (const result of Object.values(components)) {
    for (const note of result.problems || []) problems.push(note)
    for (const note of result.strengths || []) strengths.push(note)
    for (const note of result.notes || []) {
      if (/overcrowd/i.test(note) && (ctx.primaryNavLinkCount || 0) <= PRIMARY_NAV_OVERCROWD_THRESHOLD) {
        continue
      }
      if (/too|missing|no |not |lack|low|spam|overflow|dense|weak|hard|outdated|may be|misaligned|poorly sized/i.test(note)) {
        if (!problems.includes(note)) problems.push(note)
      } else if (/clear|supports|visible|readable|strong|solid|good|organized|balanced|fit the page/i.test(note)) {
        if (!strengths.includes(note)) strengths.push(note)
      }
    }
  }

  const recommended_fixes = problems.slice(0, 6).map((problem) => {
    if (/overflow/i.test(problem)) return 'Fix mobile CSS overflow and test on a 390px-wide viewport.'
    if (/navigation/i.test(problem)) return 'Add a visible header nav with 3–6 clear links to key pages.'
    if (/semantic H1/i.test(problem)) return 'Add a single semantic <h1> that matches your visible hero heading.'
    if (/H1|hero/i.test(problem)) return 'Rewrite the hero with a short headline, supporting line, and one primary CTA.'
    if (/text block|paragraph|dense/i.test(problem)) return 'Break long copy into shorter paragraphs with subheadings.'
    if (/CTA|conversion|phone/i.test(problem)) return 'Add one natural primary CTA matched to your business model (book, shop, or contact).'
    if (/image/i.test(problem)) return 'Add relevant photos that prove your product, service, or brand.'
    return `Address visual UX issue: ${problem}`
  })

  const readability = components.readability_score
  const layout = components.layout_balance_score

  return {
    visual_score: visualScore,
    visual_score_100: visualScore,
    ux_ui_score: Math.round((visualScore / 100) * 25),
    ux_score_components: componentScores,
    ux_component_scores: componentScores,
    ux_component_explanations: uxComponentExplanations,
    component_notes: componentNotes,
    visual_strengths: [...new Set(strengths)].slice(0, 10),
    visual_problems: [...new Set(problems)].slice(0, 12),
    visual_recommended_fixes: [...new Set(recommended_fixes)].slice(0, 6),
    ux_confidence: avgConfidence,
    ux_evidence: {
      hero_heading: heroHeading,
      readability_factors: readability.factors || {},
      layout_strengths: layout.strengths || [],
      layout_problems: layout.problems || [],
      layout_evidence: layout.evidence || [],
    },
    hero_heading: heroHeading,
    readability_factors: readability.factors || {},
    readability_strengths: readability.strengths || [],
    readability_problems: readability.problems || [],
    readability_confidence: readability.confidence || avgConfidence,
    layout_strengths: layout.strengths || [],
    layout_problems: layout.problems || [],
    layout_evidence: layout.evidence || [],
    component_weights: COMPONENT_WEIGHTS,
    scoring_inputs: {
      visual_audit_ok: visualAuditOk,
      business_model: businessModel,
      nav_link_count: navLinkCount,
      primary_nav_link_count: primaryNavLinkCount,
      image_count: imageCount,
      cta_above_fold_count: ctaSpamCount,
      avg_paragraph_length: avgParagraphLength,
      max_text_block_length: maxTextBlockLength,
      section_count: sectionCount,
      h1_above_fold: heroHeading.h1_above_fold,
      hero_heading_above_fold: heroHeading.hero_heading_above_fold,
      has_hero_heading: heroHeading.has_hero_heading,
      layout_fitted_image_count: layoutFittedImageCount,
      misaligned_image_count: misalignedImageCount,
    },
  }
}

function mapVisualScoreToCategoryPoints(visualScore, maxPoints = 25) {
  return Math.max(0, Math.min(maxPoints, Math.round((visualScore / 100) * maxPoints)))
}

function mapVisualScoreToLegacy20(visualScore) {
  return Math.round((visualScore / 5) * 10) / 10
}

module.exports = {
  COMPONENT_WEIGHTS,
  buildVisualUxScore,
  mapVisualScoreToCategoryPoints,
  mapVisualScoreToLegacy20,
  classifyCtaQuality,
  scoreNavbar,
  scoreHero,
  scoreReadability,
  scoreConversionPath,
  scoreLayoutBalance,
}
