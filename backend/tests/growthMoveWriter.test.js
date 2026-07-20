const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  writeGrowthMovesDeterministic,
  writeGrowthMovesSync,
  mergeAiLanguage,
  VAGUE_TITLE_RE,
  toGrowthPlanItems,
} = require('../services/growthMoveWriterService')
const { buildGrowthPlan, buildFixPlan } = require('../services/analyzerV2/fixPlanEngine')
const { calculateAnalyzerV2Scores } = require('../services/analyzerV2')

function baseInput(overrides = {}) {
  return {
    business_name: 'LA Shades',
    business_model: 'local_service_business',
    website_url: 'https://la-shades.example.com',
    overall_score: 62,
    category_scores: {
      safety_trust: 14,
      technical_functionality: 12,
      ux_ui_visual: 16,
      offer_business_fit: 12,
      customer_attraction: 8,
    },
    risks: ['Visitors cannot quickly see how to book a consultation.'],
    strengths: ['Homepage loads and names the window-treatment service.'],
    growth_plan: [
      {
        id: 'weak_cta',
        title: 'Make the primary customer action clearer.',
        evidence: ['No clear action path.', 'No consultation, quote, shop, or contact CTA above the fold.'],
        why_it_matters: 'Visitors need one obvious next step or they leave without contacting the business.',
        steps: [
          'Add a "Book now" or "Get a quote" button above the fold.',
          'Show your phone number as a clickable link in the header.',
          'State the areas or cities you serve near the CTA for local trust.',
        ],
        affected_scores: ['customer_attraction', 'offer_business_fit'],
        confidence: 'high',
        priority: 'high',
        difficulty: 'easy',
        category: 'customer_attraction',
        pillar: 'convert',
      },
      {
        id: 'unclear_offer',
        title: 'Clarify your services and how customers book them.',
        evidence: ['Offer clarity is weak: visitors may not quickly understand what you sell.'],
        why_it_matters: 'Visitors who cannot tell what you sell leave for a clearer competitor.',
        steps: ['Name the core services in the first screen.', 'Explain how booking works in one short paragraph.'],
        affected_scores: ['offer_business_fit'],
        confidence: 'medium',
        priority: 'high',
        difficulty: 'medium',
        category: 'business_fit',
        pillar: 'convert',
      },
      {
        id: 'strengthen_trust_visibility',
        title: 'Strengthen trust signal visibility.',
        evidence: ['Review or rating signals exist but may need stronger placement near the offer.'],
        why_it_matters: 'Trust signals that are hard to notice still leave visitors unsure.',
        steps: [
          'Move your strongest review or testimonial near the primary offer above the fold.',
          'Name the source next to each quote or rating.',
        ],
        affected_scores: ['safety_trust', 'customer_attraction'],
        confidence: 'medium',
        priority: 'medium',
        difficulty: 'easy',
        category: 'trust',
        pillar: 'convert',
      },
      {
        id: 'visual_polish',
        title: 'Polish remaining layout and readability issues.',
        evidence: [
          'Unfinished template-builder layout (demo footer/placeholder content) hurts polish.',
          'Overall visual appeal / polish & modern feel deducted.',
        ],
        why_it_matters: 'A dated layout lowers trust before visitors read a word.',
        steps: ['Remove template builder footers and placeholder contact blocks.', 'Standardize spacing on the homepage.'],
        affected_scores: ['customer_attraction', 'ux_ui_visual'],
        confidence: 'medium',
        priority: 'medium',
        difficulty: 'medium',
        category: 'ux_ui',
        pillar: 'convert',
      },
      {
        id: 'weak_seo_meta',
        title: 'Strengthen SEO title, meta, and heading clarity.',
        evidence: ['Weak SEO title/meta/heading clarity.'],
        why_it_matters: 'Vague titles lower click-through from search.',
        steps: ['Rewrite the homepage title to name the service and city.'],
        affected_scores: ['customer_attraction'],
        confidence: 'medium',
        priority: 'low',
        difficulty: 'easy',
        category: 'seo',
        pillar: 'acquire',
      },
    ],
    ux_features: {
      visual_problems: ['Unfinished template-builder layout (demo footer/placeholder content) hurts polish.'],
      signals: { template_debt_signals: ['squarespace_template_footer', 'placeholder_demo_contact'] },
      visual_evidence_summary: {
        template_debt_signals: ['squarespace_template_footer', 'placeholder_demo_contact'],
      },
    },
    visual_evidence: {
      template_debt_signals: ['squarespace_template_footer', 'placeholder_demo_contact'],
    },
    analyzed_pages: [{ url: 'https://la-shades.example.com/', title: 'LA Shades', page_type: 'homepage' }],
    ...overrides,
  }
}

describe('growthMoveWriterService', () => {
  it('does not invent evidence — only uses analyzer-provided lines', () => {
    const input = baseInput()
    const known = new Set(
      input.growth_plan.flatMap((item) => item.evidence).concat(input.ux_features.visual_problems),
    )
    const result = writeGrowthMovesDeterministic(input)
    assert.ok(result.growth_moves.length >= 3)
    for (const move of result.growth_moves) {
      assert.ok(Array.isArray(move.evidence) && move.evidence.length >= 1)
      for (const line of move.evidence) {
        assert.ok(
          known.has(line) || /Template\/demo residue detected:/i.test(line),
          `invented evidence: ${line}`,
        )
      }
    }
  })

  it('rewrites generic fix titles into specific customer-facing growth moves', () => {
    const result = writeGrowthMovesDeterministic(baseInput())
    const titles = result.growth_moves.map((m) => m.title)
    assert.ok(titles.some((t) => /booking path obvious/i.test(t)))
    assert.ok(titles.some((t) => /understand the service in 5 seconds/i.test(t)))
    assert.ok(titles.some((t) => /trust details customers check before they book/i.test(t)))
    assert.ok(titles.some((t) => /template\/demo content/i.test(t)))
    for (const title of titles) {
      assert.equal(VAGUE_TITLE_RE.test(title), false, `vague title survived: ${title}`)
    }
  })

  it('limits primary moves to top 3', () => {
    const result = writeGrowthMovesSync(baseInput())
    assert.equal(result.primary_growth_moves.length, 3)
    assert.ok(result.secondary_growth_moves.length >= 1)
    assert.equal(result.growth_moves.filter((m) => m.tier === 'primary').length, 3)
    assert.ok(result.diagnosis.length > 40)
    assert.match(result.diagnosis, /LA Shades/)
  })

  it('does not generate pillar filler', () => {
    const result = writeGrowthMovesDeterministic({
      ...baseInput(),
      growth_plan: [
        ...baseInput().growth_plan,
        {
          id: 'pillar_backfill_retain',
          title: 'Launch a repeat-customer follow-up sequence.',
          evidence: ['This growth pillar has no explicit step yet, so add one to keep the roadmap balanced.'],
          why_it_matters: 'Retention creates compounding growth.',
          steps: ['Define one owner'],
          confidence: 'low',
          affected_scores: [],
        },
      ],
    })
    assert.ok(result.growth_moves.every((m) => !/^pillar_backfill_/i.test(m.id)))
    assert.ok(!result.growth_moves.some((m) => /pillar has no explicit step/i.test(m.evidence.join(' '))))
  })

  it('uses different move language for ecommerce vs local service', () => {
    const service = writeGrowthMovesDeterministic(baseInput())
    const store = writeGrowthMovesDeterministic(
      baseInput({
        business_name: 'Oak Supply Co',
        business_model: 'ecommerce_store',
        growth_plan: [
          {
            id: 'weak_cta',
            title: 'Make the primary customer action clearer.',
            evidence: ['No add-to-cart, buy now, or checkout path above the fold.'],
            why_it_matters: 'Shoppers bounce when they cannot buy.',
            steps: ['Add a persistent Shop now button above the fold.'],
            affected_scores: ['customer_attraction'],
            confidence: 'high',
            category: 'customer_attraction',
          },
          {
            id: 'unclear_offer',
            title: 'Clarify your product catalog and pricing.',
            evidence: ['Visitors may not quickly understand what you sell.'],
            why_it_matters: 'Unclear catalogs lose buyers.',
            steps: ['Name bestsellers and price ranges on the homepage.'],
            affected_scores: ['offer_business_fit'],
            confidence: 'medium',
            category: 'business_fit',
          },
        ],
      }),
    )

    const serviceCta = service.growth_moves.find((m) => m.id === 'weak_cta')
    const storeCta = store.growth_moves.find((m) => m.id === 'weak_cta')
    assert.ok(/book/i.test(serviceCta.title))
    assert.ok(/shop|cart|purchase/i.test(storeCta.title))
    assert.ok(/service/i.test(service.growth_moves.find((m) => m.id === 'unclear_offer').title))
    assert.ok(/sell|shoppers/i.test(store.growth_moves.find((m) => m.id === 'unclear_offer').title))
  })

  it('LA Shades-like service site gets booking, clarity, proof, and template moves', () => {
    const result = writeGrowthMovesDeterministic(baseInput())
    const blob = result.primary_growth_moves.map((m) => m.title).join(' | ')
    assert.match(blob, /booking path/i)
    assert.match(result.growth_moves.map((m) => m.title).join(' | '), /service in 5 seconds/i)
    assert.match(result.growth_moves.map((m) => m.title).join(' | '), /trust details customers check before they book/i)
    assert.match(result.growth_moves.map((m) => m.title).join(' | '), /template\/demo/i)

    const json = JSON.parse(JSON.stringify({
      diagnosis: result.diagnosis,
      growth_moves: result.growth_moves.map((m) => ({
        title: m.title,
        customer_problem: m.customer_problem,
        what_to_change: m.what_to_change,
        why_it_matters: m.why_it_matters,
        evidence: m.evidence,
        implementation_steps: m.implementation_steps,
        expected_outcome: m.expected_outcome,
        confidence: m.confidence,
        affected_scores: m.affected_scores,
        source_fix_ids: m.source_fix_ids,
      })),
    }))
    assert.ok(typeof json.diagnosis === 'string')
    assert.ok(Array.isArray(json.growth_moves))
    assert.ok(json.growth_moves[0].source_fix_ids.length >= 1)
  })

  it('rejects AI-invented evidence when merging custom model output', () => {
    const fallback = writeGrowthMovesDeterministic(baseInput())
    const merged = mergeAiLanguage(
      {
        diagnosis: 'LA Shades needs a clearer booking path and proof placement.',
        growth_moves: [
          {
            title: 'Make the booking path obvious before visitors scroll',
            evidence: ['Invented: missing 47 reviews on Google', 'No clear action path.'],
            customer_problem: 'People cannot book.',
            what_to_change: 'Add Book now in the header.',
            why_it_matters: 'Lost quotes.',
            implementation_steps: ['Add Book now'],
            expected_outcome: 'More calls',
            source_fix_ids: ['weak_cta'],
          },
        ],
      },
      fallback,
    )
    const move = merged.growth_moves.find((m) => m.id === 'weak_cta')
    assert.ok(!move.evidence.some((e) => /Invented/i.test(e)))
    assert.ok(move.evidence.includes('No clear action path.'))
  })

  it('fixPlanEngine no longer emits pillar_backfill via buildGrowthPlan', () => {
    const fixPlan = buildFixPlan({
      categoryDetails: {
        safety_trust: { score: 18, max: 20, problems: [], strengths: [], evidence: [] },
        technical_functionality: { score: 14, max: 15, problems: [], strengths: [], evidence: [] },
        ux_ui_visual: { score: 20, max: 25, problems: [], strengths: [], evidence: [] },
        offer_business_fit: { score: 16, max: 20, problems: [], strengths: [], evidence: [] },
        customer_attraction: {
          score: 10,
          max: 20,
          problems: [],
          strengths: [],
          evidence: [],
          point_breakdown: [
            {
              key: 'action_path',
              label: 'Contact path',
              earned: 0,
              max: 1,
              note: 'No consultation, quote, shop, or contact CTA above the fold.',
            },
          ],
        },
      },
      uxFeatures: {},
      rubric: 'local_service_business',
      pages: [],
      aggregated: {},
    })
    const plan = buildGrowthPlan({
      rubric: 'local_service_business',
      fixPlan,
      categoryDetails: {},
      aggregated: {},
    })
    assert.ok(plan.every((item) => !/^pillar_backfill_/i.test(item.id || '')))
    assert.equal(typeof buildGrowthPlan, 'function')
  })

  it('analyzer pipeline attaches growth diagnosis and primary moves', () => {
    const aggregated = {
      content_signals: {
        total_text_length: 900,
        ctas: [],
        headings: { h1: ['Custom Window Shades'] },
      },
      contact_signals: { phones: [], emails: [], has_tel: false, has_mailto: false },
      trust_signals: { review_indicators: false, policy_count: 0 },
      policy_signals: { policy_count: 0 },
      services: ['Custom shades', 'In-home consultation'],
      products: [],
      tech_signals: { https: true, has_viewport: true },
    }
    const pages = [
      {
        url: 'https://la-shades.example.com/',
        final_url: 'https://la-shades.example.com/',
        title: 'LA Shades',
        page_type: 'homepage',
        extracted_text:
          'Custom window shades and blinds. We install across Los Angeles. Made with Squarespace. Email us at email@example.com.',
        http_status: 200,
      },
    ]
    const scores = calculateAnalyzerV2Scores(
      aggregated,
      {
        business_name: 'LA Shades',
        store_url: 'https://la-shades.example.com/',
        business_model: 'local_service_business',
      },
      pages,
      {
        safetyResult: { status: 'safe', configured: true, threats: [], message: 'Safe.' },
        crawlMeta: { homepage_fetch_ok: true, pages_crawled: 1, pages_discovered: 1 },
        includeBenchmark: false,
        visualAudit: {
          enabled: true,
          ok: true,
          summary: {
            template_debt_signals: ['squarespace_template_footer', 'placeholder_demo_contact'],
            contact_signals: { phones: [], has_tel_link: false },
          },
        },
      },
    )

    assert.ok(scores.growth_diagnosis && scores.growth_diagnosis.length > 20)
    assert.ok(Array.isArray(scores.primary_growth_moves))
    assert.ok(scores.primary_growth_moves.length <= 3)
    assert.ok(scores.growth_moves.every((m) => !/^pillar_backfill_/i.test(m.id || '')))
    for (const move of scores.growth_plan.slice(0, 3)) {
      assert.equal(VAGUE_TITLE_RE.test(move.title), false, move.title)
    }
    const planItems = toGrowthPlanItems({ growth_moves: scores.growth_moves })
    assert.equal(planItems[0].source, 'growth_move_writer')
  })
})
