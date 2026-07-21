const { filterProblemLines, sanitizeCategoryDetail } = require('./evidenceFilters')
const { unknownResult } = require('../safeBrowsingService')
const { inferCrawlHealth } = require('../priorityWebsiteScoring')
const { detectOperationalSignals } = require('../businessScoringRubrics')
const { extractUxFeatures, buildUxFeatureExplanations, mapVisualScoreToCategoryPoints } = require('../uxFeatureExtractor')
const { pointsForStrength, strengthFromBoolean, strengthFromCount, combineStrengths } = require('./signalStrength')
const { scoreOfferBusinessFit } = require('./businessModelRubrics')
const { CATEGORY_WEIGHTS } = require('./scoringWeights')
const {
  assessContactEvidence,
  assessReviewEvidence,
  assessMobileOverflow,
} = require('./evidenceDetectors')

function clamp(value, max) {
  return Math.max(0, Math.min(max, Math.round(value)))
}

const VISUAL_PENALTY_CAP = 8
const PRIMARY_NAV_OVERCROWD_THRESHOLD = 6

function numOrNull(value) {
  return Number.isFinite(value) ? value : null
}

function computeVisitorAppealDownsides(uxFeatures) {
  if (!uxFeatures) return { total: 0, items: [] }

  const visualVerified =
    uxFeatures.source === 'visual_audit+crawler' || (uxFeatures.ux_confidence ?? 0) >= 70
  if (!visualVerified) {
    return { total: 0, items: [] }
  }

  const items = []
  let total = 0

  const addPenalty = (key, label, points, note) => {
    if (points <= 0) return
    items.push({ key, label, earned: -points, max: points, note, type: 'penalty' })
    total += points
  }

  const visual = numOrNull(uxFeatures.visual_score ?? uxFeatures.overall_static_ux_score)
  const layout = numOrNull(uxFeatures.layout_balance_score)
  const readability = numOrNull(uxFeatures.readability_score)
  const polish = numOrNull(uxFeatures.display_polish_score)
  const hierarchy = numOrNull(uxFeatures.visual_hierarchy_score)
  const imageQuality = numOrNull(uxFeatures.image_quality_score)
  const appealIndex = numOrNull(uxFeatures.visitor_appeal_index)

  if (appealIndex != null) {
    if (appealIndex < 42) {
      addPenalty(
        'visitor_appeal',
        'Overall visual appeal & pleasantness',
        5,
        `Visitor appeal index ${appealIndex}/100 — layout and presentation feel uninviting.`,
      )
    } else if (appealIndex < 52) {
      addPenalty(
        'visitor_appeal',
        'Overall visual appeal & pleasantness',
        4,
        `Visitor appeal index ${appealIndex}/100 — site looks dated or hard to enjoy.`,
      )
    } else if (appealIndex < 62) {
      addPenalty(
        'visitor_appeal',
        'Overall visual appeal & pleasantness',
        3,
        `Visitor appeal index ${appealIndex}/100 — below what most visitors prefer.`,
      )
    } else if (appealIndex < 70) {
      addPenalty(
        'visitor_appeal',
        'Overall visual appeal & pleasantness',
        2,
        `Visitor appeal index ${appealIndex}/100 — presentation is acceptable but not compelling.`,
      )
    } else if (appealIndex < 76) {
      addPenalty(
        'visitor_appeal',
        'Overall visual appeal & pleasantness',
        1,
        `Visitor appeal index ${appealIndex}/100 — minor polish gaps reduce first impression.`,
      )
    }
  } else if (visual != null) {
    if (visual < 45) {
      addPenalty('visual_appeal', 'Visual appearance', 3, `Overall visual score ${visual}/100 is weak.`)
    } else if (visual < 58) {
      addPenalty('visual_appeal', 'Visual appearance', 2, `Overall visual score ${visual}/100 is below average.`)
    } else if (visual < 68) {
      addPenalty('visual_appeal', 'Visual appearance', 1, `Overall visual score ${visual}/100 lacks polish.`)
    }
  }

  if (layout != null) {
    if (layout < 40) {
      addPenalty(
        'layout_cleanliness',
        'Layout cleanliness',
        3,
        `Layout balance ${layout}/100 — sections feel crowded or poorly spaced.`,
      )
    } else if (layout < 52) {
      addPenalty(
        'layout_cleanliness',
        'Layout cleanliness',
        2,
        `Layout balance ${layout}/100 — sections feel crowded or unorganized.`,
      )
    } else if (layout < 63) {
      addPenalty(
        'layout_cleanliness',
        'Layout cleanliness',
        1,
        `Layout balance ${layout}/100 — spacing or structure could be cleaner.`,
      )
    }
  }

  if (readability != null && readability < 55) {
    addPenalty(
      'readability_pleasantness',
      'Readability & pleasantness',
      readability < 42 ? 2 : 1,
      `Readability ${readability}/100 — dense or tiring copy hurts visitor comfort.`,
    )
  }

  if (polish != null && polish < 55) {
    addPenalty(
      'display_polish',
      'Polish & modern feel',
      polish < 42 ? 2 : 1,
      `Display polish ${polish}/100 — site feels outdated or unrefined.`,
    )
  }

  if (hierarchy != null && imageQuality != null) {
    const scanScore = Math.round(hierarchy * 0.6 + imageQuality * 0.4)
    if (scanScore < 50) {
      addPenalty(
        'user_scan_preference',
        'How easy it is to scan & browse',
        2,
        `Hierarchy/image cues ${scanScore}/100 — visitors struggle to find what matters.`,
      )
    } else if (scanScore < 62) {
      addPenalty(
        'user_scan_preference',
        'How easy it is to scan & browse',
        1,
        `Hierarchy/image cues ${scanScore}/100 — visual flow is only average.`,
      )
    }
  }

  const overflowSeverity = uxFeatures.signals?.overflow_severity_mobile
  const overflowAssessment = assessMobileOverflow({ uxFeatures })
  if (overflowAssessment.is_severe) {
    addPenalty(
      'mobile_layout',
      'Mobile layout usability',
      2,
      overflowAssessment.problem || 'Horizontal scrolling or overflow on mobile frustrates visitors.',
    )
  } else if (
    overflowAssessment.claim === 'possible_overflow' &&
    uxFeatures.signals?.horizontal_overflow_mobile === true
  ) {
    addPenalty(
      'mobile_layout',
      'Mobile layout usability',
      1,
      overflowAssessment.problem || 'Possible mobile layout issue to verify.',
    )
  }
  // Do not penalize "overflow" from layout_balance alone, and never when audit says no overflow.

  const primaryNav = uxFeatures.primary_nav_link_count ?? uxFeatures.signals?.primary_nav_link_count
  if (Number.isFinite(primaryNav) && primaryNav > PRIMARY_NAV_OVERCROWD_THRESHOLD) {
    addPenalty(
      'nav_clutter',
      'Navigation clutter',
      1,
      `${primaryNav} primary nav links — too many choices above the fold.`,
    )
  }

  const misalignConfidence =
    uxFeatures.visual_evidence_summary?.misalignment_confidence ??
    uxFeatures.signals?.misalignment_confidence ??
    0
  const misaligned = uxFeatures.misaligned_image_count ?? 0
  // Never flag alignment when visual evidence confidence is 0 / missing
  if (misaligned >= 3 && Number(misalignConfidence) > 0) {
    addPenalty(
      'misaligned_images',
      'Image alignment',
      1,
      `${misaligned} images look misaligned or poorly fitted to the layout.`,
    )
  }

  const layoutProblems = uxFeatures.layout_problems || []
  const visualProblems = uxFeatures.visual_problems || []
  const severeLayoutNotes = [...layoutProblems, ...visualProblems].filter((note) =>
    /crowd|clutter|outdated|unpolished|dense|hard to scan|hard to read/i.test(note) &&
    !/overflow|horizontal scroll/i.test(note),
  )
  if (severeLayoutNotes.length >= 3 && total < 3) {
    addPenalty(
      'layout_red_flags',
      'Multiple layout red flags',
      1,
      severeLayoutNotes[0],
    )
  }

  return { total: Math.min(VISUAL_PENALTY_CAP, total), items }
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

function emptyCategoryDetail(max) {
  return {
    score: 0,
    max,
    confidence: 40,
    strengths: [],
    problems: [],
    evidence: [],
    recommended_fixes: [],
  }
}

function finalizeCategory(detail, max, confidenceFactors = [], rubric = null) {
  detail.score = clamp(detail.score, max)
  detail.max = max
  const avgConfidence =
    confidenceFactors.length > 0
      ? Math.round(confidenceFactors.reduce((sum, value) => sum + value, 0) / confidenceFactors.length)
      : 55
  detail.confidence = Math.max(20, Math.min(100, avgConfidence))
  return sanitizeCategoryDetail(detail, rubric)
}

function scoreSafetyTrust({ aggregated, pages, safetyResult, crawlHealth, rubric, signals, visualAudit }) {
  const max = CATEGORY_WEIGHTS.safety_trust
  const detail = emptyCategoryDetail(max)
  const result = safetyResult || unknownResult()
  const confidenceFactors = []
  let points = 0
  const opsSignals = signals || detectOperationalSignals(pages, aggregated)

  const httpsStrength = strengthFromBoolean(aggregated.trust_signals?.https)
  const httpsPoints = pointsForStrength(httpsStrength, 4)
  points += httpsPoints
  if (httpsStrength !== 'none') {
    detail.strengths.push('Site is served over HTTPS.')
    detail.evidence.push({ signal: 'https', strength: httpsStrength, label: 'HTTPS', detail: 'Secure connection detected.' })
  } else {
    detail.problems.push('HTTPS was not detected — visitors may see security warnings.')
    detail.recommended_fixes.push('Enable SSL/HTTPS across your entire domain.')
  }
  confidenceFactors.push(80)

  if (result.status === 'unsafe') {
    detail.problems.push(result.message || 'Site flagged as unsafe by Google Safe Browsing.')
    detail.recommended_fixes.push('Remove malware/phishing content and request a Safe Browsing review.')
    detail.score = 0
    return finalizeCategory(detail, max, [result.configured ? 95 : 70], rubric)
  }

  if (result.status === 'safe' && result.configured) {
    points += 6
    detail.strengths.push('Google Safe Browsing reports no malware or phishing threats.')
    detail.evidence.push({ signal: 'safe_browsing', strength: 'strong', label: 'Safe Browsing', detail: result.message })
    confidenceFactors.push(95)
  } else {
    const partial = crawlHealth.homepageOk && aggregated.trust_signals?.https ? 3 : 1
    points += partial
    if (crawlHealth.homepageOk && aggregated.trust_signals?.https) {
      detail.strengths.push('HTTPS and crawl checks passed; live Google Safe Browsing was not verified.')
    }
    detail.evidence.push({
      signal: 'safe_browsing',
      strength: 'weak',
      label: 'Safe Browsing inconclusive',
      detail: result.configured
        ? 'API could not verify safety; partial credit from HTTPS and crawl health.'
        : 'Safe Browsing not configured; partial credit from HTTPS and crawl checks only.',
    })
    // Note: missing Safe Browsing configuration is an internal scoring-confidence detail (handled
    // via confidenceFactors below), not a customer-facing problem — the business owner cannot fix
    // our API configuration, so it must never surface as a fix-plan item or "problem" bullet.
    confidenceFactors.push(result.configured ? 55 : 45)
  }

  const contact = assessContactEvidence({
    aggregated,
    pages,
    signals: opsSignals,
    visualAudit: visualAudit || null,
    rubric,
  })
  const contactStrength =
    contact.claim === 'contact_visible'
      ? contact.strength
      : contact.claim === 'contact_weak_placement' || contact.claim === 'contact_path_only'
        ? 'weak'
        : contact.has_any_contact_path
          ? 'weak'
          : 'none'
  const contactPoints = pointsForStrength(contactStrength, 4)
  points += contactPoints
  if (contact.claim === 'contact_visible') {
    detail.strengths.push('Contact information (phone or email) is discoverable.')
    detail.evidence.push({
      signal: 'contact',
      strength: contact.strength,
      label: 'Contact info',
      detail: `Phones=${contact.has_phone}, emails=${contact.has_email}.`,
      proof: contact.evidence.slice(0, 4),
      confidence: 'high',
    })
  } else if (contact.claim === 'contact_weak_placement' || contact.claim === 'contact_path_only') {
    detail.strengths.push('A contact path exists, but it may not be prominent enough.')
    if (contact.problem) detail.problems.push(contact.problem)
    if (contact.fix) detail.recommended_fixes.push(contact.fix)
    detail.evidence.push({
      signal: 'contact',
      strength: 'weak',
      label: 'Contact path weakly placed',
      detail: contact.problem,
      proof: contact.evidence.slice(0, 4),
      confidence: 'medium',
    })
  } else if (contact.claim === 'no_contact_high_confidence') {
    detail.problems.push(contact.problem)
    detail.recommended_fixes.push(contact.fix)
    detail.evidence.push({
      signal: 'contact',
      strength: 'none',
      label: 'No contact found',
      detail: contact.problem,
      confidence: 'high',
    })
  } else if (contact.problem) {
    detail.problems.push(contact.problem)
    if (contact.fix) detail.recommended_fixes.push(contact.fix)
    detail.evidence.push({
      signal: 'contact',
      strength: 'none',
      label: 'Contact unclear',
      detail: contact.problem,
      confidence: contact.absence_confidence || 'low',
    })
  }

  const policyRelevant =
    rubric === 'ecommerce_store' || rubric === 'online_plus_offline_store' || rubric === 'listing'
  const policies = aggregated.policy_signals || {}
  const policyHits = [policies.privacy, policies.terms, policies.returns, policies.shipping].filter(Boolean).length
  if (policyRelevant) {
    const policyStrength =
      policyHits >= 3 ? 'strong' : policyHits >= 2 ? 'medium' : policyHits >= 1 ? 'weak' : 'none'
    const policyPoints = pointsForStrength(policyStrength, 3)
    points += policyPoints
    if (policyStrength !== 'none') {
      detail.strengths.push('Relevant policies (privacy, shipping, returns) are discoverable.')
      detail.evidence.push({ signal: 'policies', strength: policyStrength, label: 'Policies', detail: `${policyHits} policy type(s) found.` })
    } else {
      detail.problems.push('Expected ecommerce policies (shipping/returns/privacy) were not found.')
      detail.recommended_fixes.push('Publish and link privacy, shipping, and return policies.')
    }
  } else {
    const basicPolicyStrength = strengthFromBoolean(policies.privacy || policies.terms)
    points += pointsForStrength(basicPolicyStrength, 2)
    if (basicPolicyStrength !== 'none') {
      detail.strengths.push('Privacy or terms policy signals found.')
    }
  }

  const identityStrength = combineStrengths([
    strengthFromBoolean(Boolean(businessNameFromPages(pages))),
    strengthFromBoolean((aggregated.content_signals?.navigation_labels || []).length >= 2),
  ])
  points += pointsForStrength(identityStrength, 2)
  if (identityStrength !== 'none') {
    detail.strengths.push('Business identity is reasonably clear from headings and navigation.')
  } else {
    detail.problems.push('Business name or identity is unclear from crawled content.')
  }

  const reviews = assessReviewEvidence({ aggregated, pages, signals: opsSignals, rubric })
  const reviewStrength = reviews.strength
  const isContentSite = rubric === 'blog' || rubric === 'content_business'
  // Blogs/content: author/about/social prove trust — do not push commerce review problems.
  if (!isContentSite) {
    points += pointsForStrength(reviewStrength, 3)
    if (reviewStrength === 'strong') {
      detail.strengths.push('Reviews or testimonials build visitor trust.')
      detail.evidence.push({
        signal: 'reviews',
        strength: reviewStrength,
        label: 'Social proof',
        detail: 'Structured review or testimonial evidence detected.',
        proof: reviews.evidence.slice(0, 4),
        confidence: 'high',
      })
    } else if (reviewStrength === 'medium' || reviewStrength === 'weak') {
      detail.strengths.push('Some review or rating signals were detected.')
      if (reviews.problem) {
        detail.problems.push(reviews.problem)
        detail.recommended_fixes.push(reviews.fix)
      }
      detail.evidence.push({
        signal: 'reviews',
        strength: reviewStrength,
        label: 'Social proof',
        detail: reviews.problem || 'Review language detected.',
        proof: reviews.evidence.slice(0, 4),
        confidence: reviewStrength === 'medium' ? 'medium' : 'low',
      })
    }
  } else {
    const authorStrength = combineStrengths([
      strengthFromBoolean(Boolean(businessNameFromPages(pages))),
      strengthFromBoolean((aggregated.social_channels || []).length >= 1),
      strengthFromBoolean(aggregated.content_signals?.newsletter_indicators),
    ])
    points += pointsForStrength(authorStrength, 3)
    if (authorStrength !== 'none') {
      detail.strengths.push('Author identity, social, or newsletter signals support reader trust.')
    } else {
      detail.problems.push('Author identity and reader-trust paths (About, social, newsletter) are weak.')
      detail.recommended_fixes.push('Add an About/author section and a clear newsletter or social follow path.')
    }
  }

  const socialStrength =
    (aggregated.social_channels || []).length >= 2
      ? 'strong'
      : (aggregated.social_channels || []).length === 1
        ? 'weak'
        : 'none'
  points += pointsForStrength(socialStrength, 2)
  if (socialStrength !== 'none') {
    detail.strengths.push('Social profile links reinforce business legitimacy.')
  }

  detail.score = points
  return finalizeCategory(detail, max, confidenceFactors, rubric)
}

function businessNameFromPages(pages) {
  for (const page of pages) {
    const data = pageData(page)
    const h1 = (data.headings?.h1 || [])[0]
    if (h1) return h1
    if (page.title) return page.title
  }
  return null
}

function scoreTechnicalFunctionality({ aggregated, pages, crawlHealth, visualAudit, options }) {
  const max = CATEGORY_WEIGHTS.technical_functionality
  const detail = emptyCategoryDetail(max)
  const confidenceFactors = []
  let points = 0

  const botBlocked = pages.some(
    (p) =>
      p.bot_blocked === true ||
      p.extracted_data_json?.bot_blocked === true ||
      ([401, 403, 429, 503].includes(Number(p.status_code)) &&
        String(p.extracted_text || '').trim().length < 120),
  ) || Boolean(options?.crawlMeta?.bot_blocked) || Boolean(options?.crawlMeta?.bot_protection)

  if (botBlocked) {
    detail.problems.push(
      'This site blocked automated crawling (HTTP 403/bot protection), so scores from crawl HTML are incomplete and should not be treated as a full site review.',
    )
    detail.recommended_fixes.push(
      'Re-run with browser/Playwright crawling enabled (CRAWLER_USE_PLAYWRIGHT=true) and a rendered visual audit so the analyzer can see the live page.',
    )
    detail.evidence.push({
      signal: 'bot_blocked',
      strength: 'strong',
      label: 'Crawl blocked',
      detail: 'Fetcher reported bot protection or an HTTP 401/403/429/503 response with little extractable HTML.',
    })
    confidenceFactors.push(20)
    detail.score = Math.min(Math.max(points, 2), 4)
    return finalizeCategory(detail, max, confidenceFactors, options?.rubric || null)
  }

  if (crawlHealth.homepageOk) {
    points += 3
    detail.strengths.push('Homepage loaded successfully.')
    detail.evidence.push({ signal: 'homepage', strength: 'strong', label: 'Homepage', detail: 'Primary URL returned successfully.' })
    confidenceFactors.push(90)
  } else {
    detail.problems.push('Homepage failed to load or returned an error.')
    detail.recommended_fixes.push('Fix homepage availability and SSL errors.')
    confidenceFactors.push(30)
  }

  const pageCount = pages.length
  if (pageCount >= 4) {
    points += 2
    detail.strengths.push('Multiple supporting pages were crawled successfully.')
  } else if (pageCount >= 2) {
    points += 1
    detail.strengths.push('A limited set of pages was crawled.')
  } else {
    detail.problems.push('Very few pages were crawled — site depth is limited.')
  }
  confidenceFactors.push(pageCount >= 3 ? 80 : 50)

  if (crawlHealth.pagesFailed === 0 && pageCount >= 2) {
    points += 2
    detail.strengths.push('No page fetch failures during crawl.')
  } else if (crawlHealth.fetchFailureRate >= 0.4) {
    detail.problems.push(`${crawlHealth.pagesFailed} page fetch failure(s) reduced crawl confidence.`)
    detail.recommended_fixes.push('Fix broken internal links and server errors on key pages.')
  }

  const keyPages = [crawlHealth.homepageOk, pageCount >= 2, crawlHealth.pagesFailed === 0].filter(Boolean).length
  if (keyPages >= 3) {
    points += 2
    detail.strengths.push('Homepage and additional pages are reachable without crawl failures.')
  } else if (keyPages >= 2) {
    points += 1
  } else if (pageCount === 0) {
    detail.problems.push('No pages were crawled successfully.')
  }

  const meta = aggregated.extraction_meta || {}
  const visualTextLen = Math.max(
    Number(visualAudit?.summary?.visible_text_length) || 0,
    Number(visualAudit?.summary?.above_fold_text_length) || 0,
    Number(visualAudit?.desktop?.visible_text_length) || 0,
    Number(visualAudit?.mobile?.visible_text_length) || 0,
  )
  const visualShowsContent =
    Boolean(options?.crawlExtraction?.visual_shows_content) ||
    (Boolean(visualAudit?.ok) && visualTextLen >= 200)

  if (meta.js_rendered_pages > 0) {
    if (visualShowsContent) {
      detail.problems.push(
        'Sparse or JS-rendered HTML reduced crawler extractability, but the visual audit confirmed rendered content is present.',
      )
      detail.recommended_fixes.push(
        'Serve key offer copy in server-rendered HTML so crawlers and slower devices see the same content visitors see.',
      )
      // Soft penalty: crawlability gap, not "site is empty"
      points = Math.max(0, points - 1)
      confidenceFactors.push(55)
    } else {
      detail.problems.push('Sparse or JS-rendered HTML reduced content extractability.')
      detail.recommended_fixes.push('Serve key content in server-rendered HTML for crawlers and visitors.')
      points = Math.max(0, points - 2)
      confidenceFactors.push(45)
    }
  } else {
    confidenceFactors.push(75)
  }

  const textLen = aggregated.content_signals?.total_text_length || 0
  if (textLen >= 1500) {
    points += 2
    detail.strengths.push('Enough readable content extracted for analysis.')
  } else if (visualShowsContent) {
    points += 2
    detail.strengths.push(
      'Visual audit found substantial rendered text even though the crawler extracted little HTML content.',
    )
    detail.problems.push(
      'Crawler HTML extraction was thin — treat this as a crawlability issue, not proof the live site is empty.',
    )
    detail.recommended_fixes.push('Server-render primary product or offer copy so analysis and SEO can see it.')
  } else if (textLen >= 600) {
    points += 1
  } else {
    detail.problems.push('Very little readable content on crawled pages.')
    detail.recommended_fixes.push('Add descriptive text to homepage and key landing pages.')
  }

  let hasMobileViewport = false
  for (const page of pages) {
    if (pageData(page).has_mobile_viewport) hasMobileViewport = true
  }
  if (hasMobileViewport || visualAudit?.ok) {
    points += 1
    detail.strengths.push('Mobile viewport or rendered mobile audit supports responsive layout.')
  } else {
    detail.problems.push('No mobile viewport meta tag detected.')
    detail.recommended_fixes.push('Add <meta name="viewport" content="width=device-width, initial-scale=1">.')
  }

  if (aggregated.platform && aggregated.platform !== 'unknown') {
    points += 1
    detail.strengths.push(`Platform detected: ${aggregated.platform}.`)
    detail.evidence.push({ signal: 'platform', strength: 'medium', label: 'Platform', detail: aggregated.platform })
  }

  const perfHint = visualAudit?.summary?.load_time_ms || visualAudit?.desktop?.metrics?.load_time_ms
  if (perfHint && perfHint < 4000) {
    points += 1
    detail.strengths.push('Rendered audit suggests acceptable homepage load performance.')
  }

  if (options.crawlMeta?.sitemap_found) {
    detail.evidence.push({ signal: 'sitemap', strength: 'medium', label: 'Sitemap', detail: 'Sitemap discovered during crawl.' })
  }

  detail.score = points
  return finalizeCategory(detail, max, confidenceFactors, options?.rubric || null)
}

function scoreUxUiVisual({ pages, aggregated, uxFeatures, visualAudit, rubric, signals }) {
  const max = CATEGORY_WEIGHTS.ux_ui_visual
  const detail = emptyCategoryDetail(max)
  const visualOk = Boolean(visualAudit?.ok)
  const features =
    uxFeatures ||
    extractUxFeatures({
      visualAudit: visualAudit || null,
      pages,
      aggregated,
      businessModel: rubric,
      signals: signals || {},
    })

  let score = mapVisualScoreToCategoryPoints(features.visual_score ?? 50, max)
  detail.evidence.push({
    signal: 'visual_to_category',
    strength: 'strong',
    label: 'Visual → UX category mapping',
    detail: `${features.visual_score ?? 0}/100 visual → ${score}/${max} (visual ÷ 4, rounded).`,
  })

  if (!visualOk) {
    detail.problems.push('Visual audit unavailable — UX score uses static HTML signals with lower confidence.')
    detail.recommended_fixes.push('Enable VISUAL_AUDIT_ENABLED for rendered mobile/desktop layout analysis.')
  }

  if (features.hero_heading?.has_hero_heading) {
    detail.strengths.push('Hero heading is visible above the fold.')
    detail.evidence.push({
      signal: 'hero_heading',
      strength: 'strong',
      label: 'Hero heading',
      detail: features.hero_heading.hero_heading_text || 'Detected',
    })
  } else if (!features.hero_heading?.has_h1) {
    detail.problems.push('No clear hero heading guides visitors on page purpose.')
    detail.recommended_fixes.push('Add a clear headline that states what you offer and who it is for.')
  } else if (features.hero_heading?.semantic_h1_missing) {
    detail.problems.push('Hero heading is visually clear, but semantic H1 markup may be missing.')
  }

  if ((features.readability_problems || []).length) {
    for (const problem of filterProblemLines(features.readability_problems.slice(0, 2), rubric)) {
      detail.problems.push(problem)
    }
  }
  if ((features.readability_strengths || []).length) {
    detail.strengths.push(features.readability_strengths[0])
  }

  const overflow = assessMobileOverflow({ uxFeatures: features, visualAudit })
  if (overflow.claim === 'severe_overflow') {
    detail.problems.push(overflow.problem)
    detail.recommended_fixes.push(overflow.fix)
    detail.evidence.push({
      signal: 'mobile_overflow',
      strength: 'strong',
      label: 'Mobile overflow',
      detail: overflow.problem,
      proof: overflow.proof,
      confidence: overflow.confidence,
    })
  } else if (
    overflow.claim === 'possible_overflow' &&
    features.signals?.horizontal_overflow_mobile === true
  ) {
    detail.problems.push(overflow.problem)
    detail.recommended_fixes.push(overflow.fix)
    detail.evidence.push({
      signal: 'mobile_overflow',
      strength: 'weak',
      label: 'Possible layout issue',
      detail: overflow.problem,
      proof: overflow.proof,
      confidence: 'low',
    })
  }
  // Never emit overflow claims from layout_balance_score alone

  if ((features.primary_nav_link_count || features.nav_link_count || 0) > 6) {
    detail.problems.push('Top navigation has many primary links and may feel overcrowded.')
  } else if ((features.nav_visibility_score || 0) >= 70) {
    detail.strengths.push('Top-level navigation is visible and readable.')
  }

  if ((features.layout_problems || []).length) {
    const filtered = filterProblemLines(features.layout_problems)
    if (filtered[0]) detail.problems.push(filtered[0])
  }
  if ((features.layout_strengths || []).length) {
    detail.strengths.push(features.layout_strengths[0])
  }

  for (const reason of buildUxFeatureExplanations(features).slice(0, 3)) {
    detail.evidence.push({ signal: 'ux_feature', strength: 'medium', label: 'UX signal', detail: reason })
  }

  detail.score = score
  const confidence = features.ux_confidence ?? (visualOk ? 88 : 52)
  return finalizeCategory(detail, max, [confidence], rubric)
}

function scoreCustomerAttraction({ aggregated, pages, signals, rubric, uxFeatures, crawlHealth }) {
  const max = CATEGORY_WEIGHTS.customer_attraction
  const detail = emptyCategoryDetail(max)
  let points = 0
  const breakdown = []

  const addBreakdown = (key, label, earned, maxPts, note = '') => {
    const safeEarned = Math.max(0, Math.min(maxPts, earned))
    breakdown.push({ key, label, earned: safeEarned, max: maxPts, note })
    return safeEarned
  }

  const reviews = assessReviewEvidence({ aggregated, pages, signals, rubric })
  const proofStrength = reviews.strength
  const isContentSite = rubric === 'blog' || rubric === 'content_business'
  if (isContentSite) {
    const audienceTrust = combineStrengths([
      strengthFromBoolean(aggregated.content_signals?.newsletter_indicators),
      strengthFromBoolean(signals.has_creator_links),
      strengthFromCount((aggregated.social_channels || []).length, { weak: 1, medium: 2, strong: 3 }),
    ])
    const trustPts = pointsForStrength(audienceTrust, 3)
    points += addBreakdown(
      'trust_proof',
      'Author / newsletter / social trust',
      trustPts,
      3,
      audienceTrust !== 'none'
        ? 'Reader-trust paths (newsletter, social, creator links) detected.'
        : 'Limited author or subscribe trust paths.',
    )
    if (trustPts > 0) {
      detail.strengths.push('Newsletter, social, or creator links help readers trust the content.')
    } else {
      detail.problems.push('Readers lack a clear author, newsletter, or follow path to trust and return.')
      detail.recommended_fixes.push('Add About/author context and an obvious newsletter or follow CTA.')
    }
  } else {
    const proofPts = pointsForStrength(proofStrength, 3)
    points += addBreakdown(
      'trust_proof',
      'Trust proof (reviews/testimonials)',
      proofPts,
      3,
      proofStrength !== 'none' ? 'Review or testimonial evidence detected.' : 'No clear review proof found.',
    )
    if (proofStrength === 'strong') {
      detail.strengths.push('Reviews or testimonials answer “why trust this business?”')
    } else if (proofStrength === 'medium' || proofStrength === 'weak') {
      detail.strengths.push('Some review or rating signals are present.')
      if (reviews.problem) {
        detail.problems.push(reviews.problem)
        detail.recommended_fixes.push(reviews.fix)
      }
    } else if (reviews.claim === 'no_reviews_high_confidence') {
      detail.problems.push(reviews.problem)
      detail.recommended_fixes.push(reviews.fix)
    } else if (reviews.problem) {
      detail.problems.push(reviews.problem)
    }
  }

  const offerParts = [
    strengthFromBoolean(aggregated.pricing_signals?.length > 0),
    strengthFromBoolean(signals.has_service_categories || signals.has_product_categories),
    strengthFromBoolean(signals.has_niche_language),
    strengthFromCount((aggregated.products || []).length, { weak: 1, medium: 3, strong: 5 }),
  ]
  if (isContentSite) {
    const articlePages = pages.filter((p) =>
      /article|blog|recipe|post/i.test(String(p.page_type || '')),
    ).length
    offerParts.push(strengthFromCount(articlePages || (aggregated.content_signals?.article_count || 0), {
      weak: 1,
      medium: 3,
      strong: 6,
    }))
  }
  const offerStrength = combineStrengths(offerParts)
  const offerPts = pointsForStrength(offerStrength, 4)
  points += addBreakdown(
    'offer_clarity',
    isContentSite ? 'Niche / category / navigation clarity' : 'Offer / pricing / category clarity',
    offerPts,
    4,
    offerStrength !== 'none'
      ? isContentSite
        ? 'Readers can tell what the blog or content covers.'
        : 'Visitors can tell what you sell or offer.'
      : isContentSite
        ? 'Category and niche clarity is weak for new readers.'
        : 'Offer clarity is weak.',
  )
  if (offerPts > 0) {
    detail.strengths.push(
      isContentSite
        ? 'Categories or niche framing help readers understand what they will find.'
        : 'Offer, pricing, or service categories are clear enough to attract interest.',
    )
  } else {
    detail.problems.push(
      isContentSite
        ? 'New readers may not quickly see categories, search, or what the site is known for.'
        : 'Visitors may not quickly understand what you sell or who you help.',
    )
    detail.recommended_fixes.push(
      isContentSite
        ? 'Add clear category navigation, search, and a short homepage line for what the site covers.'
        : 'Clarify your offer, pricing, or service categories on the homepage.',
    )
  }

  const home = pages.find((p) => p.page_type === 'homepage') || pages[0]
  const homeData = pageData(home)
  const hasMeta = Boolean(home?.title || home?.meta_description || (homeData.headings?.h1 || []).length)
  const seoPts = hasMeta ? 2 : 0
  points += addBreakdown(
    'discoverability',
    'SEO title / meta / heading clarity',
    seoPts,
    2,
    hasMeta ? `Title: ${home?.title || 'present'}` : 'Missing clear title/meta.',
  )
  if (seoPts > 0) {
    detail.strengths.push('SEO title, meta, or heading clarify what visitors will find.')
  } else {
    detail.problems.push('Weak SEO title/meta/heading clarity for search visitors.')
  }

  const audienceStrength = combineStrengths([
    strengthFromBoolean(signals.has_service_area || signals.has_local_city),
    strengthFromCount((aggregated.social_channels || []).length, { weak: 1, medium: 2, strong: 3 }),
    strengthFromBoolean(aggregated.content_signals?.newsletter_indicators),
    strengthFromBoolean(signals.has_creator_links),
  ])
  const audiencePts = pointsForStrength(audienceStrength, 3)
  points += addBreakdown(
    'audience_reach',
    'Local relevance / social / newsletter path',
    audiencePts,
    3,
    audienceStrength !== 'none' ? 'Audience-building signals present.' : 'Limited audience reach signals.',
  )
  if (audiencePts > 0) {
    detail.strengths.push('Local relevance, social presence, or audience-building paths help attract customers.')
  } else {
    detail.problems.push('Limited signals that help the right audience find or follow the business.')
  }

  const contentDepth = aggregated.content_signals?.total_text_length || 0
  const visualDepth = Math.max(
    Number(uxFeatures?.above_fold_text_length) || 0,
    Number(uxFeatures?.signals?.visible_text_length) || 0,
    Number(uxFeatures?.visual_evidence_summary?.visible_text_length) || 0,
  )
  const visualScore = Number(uxFeatures?.visual_score) || 0
  const visualBackedDepth = contentDepth < 400 && (visualDepth >= 200 || visualScore >= 70)
  const effectiveDepth = visualBackedDepth ? Math.max(contentDepth, 1200) : contentDepth
  const contentStrength =
    effectiveDepth > 3000 ? 'strong' : effectiveDepth > 1800 ? 'medium' : effectiveDepth > 700 ? 'weak' : 'none'
  const contentPts = pointsForStrength(contentStrength, 3)
  points += addBreakdown(
    'content_depth',
    visualBackedDepth ? 'Content depth (visual-backed; crawl HTML was thin)' : 'Content depth on crawled pages',
    contentPts,
    3,
    visualBackedDepth
      ? `Crawl extracted ${contentDepth} chars; visual audit supports richer rendered content (visual ${visualScore}/100).`
      : `${contentDepth} characters extracted.`,
  )
  if (contentPts > 0) {
    detail.strengths.push(
      visualBackedDepth
        ? 'Rendered page content looks substantial even when crawler HTML is sparse.'
        : 'Content depth gives visitors reasons to stay and learn more.',
    )
    if (visualBackedDepth) {
      detail.problems.push(
        'Crawler extracted little HTML text — improve server-rendered copy for SEO without treating the live site as empty.',
      )
    }
  } else {
    detail.problems.push('Thin homepage content gives visitors little reason to engage.')
  }

  const visualAppeal =
    (uxFeatures?.hero_heading?.has_hero_heading ? 1 : 0) +
    ((uxFeatures?.layout_fitted_image_count || 0) >= 2 ? 1 : 0) +
    ((uxFeatures?.visitor_appeal_index ?? uxFeatures?.visual_score ?? 0) >= 78 ? 1 : 0)
  const visualPts = visualAppeal >= 3 ? 2 : visualAppeal === 2 ? 1 : 0
  points += addBreakdown(
    'visual_first_impression',
    'Strong visual hook (bonus only when appeal is high)',
    visualPts,
    2,
    visualPts >= 2
      ? 'Hero, imagery, and visitor appeal support attraction.'
      : visualPts === 1
        ? 'Some visual appeal; penalties may still apply below.'
        : 'Weak visual hook — appearance penalties apply separately.',
  )
  if (visualPts >= 2) {
    detail.strengths.push('Strong first impression from hero clarity, imagery, and visitor appeal.')
  } else if (visualPts === 1) {
    detail.strengths.push('Visual presentation partially supports initial interest.')
  }

  const ctaStrength = isContentSite
    ? combineStrengths([
        strengthFromBoolean(aggregated.content_signals?.newsletter_indicators),
        strengthFromBoolean(signals.has_creator_links),
        strengthFromCount((aggregated.content_signals?.navigation_labels || []).length, {
          weak: 2,
          medium: 4,
          strong: 6,
        }),
      ])
    : combineStrengths([
        strengthFromBoolean(signals.has_quote_cta || signals.has_booking_cta || signals.has_add_to_cart),
        strengthFromBoolean(signals.has_phone || signals.has_contact_page),
      ])
  const ctaPts = pointsForStrength(ctaStrength, 1)
  points += addBreakdown(
    'action_path',
    isContentSite ? 'Subscribe / navigation path (minor factor)' : 'Contact / next-step path (minor factor)',
    ctaPts,
    1,
    ctaStrength !== 'none'
      ? isContentSite
        ? 'Readers can find categories or subscribe.'
        : 'A path exists when visitors are ready to act.'
      : isContentSite
        ? 'No clear subscribe or category navigation path.'
        : 'No clear action path.',
  )
  if (ctaPts > 0) {
    detail.strengths.push(
      isContentSite
        ? 'Category navigation or a subscribe path exists for readers.'
        : 'A contact or next-step path exists when visitors are ready to act.',
    )
  }

  const downsides = computeVisitorAppealDownsides(uxFeatures)
  const overflowAssessment = assessMobileOverflow({ uxFeatures })
  for (const penalty of downsides.items) {
    breakdown.push(penalty)
    detail.problems.push(`${penalty.label}: ${penalty.note}`)
    if (penalty.key === 'mobile_layout' && overflowAssessment.is_severe) {
      detail.recommended_fixes.push('Fix mobile CSS overflow and test on a narrow viewport.')
    } else if (penalty.key === 'misaligned_images') {
      detail.recommended_fixes.push('Align images to a consistent grid and crop to matching aspect ratios.')
    } else if (penalty.key === 'layout_cleanliness' || /clutter/i.test(penalty.label)) {
      detail.recommended_fixes.push('Simplify spacing and section structure so the page is easier to scan.')
    } else if (/readability|pleasantness/i.test(penalty.label)) {
      detail.recommended_fixes.push('Shorten paragraphs, improve contrast, and add subheadings for easier reading.')
    } else if (/appeal|polish|appearance/i.test(penalty.label)) {
      detail.recommended_fixes.push('Refresh hero imagery, spacing, and typography so the site feels modern and inviting.')
    }
  }
  if (downsides.total > 0) {
    points -= downsides.total
  }

  if (['online_plus_physical_service', 'local_service_business'].includes(rubric)) {
    if (!signals.has_phone && !signals.has_booking_cta && proofStrength === 'none') {
      points = Math.min(points, Math.round(max * 0.45))
      detail.problems.push('Service business lacks trust proof and an easy way to reach you.')
    }
  }

  if (rubric === 'ecommerce_store' && (aggregated.products || []).length === 0 && offerStrength === 'none') {
    points = Math.min(points, Math.round(max * 0.4))
    detail.problems.push('Ecommerce site lacks clear products or offer — hard to attract buyers.')
  }

  detail.point_breakdown = breakdown
  detail.score = points
  const confidence = crawlHealth.crawled >= 2 ? 78 : 50
  return finalizeCategory(detail, max, [confidence], rubric)
}

function buildScoringContext(aggregated, business, pages, options = {}) {
  const crawlHealth = inferCrawlHealth(pages, business?.store_url, options.crawlMeta || {})
  const signals = detectOperationalSignals(pages, aggregated)
  const uxFeatures =
    options.uxFeatures ??
    extractUxFeatures({
      visualAudit: options.visualAudit || null,
      pages,
      aggregated,
      businessModel: options.rubric || business?.business_model,
      signals,
    })

  return { crawlHealth, signals, uxFeatures }
}

module.exports = {
  scoreSafetyTrust,
  scoreTechnicalFunctionality,
  scoreUxUiVisual,
  scoreCustomerAttraction,
  scoreOfferBusinessFit,
  buildScoringContext,
  clamp,
}
