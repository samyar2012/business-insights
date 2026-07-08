const fs = require('node:fs')
const path = require('node:path')
const {
  resolveCanonicalBusinessModel,
  BUSINESS_MODEL_ALIASES,
} = require('./businessModelConfig')

const SCORE_COLUMNS = [
  { key: 'safety_score', label: 'Safety', max: 30 },
  { key: 'functionality_score', label: 'Functionality', max: 20 },
  { key: 'ux_ui_score', label: 'UX/UI', max: 20 },
  { key: 'business_fit_score', label: 'Business fit', max: 20 },
  { key: 'customer_attraction_score', label: 'Customer attraction', max: 10 },
]

const BENCHMARK_TARGETS = {
  average: 17,
  strong: 18,
  top: 19,
  elite: 20,
}

const LEVELS = [
  {
    id: 'elite',
    label: 'Elite benchmark',
    min: 20,
    explanation: 'Top benchmark sites score 19-20/20.',
  },
  {
    id: 'very_strong',
    label: 'Very strong benchmark',
    min: 19,
    explanation: 'Top benchmark sites score 19-20/20.',
  },
  {
    id: 'strong',
    label: 'Strong benchmark',
    min: 18,
    explanation: 'Strong benchmark sites score 18/20.',
  },
  {
    id: 'average',
    label: 'Average benchmark',
    min: 17,
    explanation: 'Average benchmark sites score 17/20.',
  },
  {
    id: 'below_average',
    label: 'Below average benchmark',
    min: 16,
    explanation: 'This site is below the average benchmark level because it is under 17/20.',
  },
  {
    id: 'low',
    label: 'Low benchmark',
    min: 13,
    explanation: 'Sites at 15/20 and below are low benchmark examples.',
  },
  {
    id: 'major_issue',
    label: 'Major issue benchmark',
    min: 0,
    explanation: 'Sites at 12/20 and below have major benchmark issues.',
  },
]

const SAME_MODEL_MIN_COUNT = 3
const EXAMPLE_LIMIT = 5
const CRAWL_UX_WEIGHT = 0.7
const BENCHMARK_UX_WEIGHT = 0.3
const UX_UI_MAX = 20

function resolveRepoRoot() {
  return path.resolve(__dirname, '..', '..')
}

function resolveBenchmarkDatasetPath() {
  const configured = String(process.env.UX_BENCHMARK_DATASET_PATH || '').trim()
  if (!configured) return null
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(resolveRepoRoot(), configured)
}

function isBenchmarkEnabled() {
  return Boolean(resolveBenchmarkDatasetPath())
}

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const next = text[index + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        value += '"'
        index += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        value += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(value)
      value = ''
    } else if (char === '\n') {
      row.push(value)
      rows.push(row)
      row = []
      value = ''
    } else if (char !== '\r') {
      value += char
    }
  }

  if (value.length || row.length) {
    row.push(value)
    rows.push(row)
  }

  if (!rows.length) return []
  const headers = rows[0].map((header) => header.trim())
  return rows
    .slice(1)
    .filter((items) => items.some((item) => String(item || '').trim()))
    .map((items) =>
      headers.reduce((record, header, index) => {
        record[header] = items[index] ?? ''
        return record
      }, {}),
    )
}

function toNumber(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function roundHumanScore(value) {
  return Math.round(Number(value) * 10) / 10
}

function normalizeBusinessModel(model) {
  return resolveCanonicalBusinessModel(model) || String(model || '').trim()
}

function toHumanEquivalentScore(row = {}) {
  const human = toNumber(row.human_ux_score)
  if (human != null) {
    return roundHumanScore(human <= 20 ? human : human / 5)
  }

  const overall = toNumber(row.overall_score)
  if (overall != null) {
    return roundHumanScore(overall / 5)
  }

  const total = SCORE_COLUMNS.reduce((sum, column) => {
    const value = toNumber(row[column.key])
    return sum + (value ?? 0)
  }, 0)
  return roundHumanScore(total / 5)
}

function toNormalizedHundredScore(humanScore) {
  if (humanScore == null) return null
  return Math.max(0, Math.min(100, Math.round((humanScore / 20) * 100)))
}

function normalizeTotalScore(row = {}) {
  const human = toHumanEquivalentScore(row)
  return toNormalizedHundredScore(human)
}

function getBenchmarkLevel(humanScore) {
  const score = roundHumanScore(humanScore)
  if (score >= 20) return LEVELS[0]
  if (score >= 19) return LEVELS[1]
  if (score >= 18) return LEVELS[2]
  if (score >= 17) return LEVELS[3]
  if (score >= 16) return LEVELS[4]
  if (score >= 13) return LEVELS[5]
  return LEVELS[6]
}

function clampUxScore(value) {
  return Math.max(0, Math.min(UX_UI_MAX, Math.round(value)))
}

function humanBenchmarkToUxUiScore(humanScore) {
  if (humanScore == null) return null
  const band = Math.floor(roundHumanScore(humanScore))
  if (band >= 17) return clampUxScore(band)
  return clampUxScore(band - 1)
}

function mergeUxUiWithBenchmark(crawlUxScore, benchmarkUxScore, options = {}) {
  const crawlUx = clampUxScore(crawlUxScore)
  if (benchmarkUxScore == null || options.benchmarkConfidenceLow) {
    return {
      finalScore: crawlUx,
      crawlScore: crawlUx,
      benchmarkScore: benchmarkUxScore ?? null,
      usedBenchmark: false,
      adjustment: 0,
    }
  }
  const benchmarkUx = clampUxScore(benchmarkUxScore)
  const rawDelta = benchmarkUx - crawlUx
  const adjustment = Math.max(-2, Math.min(2, rawDelta))
  return {
    finalScore: clampUxScore(crawlUx + adjustment),
    crawlScore: crawlUx,
    benchmarkScore: benchmarkUx,
    usedBenchmark: true,
    adjustment,
    raw_delta: rawDelta,
  }
}

function normalizeCategoryScore(row = {}, column) {
  const value = toNumber(row[column.key])
  if (value == null) return null
  return Math.max(0, Math.min(100, Math.round((value / column.max) * 100)))
}

function normalizeBenchmarkRows(rows = []) {
  return rows
    .map((row) => {
      const humanEquivalentScore = toHumanEquivalentScore(row)
      if (humanEquivalentScore == null) return null
      return {
        ...row,
        business_model: normalizeBusinessModel(row.business_model),
        human_equivalent_score: humanEquivalentScore,
        normalized_score: toNormalizedHundredScore(humanEquivalentScore),
        benchmark_level: getBenchmarkLevel(humanEquivalentScore),
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.human_equivalent_score - a.human_equivalent_score)
}

function loadBenchmarkRows(datasetPath = resolveBenchmarkDatasetPath()) {
  if (!datasetPath) {
    return {
      ok: false,
      disabled: true,
      reason: 'UX_BENCHMARK_DATASET_PATH is not configured.',
      rows: [],
      datasetPath: null,
    }
  }
  if (!fs.existsSync(datasetPath)) {
    return {
      ok: false,
      disabled: true,
      reason: `Benchmark dataset not found: ${datasetPath}`,
      rows: [],
      datasetPath,
    }
  }

  const text = fs.readFileSync(datasetPath, 'utf8')
  return {
    ok: true,
    rows: normalizeBenchmarkRows(parseCsv(text)),
    datasetPath,
  }
}

function percentileRank(humanScore, rows) {
  if (!rows.length) return null
  const lowerOrEqual = rows.filter((row) => row.human_equivalent_score <= humanScore).length
  return Math.round((lowerOrEqual / rows.length) * 100)
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value))
  if (!clean.length) return null
  return Math.round((clean.reduce((sum, value) => sum + value, 0) / clean.length) * 10) / 10
}

function partitionComparisonRows(rows, businessModel) {
  const normalizedModel = normalizeBusinessModel(businessModel)
  const sameModelRows = normalizedModel
    ? rows.filter((row) => row.business_model === normalizedModel)
    : []
  const hasEnoughSameModel = sameModelRows.length >= SAME_MODEL_MIN_COUNT

  return {
    normalizedModel,
    sameModelRows,
    overallRows: rows,
    competitorRows: hasEnoughSameModel ? sameModelRows : [],
    primaryRows: hasEnoughSameModel ? sameModelRows : sameModelRows,
    comparison_scope: hasEnoughSameModel ? 'same_business_model' : 'insufficient_competitors',
    used_same_business_model: hasEnoughSameModel,
    insufficient_competitors: !hasEnoughSameModel,
    has_competitors: hasEnoughSameModel,
  }
}

function buildCompetitorDataNeededMessage(businessModel, sameModelCount) {
  if (!businessModel) {
    return 'Add a business model to this profile so competitor benchmarking can match the right websites.'
  }
  return `Not enough competitor websites for business model "${businessModel}". Add at least ${SAME_MODEL_MIN_COUNT} labeled competitor URLs in the same business model to enable benchmarking. You currently have ${sameModelCount}.`
}

function mapExampleRow(row, targetHumanScore) {
  return {
    url: row.url || '',
    business_model: row.business_model || '',
    human_score: row.human_equivalent_score,
    score: row.normalized_score,
    level: row.benchmark_level.label,
    level_id: row.benchmark_level.id,
    difference: roundHumanScore(row.human_equivalent_score - targetHumanScore),
  }
}

function buildExampleGroups(rows, targetHumanScore, limit = EXAMPLE_LIMIT) {
  const sortedNearest = [...rows].sort(
    (a, b) =>
      Math.abs(a.human_equivalent_score - targetHumanScore) -
      Math.abs(b.human_equivalent_score - targetHumanScore),
  )

  return {
    nearest_examples: sortedNearest.slice(0, limit).map((row) => mapExampleRow(row, targetHumanScore)),
    average_examples: rows
      .filter((row) => Math.round(row.human_equivalent_score) === BENCHMARK_TARGETS.average)
      .slice(0, limit)
      .map((row) => mapExampleRow(row, targetHumanScore)),
    strong_examples: rows
      .filter((row) => Math.round(row.human_equivalent_score) === BENCHMARK_TARGETS.strong)
      .slice(0, limit)
      .map((row) => mapExampleRow(row, targetHumanScore)),
    top_examples: rows
      .filter((row) => row.human_equivalent_score >= BENCHMARK_TARGETS.top)
      .slice(0, limit)
      .map((row) => mapExampleRow(row, targetHumanScore)),
    low_examples: rows
      .filter((row) => row.human_equivalent_score <= 15)
      .slice(0, limit)
      .map((row) => mapExampleRow(row, targetHumanScore)),
  }
}

function buildCategoryComparisons(targetScores = {}, rows = []) {
  return SCORE_COLUMNS.map((column) => {
    const raw = toNumber(targetScores[column.key])
    const competitorValues = rows
      .map((row) => toNumber(row[column.key]))
      .filter((value) => value != null)
    const benchmarkAverage =
      competitorValues.length > 0
        ? Math.round(
            competitorValues.reduce((sum, value) => sum + value, 0) / competitorValues.length,
          )
        : null
    const gap =
      raw != null && benchmarkAverage != null ? Math.round(raw - benchmarkAverage) : null

    return {
      key: column.key,
      label: column.label,
      score: raw,
      max: column.max,
      normalized_score: raw == null ? null : normalizeCategoryScore({ [column.key]: raw }, column),
      benchmark_average: benchmarkAverage,
      gap,
      level: raw == null ? 'Unknown' : getBenchmarkLevel((raw / column.max) * 20).label,
      explanation:
        gap == null
          ? `${column.label} could not be compared because score data is missing.`
          : gap >= 2
            ? `${column.label} is above competitor average by ${gap} point${gap === 1 ? '' : 's'} on the ${column.max}-point scale.`
            : gap <= -2
              ? `${column.label} trails competitor average by ${Math.abs(gap)} point${Math.abs(gap) === 1 ? '' : 's'} on the ${column.max}-point scale.`
              : `${column.label} is close to the competitor average.`,
    }
  })
}

function buildGaps(targetHumanScore) {
  return {
    gap_to_average: roundHumanScore(BENCHMARK_TARGETS.average - targetHumanScore),
    gap_to_strong: roundHumanScore(BENCHMARK_TARGETS.strong - targetHumanScore),
    gap_to_top: roundHumanScore(BENCHMARK_TARGETS.top - targetHumanScore),
  }
}

function buildUxImprovementActions({ targetHumanScore, gaps, targetLevel }) {
  const actions = []

  if (gaps.gap_to_average > 0) {
    actions.push(
      `Close ${gaps.gap_to_average} point${gaps.gap_to_average === 1 ? '' : 's'} to reach the average competitor benchmark (${BENCHMARK_TARGETS.average}/20).`,
    )
  }
  if (gaps.gap_to_strong > 0) {
    actions.push(
      `Improve UX/UI by ${gaps.gap_to_strong} point${gaps.gap_to_strong === 1 ? '' : 's'} to match strong competitors (${BENCHMARK_TARGETS.strong}/20).`,
    )
  }
  if (gaps.gap_to_top > 0) {
    actions.push(
      `Reach top competitor level (${BENCHMARK_TARGETS.top}-${BENCHMARK_TARGETS.elite}/20) by fixing the biggest UX/UI gaps first.`,
    )
  }
  if (targetLevel.id === 'major_issue' || targetLevel.id === 'low') {
    actions.push('Prioritize mobile layout, CTA visibility, and readable text blocks before visual polish.')
  }
  if (targetHumanScore < BENCHMARK_TARGETS.average) {
    actions.push('Study the average competitor examples and match their above-the-fold clarity and navigation.')
  }

  return actions.slice(0, 5)
}

function buildBenchmarkExplanations({
  targetHumanScore,
  targetLevel,
  gaps,
  percentile,
  comparisonRows,
  comparisonScope,
  sameModelCount,
  businessModel,
  benchmarkUxUiScore,
  uxBlendApplied,
}) {
  const explanations = [
    `${targetLevel.label}: ${targetLevel.explanation}`,
    `This site is scoring ${targetHumanScore}/20 on the human benchmark scale.`,
    `Average benchmark sites score ${BENCHMARK_TARGETS.average}/20.`,
    `Strong benchmark sites score ${BENCHMARK_TARGETS.strong}/20.`,
    `Top benchmark sites score ${BENCHMARK_TARGETS.top}-${BENCHMARK_TARGETS.elite}/20.`,
  ]

  if (targetHumanScore < BENCHMARK_TARGETS.average) {
    explanations.push(
      'This site is below the average benchmark level because it is under 17/20.',
    )
  }

  explanations.push(
    `This site is ${Math.abs(gaps.gap_to_average)} point${Math.abs(gaps.gap_to_average) === 1 ? '' : 's'} ${gaps.gap_to_average > 0 ? 'away from' : 'above'} the average benchmark and ${Math.abs(gaps.gap_to_top)} point${Math.abs(gaps.gap_to_top) === 1 ? '' : 's'} ${gaps.gap_to_top > 0 ? 'away from' : 'above'} top benchmark level.`,
  )

  if (comparisonScope === 'insufficient_competitors') {
    explanations.push(buildCompetitorDataNeededMessage(businessModel, sameModelCount))
  } else if (comparisonScope === 'same_business_model') {
    explanations.push(
      `Competitor examples use ${comparisonRows.length} websites in the same business model.`,
    )
  }

  if (uxBlendApplied && benchmarkUxUiScore != null) {
    explanations.push(
      `UX/UI score blends 70% crawl analysis with 30% competitor benchmark calibration (${benchmarkUxUiScore}/20 benchmark target).`,
    )
  }

  if (percentile != null && comparisonScope === 'same_business_model') {
    explanations.push(
      `This site is scoring higher than about ${percentile}% of the ${comparisonRows.length} competitor websites in your business model.`,
    )
  }

  if (targetHumanScore < BENCHMARK_TARGETS.strong) {
    explanations.push(
      'To reach the strong benchmark level, prioritize the largest category gaps before polishing minor details.',
    )
  }

  return explanations
}

function appendUxExplanation(scorePayload, reason, delta = 0) {
  if (!reason) return
  const explanations = Array.isArray(scorePayload.score_explanation)
    ? [...scorePayload.score_explanation]
    : []
  explanations.push({ category: 'ux_ui', delta, reason })
  scorePayload.score_explanation = explanations.slice(0, 24)
}

function recalculateOverallScore(scorePayload) {
  scorePayload.overall_score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (scorePayload.safety_score || 0) +
          (scorePayload.functionality_score || 0) +
          (scorePayload.ux_ui_score || 0) +
          (scorePayload.business_fit_score || 0) +
          (scorePayload.customer_attraction_score || 0),
      ),
    ),
  )
}

function applyBenchmarkUxLayer(scorePayload, benchmark = {}) {
  const crawlUx =
    scorePayload.crawl_ux_ui_score ??
    scorePayload.deterministic_ux_ui_score ??
    scorePayload.ux_ui_score

  scorePayload.crawl_ux_ui_score = crawlUx

  const benchmarkConfidenceLow =
    benchmark.insufficient_competitors ||
    !benchmark.has_competitors ||
    (benchmark.compared_count || 0) < 3

  if (!benchmark.enabled || benchmark.benchmark_ux_ui_score == null) {
    scorePayload.ux_scoring_mode = scorePayload.ux_scoring_mode || 'crawl_only'
    if (benchmark.competitor_data_needed) {
      appendUxExplanation(scorePayload, benchmark.competitor_data_needed, 0)
    }
    return scorePayload
  }

  const merged = mergeUxUiWithBenchmark(crawlUx, benchmark.benchmark_ux_ui_score, {
    benchmarkConfidenceLow,
  })
  scorePayload.benchmark_ux_ui_score = merged.benchmarkScore
  scorePayload.ux_ui_score = merged.finalScore
  scorePayload.ux_scoring_mode = merged.usedBenchmark
    ? 'crawl_plus_light_benchmark_context'
    : 'crawl_only'
  scorePayload.ux_blend = {
    crawl_ux_ui_score: merged.crawlScore,
    benchmark_ux_ui_score: merged.benchmarkScore,
    final_ux_ui_score: merged.finalScore,
    adjustment: merged.adjustment,
    max_adjustment: 2,
    benchmark_confidence_low: benchmarkConfidenceLow,
  }
  if (merged.usedBenchmark && merged.adjustment !== 0) {
    recalculateOverallScore(scorePayload)
    appendUxExplanation(
      scorePayload,
      `UX/UI score adjusted by ${merged.adjustment > 0 ? '+' : ''}${merged.adjustment} from competitor benchmark context (max ±2).`,
      merged.adjustment,
    )
  }
  return scorePayload
}

function buildWebsiteBenchmark({
  business = {},
  scores = {},
  benchmarkRows = null,
  datasetPath = undefined,
} = {}) {
  const loaded = benchmarkRows
    ? { ok: true, rows: normalizeBenchmarkRows(benchmarkRows), datasetPath: datasetPath || null }
    : loadBenchmarkRows(datasetPath)

  if (!loaded.ok || !loaded.rows.length) {
    return {
      enabled: false,
      reason: loaded.reason || 'No benchmark rows available.',
      source_path: loaded.datasetPath || null,
    }
  }

  const overallScore = toNumber(scores.overall_score)
  if (overallScore == null) {
    return {
      enabled: false,
      reason: 'Current website score is missing.',
      source_path: loaded.datasetPath || null,
    }
  }

  const targetHumanScore = roundHumanScore(overallScore / 5)
  const targetScore = toNormalizedHundredScore(targetHumanScore)
  const businessModel = normalizeBusinessModel(business.business_model || scores.business_model || '')
  const partition = partitionComparisonRows(loaded.rows, businessModel)
  const targetLevel = getBenchmarkLevel(targetHumanScore)
  const gaps = buildGaps(targetHumanScore)
  const competitorRows = partition.competitorRows
  const benchmarkUxUiScore = humanBenchmarkToUxUiScore(targetHumanScore)
  const percentile = partition.has_competitors
    ? percentileRank(targetHumanScore, competitorRows)
    : null
  const categoryComparisons = partition.has_competitors
    ? buildCategoryComparisons(scores, competitorRows)
    : []
  const competitorExamples = partition.has_competitors
    ? buildExampleGroups(competitorRows, targetHumanScore)
    : {
        nearest_examples: [],
        average_examples: [],
        strong_examples: [],
        top_examples: [],
        low_examples: [],
      }
  const uxImprovementActions = buildUxImprovementActions({
    targetHumanScore,
    gaps,
    targetLevel,
  })

  const sameLevelExamples = competitorExamples.nearest_examples.filter(
    (row) => row.level_id === targetLevel.id,
  )
  const sameModelExamples = partition.sameModelRows
    .slice(0, EXAMPLE_LIMIT)
    .map((row) => mapExampleRow(row, targetHumanScore))

  return {
    enabled: true,
    source_path: loaded.datasetPath || null,
    business_model: businessModel || null,
    compared_count: competitorRows.length,
    total_benchmark_count: loaded.rows.length,
    same_model_count: partition.sameModelRows.length,
    comparison_scope: partition.comparison_scope,
    used_same_business_model: partition.used_same_business_model,
    insufficient_competitors: partition.insufficient_competitors,
    has_competitors: partition.has_competitors,
    competitor_data_needed: partition.insufficient_competitors
      ? buildCompetitorDataNeededMessage(businessModel, partition.sameModelRows.length)
      : null,
    benchmark_warning: partition.insufficient_competitors
      ? buildCompetitorDataNeededMessage(businessModel, partition.sameModelRows.length)
      : null,
    target_human_score: targetHumanScore,
    current_human_equivalent_score: targetHumanScore,
    current_benchmark_level: targetLevel.label,
    target_score: targetScore,
    target_level: targetLevel.label,
    target_level_id: targetLevel.id,
    benchmark_targets: { ...BENCHMARK_TARGETS },
    benchmark_ux_ui_score: benchmarkUxUiScore,
    can_blend_ux: true,
    gaps,
    percentile,
    benchmark_average_score: toNormalizedHundredScore(BENCHMARK_TARGETS.average),
    benchmark_average_human_score: BENCHMARK_TARGETS.average,
    benchmark_strong_human_score: BENCHMARK_TARGETS.strong,
    benchmark_top_human_score: BENCHMARK_TARGETS.top,
    benchmark_top_score: toNormalizedHundredScore(
      competitorRows[0]?.human_equivalent_score ?? BENCHMARK_TARGETS.elite,
    ),
    ...competitorExamples,
    same_model_examples: sameModelExamples,
    same_level_examples: sameLevelExamples,
    ux_improvement_actions: uxImprovementActions,
    category_comparisons: categoryComparisons,
    explanations: buildBenchmarkExplanations({
      targetHumanScore,
      targetLevel,
      gaps,
      percentile,
      comparisonRows: competitorRows,
      comparisonScope: partition.comparison_scope,
      sameModelCount: partition.sameModelRows.length,
      businessModel,
      benchmarkUxUiScore,
      uxBlendApplied: true,
    }),
  }
}

module.exports = {
  SCORE_COLUMNS,
  LEVELS,
  BENCHMARK_TARGETS,
  BUSINESS_MODEL_ALIASES,
  CRAWL_UX_WEIGHT,
  BENCHMARK_UX_WEIGHT,
  UX_UI_MAX,
  parseCsv,
  normalizeBusinessModel,
  toHumanEquivalentScore,
  normalizeTotalScore,
  normalizeBenchmarkRows,
  getBenchmarkLevel,
  humanBenchmarkToUxUiScore,
  mergeUxUiWithBenchmark,
  loadBenchmarkRows,
  buildWebsiteBenchmark,
  buildGaps,
  buildExampleGroups,
  applyBenchmarkUxLayer,
  resolveBenchmarkDatasetPath,
  isBenchmarkEnabled,
}
