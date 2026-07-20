const {
  resolveCanonicalBusinessModel,
  ECOMMERCE_MODELS,
  SERVICE_MODELS,
  CONTENT_MODELS,
  GALLERY_SERVICE_MODELS,
  isListingModel,
} = require('./businessModelConfig')
const { mergeHeroHeadingSignals } = require('./heroHeadingDetection')
const { HIGH_CONFIDENCE, MEDIUM_CONFIDENCE } = require('./visualEvidenceService')

function isDebugAnalyzerEnabled() {
  return process.env.DEBUG_ANALYZER === 'true'
}

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
const SPAM_CTA_THRESHOLD = 9

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function missingDefault(confidence) {
  return confidence >= 70 ? 48 : confidence >= 45 ? 38 : 28
}

const PRIMARY_NAV_OVERCROWD_THRESHOLD = 6

function issueToProblem(issue) {
  if (!issue) return null
  if (issue.confidence < MEDIUM_CONFIDENCE) return null
  return issue.message
}

function collectEvidenceProblems(issues = [], minConfidence = HIGH_CONFIDENCE) {
  return (issues || [])
    .filter((issue) => issue.confidence >= minConfidence)
    .map((issue) => issue.message)
    .filter(Boolean)
}

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
    businessModel,
  } = ctx
  const model = resolveCanonicalBusinessModel(businessModel) || businessModel
  const isServiceBusiness = SERVICE_MODELS.has(model) || GALLERY_SERVICE_MODELS.has(model)
  const topLevelCount =
    primaryNavLinkCount > 0
      ? primaryNavLinkCount
      : navLinkCount <= PRIMARY_NAV_OVERCROWD_THRESHOLD
        ? navLinkCount
        : 0
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
    if (isServiceBusiness) {
      strengths.push('Phone banner CTA is visible and valid for a local/service business.')
      score += 4
    } else {
      score -= 14
      problems.push('Phone/banner CTA appears to replace real navigation.')
    }
  }

  if (mobileNavOverflow) {
    score -= 12
    problems.push('Mobile navigation area shows layout overflow.')
  }

  if (navLinkCount > PRIMARY_NAV_OVERCROWD_THRESHOLD && primaryNavLinkCount === 0) {
    score -= 6
    problems.push('Navigation appears complex with many nested links — clarity may suffer.')
  }

  if (topLevelCount >= 2 && topLevelCount <= PRIMARY_NAV_OVERCROWD_THRESHOLD && navAboveFold && hasStructuredHeader && !mobileNavOverflow) {
    score = Math.max(score, 92)
    strengths.push('Header navigation is clear, visible, and well structured.')
  }
  if (
    topLevelCount >= 2 &&
    topLevelCount <= PRIMARY_NAV_OVERCROWD_THRESHOLD &&
    navAboveFold &&
    hasStructuredHeader &&
    brandInHeader &&
    !mobileNavOverflow
  ) {
    score = Math.max(score, 96)
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
    duplicateCopyCount,
    templateDebtSignals,
    businessModel,
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

  if (semanticH1Missing && hasHero) {
    notes.push('Semantic H1 missing, but visual hero heading is clear (minor markup issue only).')
  } else if (semanticH1Missing) {
    score -= 4
    problems.push('Hero heading is visually clear, but semantic H1 markup may be missing.')
  }

  if (heroText.length >= 20 && heroText.length <= 72) score += 8
  else if (heroText.length > 95) {
    score -= 18
    problems.push(`Hero headline is too long (${heroText.length} characters) and hurts first impression.`)
  } else if (heroText.length > 72) {
    score -= 8
    problems.push(`Hero headline is longer than ideal (${heroText.length} characters).`)
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
    score -= 8
    problems.push(`${ctaSpamCount} promotional CTA-like elements above the fold may compete for attention.`)
  } else if (ctaSpamCount >= 7) {
    score -= 3
    notes.push(`${ctaSpamCount} CTA-like elements above the fold — acceptable for retail sites with promos.`)
  } else if (ctaSpamCount >= 5) {
    score -= 1
  }

  if (maxAboveFoldBlock > 720) {
    score -= 12
    problems.push(`Hero text is dense: largest above-fold block is ${maxAboveFoldBlock} characters.`)
  } else if (maxAboveFoldBlock > 560) {
    score -= 5
  } else if (aboveFoldTextLength > 1400) {
    score -= 8
    problems.push('Above-fold area contains a lot of text before visitors can scan the page.')
  } else if (aboveFoldTextLength > 0 && aboveFoldTextLength < 700) {
    score += 4
  }

  if (
    (duplicateCopyCount || 0) >= 2 ||
    ((duplicateCopyCount || 0) >= 1 &&
      !ECOMMERCE_MODELS.has(resolveCanonicalBusinessModel(businessModel) || businessModel))
  ) {
    score -= 14
    problems.push('Repeated marketing copy appears multiple times on the page.')
  }

  if ((templateDebtSignals || []).length >= 1) {
    score -= 16
    problems.push('Template/demo residue is still visible (unfinished footer or placeholder content).')
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
    densityEvidence,
    visualEvidenceIssues,
  } = ctx
  const tolerance = readabilityTolerance(businessModel)
  let score = visualVerified ? 58 : 48
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
    score -= 14
    problems.push(`Largest text block is ${maxTextBlockLength} characters and lacks section breaks.`)
  } else if (maxTextBlockLength > tolerance.maxBlock && wellStructured) {
    score -= 2
    factors.scan_density_note = 'Long copy is readable but dense — extra headings could help scanning.'
  } else if (maxTextBlockLength > tolerance.maxBlock * 0.8 && !wellStructured) {
    score -= 5
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

  if (textDensity > tolerance.densityHard && densityEvidence?.desktop?.high_density) {
    score -= 16
    const desktopIssue = visualEvidenceIssues?.find((issue) => issue.category === 'mobile_text_density')
    if (desktopIssue?.confidence >= HIGH_CONFIDENCE) {
      problems.push(desktopIssue.message)
    } else {
      problems.push('Above-fold desktop text area is crowded based on rendered text blocks.')
    }
  } else if (textDensity > tolerance.densitySoft && densityEvidence?.desktop?.high_density) {
    score -= 6
  }

  const mobileDensityIssue = (visualEvidenceIssues || []).find(
    (issue) => issue.category === 'mobile_text_density' && issue.confidence >= MEDIUM_CONFIDENCE,
  )
  if (mobileDensityIssue?.confidence >= HIGH_CONFIDENCE) {
    score -= 12
    problems.push(mobileDensityIssue.message)
  } else if (mobileDensityIssue) {
    problems.push(mobileDensityIssue.message)
  } else if (mobileTextDensity > tolerance.densityHard) {
    strengths.push('Mobile above-fold text layout appears normal from rendered text blocks.')
  } else if (!mobileDensityIssue && densityEvidence?.mobile?.density_confidence >= HIGH_CONFIDENCE) {
    strengths.push('Mobile above-fold text layout looks readable from rendered text blocks.')
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
  const { heroHeading, h2Count, sectionCount, headingLevels, contentH2Count } = ctx
  let score = 34
  const notes = []
  const problems = []

  const hasHero = Boolean(heroHeading?.has_hero_heading)
  const hasH1 = Boolean(heroHeading?.has_h1)
  const heroAboveFold = Boolean(heroHeading?.hero_heading_above_fold)
  const meaningfulH2 = contentH2Count ?? h2Count

  if (hasHero && heroAboveFold) score += 24
  else if (hasHero || hasH1) score += 14
  else {
    score -= 12
    problems.push('Missing clear hero heading — page purpose is harder to grasp.')
  }

  if (heroAboveFold) score += 10
  if (meaningfulH2 >= 2) {
    score += 12
    notes.push('Section headings (H2) create a clear content structure.')
  } else if (meaningfulH2 === 1) {
    score += 4
  } else if (!hasHero) {
    score -= 6
    problems.push('Few section headings — content is hard to scan.')
  }

  const effectiveSections = Math.min(sectionCount || 0, 5)
  if (effectiveSections >= 4) score += 10
  else if (effectiveSections >= 2) score += 5
  else if (effectiveSections === 0 && !hasHero) score -= 8

  if (headingLevels >= 3 && meaningfulH2 >= 1) score += 6

  if (heroHeading?.semantic_h1_missing) {
    score -= 3
    notes.push('Visual hierarchy is clear, but semantic H1 markup may be missing.')
  }

  return { score: clamp(score), notes: [...notes, ...problems], problems }
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
    productGridImageCount,
    portfolioSignals,
    alignmentConfidence,
    visualEvidenceIssues,
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
    score += 6
    strengths.push(`${imageCount} images detected on the page.`)
  }

  const layoutFitRatio =
    imageCount > 0 ? layoutFittedImageCount / imageCount : layoutFittedImageCount > 0 ? 1 : 0
  const misalignRatio = imageCount > 0 ? misalignedImageCount / imageCount : 0
  const catalogImages = Math.max(productGridImageCount || 0, layoutFittedImageCount)

  const alignmentIssues = (visualEvidenceIssues || []).filter(
    (issue) => issue.category === 'image_alignment' && issue.confidence >= MEDIUM_CONFIDENCE,
  )
  const highConfidenceAlignment = alignmentIssues.filter((issue) => issue.confidence >= HIGH_CONFIDENCE)

  if (isEcommerce && imageCount >= 20) {
    if (catalogImages >= 10) {
      score += 20
      strengths.push('Rich product/catalog imagery supports shopping and discovery.')
    } else if (catalogImages >= 6) {
      score += 14
      strengths.push('Product imagery is present across the catalog.')
    }
    if (misalignedImageCount <= 4 && catalogImages >= 8 && highConfidenceAlignment.length === 0) {
      score += 8
      strengths.push('Product grid images appear consistently aligned.')
    }
    if (highConfidenceAlignment.length > 0) {
      score -= 12
      problems.push(highConfidenceAlignment[0].message)
    }
  } else {
    if (layoutFittedImageCount >= 2 && layoutFitRatio >= 0.45) {
      score += 14
      strengths.push(`${layoutFittedImageCount} images fit the page layout cleanly.`)
    } else if (imageCount >= 3 && layoutFittedImageCount === 0 && highConfidenceAlignment.length > 0) {
      score -= 18
      problems.push(highConfidenceAlignment[0].message)
    }

    if (highConfidenceAlignment.length > 0) {
      score -= 18
      problems.push(highConfidenceAlignment[0].message)
    } else if (alignmentIssues.length > 0) {
      score -= 8
      problems.push(alignmentIssues[0].message)
    } else if (imageCount >= 2) {
      strengths.push('No image alignment issue detected.')
    } else if (alignmentConfidence > 0 && alignmentConfidence < HIGH_CONFIDENCE) {
      strengths.push('Image alignment could not be reliably evaluated.')
    }
  }

  if (aboveFoldImageCount >= 2 && layoutFitRatio >= 0.4) score += 8
  else if (aboveFoldImageCount >= 2 && layoutFitRatio < 0.25) {
    score -= 6
    problems.push('Above-fold images look poorly integrated into the layout.')
  }
  if (heroImagePresent && layoutFitRatio >= 0.35) score += 6

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
    businessModel,
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
    layoutFittedImageCount,
    misalignedImageCount,
    imageCount,
    productGridImageCount,
    conversionPathScore,
    visualEvidenceIssues,
    highMobileTextDensity,
    alignmentConfidence,
  } = ctx
  const model = resolveCanonicalBusinessModel(businessModel) || businessModel
  const isEcommerce = ECOMMERCE_MODELS.has(model)
  let score = 48
  const notes = []
  const strengths = []
  const problems = []
  const evidence = []

  const effectiveSections = Math.min(sectionCount || 0, 6)
  const layoutFitRatio =
    imageCount > 0 ? layoutFittedImageCount / imageCount : layoutFittedImageCount > 0 ? 1 : 0

  if (mobileOverflowSeverity === 'major' && mobileOverflow === true && (ctx.overflowPxMobile == null || ctx.overflowPxMobile > 80) && (ctx.overflowOffendersMobile || []).length > 0) {
    score -= 32
    problems.push(
      `Severe mobile layout overflow detected (~${Math.round(ctx.overflowPxMobile || 0)}px): content width exceeds viewport.`,
    )
    evidence.push({
      type: 'overflow',
      viewport: 'mobile',
      severity: 'major',
      overflow_px: ctx.overflowPxMobile,
      offenders: (ctx.overflowOffendersMobile || []).slice(0, 3),
      confidence: 'high',
    })
  } else if (mobileOverflow === true && (mobileOverflowSeverity === 'major' || mobileOverflowSeverity === 'minor')) {
    score -= 8
    problems.push('Possible mobile layout issue to verify — overflow was measured without strong element-level proof.')
    evidence.push({
      type: 'overflow',
      viewport: 'mobile',
      severity: mobileOverflowSeverity || 'minor',
      overflow_px: ctx.overflowPxMobile,
      confidence: 'low',
    })
  }
  // Never treat layout_balance or false horizontal_overflow as overflow

  if (desktopOverflowSeverity === 'major' || desktopOverflow) {
    score -= 18
    problems.push('Desktop layout overflow detected.')
    evidence.push({ type: 'overflow', viewport: 'desktop', severity: desktopOverflowSeverity || 'major' })
  } else if (desktopOverflowSeverity === 'minor') {
    score -= 6
  }

  if (ctaSpamCount >= 7) {
    score -= 4
    problems.push('Several promotional CTAs above the fold compete for attention.')
    evidence.push({ type: 'cta_crowding', count: ctaSpamCount })
  } else if (ctaSpamCount >= 5) {
    score -= 2
  }

  if (textDensity > 0.0035 && effectiveSections < 2 && highMobileTextDensity) {
    score -= 14
    const densityIssue = (visualEvidenceIssues || []).find((issue) => issue.category === 'mobile_text_density')
    if (densityIssue?.confidence >= HIGH_CONFIDENCE) {
      problems.push(densityIssue.message)
    } else {
      problems.push('Above-fold area feels crowded without clear section separation.')
    }
  }

  const alignmentIssues = (visualEvidenceIssues || []).filter(
    (issue) => issue.category === 'image_alignment' && issue.confidence >= MEDIUM_CONFIDENCE,
  )
  const highConfidenceAlignment = alignmentIssues.filter((issue) => issue.confidence >= HIGH_CONFIDENCE)
  // If alignment confidence is explicitly 0 / missing, do not invent alignment problems from counts alone
  const alignmentConfidenceOk = Number(alignmentConfidence || 0) > 0 || highConfidenceAlignment.length > 0

  if (imageCount >= 3 && layoutFitRatio < 0.3 && !isEcommerce && alignmentConfidenceOk) {
    score -= 16
    problems.push('Images look scattered or poorly placed relative to the layout grid.')
    evidence.push({ type: 'image_layout_fit', ratio: layoutFitRatio, confidence: alignmentConfidence || 0 })
  } else if (!isEcommerce && imageCount >= 2 && highConfidenceAlignment.length > 0) {
    score -= 12
    problems.push(highConfidenceAlignment[0].message)
  } else if (isEcommerce && highConfidenceAlignment.length > 0 && productGridImageCount < 4) {
    score -= 10
    problems.push(highConfidenceAlignment[0].message)
  }

  if (conversionPathScore != null && conversionPathScore < 42 && !isEcommerce) {
    score -= 10
    problems.push('Layout does not guide visitors toward a clear next step.')
  }

  if ((ctx.templateDebtSignals || []).length >= 1) {
    score -= 24
    problems.push('Unfinished template-builder layout (demo footer/placeholder content) hurts polish.')
    evidence.push({ type: 'template_debt', signals: ctx.templateDebtSignals })
  }

  if ((ctx.duplicateCopyCount || 0) >= 1 && !isEcommerce) {
    score -= 14
    problems.push('Repeated copy blocks make the layout feel low-effort and hard to scan.')
  }

  if (isEcommerce && productGridImageCount >= 8) {
    score += 18
    strengths.push('Structured product grid gives shoppers a clear, scannable layout.')
    evidence.push({ type: 'product_grid', count: productGridImageCount })
  } else if (isEcommerce && productGridImageCount >= 4) {
    score += 10
    strengths.push('Product tiles organize the page into a browsable catalog layout.')
  }

  if (isEcommerce && ctx.hasStructuredHeader && (ctx.primaryNavLinkCount || 0) >= 2) {
    score += 8
    strengths.push('Store header and navigation establish a clear shopping structure.')
  }

  if (effectiveSections >= 4) {
    score += 12
    strengths.push('Clear sections organize the page layout.')
    evidence.push({ type: 'sections', count: effectiveSections })
  } else if (effectiveSections >= 2) {
    score += 6
    strengths.push('Page content is grouped into distinct sections.')
  } else if (!isEcommerce) {
    score -= 6
    problems.push('Page lacks clear section structure.')
  }

  if (heroImagePresent && effectiveSections >= 2 && layoutFitRatio >= 0.35) {
    score += 6
    strengths.push('Balanced image and text composition in the layout.')
  }

  if (avgParagraphLength > 0 && avgParagraphLength < 280 && effectiveSections >= 2) {
    score += 4
    strengths.push('Spacing and block length keep the layout readable.')
  }

  if (aboveFoldElementCount > 32) {
    score -= 8
    problems.push('Above-fold area looks visually crowded.')
  } else if (aboveFoldElementCount >= 8 && aboveFoldElementCount <= 24 && effectiveSections >= 2) {
    score += 3
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
    score -= 6
    notes.push('Several promotional CTA buttons above the fold may reduce clarity.')
  } else if (ctaSpamCount >= 7) {
    score -= 2
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

  if ((ctx.templateDebtSignals || []).length >= 1) {
    score = Math.min(score, 68)
  }
  if ((ctx.duplicateCopyCount || 0) >= 1) {
    score = Math.min(score, 64)
  }

  return { score: clamp(score), notes }
}

function scoreTrustVisual(ctx) {
  const {
    reviewIndicators,
    contactVisible,
    policySignals,
    socialCount,
    contrastScore,
    hasStructuredHeader,
    outdatedSignals,
    templateDebtSignals,
    duplicateCopyCount,
  } = ctx
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
  if ((templateDebtSignals || []).length >= 1) {
    score -= 20
    notes.push('Placeholder or template-builder residue reduces perceived polish.')
  }
  if ((duplicateCopyCount || 0) >= 2) {
    score -= 10
    notes.push('Duplicate copy makes the site feel unfinished or low-effort.')
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

function calibrateFinalVisualScore(visualScore, components, ctx) {
  let score = visualScore
  const layout = components.layout_balance_score?.score ?? 50
  const images = components.image_quality_score?.score ?? 50
  const conversion = components.conversion_path_score?.score ?? 50
  const hierarchy = components.visual_hierarchy_score?.score ?? 50
  const imageCount = ctx.imageCount || 0
  const model = resolveCanonicalBusinessModel(ctx.businessModel) || ctx.businessModel
  const isEcommerce = ECOMMERCE_MODELS.has(model)
  const hasClearCatalogLayout = isEcommerce && (ctx.productGridImageCount || 0) >= 8 && !ctx.mobileOverflow
  const hasTemplateDebt = (ctx.templateDebtSignals || []).length >= 1
  const evidenceConfidence = ctx.evidenceConfidence || 0

  if (ctx.visualVerified && evidenceConfidence >= HIGH_CONFIDENCE) {
    score += 3
  } else if (ctx.visualVerified && evidenceConfidence >= MEDIUM_CONFIDENCE) {
    score += 1
  }

  if (hasClearCatalogLayout) {
    score += 6
    score = Math.max(score, 78)
  } else if (isEcommerce && (ctx.productGridImageCount || 0) >= 4) {
    score = Math.max(score, 72)
  }

  if (hasTemplateDebt) {
    score = Math.min(score, 54)
  } else if ((ctx.duplicateCopyCount || 0) >= 2 && !isEcommerce) {
    score = Math.min(score, 58)
  }

  if (layout < 45 && !hasClearCatalogLayout) {
    score = Math.min(score, Math.max(55, layout + 18))
  }
  if (conversion < 40 && !isEcommerce) score = Math.min(score, 72)
  if (hierarchy < 45 && !hasClearCatalogLayout) score = Math.min(score, 74)

  const weakComponents = [layout, images, conversion, hierarchy].filter((value) => value < 50).length
  if (weakComponents >= 3 && !isEcommerce && evidenceConfidence >= HIGH_CONFIDENCE) {
    score = Math.min(score, 56)
  }

  return clamp(score)
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

  const visualEvidence = visualAudit?.visual_evidence || {}
  const visualEvidenceIssues = [
    ...(visualEvidence.high_confidence_issues || []),
    ...(visualEvidence.medium_confidence_issues || []),
    ...(summary.visual_issues || []),
  ]
  const alignmentConfidence = visualEvidence.misalignment_confidence || summary.misalignment_confidence || 0
  const evidenceConfidence = visualEvidence.evidence_confidence || summary.evidence_confidence || 0

  const dm = desktop.metrics || {}
  const mm = mobile.metrics || {}
  const densityEvidence = {
    desktop: {
      high_density: Boolean(dm.visual_evidence?.text_density?.high_density),
      density_confidence: dm.visual_evidence?.text_density?.density_confidence || visualEvidence.density_confidence || 0,
    },
    mobile: {
      high_density: Boolean(summary.high_mobile_text_density || mm.visual_evidence?.text_density?.high_density),
      density_confidence: mm.visual_evidence?.text_density?.density_confidence || visualEvidence.density_confidence || summary.density_confidence || 0,
    },
  }
  const headings = [...(dm.headings || []), ...(mm.headings || [])]
  const h1 = headings.find((h) => h.tag === 'h1')
  const h1AboveFold = headings.some((h) => h.tag === 'h1' && h.above_fold)
  const h1Text = h1?.text || crawler.h1Text || ''
  const contentHeadings = headings.filter((h) => !h.in_chrome)
  const h2Count = contentHeadings.filter((h) => h.tag === 'h2').length
  const contentH2Count = h2Count
  const headingLevels = new Set(contentHeadings.map((h) => h.tag)).size

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
  const ctaAboveFold = ctaRaw.filter((c) => c.above_fold && !c.is_promo && !c.in_nav)
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
  const evidenceLargestBlock = Math.max(
    mm.visual_evidence?.text_density?.evidence?.largest_block_characters || 0,
    dm.visual_evidence?.text_density?.evidence?.largest_block_characters || 0,
  )
  let maxAboveFoldBlock = dm.max_above_fold_text_block || mm.max_above_fold_text_block || maxTextBlockLength
  if (evidenceLargestBlock > 0) {
    maxAboveFoldBlock = evidenceLargestBlock
  }
  const effectiveMaxTextBlock =
    evidenceLargestBlock > 0 && evidenceLargestBlock < maxTextBlockLength
      ? Math.max(evidenceLargestBlock, avgParagraphLength)
      : maxTextBlockLength

  const sectionCount = visualAuditOk
    ? Math.max(dm.section_count || 0, mm.section_count || 0)
    : Math.min(crawler.homepageSectionEstimate || 0, 3)
  const imageCount = Math.max(summary.image_count || 0, dm.image_count || 0, crawler.imageCount || 0)
  const aboveFoldImageCount = Math.max(summary.above_fold_image_count || 0, dm.above_fold_image_count || 0)
  const heroImagePresent = Boolean(summary.hero_image_present || dm.hero_image_present)
  const layoutFittedImageCount = Math.max(
    dm.layout_fitted_image_count || 0,
    mm.layout_fitted_image_count || 0,
    (dm.layout_images || mm.layout_images || []).length,
  )
  const misalignedImageCount = Math.max(
    visualEvidence.misaligned_image_count || 0,
    summary.misaligned_image_count || 0,
    dm.misaligned_image_count || 0,
    mm.misaligned_image_count || 0,
  )
  const productGridImageCount = Math.max(
    summary.product_grid_image_count || 0,
    dm.product_grid_image_count || 0,
    mm.product_grid_image_count || 0,
  )
  const templateDebtSignals = [
    ...new Set([...(summary.template_debt_signals || []), ...(dm.template_debt_signals || []), ...(mm.template_debt_signals || [])]),
  ]
  const duplicateCopyCount = Math.max(
    summary.duplicate_copy_count || 0,
    dm.duplicate_copy_count || 0,
    mm.duplicate_copy_count || 0,
  )
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
    maxTextBlockLength: effectiveMaxTextBlock,
    textDensity,
    mobileTextDensity,
    headingCount: contentHeadings.length,
    h2Count,
    contentH2Count,
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
    productGridImageCount,
    templateDebtSignals,
    duplicateCopyCount,
    alignmentConfidence,
    visualEvidenceIssues,
    densityEvidence,
    evidenceConfidence,
    highMobileTextDensity: Boolean(summary.high_mobile_text_density),
    portfolioSignals: signals.has_gallery || /portfolio|gallery|project/i.test(String(crawler.pageText || '')),
    desktopOverflow: Boolean(summary.horizontal_overflow_desktop || dm.horizontal_overflow),
    mobileOverflow: Boolean(summary.horizontal_overflow_mobile || mm.horizontal_overflow),
    mobileOverflowSeverity: summary.overflow_severity_mobile || mm.overflow_severity || 'none',
    desktopOverflowSeverity: summary.overflow_severity_desktop || dm.overflow_severity || 'none',
    overflowPxMobile: summary.overflow_px_mobile ?? mm.overflow_px ?? null,
    overflowOffendersMobile: summary.overflow_offenders_mobile || mm.overflow_offenders || [],
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

  const conversionPathScore = scoreConversionPath(ctx)
  const components = {
    navbar_score: scoreNavbar(ctx),
    hero_score: scoreHero(ctx),
    readability_score: scoreReadability(ctx),
    visual_hierarchy_score: scoreVisualHierarchy(ctx),
    image_quality_score: scoreImageQuality(ctx),
    conversion_path_score: conversionPathScore,
    layout_balance_score: scoreLayoutBalance({
      ...ctx,
      conversionPathScore: conversionPathScore.score,
    }),
    trust_visual_score: scoreTrustVisual(ctx),
  }

  let visualScore = 0
  for (const [key, weight] of Object.entries(COMPONENT_WEIGHTS)) {
    visualScore += (components[key]?.score ?? missingDefault(avgConfidence)) * weight
  }
  const scoreBeforeCalibration = Math.round(visualScore)
  visualScore = calibrateFinalVisualScore(visualScore, components, ctx)
  const scoreAfterCalibration = visualScore

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
      // Positive "No X issue detected" notes must stay strengths — "/no /" alone is too greedy.
      if (/^no .+ (?:issue|problem|overflow|misalignment) detected\.?$/i.test(note)) {
        if (!strengths.includes(note)) strengths.push(note)
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

  const evidenceProblems = collectEvidenceProblems(visualEvidenceIssues, HIGH_CONFIDENCE)
  for (const problem of evidenceProblems) {
    if (!problems.includes(problem)) problems.push(problem)
  }

  const scoreTrace = isDebugAnalyzerEnabled()
    ? {
        raw_visual_score_100: scoreBeforeCalibration,
        score_before_calibration: scoreBeforeCalibration,
        score_after_calibration: scoreAfterCalibration,
        score_components: componentScores,
        confidence: avgConfidence,
        evidence_confidence: evidenceConfidence,
        visual_evidence_summary: {
          misaligned_image_count: misalignedImageCount,
          misalignment_confidence: alignmentConfidence,
          high_mobile_text_density: Boolean(summary.high_mobile_text_density),
          issue_count: visualEvidenceIssues.length,
        },
      }
    : null

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
    score_trace: scoreTrace,
    visual_evidence_summary: {
      misaligned_image_count: misalignedImageCount,
      misalignment_confidence: alignmentConfidence,
      density_confidence: visualEvidence.density_confidence || summary.density_confidence || 0,
      high_confidence_issue_count: evidenceProblems.length,
      issues: visualEvidenceIssues.slice(0, 8),
    },
    component_weights: COMPONENT_WEIGHTS,
    scoring_inputs: {
      visual_audit_ok: visualAuditOk,
      business_model: businessModel,
      nav_link_count: navLinkCount,
      primary_nav_link_count: primaryNavLinkCount,
      image_count: imageCount,
      cta_above_fold_count: ctaSpamCount,
      avg_paragraph_length: avgParagraphLength,
      max_text_block_length: effectiveMaxTextBlock,
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
  calibrateFinalVisualScore,
}
