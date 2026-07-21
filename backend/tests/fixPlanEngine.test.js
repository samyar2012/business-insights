const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { buildFixPlan } = require('../services/analyzerV2/fixPlanEngine')
const { buildEvidenceStrengths, buildEvidenceRisks } = require('../services/analyzerV2/evidenceNarrator')
const { calculateAnalyzerV2Scores } = require('../services/analyzerV2')

function categoryDetail(overrides = {}) {
  return {
    score: 10,
    max: 20,
    confidence: 70,
    strengths: [],
    problems: [],
    evidence: [],
    recommended_fixes: [],
    ...overrides,
  }
}

describe('fixPlanEngine unit clusters', () => {
  it('clusters dense mobile text into a single "improve mobile readability" fix, not one per point', () => {
    const categoryDetails = {
      safety_trust: categoryDetail({ score: 18, max: 20 }),
      technical_functionality: categoryDetail({ score: 13, max: 15 }),
      ux_ui_visual: categoryDetail({
        score: 12,
        max: 25,
        problems: [
          'Largest text block is 1284 characters and lacks section breaks.',
          'Hero text is dense: largest above-fold block is 910 characters.',
        ],
      }),
      offer_business_fit: categoryDetail({ score: 16, max: 20 }),
      customer_attraction: categoryDetail({ score: 15, max: 20 }),
    }
    const uxFeatures = {
      source: 'visual_audit+crawler',
      ux_scoring_inputs: { visual_audit_ok: true },
      readability_problems: [
        'Largest text block is 1284 characters and lacks section breaks.',
        'Hero text is dense: largest above-fold block is 910 characters.',
      ],
    }

    const plan = buildFixPlan({ categoryDetails, uxFeatures, capReasons: [], rubric: 'local_service_business', pages: [] })
    const readabilityFixes = plan.filter((item) => item.id === 'mobile_readability')

    assert.equal(readabilityFixes.length, 1, 'should bundle dense-text deductions into one fix, not two')
    const fix = readabilityFixes[0]
    assert.equal(fix.title, 'Improve mobile readability above the fold.')
    assert.ok(fix.evidence.length >= 1)
    assert.ok(fix.evidence.some((e) => /\d/.test(e)), 'evidence should carry real numbers from the crawl, not placeholders')
    assert.ok(fix.steps.length >= 3 && fix.steps.length <= 6)
    assert.ok(fix.affected_scores.includes('ux_ui_visual'))
    assert.ok(/pts/.test(fix.expected_score_lift))
    assert.ok(['critical', 'high', 'medium', 'low'].includes(fix.priority))
    assert.ok(['easy', 'medium', 'hard'].includes(fix.difficulty))
    assert.equal(fix.source, 'analyzer')
  })

  it('clusters a weak primary CTA into "make the primary customer action clearer"', () => {
    const categoryDetails = {
      safety_trust: categoryDetail({ score: 18, max: 20 }),
      technical_functionality: categoryDetail({ score: 14, max: 15 }),
      ux_ui_visual: categoryDetail({ score: 20, max: 25 }),
      offer_business_fit: categoryDetail({ score: 15, max: 20 }),
      customer_attraction: categoryDetail({
        score: 10,
        max: 20,
        problems: [],
        point_breakdown: [{ key: 'action_path', label: 'Contact / next-step path (minor factor)', earned: 0, max: 1, note: 'No clear action path.' }],
      }),
    }

    const plan = buildFixPlan({ categoryDetails, uxFeatures: {}, capReasons: [], rubric: 'ecommerce_store', pages: [] })
    const ctaFix = plan.find((item) => item.id === 'weak_cta')

    assert.ok(ctaFix, 'expected a weak_cta fix to be generated')
    assert.equal(ctaFix.title, 'Make the primary shop action impossible to miss')
    assert.ok(/buy/i.test(ctaFix.why_it_matters))
    assert.ok(ctaFix.steps.some((s) => /cart|shop/i.test(s)), 'ecommerce CTA steps should be business-model aware')
  })

  it('clusters missing contact/policy/review signals into "add stronger trust and proof signals"', () => {
    const categoryDetails = {
      safety_trust: categoryDetail({
        score: 6,
        max: 20,
        problems: ['No phone number or email found on crawled pages.', 'Expected ecommerce policies (shipping/returns/privacy) were not found.'],
      }),
      technical_functionality: categoryDetail({ score: 13, max: 15 }),
      ux_ui_visual: categoryDetail({ score: 20, max: 25 }),
      offer_business_fit: categoryDetail({ score: 15, max: 20 }),
      customer_attraction: categoryDetail({
        score: 12,
        max: 20,
        problems: ['No testimonial or review proof visible to new visitors.'],
      }),
    }

    const plan = buildFixPlan({ categoryDetails, uxFeatures: {}, capReasons: [], rubric: 'ecommerce_store', pages: [] })
    const trustFix = plan.find(
      (item) => item.id === 'missing_contact_trust' || item.id === 'ecommerce_checkout_trust',
    )

    assert.ok(trustFix, 'expected a consolidated trust fix to be generated')
    assert.match(
      trustFix.title,
      /Add the checkout trust signals shoppers expect|Add the trust signals shoppers check before they buy|Add stronger trust and proof signals/i,
    )
    assert.ok(trustFix.evidence.length >= 2, 'should combine multiple related evidence lines into one fix')
    assert.ok(trustFix.affected_scores.includes('safety_trust'))
  })

  it('does not create a task per point deducted — many small problems become few clustered fixes', () => {
    const categoryDetails = {
      safety_trust: categoryDetail({
        score: 4,
        max: 20,
        problems: [
          'HTTPS was not detected — visitors may see security warnings.',
          'No phone number or email found on crawled pages.',
          'Expected ecommerce policies (shipping/returns/privacy) were not found.',
          'Business name or identity is unclear from crawled content.',
        ],
      }),
      technical_functionality: categoryDetail({
        score: 4,
        max: 15,
        problems: ['Very little readable content on crawled pages.', 'No mobile viewport meta tag detected.'],
      }),
      ux_ui_visual: categoryDetail({ score: 10, max: 25, problems: ['Mobile layout overflow or horizontal scrolling detected.'] }),
      offer_business_fit: categoryDetail({ score: 5, max: 20, problems: ['No reliable product cards, catalog layout, or shop navigation were found.'] }),
      customer_attraction: categoryDetail({
        score: 6,
        max: 20,
        problems: ['No testimonial or review proof visible to new visitors.', 'Weak SEO title/meta/heading clarity for search visitors.'],
      }),
    }

    const totalRawProblems = Object.values(categoryDetails).reduce((sum, d) => sum + (d.problems || []).length, 0)
    const plan = buildFixPlan({ categoryDetails, uxFeatures: {}, capReasons: [], rubric: 'ecommerce_store', pages: [] })

    assert.ok(totalRawProblems >= 9)
    assert.ok(plan.length < totalRawProblems, 'fix plan should cluster problems, not emit one item per point')
    assert.ok(plan.length <= 9)
    // Every raw problem should be represented as evidence in at least one fix.
    const allEvidence = plan.flatMap((item) => item.evidence)
    assert.ok(allEvidence.includes('HTTPS was not detected — visitors may see security warnings.'))
  })

  it('sequences fixes into "do this first, so it unlocks the next fix" waves instead of flat priority labels', () => {
    const categoryDetails = {
      safety_trust: categoryDetail({ score: 4, max: 20, problems: ['HTTPS was not detected — visitors may see security warnings.'] }),
      technical_functionality: categoryDetail({ score: 13, max: 15 }),
      ux_ui_visual: categoryDetail({
        score: 10,
        max: 25,
        problems: [
          'Largest text block is 1284 characters and lacks section breaks.',
          'Hero text is dense: largest above-fold block is 910 characters.',
        ],
      }),
      offer_business_fit: categoryDetail({ score: 16, max: 20 }),
      customer_attraction: categoryDetail({
        score: 15,
        max: 20,
        problems: ['Image alignment: 4 images look misaligned or poorly fitted to the layout.'],
      }),
    }
    const uxFeatures = {
      source: 'visual_audit+crawler',
      ux_scoring_inputs: { visual_audit_ok: true },
      readability_problems: [
        'Largest text block is 1284 characters and lacks section breaks.',
        'Hero text is dense: largest above-fold block is 910 characters.',
      ],
      visual_evidence_summary: { misalignment_confidence: 0.8 },
      signals: { misalignment_confidence: 0.8 },
    }

    const plan = buildFixPlan({ categoryDetails, uxFeatures, capReasons: [], rubric: 'ecommerce_store', pages: [] })
    const httpsIndex = plan.findIndex((item) => item.id === 'no_https')
    const readabilityIndex = plan.findIndex((item) => item.id === 'mobile_readability')
    const imagesIndex = plan.findIndex((item) => item.id === 'misaligned_images')

    assert.ok(httpsIndex >= 0 && readabilityIndex >= 0 && imagesIndex >= 0)
    // Security comes before mobile readability, which comes before visual polish — each wave
    // unlocks the next one instead of a flat "critical/high/medium" ranking.
    assert.ok(httpsIndex < readabilityIndex, 'HTTPS fix should be sequenced before mobile readability')
    assert.ok(readabilityIndex < imagesIndex, 'mobile readability should be sequenced before visual polish')

    assert.equal(plan[0].rank, 1)
    assert.ok(/do this first/i.test(plan[0].unlock_reason), 'first fix should read as "do this first"')
    for (const item of plan) {
      assert.ok(typeof item.unlock_reason === 'string' && item.unlock_reason.length > 10)
      assert.ok(!/^(critical|high|medium|low)$/i.test(item.unlock_reason.trim()))
      assert.ok(item.confidence, `expected confidence on ${item.id}`)
    }
  })

  it('never lets internal ops/config strings (API keys, env vars) leak into evidence or steps', () => {
    const categoryDetails = {
      safety_trust: categoryDetail({
        score: 10,
        max: 20,
        problems: ['Google Safe Browsing is not configured — safety confidence is reduced.'],
        recommended_fixes: ['Configure GOOGLE_SAFE_BROWSING_API_KEY for live threat verification.'],
      }),
      technical_functionality: categoryDetail({ score: 13, max: 15 }),
      ux_ui_visual: categoryDetail({ score: 20, max: 25 }),
      offer_business_fit: categoryDetail({ score: 16, max: 20 }),
      customer_attraction: categoryDetail({ score: 15, max: 20 }),
    }

    const plan = buildFixPlan({ categoryDetails, uxFeatures: {}, capReasons: [], rubric: 'ecommerce_store', pages: [] })
    const allText = plan.flatMap((item) => [
      ...item.evidence,
      ...item.steps,
      item.title,
      item.why_it_matters,
      item.research_basis,
    ])
    assert.ok(
      allText.every((text) => !text || !/API_KEY|process\.env/i.test(text)),
      'no fix-plan text should reference internal API keys or env vars — the business owner cannot act on those',
    )
  })

  it('grounds each fix in attributed UX/conversion research that varies by business model, not a flat generic label', () => {
    const trustCategoryDetails = {
      safety_trust: categoryDetail({
        score: 6,
        max: 20,
        problems: ['No phone number or email found on crawled pages.'],
      }),
      technical_functionality: categoryDetail({ score: 13, max: 15 }),
      ux_ui_visual: categoryDetail({ score: 20, max: 25 }),
      offer_business_fit: categoryDetail({ score: 15, max: 20 }),
      customer_attraction: categoryDetail({ score: 12, max: 20 }),
    }

    const ecommercePlan = buildFixPlan({
      categoryDetails: trustCategoryDetails,
      uxFeatures: {},
      capReasons: [],
      rubric: 'ecommerce_store',
      pages: [],
    })
    const servicePlan = buildFixPlan({
      categoryDetails: trustCategoryDetails,
      uxFeatures: {},
      capReasons: [],
      rubric: 'local_service_business',
      pages: [],
    })

    const ecommerceTrust = ecommercePlan.find((item) => item.id === 'missing_contact_trust')
    const serviceTrust = servicePlan.find((item) => item.id === 'missing_contact_trust')

    assert.ok(ecommerceTrust && serviceTrust, 'expected a trust fix for both business models')
    assert.ok(
      ecommerceTrust.research_basis && ecommerceTrust.research_basis.length > 30,
      'research basis should be a real, substantive sentence, not a label',
    )
    assert.ok(
      !/^(critical|high|medium|low)$/i.test(ecommerceTrust.research_basis.trim()),
      'research basis must not collapse into a bare priority label',
    )
    assert.notEqual(
      ecommerceTrust.research_basis,
      serviceTrust.research_basis,
      'the research grounding should differ between an ecommerce store and a local service business',
    )
    assert.ok(
      ecommerceTrust.steps.some((s) => /polic|checkout|badge/i.test(s)),
      'ecommerce trust steps should mention ecommerce-specific proof signals',
    )
    assert.ok(
      serviceTrust.steps.some((s) => /area|serve|phone/i.test(s)),
      'local service trust steps should mention area/phone-specific proof signals',
    )

    for (const item of [...ecommercePlan, ...servicePlan]) {
      if (item.research_basis) {
        assert.ok(!/^(critical|high|medium|low)$/i.test(item.research_basis.trim()))
      }
    }
  })

  it('every research basis names a real, verifiable source - no vague "research shows" hand-waving', () => {
    const categoryDetails = {
      safety_trust: categoryDetail({
        score: 4,
        max: 20,
        problems: [
          'HTTPS was not detected — visitors may see security warnings.',
          'No phone number or email found on crawled pages.',
        ],
      }),
      technical_functionality: categoryDetail({
        score: 4,
        max: 15,
        problems: ['Very little readable content on crawled pages.', 'No mobile viewport meta tag detected.'],
      }),
      ux_ui_visual: categoryDetail({
        score: 10,
        max: 25,
        problems: ['Mobile layout overflow or horizontal scrolling detected.'],
      }),
      offer_business_fit: categoryDetail({
        score: 5,
        max: 20,
        problems: ['No reliable product cards, catalog layout, or shop navigation were found.'],
      }),
      customer_attraction: categoryDetail({
        score: 6,
        max: 20,
        problems: [
          'No testimonial or review proof visible to new visitors.',
          'Weak SEO title/meta/heading clarity for search visitors.',
        ],
      }),
    }

    const plan = buildFixPlan({ categoryDetails, uxFeatures: {}, capReasons: [], rubric: 'ecommerce_store', pages: [] })
    const namedSource =
      /Baymard|Nielsen Norman|Stanford|Google|Think with Google|BrightLocal|Sistrix|Data & Marketing Association/

    for (const item of plan) {
      if (!item.research_basis) continue
      assert.ok(
        namedSource.test(item.research_basis),
        `research basis for ${item.id} must name a real, searchable source, got: "${item.research_basis}"`,
      )
      assert.ok(
        !/research (shows|consistently shows|finds)[^-]*$/i.test(item.research_basis) || namedSource.test(item.research_basis),
        `research basis for ${item.id} must not be unattributed hand-waving`,
      )
    }
    // The plan overall should carry concrete, verifiable numbers, not just prose.
    const withStats = plan.filter((item) => item.research_basis && /\d/.test(item.research_basis))
    assert.ok(withStats.length >= 2, 'at least two fixes should cite a concrete published number')
  })

  it('caps design/visual-polish fixes at one so the plan stays focused on attracting customers', () => {
    const categoryDetails = {
      safety_trust: categoryDetail({ score: 18, max: 20 }),
      technical_functionality: categoryDetail({ score: 13, max: 15 }),
      ux_ui_visual: categoryDetail({
        score: 12,
        max: 25,
        problems: ['Primary nav links look overcrowded above the fold.'],
      }),
      offer_business_fit: categoryDetail({ score: 16, max: 20 }),
      customer_attraction: categoryDetail({
        score: 8,
        max: 20,
        problems: [
          'Overall visual appeal drags down how easy it is to scan the page.',
          'Images look misaligned across the homepage grid.',
          'No testimonial or review proof visible to new visitors.',
        ],
      }),
    }

    const plan = buildFixPlan({ categoryDetails, uxFeatures: {}, capReasons: [], rubric: 'local_service_business', pages: [] })
    const designIds = new Set(['nav_clutter', 'visual_polish', 'misaligned_images'])
    const designFixes = plan.filter((item) => designIds.has(item.id))

    assert.ok(designFixes.length <= 1, `expected at most one design fix, got ${designFixes.map((f) => f.id).join(', ')}`)
    // The trust/proof fix (a customer-attraction fix) must still be present and ranked above design polish.
    const trustFix = plan.find((item) => item.id === 'missing_contact_trust')
    assert.ok(trustFix, 'customer-attraction trust fix should survive')
    if (designFixes.length === 1) {
      const designIndex = plan.findIndex((item) => designIds.has(item.id))
      const trustIndex = plan.findIndex((item) => item.id === 'missing_contact_trust')
      assert.ok(trustIndex < designIndex, 'trust/proof work should be sequenced before design polish')
    }
  })

  it('surfaces a benchmark-gap fix when the site trails same-model competitors', () => {
    const categoryDetails = {
      safety_trust: categoryDetail({ score: 18, max: 20 }),
      technical_functionality: categoryDetail({ score: 13, max: 15 }),
      ux_ui_visual: categoryDetail({ score: 14, max: 25 }),
      offer_business_fit: categoryDetail({ score: 16, max: 20 }),
      customer_attraction: categoryDetail({ score: 15, max: 20 }),
    }
    const benchmarkComparison = {
      enabled: true,
      gaps: { gap_to_average: 2.4, gap_to_strong: 3.4, gap_to_top: 4.4 },
      benchmark_average_human_score: 17,
      current_human_equivalent_score: 14.6,
      category_comparisons: [{ key: 'ux_ui_visual', label: 'UX / UI & visual quality', gap: 6 }],
      ux_improvement_actions: ['Simplify the hero section like top-performing competitors.'],
    }

    const plan = buildFixPlan({ categoryDetails, uxFeatures: {}, capReasons: [], rubric: 'ecommerce_store', pages: [], benchmarkComparison })
    const benchmarkFix = plan.find((item) => item.id === 'benchmark_gap')
    assert.ok(benchmarkFix)
    assert.ok(/gap/i.test(benchmarkFix.why_it_matters))
  })
})

describe('fixPlanEngine + evidenceNarrator integration via calculateAnalyzerV2Scores', () => {
  const trustGapAggregated = {
    products: [],
    product_names: [],
    high_confidence_products: [],
    social_channels: [],
    policy_signals: { shipping: false, returns: false, privacy: false, terms: false },
    trust_signals: { https: false, review_indicators: false, policy_count: 0 },
    content_signals: { total_text_length: 500, page_count: 1, ctas: [], navigation_labels: ['Home', 'About'] },
    platform: 'unknown',
    extraction_meta: { high_confidence_product_count: 0, has_reliable_product_cards: false, js_rendered_pages: 0 },
    site_classification: { classification: 'unknown', confidence: 30, indicators: [] },
    pricing_signals: [],
    services: [],
    contact_signals: { emails: [], phones: [] },
  }

  function trustGapPages() {
    return [
      {
        page_type: 'homepage',
        status_code: 200,
        title: 'Shop',
        extracted_text: 'Welcome to our store.',
        extracted_data_json: { headings: { h1: ['Welcome'] }, has_mobile_viewport: true, navigation_labels: ['Home', 'About'] },
      },
    ]
  }

  const denseMobileTextBlock = `Our team has been serving the community for many years and we take great pride in every single job we complete for every customer who trusts us with their home and their family and their budget and their schedule and their peace of mind, because we know that when something breaks or needs attention you want a company that shows up on time, explains what is wrong in plain language, gives you a fair price up front with no surprise fees later, uses quality parts that will not fail again in a few months, and stands behind the work with a real warranty you can call on if anything ever goes wrong after we leave your property, which is why so many neighbors keep recommending us to their friends and family every single year without us ever having to ask them to do it for us.`

  const denseServiceAggregated = {
    products: [],
    product_names: [],
    high_confidence_products: [],
    social_channels: ['https://instagram.com/localpro'],
    policy_signals: { shipping: false, returns: false, privacy: true, terms: false },
    trust_signals: { https: true, review_indicators: true, policy_count: 1 },
    content_signals: {
      total_text_length: 2400,
      page_count: 3,
      ctas: ['Book now', 'Get a quote'],
      navigation_labels: ['Services', 'Gallery', 'Contact'],
    },
    platform: 'WordPress',
    extraction_meta: { high_confidence_product_count: 0, js_rendered_pages: 0 },
    site_classification: { classification: 'service', confidence: 70, indicators: [] },
    pricing_signals: [],
    services: ['Repairs', 'Maintenance'],
    contact_signals: { emails: ['help@localpro.com'], phones: ['(555) 999-1234'] },
  }

  function denseServicePages() {
    return [
      {
        page_type: 'homepage',
        status_code: 200,
        title: 'Local Pro Services — Book today',
        extracted_text: `Book now. Get a quote. Call (555) 999-1234. ${denseMobileTextBlock}`,
        extracted_data_json: {
          headings: { h1: ['Local Pro Services'] },
          has_mobile_viewport: true,
          image_count: 4,
          ctas: ['Book now', 'Get a quote'],
          phones: ['(555) 999-1234'],
          navigation_labels: ['Services', 'Gallery', 'Contact'],
          review_indicators: true,
        },
      },
      {
        page_type: 'contact',
        status_code: 200,
        final_url: 'https://localpro.com/contact',
        extracted_text: 'Contact us',
        extracted_data_json: { phones: ['(555) 999-1234'], emails: ['help@localpro.com'] },
      },
    ]
  }

  it('produces different fix plans, strengths, and risks for two different sites', () => {
    const trustGapScores = calculateAnalyzerV2Scores(
      trustGapAggregated,
      { store_url: 'https://trustgap.example.com', business_model: 'ecommerce_store' },
      trustGapPages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 1, pages_discovered: 1 },
        includeBenchmark: false,
      },
    )

    const denseScores = calculateAnalyzerV2Scores(
      denseServiceAggregated,
      { store_url: 'https://localpro.example.com', business_model: 'local_service_business' },
      denseServicePages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 2, pages_discovered: 2 },
        includeBenchmark: false,
      },
    )

    // Different fix plan titles entirely.
    const trustGapTitles = new Set(trustGapScores.fix_plan.map((f) => f.title))
    const denseTitles = new Set(denseScores.fix_plan.map((f) => f.title))
    assert.notDeepEqual([...trustGapTitles], [...denseTitles])

    // Growth plans should also differ by business context.
    const trustGapGrowthTitles = new Set(trustGapScores.growth_plan.map((f) => f.title))
    const denseGrowthTitles = new Set(denseScores.growth_plan.map((f) => f.title))
    assert.notDeepEqual([...trustGapGrowthTitles], [...denseGrowthTitles])

    assert.ok(trustGapScores.fix_plan.some((f) => f.id === 'no_https' || f.id === 'missing_contact_trust'))
    // Crawler-only dense HTML must NOT invent above-fold mobile_readability without a rendered audit.
    assert.ok(
      !denseScores.fix_plan.some((f) => f.id === 'mobile_readability'),
      'static crawl density is not above-fold proof without visual audit',
    )
    assert.ok(!denseScores.fix_plan.some((f) => f.id === 'no_https'), 'HTTPS is fine on the dense-text site, so it should not appear')

    const denseWithVisual = calculateAnalyzerV2Scores(
      denseServiceAggregated,
      { store_url: 'https://localpro.example.com', business_model: 'local_service_business' },
      denseServicePages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 2, pages_discovered: 2 },
        includeBenchmark: false,
        visualAudit: {
          ok: true,
          enabled: true,
          summary: {
            avg_text_block_length: 821,
            max_text_block_length: 821,
            max_above_fold_text_block: 821,
            above_fold_text_length: 900,
            visible_text_length: 2400,
          },
          desktop: {
            metrics: {
              max_text_block_length: 821,
              max_above_fold_text_block: 821,
              above_fold_text_length: 900,
              section_count: 1,
              headings: [{ tag: 'h1', text: 'Local Pro Services', above_fold: true }],
            },
          },
          mobile: { metrics: { max_text_block_length: 821, section_count: 1 } },
        },
      },
    )
    assert.ok(
      denseWithVisual.fix_plan.some((f) => f.id === 'mobile_readability'),
      'rendered dense above-fold copy should create mobile_readability',
    )

    // Strengths/risks are also evidence-based and differ between sites.
    assert.notDeepEqual(trustGapScores.strengths, denseScores.strengths)
    assert.notDeepEqual(trustGapScores.risks, denseScores.risks)

    // Every fix plan item is fully-formed with the required evidence-based schema.
    for (const scores of [trustGapScores, denseScores]) {
      for (const fix of scores.fix_plan) {
        assert.ok(fix.title && fix.title.length > 5)
        assert.ok(fix.category)
        assert.ok(Array.isArray(fix.evidence))
        assert.ok(fix.why_it_matters && fix.why_it_matters.length > 20)
        assert.ok(Array.isArray(fix.steps) && fix.steps.length >= 3 && fix.steps.length <= 6)
        assert.ok(typeof fix.expected_score_lift === 'string' && fix.expected_score_lift.length > 0)
        assert.ok(Array.isArray(fix.affected_scores) && fix.affected_scores.length > 0)
        assert.ok(['critical', 'high', 'medium', 'low'].includes(fix.priority))
        assert.ok(['easy', 'medium', 'hard'].includes(fix.difficulty))
        assert.equal(fix.source, 'analyzer')
        assert.ok(typeof fix.unlock_reason === 'string' && fix.unlock_reason.length > 10)
        assert.ok(typeof fix.rank === 'number' && fix.rank >= 1)
      }

      for (const step of scores.growth_plan) {
        assert.ok(['acquire', 'convert', 'retain', 'operate'].includes(step.pillar))
        assert.ok(step.title && step.title.length > 5)
        assert.ok(step.why_it_matters && step.why_it_matters.length > 20)
        assert.ok(Array.isArray(step.steps) && step.steps.length >= 3)
        assert.ok(step.expected_business_outcome && step.expected_business_outcome.length > 20)
        assert.ok(typeof step.ask_ai_prompt === 'string' && step.ask_ai_prompt.length > 20)
        assert.ok(typeof step.rank === 'number' && step.rank >= 1)
        assert.ok(typeof step.unlock_reason === 'string' && step.unlock_reason.length > 10)
      }
    }
  })

  it('includes evidence-backed growth steps with confidence labels (no empty pillar filler)', () => {
    const scores = calculateAnalyzerV2Scores(
      trustGapAggregated,
      { store_url: 'https://trustgap.example.com', business_model: 'ecommerce_store' },
      trustGapPages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 1, pages_discovered: 1 },
        includeBenchmark: false,
      },
    )
    assert.ok(scores.growth_plan.length >= 1, 'expected at least one evidence-backed growth step')
    for (const item of scores.growth_plan) {
      assert.ok(item.confidence, `expected confidence on ${item.id}`)
      assert.ok(['high', 'medium', 'low'].includes(item.confidence), item.confidence)
      assert.equal(/^pillar_backfill_/i.test(item.id || ''), false)
      assert.ok(item.evidence?.length >= 1, `expected evidence on ${item.id}`)
    }
  })

  it('does not generate generic repeated roadmap todo items', () => {
    const scores = calculateAnalyzerV2Scores(
      denseServiceAggregated,
      { store_url: 'https://localpro.example.com', business_model: 'local_service_business' },
      denseServicePages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 2, pages_discovered: 2 },
        includeBenchmark: false,
      },
    )
    const titles = scores.growth_plan.map((item) => item.title.trim().toLowerCase())
    const uniqueTitles = new Set(titles)
    assert.equal(uniqueTitles.size, titles.length, 'growth roadmap titles should be unique')
    for (const item of scores.growth_plan) {
      assert.ok(item.evidence?.length >= 1, `expected evidence on ${item.id}`)
      assert.ok(
        !/^(improve ux|polish|medium impact|high impact|todo|generic improvement)$/i.test(item.title.trim()),
        `title should be concrete, got "${item.title}"`,
      )
    }
  })

  it('rewrites generic technical strengths into business-impact statements', () => {
    const scores = calculateAnalyzerV2Scores(
      denseServiceAggregated,
      { store_url: 'https://localpro.example.com', business_model: 'local_service_business' },
      denseServicePages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 2, pages_discovered: 2 },
        includeBenchmark: false,
      },
    )

    assert.ok(!scores.strengths.includes('Homepage loaded successfully.'), 'generic technical strength should be rewritten')
    assert.ok(
      scores.strengths.some((s) => /visitor|customer|conversion|trust/i.test(s)),
      'strengths should be framed around visitor/business impact',
    )
    assert.ok(scores.strengths.every((s) => s.length > 15), 'strengths should be full sentences, not bare labels')
  })

  it('never reduces risks to a bare priority label', () => {
    const scores = calculateAnalyzerV2Scores(
      trustGapAggregated,
      { store_url: 'https://trustgap.example.com', business_model: 'ecommerce_store' },
      trustGapPages(),
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 1, pages_discovered: 1 },
        includeBenchmark: false,
      },
    )

    assert.ok(scores.risks.length > 0)
    for (const risk of scores.risks) {
      assert.ok(risk.length > 15, `risk "${risk}" reads like a bare label, not an explanation`)
      assert.ok(!/^(critical|high|medium|low|high impact|medium impact|polish)\.?$/i.test(risk.trim()))
    }
  })
})

describe('evidenceNarrator', () => {
  it('keeps strengths that already contain impact language unchanged', () => {
    const out = buildEvidenceStrengths({
      offer_business_fit: categoryDetail({ strengths: ['Reviews or testimonials answer "why trust this business?"'] }),
    })
    assert.ok(out.includes('Reviews or testimonials answer "why trust this business?"'))
  })

  it('appends a business-impact clause to generic technical strengths', () => {
    const out = buildEvidenceStrengths({
      offer_business_fit: categoryDetail({ strengths: ['Product lines or shop categories explain what you sell.'] }),
    })
    assert.ok(out.some((s) => s.startsWith('Product lines or shop categories explain what you sell.') && s.length > 45))
  })

  it('falls back to "no major risks" only when nothing was found', () => {
    const out = buildEvidenceRisks({ safety_trust: categoryDetail() }, {}, [])
    assert.deepEqual(out, ['No major risks detected from this crawl.'])
  })

  it('does not claim Google Safe Browsing confirmation when the API was not configured', () => {
    const scores = calculateAnalyzerV2Scores(
      {
        products: [],
        trust_signals: { https: true, review_indicators: false, policy_count: 0 },
        content_signals: { total_text_length: 800, page_count: 1, ctas: [], navigation_labels: ['Home'] },
        contact_signals: { emails: [], phones: [] },
        policy_signals: {},
        social_channels: [],
        extraction_meta: {},
      },
      { store_url: 'https://example.com', business_model: 'content_business' },
      [
        {
          page_type: 'homepage',
          status_code: 200,
          title: 'Example',
          extracted_text: 'Research and articles about usability.',
          extracted_data_json: { headings: { h1: ['Example'] }, has_mobile_viewport: true },
        },
      ],
      {
        safetyResult: {
          status: 'unknown',
          configured: false,
          threats: [],
          message: 'Live safety verification is not configured.',
        },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 1, pages_discovered: 1 },
        includeBenchmark: false,
      },
    )
    const blob = [...(scores.strengths || []), ...(scores.risks || [])].join(' ')
    assert.ok(!/Google confirms/i.test(blob), 'must not overclaim Google Safe Browsing')
    assert.ok(
      scores.strengths.some((s) => /Safe Browsing was not configured|HTTPS and crawler security checks passed/i.test(s)),
      'should use HTTPS/crawl language when Safe Browsing is not configured',
    )
  })
})

describe('roadmap realism guards', () => {
  it('does not create mobile_readability from crawler-only density without visual audit', () => {
    const plan = buildFixPlan({
      categoryDetails: {
        safety_trust: categoryDetail({ score: 18, max: 20 }),
        technical_functionality: categoryDetail({ score: 13, max: 15 }),
        ux_ui_visual: categoryDetail({
          score: 12,
          max: 25,
          problems: ['Hero text is dense: largest above-fold block is 910 characters.'],
        }),
        offer_business_fit: categoryDetail({ score: 16, max: 20 }),
        customer_attraction: categoryDetail({ score: 15, max: 20 }),
      },
      uxFeatures: {
        source: 'crawler_static',
        readability_problems: ['Hero text is dense: largest above-fold block is 910 characters.'],
      },
      rubric: 'ecommerce_store',
      pages: [],
    })
    assert.ok(!plan.some((f) => f.id === 'mobile_readability'))
  })

  it('creates ecommerce catalog/checkout trust fixes from store evidence, not only UX polish', () => {
    const plan = buildFixPlan({
      categoryDetails: {
        safety_trust: categoryDetail({
          score: 12,
          max: 20,
          problems: ['No shipping or returns policy signals found.'],
        }),
        technical_functionality: categoryDetail({ score: 13, max: 15 }),
        ux_ui_visual: categoryDetail({ score: 18, max: 25 }),
        offer_business_fit: categoryDetail({
          score: 8,
          max: 20,
          problems: [
            'No reliable product cards, catalog layout, or shop navigation were found.',
            'No add-to-cart, buy now, or checkout path detected.',
            'No customer reviews or testimonials detected.',
          ],
        }),
        customer_attraction: categoryDetail({ score: 10, max: 20 }),
      },
      uxFeatures: { source: 'crawler_static' },
      rubric: 'ecommerce_store',
      pages: [],
    })
    const ids = plan.map((f) => f.id)
    assert.ok(
      ids.some((id) =>
        [
          'ecommerce_product_grid_clarity',
          'ecommerce_collection_navigation',
          'ecommerce_checkout_trust',
          'ecommerce_cart_path',
        ].includes(id),
      ),
    )
    assert.ok(ids.includes('ecommerce_checkout_trust') || ids.includes('ecommerce_product_grid_clarity'))
  })

  it('merges duplicate ecommerce checkout trust fixes into one item', () => {
    const plan = buildFixPlan({
      categoryDetails: {
        safety_trust: categoryDetail({
          score: 10,
          max: 20,
          problems: [
            'No shipping or returns policy signals found.',
            'No on-page reviews, testimonials, or rating markup was detected.',
          ],
        }),
        technical_functionality: categoryDetail({ score: 13, max: 15 }),
        ux_ui_visual: categoryDetail({ score: 18, max: 25 }),
        offer_business_fit: categoryDetail({
          score: 8,
          max: 20,
          problems: [
            'Expected ecommerce policies (shipping, returns, privacy) are missing.',
            'No customer reviews or testimonials detected.',
          ],
        }),
        customer_attraction: categoryDetail({ score: 10, max: 20 }),
      },
      uxFeatures: { source: 'crawler_static' },
      rubric: 'ecommerce_store',
      pages: [],
    })
    const trustFixes = plan.filter((item) =>
      ['ecommerce_checkout_trust', 'missing_contact_trust', 'strengthen_trust_visibility'].includes(item.id),
    )
    assert.equal(trustFixes.length, 1, 'Gymshark-like stores should not get duplicate trust fixes')
    assert.equal(trustFixes[0].id, 'ecommerce_checkout_trust')
    assert.equal(trustFixes[0].title, 'Add the checkout trust signals shoppers expect.')
    const titles = plan.map((item) => item.title)
    assert.equal(new Set(titles).size, titles.length, 'no duplicate fix titles')
  })

  it('prefers ecommerce catalog advice over generic nav/readability when store evidence exists', () => {
    const plan = buildFixPlan({
      categoryDetails: {
        safety_trust: categoryDetail({ score: 12, max: 20 }),
        technical_functionality: categoryDetail({ score: 13, max: 15 }),
        ux_ui_visual: categoryDetail({ score: 18, max: 25 }),
        offer_business_fit: categoryDetail({
          score: 8,
          max: 20,
          problems: [
            'No reliable product cards, catalog layout, or shop navigation were found.',
            'Product catalog layout detected from collections and product imagery.',
          ],
        }),
        customer_attraction: categoryDetail({ score: 10, max: 20 }),
      },
      uxFeatures: { source: 'crawler_static' },
      rubric: 'ecommerce_store',
      pages: [],
      aggregated: {
        content_signals: { ctas: ['Shop now', 'Browse collections'], navigation_labels: ['Shop', 'Collections'] },
      },
    })
    const ids = plan.map((item) => item.id)
    assert.ok(
      ids.some((id) =>
        ['ecommerce_product_grid_clarity', 'ecommerce_collection_navigation', 'ecommerce_cart_path'].includes(id),
      ),
      'should surface ecommerce-specific fixes',
    )
    assert.ok(!ids.includes('nav_clutter'))
  })

  it('does not create nav_clutter when primary nav count is modest', () => {
    const plan = buildFixPlan({
      categoryDetails: {
        safety_trust: categoryDetail({ score: 18, max: 20 }),
        technical_functionality: categoryDetail({ score: 13, max: 15 }),
        ux_ui_visual: categoryDetail({ score: 20, max: 25 }),
        offer_business_fit: categoryDetail({ score: 16, max: 20 }),
        customer_attraction: categoryDetail({ score: 15, max: 20 }),
      },
      uxFeatures: {
        source: 'visual_audit+crawler',
        ux_scoring_inputs: { visual_audit_ok: true, primary_nav_link_count: 5 },
        primary_nav_link_count: 5,
        nav_link_count: 52,
      },
      rubric: 'ecommerce_store',
      pages: [],
      aggregated: {
        content_signals: {
          navigation_labels: ['Home', 'Shop', 'Collections', 'About', 'Contact'],
        },
      },
    })
    assert.ok(!plan.some((item) => item.id === 'nav_clutter'))
  })

  it('recognizes About pages and article-like URLs for content sites', () => {
    const scores = calculateAnalyzerV2Scores(
      {
        products: [],
        trust_signals: { https: true, review_indicators: false, policy_count: 0 },
        content_signals: {
          total_text_length: 5000,
          page_count: 4,
          ctas: ['Subscribe'],
          navigation_labels: ['Articles', 'Topics', 'About', 'Newsletter'],
          newsletter_indicators: true,
        },
        contact_signals: { emails: ['hello@example.com'], phones: [] },
        policy_signals: { privacy: true },
        social_channels: ['https://twitter.com/example'],
        extraction_meta: {},
      },
      { store_url: 'https://www.nngroup.com', business_model: 'content_business' },
      [
        {
          page_type: 'homepage',
          status_code: 200,
          title: 'Nielsen Norman Group',
          extracted_text: 'UX research articles and reports. '.repeat(40),
          extracted_data_json: { headings: { h1: ['Nielsen Norman Group'] }, has_mobile_viewport: true },
        },
        {
          page_type: 'about',
          status_code: 200,
          final_url: 'https://www.nngroup.com/about/',
          extracted_text: 'About Nielsen Norman Group and our authors.',
          extracted_data_json: { headings: { h1: ['About'] } },
        },
        {
          page_type: 'blog',
          status_code: 200,
          final_url: 'https://www.nngroup.com/articles/usability-101/',
          extracted_text: 'Usability 101 article body. '.repeat(50),
          extracted_data_json: { headings: { h1: ['Usability 101'] } },
        },
      ],
      {
        safetyResult: { status: 'unknown', configured: false, threats: [], message: 'not configured' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 3, pages_discovered: 3 },
        includeBenchmark: false,
      },
    )
    const offerProblems = scores.category_details?.offer_business_fit?.problems || []
    assert.ok(!offerProblems.some((p) => /few article pages or posts/i.test(p)))
    assert.ok(!offerProblems.some((p) => /author\/about trust signals are missing/i.test(p)))
    const growthBlob = scores.growth_plan.map((g) => g.title).join(' ')
    assert.ok(!/recipe/i.test(growthBlob), 'content_business growth titles must not use recipe wording')
  })

  it('surfaces crawl_blocked when the site returns HTTP 403 / bot protection', () => {
    const scores = calculateAnalyzerV2Scores(
      {
        products: [],
        trust_signals: { https: true, review_indicators: false, policy_count: 0 },
        content_signals: { total_text_length: 20, page_count: 1, ctas: [], navigation_labels: [] },
        contact_signals: { emails: [], phones: [] },
        policy_signals: {},
        social_channels: [],
        extraction_meta: {},
      },
      { store_url: 'https://www.exploretock.com', business_model: 'local_service_business' },
      [
        {
          page_type: 'homepage',
          status_code: 403,
          bot_blocked: true,
          title: 'Forbidden',
          extracted_text: '',
          extracted_data_json: {},
        },
      ],
      {
        safetyResult: { status: 'unknown', configured: false, threats: [], message: 'not configured' },
        crawlMeta: { homepage_fetch_ok: false, pages_crawled: 0, pages_failed: 1, bot_blocked: true },
        includeBenchmark: false,
      },
    )
    assert.ok(
      (scores.category_details?.technical_functionality?.problems || []).some((p) =>
        /blocked automated crawling/i.test(p),
      ),
    )
    assert.ok(scores.fix_plan.some((f) => f.id === 'crawl_blocked'))
    assert.equal(
      scores.fix_plan.filter((f) => f.id !== 'crawl_blocked').length,
      0,
      'blocked crawls should not emit normal UX/business fixes',
    )
    assert.ok(scores.crawl_limitation?.crawl_blocked)
    assert.match(scores.crawl_limitation.user_message, /browser-based scan mode/i)
  })
})
