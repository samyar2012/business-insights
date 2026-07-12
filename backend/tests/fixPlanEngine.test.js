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
    assert.equal(ctaFix.title, 'Make the primary customer action clearer.')
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
    const trustFix = plan.find((item) => item.id === 'missing_contact_trust')

    assert.ok(trustFix, 'expected a missing_contact_trust fix to be generated')
    assert.equal(trustFix.title, 'Add stronger trust and proof signals.')
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
        problems: ['Images look misaligned across the homepage grid.'],
      }),
    }
    const uxFeatures = {
      readability_problems: [
        'Largest text block is 1284 characters and lacks section breaks.',
        'Hero text is dense: largest above-fold block is 910 characters.',
      ],
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
    assert.ok(denseScores.fix_plan.some((f) => f.id === 'mobile_readability'))
    assert.ok(!denseScores.fix_plan.some((f) => f.id === 'no_https'), 'HTTPS is fine on the dense-text site, so it should not appear')

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

  it('includes all four growth pillars in the roadmap', () => {
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
    const pillars = new Set(scores.growth_plan.map((item) => item.pillar))
    assert.deepEqual(
      [...pillars].sort(),
      ['acquire', 'convert', 'operate', 'retain'],
      'growth roadmap should explicitly cover all four growth pillars',
    )
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
})
