const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { extractPage } = require('../services/crawler/pageExtractor')
const { aggregatePages } = require('../services/businessProfileLogic')
const { calculateAnalyzerV2Scores } = require('../services/analyzerV2')
const {
  assessContactEvidence,
  assessReviewEvidence,
  assessMobileOverflow,
} = require('../services/analyzerV2/evidenceDetectors')
const { buildFixPlan, buildGrowthPlan } = require('../services/analyzerV2/fixPlanEngine')
const {
  normalizeFixesFromScores,
  buildFixMetadata,
  shouldIncludeFix,
} = require('../services/actionPlanFixBuilder')

const BASE = 'https://example-business.test'

function pageFromHtml(html, { pageType = 'homepage', path = '/' } = {}) {
  const url = `${BASE}${path}`
  const extracted = extractPage(html, url, 'example-business.test')
  return {
    page_type: pageType,
    status_code: 200,
    url,
    final_url: url,
    title: extracted.title,
    meta_description: extracted.meta_description,
    extracted_text: extracted.extracted_text,
    extracted_data_json: extracted.extracted_data_json,
  }
}

function analyzePages(pages, businessModel = 'local_service_business', visualAudit = null) {
  const aggregated = aggregatePages(pages)
  return calculateAnalyzerV2Scores(
    aggregated,
    { store_url: BASE, business_model: businessModel },
    pages,
    {
      safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
      crawlMeta: { homepage_fetch_ok: true, pages_crawled: pages.length, pages_discovered: pages.length },
      visualAudit: visualAudit || { ok: false, enabled: false, reason: 'skipped_for_unit_test' },
      includeBenchmark: false,
    },
  )
}

const SERVICE_VISIBLE_PHONE = `
<!doctype html><html><head><title>Local Plumbing Co</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>
<header><a href="tel:5551234567">Call (555) 123-4567</a>
<a href="/contact">Contact</a></header>
<main>
  <h1>Fast local plumbing</h1>
  <p>We repair leaks and install water heaters. Book a visit today.</p>
  <a href="/book">Schedule service</a>
</main>
<footer>Local Plumbing Co</footer>
</body></html>`

const SERVICE_FOOTER_ONLY_PHONE = `
<!doctype html><html><head><title>Yard Care Pros</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>
<header><nav><a href="/services">Services</a><a href="/about">About</a></nav></header>
<main>
  <h1>Lawn and landscaping</h1>
  <p>Weekly mowing and seasonal cleanups for homeowners.</p>
</main>
<footer>
  <p>Reach us at (555) 987-6543</p>
  <p>help@yardcare-example.test</p>
</footer>
</body></html>`

const SITE_WITH_TESTIMONIALS = `
<!doctype html><html><head><title>Studio Services</title>
<script type="application/ld+json">
{"@type":"LocalBusiness","aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"26"},
"review":[{"@type":"Review","reviewBody":"Excellent work and on time.","author":"Alex"}]}
</script>
</head><body>
<main>
  <h1>Design studio</h1>
  <section class="testimonials">
    <h2>What our customers say</h2>
    <blockquote>They delivered exactly what we needed. — Jordan</blockquote>
  </section>
  <p>Rated 4.8 / 5 stars by recent clients.</p>
</main>
</body></html>`

const SITE_NO_REVIEWS = `
<!doctype html><html><head><title>Plain Services</title></head><body>
<main>
  <h1>General consulting</h1>
  <p>We help small businesses with operations planning and process design.</p>
  <p>Please review our privacy policy before submitting forms.</p>
  <a href="/privacy">Privacy policy</a>
</main>
</body></html>`

const PAGE_NO_OVERFLOW_AUDIT = {
  ok: true,
  enabled: true,
  url: `${BASE}/`,
  summary: {
    horizontal_overflow_mobile: false,
    overflow_severity_mobile: 'none',
    overflow_px_mobile: 0,
    overflow_offenders_mobile: [],
    cta_above_fold: true,
    nav_above_fold: true,
  },
  mobile: {
    metrics: {
      horizontal_overflow: false,
      overflow_severity: 'none',
      overflow_px: 0,
      overflow_offenders: [],
      headings: [{ tag: 'h1', above_fold: true, text: 'Hello' }],
    },
  },
  desktop: { metrics: { horizontal_overflow: false, headings: [{ tag: 'h1', above_fold: true }] } },
}

const PAGE_REAL_OVERFLOW_AUDIT = {
  ok: true,
  enabled: true,
  url: `${BASE}/`,
  summary: {
    horizontal_overflow_mobile: true,
    overflow_severity_mobile: 'major',
    overflow_px_mobile: 160,
    overflow_offenders_mobile: [
      {
        selector: 'div.wide-banner',
        text: 'Promo strip',
        width_px: 550,
        issue_type: 'element_wider_than_viewport',
      },
    ],
    cta_above_fold: true,
    nav_above_fold: true,
  },
  mobile: {
    metrics: {
      horizontal_overflow: true,
      overflow_severity: 'major',
      overflow_px: 160,
      overflow_offenders: [
        {
          selector: 'div.wide-banner',
          text: 'Promo strip',
          width_px: 550,
          issue_type: 'element_wider_than_viewport',
        },
      ],
      headings: [{ tag: 'h1', above_fold: true, text: 'Hello' }],
    },
  },
  desktop: { metrics: { horizontal_overflow: false } },
}

describe('evidence-based analyzer: contact detection', () => {
  it('detects a visible header phone and does not claim no contact found', () => {
    const pages = [
      pageFromHtml(SERVICE_VISIBLE_PHONE),
      pageFromHtml(
        `<!doctype html><html><body><h1>About</h1><p>Family owned since 2010.</p></body></html>`,
        { pageType: 'about', path: '/about' },
      ),
    ]
    const extracted = pages[0].extracted_data_json
    assert.ok(extracted.phones.length > 0, 'extractor should find phone')
    assert.equal(extracted.has_tel, true)
    assert.ok(['header', 'hero', 'body'].includes(extracted.contact_placement))

    const scores = analyzePages(pages)
    const problems = [
      ...(scores.category_details.safety_trust.problems || []),
      ...(scores.category_details.customer_attraction.problems || []),
    ].join(' | ')
    assert.equal(/no phone|no contact found|have no way to reach/i.test(problems), false)
    assert.ok(
      scores.category_details.safety_trust.strengths.some((s) => /contact/i.test(s)),
      'should credit discoverable contact',
    )

    const growthTitles = (scores.growth_plan || []).map((f) => f.title).join(' | ')
    assert.equal(/add stronger trust and proof signals/i.test(growthTitles) && /no phone/i.test(growthTitles), false)
  })

  it('detects footer-only phone as weak placement, not missing contact', () => {
    const pages = [
      pageFromHtml(SERVICE_FOOTER_ONLY_PHONE),
      pageFromHtml(
        `<!doctype html><html><body><h1>Services</h1><p>Mowing, edging, and cleanups.</p></body></html>`,
        { pageType: 'services', path: '/services' },
      ),
    ]
    const contact = assessContactEvidence({
      pages,
      aggregated: aggregatePages(pages),
      signals: {},
    })
    assert.equal(contact.has_phone, true)
    assert.equal(contact.claim, 'contact_weak_placement')
    assert.notEqual(contact.claim, 'no_contact_high_confidence')
    assert.match(contact.problem, /more visible|hard for visitors to notice/i)

    const scores = analyzePages(pages)
    const problems = (scores.category_details.safety_trust.problems || []).join(' | ')
    assert.equal(/no phone, email, contact form/i.test(problems), false)
    if (problems) {
      assert.ok(/more visible|hard for visitors to notice|verify/i.test(problems) || problems.length === 0)
    }
  })

  it('only claims no contact with high confidence when nothing is found', () => {
    const pages = [
      pageFromHtml(
        `<!doctype html><html><body><h1>Brochure site</h1><p>We share articles about industry trends and tips.</p></body></html>`,
      ),
      pageFromHtml(
        `<!doctype html><html><body><h1>About</h1><p>Our team writes educational content for readers.</p></body></html>`,
        { pageType: 'about', path: '/about' },
      ),
      pageFromHtml(
        `<!doctype html><html><body><h1>Blog</h1><p>Another article with educational tips for readers.</p></body></html>`,
        { pageType: 'blog', path: '/blog' },
      ),
    ]
    const contact = assessContactEvidence({
      pages,
      aggregated: aggregatePages(pages),
      signals: {},
    })
    assert.equal(contact.has_any_contact_path, false)
    assert.ok(
      contact.claim === 'no_contact_high_confidence' || contact.claim === 'no_contact_low_confidence',
    )
    if (contact.claim === 'no_contact_high_confidence') {
      assert.match(contact.problem, /no phone, email, contact form/i)
    } else {
      assert.match(contact.problem, /not clearly detected/i)
    }
  })
})

describe('evidence-based analyzer: review detection', () => {
  it('detects testimonials and does not recommend add reviews', () => {
    const pages = [pageFromHtml(SITE_WITH_TESTIMONIALS)]
    const data = pages[0].extracted_data_json
    assert.equal(data.review_indicators, true)
    assert.ok(data.has_review_schema || data.has_testimonial_block)

    const reviews = assessReviewEvidence({
      pages,
      aggregated: aggregatePages(pages),
      signals: { has_testimonials: true },
    })
    assert.equal(reviews.has_reviews, true)
    assert.ok(reviews.strength === 'strong' || reviews.strength === 'medium')

    const scores = analyzePages(pages, 'local_service_business')
    const allProblems = Object.values(scores.category_details)
      .flatMap((d) => d.problems || [])
      .join(' | ')
    assert.equal(/no testimonial or review proof visible/i.test(allProblems), false)

    const actions = [
      ...(scores.fix_plan || []),
      ...(scores.growth_plan || []),
    ]
    const addReviews = actions.filter((a) =>
      /add reviews|add stronger trust.*review|no on-page reviews/i.test(`${a.title} ${a.action || ''} ${(a.steps || []).join(' ')}`),
    )
    // May still suggest better placement, but not absolute "add reviews because missing"
    for (const item of addReviews) {
      assert.equal(
        /no on-page reviews, testimonials, or rating markup was detected/i.test((item.evidence || []).join(' ')),
        false,
        'should not claim reviews are missing when proof exists',
      )
    }
  })

  it('does not treat privacy-policy "review" wording as social proof', () => {
    const pages = [pageFromHtml(SITE_NO_REVIEWS)]
    const data = pages[0].extracted_data_json
    assert.equal(data.has_review_schema, false)
    assert.equal(data.has_testimonial_block, false)

    const reviews = assessReviewEvidence({
      pages,
      aggregated: aggregatePages(pages),
      signals: {},
    })
    assert.ok(reviews.strength === 'none' || reviews.claim.startsWith('no_reviews'))
  })
})

describe('evidence-based analyzer: mobile overflow', () => {
  it('flags severe overflow with proof and can cap score', () => {
    const pages = [pageFromHtml(SERVICE_VISIBLE_PHONE)]
    const overflow = assessMobileOverflow({
      uxFeatures: {
        signals: {
          horizontal_overflow_mobile: true,
          overflow_severity_mobile: 'major',
          overflow_px_mobile: 160,
          overflow_offenders_mobile: PAGE_REAL_OVERFLOW_AUDIT.summary.overflow_offenders_mobile,
        },
      },
      visualAudit: PAGE_REAL_OVERFLOW_AUDIT,
    })
    assert.equal(overflow.is_severe, true)
    assert.equal(overflow.should_cap_score, true)
    assert.equal(overflow.confidence, 'high')
    assert.ok(overflow.proof.scroll_width_overflow_px === 160)
    assert.ok(overflow.proof.offenders.length >= 1)

    const scores = analyzePages(pages, 'local_service_business', PAGE_REAL_OVERFLOW_AUDIT)
    assert.ok(scores.score_caps_applied.includes('mobile_overflow_cap_70'))
    const uxProblems = scores.category_details.ux_ui_visual.problems.join(' | ')
    assert.match(uxProblems, /severe mobile layout overflow/i)
  })

  it('does not treat major overflow without offenders as a score cap or top fix', () => {
    const overflow = assessMobileOverflow({
      uxFeatures: {
        signals: {
          horizontal_overflow_mobile: true,
          overflow_severity_mobile: 'major',
          overflow_px_mobile: 160,
          overflow_offenders_mobile: [],
        },
      },
    })
    assert.equal(overflow.should_cap_score, false)
    assert.equal(overflow.should_top_fix, false)
    assert.equal(overflow.claim, 'possible_overflow')
    assert.equal(overflow.confidence, 'low')
  })

  it('uses rendered visual contact instead of claiming no phone found', () => {
    const pages = [
      pageFromHtml(`<!doctype html><html><body><h1>Service Co</h1><p>We install custom window treatments.</p>
<a href="/book">Book Now</a></body></html>`),
    ]
    const visualAudit = {
      ok: true,
      url: `${BASE}/`,
      summary: {
        contact_signals: {
          phones: ['310 923 1028'],
          emails: [],
          has_tel_link: false,
          has_mailto_link: false,
          has_text_phone: true,
          contact_cta_texts: ['Book Now'],
        },
        horizontal_overflow_mobile: false,
        overflow_severity_mobile: 'none',
      },
    }
    const contact = assessContactEvidence({
      pages,
      aggregated: aggregatePages(pages),
      signals: {},
      visualAudit,
    })
    assert.equal(contact.has_phone, true)
    assert.notEqual(contact.claim, 'no_contact_high_confidence')
    assert.ok(
      contact.claim === 'contact_weak_placement' || contact.claim === 'contact_visible',
      contact.claim,
    )
    if (contact.claim === 'contact_weak_placement') {
      assert.match(contact.fix, /clickable|more visible/i)
    }

    const scores = analyzePages(pages, 'online_plus_physical_service', visualAudit)
    const problems = [
      ...(scores.category_details.safety_trust.problems || []),
      ...(scores.category_details.offer_business_fit.problems || []),
    ].join(' | ')
    assert.equal(/no phone number or email found|no phone, email, contact form/i.test(problems), false)
    assert.equal(scores.score_caps_applied.includes('business_model_mismatch_cap_65'), false)

    for (const item of scores.growth_plan || []) {
      assert.ok(item.confidence, `growth item ${item.id} must have confidence`)
      assert.equal(
        /no phone number or email found/i.test(`${item.title} ${(item.evidence || []).join(' ')}`),
        false,
      )
    }
  })

  it('does not flag hybrid consultation businesses as severe model mismatch', () => {
    const pages = [
      pageFromHtml(`<!doctype html><html><body>
<header><a href="tel:8005551212">800-555-1212</a><a href="/consult">Free consultation</a></header>
<main><h1>Custom blinds</h1><p>Book Now for a free in-home consultation. 4.7 out of 5 based on 15,067 reviews.</p>
<a href="/products/roller-shades">Roller Shades</a></main></body></html>`),
    ]
    const aggregated = aggregatePages(pages)
    aggregated.platform = 'Shopify'
    aggregated.site_classification = { classification: 'shopify_dtc', confidence: 80 }
    aggregated.content_signals = {
      ...(aggregated.content_signals || {}),
      ctas: ['Book Now', 'Free consultation'],
    }
    const scores = calculateAnalyzerV2Scores(
      aggregated,
      { store_url: BASE, business_model: 'online_plus_physical_service' },
      pages,
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 1 },
        includeBenchmark: false,
      },
    )
    assert.equal(scores.score_caps_applied.includes('business_model_mismatch_cap_65'), false)
    assert.equal(
      (scores.growth_plan || []).some((i) => i.id === 'business_model_mismatch'),
      false,
    )
  })

  it('does not claim severe overflow when audit shows none', () => {
    const pages = [pageFromHtml(SERVICE_VISIBLE_PHONE)]
    const overflow = assessMobileOverflow({
      uxFeatures: {
        layout_balance_score: 40,
        signals: {
          horizontal_overflow_mobile: false,
          overflow_severity_mobile: 'none',
          overflow_px_mobile: 0,
        },
      },
      visualAudit: PAGE_NO_OVERFLOW_AUDIT,
    })
    assert.equal(overflow.is_severe, false)
    assert.equal(overflow.should_cap_score, false)
    assert.notEqual(overflow.claim, 'severe_overflow')

    const scores = analyzePages(pages, 'local_service_business', PAGE_NO_OVERFLOW_AUDIT)
    assert.equal(scores.score_caps_applied.includes('mobile_overflow_cap_70'), false)
    const uxProblems = (scores.category_details.ux_ui_visual.problems || []).join(' | ')
    assert.equal(/severe mobile layout overflow/i.test(uxProblems), false)
  })

  it('does not invent overflow roadmap actions when visual audit says no overflow', () => {
    const plan = buildFixPlan({
      categoryDetails: {
        safety_trust: { score: 18, max: 20, problems: [], evidence: [], strengths: [] },
        technical_functionality: { score: 14, max: 15, problems: [], evidence: [], strengths: [] },
        ux_ui_visual: {
          score: 12,
          max: 25,
          problems: ['Layout cleanliness: Layout balance 40/100 — sections feel crowded or poorly spaced.'],
          evidence: [],
          strengths: [],
        },
        offer_business_fit: { score: 16, max: 20, problems: [], evidence: [], strengths: [] },
        customer_attraction: {
          score: 10,
          max: 20,
          problems: ['Layout cleanliness: Layout balance 40/100 — sections feel crowded or poorly spaced.'],
          evidence: [],
          strengths: [],
          recommended_fixes: ['Simplify layout, fix mobile overflow, and align images to a clear grid.'],
        },
      },
      uxFeatures: {
        layout_balance_score: 40,
        signals: {
          horizontal_overflow_mobile: false,
          overflow_severity_mobile: 'none',
          overflow_px_mobile: 0,
          overflow_offenders_mobile: [],
        },
        visual_evidence_summary: { misalignment_confidence: 0 },
      },
      capReasons: [],
      rubric: 'local_service_business',
      pages: [{ page_type: 'homepage', final_url: 'https://example-business.test/', title: 'Home' }],
      aggregated: { contact_signals: { phones: ['310 923 1028'], has_text_phone: true } },
    })
    assert.equal(plan.some((i) => /overflow/i.test(i.id) || /overflow/i.test(i.title)), false)
    assert.equal(plan.every((i) => i.confidence), true)
  })

  it('does not invent image-alignment actions when misalignment confidence is 0', () => {
    const plan = buildFixPlan({
      categoryDetails: {
        safety_trust: { score: 18, max: 20, problems: [], evidence: [], strengths: [] },
        technical_functionality: { score: 14, max: 15, problems: [], evidence: [], strengths: [] },
        ux_ui_visual: { score: 18, max: 25, problems: [], evidence: [], strengths: [] },
        offer_business_fit: { score: 16, max: 20, problems: [], evidence: [], strengths: [] },
        customer_attraction: {
          score: 12,
          max: 20,
          problems: ['Image alignment: 4 images look misaligned or poorly fitted to the layout.'],
          evidence: [],
          strengths: [],
        },
      },
      uxFeatures: {
        misaligned_image_count: 4,
        signals: { horizontal_overflow_mobile: false, overflow_severity_mobile: 'none' },
        visual_evidence_summary: { misalignment_confidence: 0 },
      },
      capReasons: [],
      rubric: 'ecommerce_store',
      pages: [],
      aggregated: {},
    })
    assert.equal(plan.some((i) => i.id === 'misaligned_images'), false)
  })
})

describe('evidence-based analyzer: roadmap gating', () => {
  it('does not create false add-reviews or no-contact roadmap items when proof exists', () => {
    const pages = [
      pageFromHtml(SERVICE_VISIBLE_PHONE.replace(
        '</main>',
        `<section class="testimonials"><h2>Customer reviews</h2><blockquote>Great service. — Sam</blockquote></section></main>`,
      )),
    ]
    const scores = analyzePages(pages)
    const normalized = normalizeFixesFromScores(scores)

    for (const fix of normalized) {
      const meta = buildFixMetadata(fix, { business_id: 'biz_1', scan_id: 'scan_1', scores })
      assert.ok(meta.why_it_matters, 'every roadmap action needs why_it_matters')
      assert.ok(Array.isArray(meta.steps) && meta.steps.length > 0, 'every roadmap action needs steps')
      assert.ok(meta.confidence, 'every roadmap action needs confidence')
      assert.ok(
        (meta.evidence && meta.evidence.length) || meta.evidence_snippet,
        'every roadmap action needs evidence',
      )
    }

    const falseContact = normalized.filter((f) =>
      /no phone number or email found|no phone, email, contact form/i.test(
        `${f.title} ${(f.evidence || []).join(' ')}`,
      ),
    )
    assert.equal(falseContact.length, 0, 'must not claim contact is missing when phone is present')

    const falseReviews = normalized.filter((f) =>
      /no on-page reviews, testimonials, or rating markup was detected|no testimonial or review proof visible/i.test(
        `${f.title} ${(f.evidence || []).join(' ')}`,
      ),
    )
    assert.equal(falseReviews.length, 0, 'must not claim reviews missing when testimonials exist')
  })

  it('skips roadmap fixes that lack evidence', () => {
    assert.equal(
      shouldIncludeFix({
        id: 'empty',
        title: 'Do something',
        why_it_matters: 'Because',
        steps: ['Step'],
        evidence: [],
        confidence: 'high',
      }),
      false,
    )
    assert.equal(
      shouldIncludeFix({
        id: 'ok',
        title: 'Fix overflow',
        why_it_matters: 'Breaks mobile',
        steps: ['Constrain width'],
        evidence: ['Overflow ~160px on homepage'],
        confidence: 'high',
        related_pages: [{ url: `${BASE}/` }],
      }),
      true,
    )
  })

  it('softens mobile overflow roadmap when confidence is low', () => {
    const plan = buildFixPlan({
      categoryDetails: {
        safety_trust: { score: 18, max: 20, problems: [], evidence: [], strengths: [] },
        technical_functionality: { score: 14, max: 15, problems: [], evidence: [], strengths: [] },
        ux_ui_visual: {
          score: 18,
          max: 25,
          problems: ['Possible mobile layout issue to verify (~40px overflow).'],
          evidence: [],
          strengths: [],
        },
        offer_business_fit: { score: 16, max: 20, problems: [], evidence: [], strengths: [] },
        customer_attraction: { score: 15, max: 20, problems: [], evidence: [], strengths: [] },
      },
      uxFeatures: {
        signals: {
          overflow_severity_mobile: 'minor',
          overflow_px_mobile: 40,
          horizontal_overflow_mobile: true,
        },
      },
      capReasons: [],
      rubric: 'local_service_business',
      pages: [{ page_type: 'homepage', final_url: `${BASE}/`, title: 'Home' }],
    })
    const severe = plan.find((i) => i.id === 'mobile_overflow')
    const soft = plan.find((i) => i.id === 'mobile_overflow_verify')
    assert.equal(severe, undefined)
    assert.ok(soft)
    assert.equal(soft.confidence, 'low')
    assert.match(soft.title, /verify/i)
  })

  it('growth retain loop does not fire when strong reviews exist', () => {
    const pages = [pageFromHtml(SITE_WITH_TESTIMONIALS)]
    const aggregated = aggregatePages(pages)
    const growth = buildGrowthPlan({
      categoryDetails: {
        safety_trust: {
          score: 16,
          max: 20,
          problems: [],
          strengths: ['Reviews or testimonials build visitor trust.'],
          evidence: [],
        },
        customer_attraction: { score: 14, max: 20, problems: [], strengths: [], evidence: [] },
        technical_functionality: { score: 13, max: 15, problems: [], strengths: [], evidence: [] },
        ux_ui_visual: { score: 18, max: 25, problems: [], strengths: [], evidence: [] },
        offer_business_fit: { score: 15, max: 20, problems: [], strengths: [], evidence: [] },
      },
      rubric: 'local_service_business',
      pages,
      aggregated,
      fixPlan: [],
    })
    assert.equal(
      growth.some((item) => item.id === 'retain_reviews_loop'),
      false,
      'should not push add-reviews retain loop when testimonials already exist',
    )
  })
})
