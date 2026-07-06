const {
  buildWebsiteBenchmark,
  getBenchmarkLevel,
  normalizeBusinessModel,
  BENCHMARK_TARGETS,
  buildGaps,
  isBenchmarkEnabled,
} = require('../websiteBenchmarkService')

const V2_SCORE_COLUMNS = [
  { key: 'safety_score', label: 'Safety & trust', max: 20 },
  { key: 'functionality_score', label: 'Technical functionality', max: 15 },
  { key: 'ux_ui_score', label: 'UX / UI & visual', max: 25 },
  { key: 'business_fit_score', label: 'Offer & business fit', max: 20 },
  { key: 'customer_attraction_score', label: 'Customer attraction', max: 20 },
]

function humanEquivalentFromOverall(overallScore) {
  return Math.round((overallScore / 5) * 10) / 10
}

function interpretBenchmarkLevel(humanScore) {
  const level = getBenchmarkLevel(humanScore)
  return {
    ...level,
    human_score: humanScore,
    is_average: humanScore >= 17 && humanScore < 18,
    is_below_average: humanScore >= 16 && humanScore < 17,
    is_major_issue: humanScore < 13 || level.id === 'major_issue',
    is_low: humanScore <= 15,
    is_strong: humanScore >= 18 && humanScore < 19,
    is_top: humanScore >= 19,
  }
}

function buildBenchmarkComparison({ business, scores, benchmarkRows, datasetPath } = {}) {
  const benchmark = buildWebsiteBenchmark({
    business,
    scores,
    benchmarkRows,
    datasetPath,
  })

  if (!benchmark.enabled) {
    return {
      enabled: false,
      reason: benchmark.reason,
      source_path: benchmark.source_path || null,
    }
  }

  const humanScore = benchmark.target_human_score
  const interpretation = interpretBenchmarkLevel(humanScore)
  const gaps = benchmark.gaps || buildGaps(humanScore)

  const comparisonNarrative = []
  comparisonNarrative.push(
    `Your site scores ${humanScore}/20 — classified as "${interpretation.label}".`,
  )

  if (humanScore < BENCHMARK_TARGETS.average) {
    comparisonNarrative.push(
      `${humanScore}/20 is below the average benchmark (${BENCHMARK_TARGETS.average}/20) — not "average" performance.`,
    )
  } else if (interpretation.is_average) {
    comparisonNarrative.push(`${BENCHMARK_TARGETS.average}/20 is the average benchmark reference level.`)
  }

  if (gaps.gap_to_strong > 0) {
    comparisonNarrative.push(
      `You are ${gaps.gap_to_strong} point(s) below strong competitors (${BENCHMARK_TARGETS.strong}/20). Study strong examples for above-fold clarity and CTA placement.`,
    )
  }

  if (gaps.gap_to_top > 0 && benchmark.top_examples?.length) {
    const top = benchmark.top_examples[0]
    comparisonNarrative.push(
      `Top benchmark example (${top?.human_score}/20): ${top?.url || 'see dataset'} — compare navigation density, imagery, and CTA visibility.`,
    )
  }

  if (benchmark.average_examples?.length) {
    comparisonNarrative.push(
      `Average examples (${BENCHMARK_TARGETS.average}/20) typically balance readable copy, visible nav, and one clear CTA.`,
    )
  }

  return {
    ...benchmark,
    scoring_version: 'business_insights_analyzer_v2',
    human_equivalent_score: humanScore,
    benchmark_interpretation: interpretation,
    gaps,
    gap_to_average: gaps.gap_to_average,
    gap_to_strong: gaps.gap_to_strong,
    gap_to_top: gaps.gap_to_top,
    score_columns: V2_SCORE_COLUMNS,
    comparison_narrative: comparisonNarrative,
    business_model_normalized: normalizeBusinessModel(business?.business_model || scores.scoring_rubric),
  }
}

module.exports = {
  V2_SCORE_COLUMNS,
  humanEquivalentFromOverall,
  interpretBenchmarkLevel,
  buildBenchmarkComparison,
  isBenchmarkEnabled,
}
