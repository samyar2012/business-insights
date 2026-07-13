/**
 * Evidence-gated detectors for contact, reviews, and mobile overflow.
 * Conservative: only emit absolute "missing" claims when confidence is high.
 * Domain-agnostic — no brand or URL hardcoding.
 */

const PHONE_TEXT_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b|(?:\+?\d{1,3}[\s.-]?)?\d{7,15}\b/
const PHONE_CONTEXT_RE = /(?:call(?:\s+us)?|phone|tel|text\s+us|reach\s+us)[:\s]/i
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

const CONTACT_CTA_RE =
  /\b(?:call(?:\s+us)?|contact\s+us|book(?:\s+(?:now|online|a|an|your))?|schedule(?:\s+a)?|(?:free\s+)?estimate|(?:get\s+a\s+)?quote|consultation|get\s+in\s+touch|reach\s+us|request\s+(?:a\s+)?(?:quote|estimate|callback)|speak\s+(?:with|to)|talk\s+to\s+us)\b/i

const CONTACT_LINK_RE = /contact|get[-_\s]?in[-_\s]?touch|reach[-_\s]?us|book|schedule|quote|estimate/i

const REVIEW_WIDGET_HOST_RE =
  /trustpilot|google\.com\/maps|g\.page|yelp\.com|facebook\.com\/.*reviews|birdeye|podium|grade\.us|sitejabber|resellerratings/i

const REVIEW_SCHEMA_TYPES = new Set([
  'review',
  'aggregaterating',
  'rating',
  'testimonial',
])

const FALSE_POSITIVE_REVIEW_RE =
  /review\s+(?:our|the)\s+(?:privacy|terms|policy|cookie)|policy\s+review|under\s+review|reviewed\s+by\s+(?:legal|compliance)/i

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

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null
  return digits
}

function extractPhonesFromText(text) {
  const found = new Set()
  const source = String(text || '')
  const matches = source.match(
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g,
  ) || []
  for (const m of matches) {
    const normalized = normalizePhone(m)
    if (normalized) found.add(m.trim())
  }
  if (!found.size && PHONE_CONTEXT_RE.test(source)) {
    const near = source.match(
      /(?:call(?:\s+us)?|phone|tel)[:\s]+([+\d().\s-]{7,20})/i,
    )
    if (near?.[1] && normalizePhone(near[1])) found.add(near[1].trim())
  }
  return [...found]
}

function assessContactEvidence({ pages = [], aggregated = {}, signals = {} } = {}) {
  const emails = new Set(aggregated.contact_signals?.emails || [])
  const phones = new Set(aggregated.contact_signals?.phones || [])
  const evidence = []
  const placements = new Set()
  let hasMailto = false
  let hasTel = false
  let hasTextPhone = false
  let hasContactForm = false
  let hasContactPageLink = false
  let hasContactCta = false
  let pagesWithContact = 0
  let crawlablePages = 0

  for (const page of pages) {
    const data = pageData(page)
    const url = page.final_url || page.url || null
    const text = page.extracted_text || ''
    if ((page.status_code || 200) >= 400) continue
    crawlablePages += 1

    let pageHasContact = false

    for (const email of data.emails || []) {
      emails.add(email)
      pageHasContact = true
      evidence.push({
        type: 'email',
        method: 'extracted',
        value: email,
        page_url: url,
        placement: data.contact_placement || 'unknown',
        confidence: 'high',
      })
    }
    for (const phone of data.phones || []) {
      phones.add(phone)
      pageHasContact = true
      evidence.push({
        type: 'phone',
        method: data.phone_methods?.includes?.('tel') ? 'tel_link' : 'extracted',
        value: phone,
        page_url: url,
        placement: data.contact_placement || 'unknown',
        confidence: 'high',
      })
    }

    if ((data.mailto_links || []).length || (data.emails || []).some(() => true)) {
      // mailto tracked via emails; flag presence of clickable mailto separately when provided
    }
    if (data.has_mailto) hasMailto = true
    if (data.has_tel) hasTel = true
    if (data.has_text_phone) hasTextPhone = true
    if (data.has_contact_form) {
      hasContactForm = true
      pageHasContact = true
      evidence.push({
        type: 'contact_form',
        method: 'form',
        page_url: url,
        placement: data.contact_placement || 'body',
        confidence: 'high',
      })
    }
    if (data.has_contact_page_link || page.page_type === 'contact') {
      hasContactPageLink = true
      pageHasContact = true
      evidence.push({
        type: 'contact_page',
        method: 'link_or_page',
        page_url: url,
        confidence: 'medium',
      })
    }
    if (data.has_contact_cta || (data.contact_ctas || []).length) {
      hasContactCta = true
      pageHasContact = true
      evidence.push({
        type: 'contact_cta',
        method: 'cta_text',
        value: (data.contact_ctas || [])[0] || null,
        page_url: url,
        confidence: 'medium',
      })
    }

    if (data.contact_placement) placements.add(data.contact_placement)

    // Fallback text scan when extractor did not enrich the page
    if (!pageHasContact) {
      const textPhones = extractPhonesFromText(text)
      for (const phone of textPhones) {
        phones.add(phone)
        hasTextPhone = true
        pageHasContact = true
        evidence.push({
          type: 'phone',
          method: 'text_regex',
          value: phone,
          page_url: url,
          placement: 'unknown',
          confidence: 'medium',
        })
      }
      const textEmails = text.match(EMAIL_RE) || []
      for (const email of textEmails.slice(0, 3)) {
        emails.add(email)
        pageHasContact = true
        evidence.push({
          type: 'email',
          method: 'text_regex',
          value: email,
          page_url: url,
          placement: 'unknown',
          confidence: 'medium',
        })
      }
      if (
        CONTACT_CTA_RE.test(text) &&
        !/\bno\s+contact\b|\bwithout\s+contact\b|\black(?:ing)?\s+contact\b/i.test(text)
      ) {
        hasContactCta = true
        pageHasContact = true
        evidence.push({
          type: 'contact_cta',
          method: 'text_regex',
          page_url: url,
          confidence: 'low',
        })
      }
    }

    if (pageHasContact) pagesWithContact += 1
  }

  if (signals.has_phone) hasTextPhone = true
  if (signals.has_contact_page) hasContactPageLink = true
  if (signals.has_contact_form) hasContactForm = true
  if (signals.has_quote_cta || signals.has_booking_cta || signals.has_consultation) {
    hasContactCta = true
  }

  const hasPhone = phones.size > 0 || hasTel || hasTextPhone || Boolean(signals.has_phone)
  const hasEmail = emails.size > 0 || hasMailto
  const hasDirectContact = hasPhone || hasEmail
  const hasAlternatePath = hasContactForm || hasContactPageLink || hasContactCta
  const hasAnyContactPath = hasDirectContact || hasAlternatePath

  const placementsList = [
    ...placements,
    ...((aggregated.contact_signals?.placements || []).filter(Boolean)),
  ]
  const uniquePlacements = [...new Set(placementsList.filter((p) => p && p !== 'unknown'))]
  const onlyFooter =
    hasDirectContact &&
    uniquePlacements.length > 0 &&
    uniquePlacements.every((p) => p === 'footer') &&
    !uniquePlacements.includes('header') &&
    !uniquePlacements.includes('hero')

  const weaklyPlaced =
    onlyFooter ||
    (hasAnyContactPath && !hasDirectContact && hasAlternatePath) ||
    (hasDirectContact &&
      !hasTel &&
      !hasMailto &&
      hasTextPhone &&
      onlyFooter)

  // High-confidence absence: enough crawl coverage, no contact path of any kind
  const crawlCoverageOk = crawlablePages >= 2 || (crawlablePages >= 1 && pagesWithContact === 0)
  const jsHeavy = (aggregated.extraction_meta?.js_rendered_pages || 0) >= Math.max(1, crawlablePages)
  const sparse = (aggregated.content_signals?.total_text_length || 0) < 400

  let absenceConfidence = 'low'
  if (!hasAnyContactPath && crawlCoverageOk && !jsHeavy && !sparse) {
    absenceConfidence = crawlablePages >= 3 ? 'high' : 'medium'
  } else if (!hasAnyContactPath) {
    absenceConfidence = 'low'
  } else if (weaklyPlaced) {
    absenceConfidence = 'none'
  } else {
    absenceConfidence = 'none'
  }

  let claim = 'contact_found'
  let problem = null
  let fix = null
  let strength = 'none'

  if (hasDirectContact && !weaklyPlaced) {
    claim = 'contact_visible'
    strength = hasTel || hasMailto ? 'strong' : 'medium'
  } else if (hasAnyContactPath && weaklyPlaced) {
    claim = 'contact_weak_placement'
    strength = 'weak'
    problem = 'Contact path exists but may be hard for visitors to notice.'
    fix = 'Make the contact path more visible in the header or above the fold (phone, email, or clear contact CTA).'
  } else if (hasAlternatePath && !hasDirectContact) {
    claim = 'contact_path_only'
    strength = 'weak'
    problem = 'A contact path exists (form, page, or CTA), but no phone or email was clearly detected.'
    fix = 'Add a visible phone number or email alongside your contact form or CTA.'
  } else if (!hasAnyContactPath && absenceConfidence === 'high') {
    claim = 'no_contact_high_confidence'
    strength = 'none'
    problem = 'No phone, email, contact form, or clear contact CTA was found across crawled pages.'
    fix = 'Add phone and email in the header and footer, plus a clear contact or booking CTA.'
  } else if (!hasAnyContactPath) {
    claim = 'no_contact_low_confidence'
    strength = 'none'
    // Soft wording — do not claim absolute absence
    problem = 'Contact details were not clearly detected in crawled HTML; verify phone, email, or a contact form are visible.'
    fix = 'Confirm visitors can easily find a phone number, email, or contact form on key pages.'
  }

  return {
    has_phone: hasPhone,
    has_email: hasEmail,
    has_mailto: hasMailto,
    has_tel: hasTel,
    has_text_phone: hasTextPhone,
    has_contact_form: hasContactForm,
    has_contact_page_link: hasContactPageLink,
    has_contact_cta: hasContactCta,
    has_direct_contact: hasDirectContact,
    has_any_contact_path: hasAnyContactPath,
    weakly_placed: weaklyPlaced,
    only_footer: onlyFooter,
    claim,
    problem,
    fix,
    strength,
    absence_confidence: absenceConfidence,
    phones: [...phones],
    emails: [...emails],
    evidence: evidence.slice(0, 12),
    pages_with_contact: pagesWithContact,
    crawlable_pages: crawlablePages,
  }
}

function detectReviewsInJsonLd(jsonLd) {
  const items = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const type = item['@type']
    const types = (Array.isArray(type) ? type : [type]).map((t) => String(t || '').toLowerCase())
    if (types.some((t) => REVIEW_SCHEMA_TYPES.has(t))) return true
    if (item.aggregateRating || item.reviewRating || item.review) return true
    if (Array.isArray(item['@graph']) && detectReviewsInJsonLd(item['@graph'])) return true
  }
  return false
}

function assessReviewEvidence({ pages = [], aggregated = {}, signals = {} } = {}) {
  const evidence = []
  let schemaHits = 0
  let widgetHits = 0
  let quoteBlockHits = 0
  let keywordHits = 0
  let starHits = 0

  for (const page of pages) {
    const data = pageData(page)
    const url = page.final_url || page.url || null
    const text = page.extracted_text || ''

    if (data.review_evidence) {
      for (const item of data.review_evidence) {
        evidence.push({ ...item, page_url: item.page_url || url })
      }
    }

    if (data.review_strength === 'strong' || data.has_review_schema) {
      schemaHits += 1
      evidence.push({ type: 'schema', method: 'json_ld', page_url: url, confidence: 'high' })
    }
    if (data.has_review_widget) {
      widgetHits += 1
      evidence.push({ type: 'widget', method: 'embed_or_host', page_url: url, confidence: 'high' })
    }
    if (data.has_testimonial_block) {
      quoteBlockHits += 1
      evidence.push({ type: 'testimonial_block', method: 'markup', page_url: url, confidence: 'high' })
    }
    if (data.has_star_rating) {
      starHits += 1
      evidence.push({ type: 'stars', method: 'markup_or_text', page_url: url, confidence: 'medium' })
    }

    if (detectReviewsInJsonLd(data.json_ld)) {
      schemaHits += 1
      evidence.push({ type: 'schema', method: 'json_ld_scan', page_url: url, confidence: 'high' })
    }

    const social = [...(data.social_links || []), ...(aggregated.social_channels || [])]
    if (social.some((link) => REVIEW_WIDGET_HOST_RE.test(String(link)))) {
      widgetHits += 1
      evidence.push({ type: 'widget', method: 'social_host', page_url: url, confidence: 'medium' })
    }

    if (FALSE_POSITIVE_REVIEW_RE.test(text)) {
      // ignore privacy-policy style "review" language
    } else if (
      /\b(?:testimonial|customer\s+review|client\s+review|what\s+our\s+customers\s+say|rated\s+\d|stars?\b|★|⭐)\b/i.test(
        text,
      )
    ) {
      keywordHits += 1
      evidence.push({ type: 'keyword', method: 'text', page_url: url, confidence: 'low' })
    } else if (/\breviews?\b/i.test(text) && !FALSE_POSITIVE_REVIEW_RE.test(text)) {
      keywordHits += 1
      evidence.push({ type: 'keyword', method: 'text_weak', page_url: url, confidence: 'low' })
    }
  }

  if (signals.has_testimonials) {
    quoteBlockHits += 1
    evidence.push({ type: 'signal', method: 'operational', confidence: 'medium' })
  }
  if (aggregated.trust_signals?.review_indicators && !schemaHits && !widgetHits && !quoteBlockHits) {
    keywordHits += 1
  }

  const strongProof = schemaHits > 0 || widgetHits > 0 || quoteBlockHits > 0
  const mediumProof = strongProof || starHits > 0 || keywordHits >= 2
  const weakProof = mediumProof || keywordHits >= 1 || Boolean(aggregated.trust_signals?.review_indicators)

  let strength = 'none'
  let claim = 'no_reviews'
  let problem = null
  let fix = null

  if (strongProof) {
    strength = 'strong'
    claim = 'reviews_present'
  } else if (starHits > 0 || keywordHits >= 2) {
    strength = 'medium'
    claim = 'reviews_present_weak'
    problem = 'Review or rating signals exist but may need clearer placement or source attribution.'
    fix = 'Move reviews or ratings near your main offer and name the source (Google, customers, etc.).'
  } else if (weakProof) {
    strength = 'weak'
    claim = 'reviews_keyword_only'
    problem = 'Possible review language was detected, but structured testimonials or ratings were not clearly found.'
    fix = 'Add clear customer testimonials or ratings with attribution near your primary offer.'
  } else {
    const crawlable = pages.filter((p) => (p.status_code || 200) < 400).length
    const sparse = (aggregated.content_signals?.total_text_length || 0) < 400
    const jsHeavy = (aggregated.extraction_meta?.js_rendered_pages || 0) >= Math.max(1, crawlable)
    if (crawlable >= 2 && !sparse && !jsHeavy) {
      claim = 'no_reviews_high_confidence'
      problem = 'No on-page reviews, testimonials, or rating markup was detected on crawled pages.'
      fix = 'Add reviews, ratings, or client testimonials near your main offer.'
    } else {
      claim = 'no_reviews_low_confidence'
      problem = 'Review or testimonial proof was not clearly detected; verify ratings or quotes are visible to visitors.'
      fix = 'Confirm customer reviews or testimonials appear near your main offer with clear attribution.'
    }
  }

  return {
    has_reviews: strength !== 'none',
    strength,
    claim,
    problem,
    fix,
    schema_hits: schemaHits,
    widget_hits: widgetHits,
    quote_block_hits: quoteBlockHits,
    keyword_hits: keywordHits,
    star_hits: starHits,
    evidence: evidence.slice(0, 12),
  }
}

function assessMobileOverflow({ uxFeatures = {}, visualAudit = null } = {}) {
  const signals = uxFeatures.signals || {}
  const summary = visualAudit?.summary || {}
  const mobileMetrics = visualAudit?.mobile?.metrics || {}

  const severity =
    signals.overflow_severity_mobile ||
    summary.overflow_severity_mobile ||
    mobileMetrics.overflow_severity ||
    'none'
  const overflowPx =
    signals.overflow_px_mobile ??
    summary.overflow_px_mobile ??
    mobileMetrics.overflow_px ??
    null
  const horizontal =
    severity === 'major' ||
    (signals.horizontal_overflow_mobile === true && severity !== 'none' && severity !== 'minor')

  const offenders =
    signals.overflow_offenders_mobile ||
    summary.overflow_offenders_mobile ||
    mobileMetrics.overflow_offenders ||
    []

  const pageUrl =
    visualAudit?.page_url ||
    visualAudit?.url ||
    uxFeatures.page_url ||
    null

  const viewport = { width: 390, height: 844 }
  const hasMeasuredOverflow =
    Number.isFinite(overflowPx) ||
    severity === 'major' ||
    severity === 'minor' ||
    Boolean(signals.horizontal_overflow_mobile) ||
    Boolean(summary.horizontal_overflow_mobile)

  const layoutOnlyWeak =
    !hasMeasuredOverflow &&
    uxFeatures.layout_balance_score != null &&
    uxFeatures.layout_balance_score < 55

  let confidence = 'none'
  let claim = 'no_overflow'
  let problem = null
  let fix = null

  const proof = {
    page_url: pageUrl,
    viewport,
    scroll_width_overflow_px: overflowPx,
    severity,
    issue_type: 'horizontal_overflow',
    offenders: (offenders || []).slice(0, 5),
    confidence: 'none',
  }

  if (severity === 'major' && (overflowPx == null || overflowPx > 80)) {
    confidence = offenders?.length ? 'high' : 'medium'
    claim = 'severe_overflow'
    problem = `Severe mobile layout overflow detected${overflowPx != null ? ` (~${Math.round(overflowPx)}px)` : ''}.`
    fix = 'Fix elements wider than the mobile viewport and retest at ~390px width.'
  } else if (severity === 'minor' || (signals.horizontal_overflow_mobile && severity !== 'major')) {
    confidence = 'low'
    claim = 'possible_overflow'
    problem = `Possible mobile layout issue to verify${overflowPx != null ? ` (~${Math.round(overflowPx)}px overflow)` : ''}.`
    fix = 'Check the homepage on a phone-width viewport and fix any element that forces horizontal scrolling.'
  } else if (layoutOnlyWeak) {
    confidence = 'low'
    claim = 'weak_layout_balance'
    // Intentionally NOT labeled as overflow
    problem = 'Layout balance looks weak on the audited page; verify spacing and alignment on mobile.'
    fix = 'Review mobile spacing and alignment; confirm there is no horizontal scrolling.'
  }

  proof.confidence = confidence

  return {
    claim,
    confidence,
    problem,
    fix,
    severity,
    overflow_px: overflowPx,
    is_severe: claim === 'severe_overflow',
    should_cap_score: claim === 'severe_overflow' && (confidence === 'high' || confidence === 'medium'),
    should_top_fix: claim === 'severe_overflow' && confidence !== 'low',
    proof,
  }
}

module.exports = {
  PHONE_TEXT_RE,
  CONTACT_CTA_RE,
  CONTACT_LINK_RE,
  extractPhonesFromText,
  normalizePhone,
  assessContactEvidence,
  assessReviewEvidence,
  assessMobileOverflow,
  detectReviewsInJsonLd,
  pageData,
}
