const CAP_RULES = [
  {
    id: 'unsafe_site_cap_30',
    cap: 30,
    test: (ctx) => ctx.safetyStatus === 'unsafe',
    reason: 'Google Safe Browsing flagged this site as unsafe, so the overall score is capped at 30.',
  },
  {
    id: 'homepage_failure_cap_40',
    cap: 40,
    test: (ctx) => !ctx.homepageOk,
    reason: 'The homepage did not load successfully, so the overall score is capped at 40.',
  },
  {
    id: 'no_readable_content_cap_45',
    cap: 45,
    test: (ctx) => ctx.noReadableContent,
    reason: 'Very little readable content was extracted, so the overall score is capped at 45.',
  },
  {
    id: 'business_model_mismatch_cap_65',
    cap: 65,
    test: (ctx) => ctx.severeBusinessMismatch,
    reason:
      'The selected business model badly mismatches what the crawler detected, so the overall score is capped at 65.',
  },
  {
    id: 'mobile_overflow_cap_70',
    cap: 70,
    test: (ctx) => ctx.severeMobileOverflow,
    reason: 'Severe mobile layout overflow was detected, so the overall score is capped at 70.',
  },
  {
    id: 'no_conversion_path_cap_75',
    cap: 75,
    test: (ctx) => ctx.noConversionPath,
    reason: 'No clear CTA, contact, or purchase path was found, so the overall score is capped at 75.',
  },
]

function applyScoreCaps(overallScore, context = {}) {
  const applied = []
  const reasons = []
  let capped = overallScore

  for (const rule of CAP_RULES) {
    if (!rule.test(context)) continue
    if (capped > rule.cap) {
      capped = rule.cap
    }
    applied.push(rule.id)
    reasons.push({ cap: rule.id, reason: rule.reason })
  }

  return { overall_score: capped, score_caps_applied: applied, cap_reasons: reasons }
}

function detectSevereBusinessMismatch(rubric, aggregated, mismatchWarnings = []) {
  if (!mismatchWarnings.length) return false
  const site = aggregated.site_classification?.classification || 'unknown'
  const severePairs = [
    { rubric: 'ecommerce_store', sites: ['marketplace'] },
    { rubric: 'local_service_business', sites: ['shopify_dtc', 'single_brand_ecommerce'] },
    { rubric: 'online_plus_physical_service', sites: ['shopify_dtc', 'single_brand_ecommerce'] },
    { rubric: 'content_business', sites: ['shopify_dtc', 'single_brand_ecommerce'] },
  ]
  return severePairs.some((pair) => pair.rubric === rubric && pair.sites.includes(site))
}

function detectNoConversionPath(signals, rubric) {
  const hasPath =
    signals.has_quote_cta ||
    signals.has_booking_cta ||
    signals.has_consultation ||
    signals.has_showroom ||
    signals.has_add_to_cart ||
    signals.has_phone ||
    signals.has_contact_page ||
    (rubric === 'content_business' && signals.has_creator_links)

  return !hasPath
}

module.exports = {
  CAP_RULES,
  applyScoreCaps,
  detectSevereBusinessMismatch,
  detectNoConversionPath,
}
