const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  parseCsv,
  normalizeTotalScore,
  toHumanEquivalentScore,
  getBenchmarkLevel,
  buildWebsiteBenchmark,
  buildGaps,
  humanBenchmarkToUxUiScore,
  mergeUxUiWithBenchmark,
  applyBenchmarkUxLayer,
  BENCHMARK_TARGETS,
  CRAWL_UX_WEIGHT,
  BENCHMARK_UX_WEIGHT,
} = require('../services/websiteBenchmarkService')

const benchmarkRows = [
  {
    url: 'https://elite.example',
    business_model: 'online_plus_physical',
    safety_score: '30',
    functionality_score: '20',
    ux_ui_score: '19',
    business_fit_score: '20',
    customer_attraction_score: '10',
    human_ux_score: '20',
  },
  {
    url: 'https://top.example',
    business_model: 'online_plus_physical',
    safety_score: '29',
    functionality_score: '19',
    ux_ui_score: '18',
    business_fit_score: '19',
    customer_attraction_score: '9',
    human_ux_score: '19',
  },
  {
    url: 'https://strong.example',
    business_model: 'online_plus_physical',
    safety_score: '27',
    functionality_score: '18',
    ux_ui_score: '17',
    business_fit_score: '18',
    customer_attraction_score: '8',
    human_ux_score: '18',
  },
  {
    url: 'https://average.example',
    business_model: 'online_plus_physical',
    safety_score: '24',
    functionality_score: '16',
    ux_ui_score: '15',
    business_fit_score: '16',
    customer_attraction_score: '7',
    human_ux_score: '17',
  },
  {
    url: 'https://below-average.example',
    business_model: 'online_plus_physical',
    safety_score: '22',
    functionality_score: '15',
    ux_ui_score: '14',
    business_fit_score: '15',
    customer_attraction_score: '6',
    human_ux_score: '16',
  },
  {
    url: 'https://low.example',
    business_model: 'online_plus_physical',
    safety_score: '20',
    functionality_score: '13',
    ux_ui_score: '12',
    business_fit_score: '13',
    customer_attraction_score: '5',
    human_ux_score: '15',
  },
  {
    url: 'https://major-issue.example',
    business_model: 'online_plus_physical',
    safety_score: '15',
    functionality_score: '10',
    ux_ui_score: '8',
    business_fit_score: '9',
    customer_attraction_score: '4',
    human_ux_score: '12',
  },
  {
    url: 'https://very-low.example',
    business_model: 'online_plus_physical',
    safety_score: '8',
    functionality_score: '8',
    ux_ui_score: '4',
    business_fit_score: '5',
    customer_attraction_score: '2',
    human_ux_score: '4',
  },
]

describe('websiteBenchmarkService benchmark levels', () => {
  it('maps human_ux_score levels using the strict 0-20 scale', () => {
    assert.equal(getBenchmarkLevel(20).id, 'elite')
    assert.equal(getBenchmarkLevel(19).id, 'very_strong')
    assert.equal(getBenchmarkLevel(18).id, 'strong')
    assert.equal(getBenchmarkLevel(17).id, 'average')
    assert.equal(getBenchmarkLevel(16).id, 'below_average')
    assert.equal(getBenchmarkLevel(15).id, 'low')
    assert.equal(getBenchmarkLevel(12).id, 'major_issue')
  })

  it('normalizes 0-20 human scores onto a 0-100 chart scale', () => {
    assert.equal(normalizeTotalScore({ human_ux_score: '16' }), 80)
    assert.equal(toHumanEquivalentScore({ human_ux_score: '16' }), 16)
  })

  it('calculates gaps against 17/18/19 benchmark targets', () => {
    assert.deepEqual(buildGaps(12.6), {
      gap_to_average: 4.4,
      gap_to_strong: 5.4,
      gap_to_top: 6.4,
    })
    assert.equal(BENCHMARK_TARGETS.average, 17)
    assert.equal(BENCHMARK_TARGETS.strong, 18)
    assert.equal(BENCHMARK_TARGETS.top, 19)
  })

  it('maps benchmark human score to conservative UX/UI target', () => {
    assert.equal(humanBenchmarkToUxUiScore(16), 15)
    assert.equal(humanBenchmarkToUxUiScore(16.8), 15)
    assert.equal(humanBenchmarkToUxUiScore(17), 17)
    assert.equal(humanBenchmarkToUxUiScore(12.6), 11)
  })

  it('blends crawl UX/UI with benchmark calibration at 70/30', () => {
    const merged = mergeUxUiWithBenchmark(18, 15)
    assert.equal(merged.finalScore, Math.round(18 * CRAWL_UX_WEIGHT + 15 * BENCHMARK_UX_WEIGHT))
    assert.equal(merged.benchmarkScore, 15)
    assert.equal(merged.usedBenchmark, true)
  })
})

describe('websiteBenchmarkService comparisons', () => {
  it('parses quoted CSV rows', () => {
    const rows = parseCsv('url,human_notes\nhttps://example.com,"good, clear CTA"\n')

    assert.equal(rows.length, 1)
    assert.equal(rows[0].human_notes, 'good, clear CTA')
  })

  it('does not label overall_score 63 as average', () => {
    const result = buildWebsiteBenchmark({
      business: { business_model: 'online_plus_physical' },
      scores: {
        overall_score: 63,
        safety_score: 15,
        functionality_score: 16,
        ux_ui_score: 12,
        business_fit_score: 12,
        customer_attraction_score: 8,
      },
      benchmarkRows,
    })

    assert.equal(result.enabled, true)
    assert.equal(result.target_human_score, 12.6)
    assert.equal(result.target_level_id, 'major_issue')
    assert.notEqual(result.target_level_id, 'average')
    assert.ok(result.gaps.gap_to_average > 0)
    assert.ok(
      result.explanations.some((item) =>
        item.includes('below the average benchmark level because it is under 17/20'),
      ),
    )
    assert.ok(result.explanations.some((item) => item.includes('Average benchmark sites score 17/20.')))
    assert.ok(result.explanations.some((item) => item.includes('Strong benchmark sites score 18/20.')))
    assert.ok(result.explanations.some((item) => item.includes('Top benchmark sites score 19-20/20.')))
  })

  it('groups benchmark examples by strict human score bands', () => {
    const result = buildWebsiteBenchmark({
      business: { business_model: 'online_plus_physical' },
      scores: {
        overall_score: 85,
        safety_score: 25,
        functionality_score: 18,
        ux_ui_score: 16,
        business_fit_score: 17,
        customer_attraction_score: 9,
      },
      benchmarkRows,
    })

    assert.equal(result.compared_count, 8)
    assert.equal(result.has_competitors, true)
    assert.equal(result.insufficient_competitors, false)
    assert.ok(result.average_examples.every((item) => item.human_score === 17))
    assert.ok(result.strong_examples.every((item) => item.human_score === 18))
    assert.ok(result.top_examples.every((item) => item.human_score >= 19))
    assert.ok(result.low_examples.every((item) => item.human_score <= 15))
    assert.ok(result.nearest_examples.every((item) => item.business_model === 'online_plus_physical_service'))
    assert.equal(result.benchmark_ux_ui_score, humanBenchmarkToUxUiScore(17))
  })

  it('warns when there are not enough same-business-model competitors', () => {
    const result = buildWebsiteBenchmark({
      business: { business_model: 'ecommerce_store' },
      scores: {
        overall_score: 80,
        safety_score: 25,
        functionality_score: 16,
        ux_ui_score: 14,
        business_fit_score: 15,
        customer_attraction_score: 10,
      },
      benchmarkRows,
    })

    assert.equal(result.insufficient_competitors, true)
    assert.equal(result.has_competitors, false)
    assert.equal(result.can_blend_ux, true)
    assert.equal(result.benchmark_ux_ui_score, humanBenchmarkToUxUiScore(16))
    assert.equal(result.nearest_examples.length, 0)
    assert.ok(result.competitor_data_needed.includes('ecommerce_store'))
  })

  it('applies benchmark UX blend to the live score payload', () => {
    const benchmark = buildWebsiteBenchmark({
      business: { business_model: 'online_plus_physical' },
      scores: {
        overall_score: 84,
        safety_score: 24,
        functionality_score: 16,
        ux_ui_score: 18,
        business_fit_score: 16,
        customer_attraction_score: 10,
      },
      benchmarkRows,
    })
    const payload = {
      overall_score: 84,
      safety_score: 24,
      functionality_score: 16,
      ux_ui_score: 18,
      business_fit_score: 16,
      customer_attraction_score: 10,
      crawl_ux_ui_score: 18,
      score_explanation: [],
    }

    applyBenchmarkUxLayer(payload, benchmark)
    assert.equal(payload.benchmark_ux_ui_score, humanBenchmarkToUxUiScore(16.8))
    assert.equal(payload.ux_ui_score, mergeUxUiWithBenchmark(18, payload.benchmark_ux_ui_score).finalScore)
    assert.equal(payload.ux_scoring_mode, 'crawl_plus_competitor_benchmark')
  })

  it('lowers inflated crawl UX/UI when benchmark calibration is applied', () => {
    const benchmark = buildWebsiteBenchmark({
      business: { business_model: 'online_plus_physical' },
      scores: {
        overall_score: 83,
        safety_score: 15,
        functionality_score: 20,
        ux_ui_score: 19,
        business_fit_score: 19,
        customer_attraction_score: 10,
      },
      benchmarkRows,
    })
    const payload = {
      overall_score: 83,
      safety_score: 15,
      functionality_score: 20,
      ux_ui_score: 19,
      business_fit_score: 19,
      customer_attraction_score: 10,
      crawl_ux_ui_score: 19,
      score_explanation: [],
    }

    applyBenchmarkUxLayer(payload, benchmark)
    assert.ok(payload.ux_ui_score < 19)
    assert.equal(payload.benchmark_ux_ui_score, 15)
    assert.equal(payload.overall_score, 82)
  })

  it('returns disabled when no current website score exists', () => {
    const result = buildWebsiteBenchmark({
      business: { business_model: 'online_plus_physical' },
      scores: {},
      benchmarkRows,
    })

    assert.equal(result.enabled, false)
    assert.equal(result.reason, 'Current website score is missing.')
  })
})
