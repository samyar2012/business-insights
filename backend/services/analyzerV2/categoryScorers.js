const { unknownResult } = require('../safeBrowsingService')
const { inferCrawlHealth } = require('../priorityWebsiteScoring')
const { detectOperationalSignals } = require('../businessScoringRubrics')
const { extractUxFeatures, buildUxFeatureExplanations, mapVisualScoreToCategoryPoints } = require('../uxFeatureExtractor')
const { pointsForStrength, strengthFromBoolean, strengthFromCount, combineStrengths } = require('./signalStrength')
const { scoreOfferBusinessFit } = require('./businessModelRubrics')
const { CATEGORY_WEIGHTS } = require('./scoringWeights')

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
        `Layout balance ${layout}/100 — cluttered, misaligned, or hard to scan.`,
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
  const mobileOverflow = uxFeatures.signals?.horizontal_overflow_mobile
  if (overflowSeverity === 'major' || mobileOverflow) {
    addPenalty(
      'mobile_layout',
      'Mobile layout usability',
      overflowSeverity === 'major' ? 2 : 1,
      'Horizontal scrolling or overflow on mobile frustrates visitors.',
    )
  }

  const primaryNav = uxFeatures.primary_nav_link_count ?? uxFeatures.signals?.primary_nav_link_count
  if (Number.isFinite(primaryNav) && primaryNav > PRIMARY_NAV_OVERCROWD_THRESHOLD) {
    addPenalty(
      'nav_clutter',
      'Navigation clutter',
      1,
      `${primaryNav} primary nav links — too many choices above the fold.`,
    )
  }

  const misaligned = uxFeatures.misaligned_image_count ?? 0
  if (misaligned >= 3) {
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
    /overflow|crowd|clutter|outdated|unpolished|misaligned|dense|hard to scan|hard to read/i.test(note),
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

function finalizeCategory(detail, max, confidenceFactors = []) {
  detail.score = clamp(detail.score, max)
  detail.max = max
  const avgConfidence =
    confidenceFactors.length > 0
      ? Math.round(confidenceFactors.reduce((sum, value) => sum + value, 0) / confidenceFactors.length)
      : 55
  detail.confidence = Math.max(20, Math.min(100, avgConfidence))
  return detail
}

function scoreSafetyTrust({ aggregated, pages, safetyResult, crawlHealth, rubric }) {
  const max = CATEGORY_WEIGHTS.safety_trust
  const detail = emptyCategoryDetail(max)
  const result = safetyResult || unknownResult()
  const confidenceFactors = []
  let points = 0

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
    return finalizeCategory(detail, max, [result.configured ? 95 : 70])
  }

  if (result.status === 'safe') {
    points += 6
    detail.strengths.push('Google Safe Browsing reports no malware or phishing threats.')
    detail.evidence.push({ signal: 'safe_browsing', strength: 'strong', label: 'Safe Browsing', detail: result.message })
    confidenceFactors.push(95)
  } else {
    const partial = crawlHealth.homepageOk && aggregated.trust_signals?.https ? 3 : 1
    points += partial
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

  const hasEmail = (aggregated.contact_signals?.emails || []).length > 0
  const hasPhone = (aggregated.contact_signals?.phones || []).length > 0
  const contactStrength = combineStrengths([
    strengthFromBoolean(hasPhone, { strongWhen: true }),
    strengthFromBoolean(hasEmail),
  ])
  const contactPoints = pointsForStrength(contactStrength, 4)
  points += contactPoints
  if (contactStrength !== 'none') {
    detail.strengths.push('Contact information (phone or email) is discoverable.')
    detail.evidence.push({
      signal: 'contact',
      strength: contactStrength,
      label: 'Contact info',
      detail: `Phones=${hasPhone}, emails=${hasEmail}.`,
    })
  } else {
    detail.problems.push('No phone number or email found on crawled pages.')
    detail.recommended_fixes.push('Add phone and email in header, footer, and contact page.')
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

  const reviewStrength = strengthFromBoolean(aggregated.trust_signals?.review_indicators)
  points += pointsForStrength(reviewStrength, 3)
  if (reviewStrength !== 'none') {
    detail.strengths.push('Reviews or testimonials build visitor trust.')
    detail.evidence.push({ signal: 'reviews', strength: reviewStrength, label: 'Social proof', detail: 'Review language detected.' })
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
  return finalizeCategory(detail, max, confidenceFactors)
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
  if (meta.js_rendered_pages > 0) {
    detail.problems.push('Sparse or JS-rendered HTML reduced content extractability.')
    detail.recommended_fixes.push('Serve key content in server-rendered HTML for crawlers and visitors.')
    points = Math.max(0, points - 2)
    confidenceFactors.push(45)
  } else {
    confidenceFactors.push(75)
  }

  const textLen = aggregated.content_signals?.total_text_length || 0
  if (textLen >= 1500) {
    points += 2
    detail.strengths.push('Enough readable content extracted for analysis.')
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
  return finalizeCategory(detail, max, confidenceFactors)
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
    for (const problem of features.readability_problems.slice(0, 2)) {
      detail.problems.push(problem)
    }
  }
  if ((features.readability_strengths || []).length) {
    detail.strengths.push(features.readability_strengths[0])
  }

  const mobileOverflow =
    features.signals?.horizontal_overflow_mobile ||
    features.signals?.overflow_severity_mobile === 'major' ||
    features.layout_balance_score < 55
  if (mobileOverflow) {
    detail.problems.push('Mobile layout overflow or horizontal scrolling detected.')
    detail.recommended_fixes.push('Fix mobile CSS overflow and test on a narrow viewport.')
  }

  if ((features.primary_nav_link_count || features.nav_link_count || 0) > 6) {
    detail.problems.push('Top navigation has many primary links and may feel overcrowded.')
  } else if ((features.nav_visibility_score || 0) >= 70) {
    detail.strengths.push('Top-level navigation is visible and readable.')
  }

  if ((features.layout_problems || []).length) {
    detail.problems.push(features.layout_problems[0])
  }
  if ((features.layout_strengths || []).length) {
    detail.strengths.push(features.layout_strengths[0])
  }

  for (const reason of buildUxFeatureExplanations(features).slice(0, 3)) {
    detail.evidence.push({ signal: 'ux_feature', strength: 'medium', label: 'UX signal', detail: reason })
  }

  detail.score = score
  const confidence = features.ux_confidence ?? (visualOk ? 88 : 52)
  return finalizeCategory(detail, max, [confidence])
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

  const proofStrength = combineStrengths([
    strengthFromBoolean(aggregated.trust_signals?.review_indicators),
    strengthFromBoolean(signals.has_testimonials),
  ])
  const proofPts = pointsForStrength(proofStrength, 3)
  points += addBreakdown(
    'trust_proof',
    'Trust proof (reviews/testimonials)',
    proofPts,
    3,
    proofStrength !== 'none' ? 'Review or testimonial language detected.' : 'No review proof found.',
  )
  if (proofPts > 0) {
    detail.strengths.push('Reviews or testimonials answer “why trust this business?”')
  } else {
    detail.problems.push('No testimonial or review proof visible to new visitors.')
    detail.recommended_fixes.push('Add reviews, ratings, or client testimonials near your main offer.')
  }

  const offerStrength = combineStrengths([
    strengthFromBoolean(aggregated.pricing_signals?.length > 0),
    strengthFromBoolean(signals.has_service_categories || signals.has_product_categories),
    strengthFromBoolean(signals.has_niche_language),
    strengthFromCount((aggregated.products || []).length, { weak: 1, medium: 3, strong: 5 }),
  ])
  const offerPts = pointsForStrength(offerStrength, 4)
  points += addBreakdown(
    'offer_clarity',
    'Offer / pricing / category clarity',
    offerPts,
    4,
    offerStrength !== 'none' ? 'Visitors can tell what you sell or offer.' : 'Offer clarity is weak.',
  )
  if (offerPts > 0) {
    detail.strengths.push('Offer, pricing, or service categories are clear enough to attract interest.')
  } else {
    detail.problems.push('Visitors may not quickly understand what you sell or who you help.')
    detail.recommended_fixes.push('Clarify your offer, pricing, or service categories on the homepage.')
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
  const contentStrength =
    contentDepth > 3000 ? 'strong' : contentDepth > 1800 ? 'medium' : contentDepth > 700 ? 'weak' : 'none'
  const contentPts = pointsForStrength(contentStrength, 3)
  points += addBreakdown(
    'content_depth',
    'Content depth on crawled pages',
    contentPts,
    3,
    `${contentDepth} characters extracted.`,
  )
  if (contentPts > 0) {
    detail.strengths.push('Content depth gives visitors reasons to stay and learn more.')
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

  const ctaStrength = combineStrengths([
    strengthFromBoolean(signals.has_quote_cta || signals.has_booking_cta || signals.has_add_to_cart),
    strengthFromBoolean(signals.has_phone || signals.has_contact_page),
  ])
  const ctaPts = pointsForStrength(ctaStrength, 1)
  points += addBreakdown(
    'action_path',
    'Contact / next-step path (minor factor)',
    ctaPts,
    1,
    ctaStrength !== 'none' ? 'A path exists when visitors are ready to act.' : 'No clear action path.',
  )
  if (ctaPts > 0) {
    detail.strengths.push('A contact or next-step path exists when visitors are ready to act.')
  }

  const downsides = computeVisitorAppealDownsides(uxFeatures)
  for (const penalty of downsides.items) {
    breakdown.push(penalty)
    detail.problems.push(`${penalty.label}: ${penalty.note}`)
    if (/layout|overflow|clutter|misaligned/i.test(penalty.label)) {
      detail.recommended_fixes.push('Simplify layout, fix mobile overflow, and align images to a clear grid.')
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
  return finalizeCategory(detail, max, [confidence])
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
