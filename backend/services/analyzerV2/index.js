const { resolveScoringRubric } = require('../businessModelConfig')
const { detectMismatchWarnings, validateWeightedScore, scoreForRubric } = require('../businessScoringRubrics')
const { legacyScoresFromCategories } = require('../priorityWebsiteScoring')
const {
  SCORING_VERSION,
  CATEGORY_WEIGHTS,
  LEGACY_FIELD_MAP,
} = require('./scoringWeights')
const {
  scoreSafetyTrust,
  scoreTechnicalFunctionality,
  scoreUxUiVisual,
  scoreCustomerAttraction,
  scoreOfferBusinessFit,
  buildScoringContext,
} = require('./categoryScorers')
const {
  applyScoreCaps,
  detectSevereBusinessMismatch,
  detectNoConversionPath,
} = require('./scoreCaps')
const {
  buildReadableSummary,
  buildScoreExplanation,
} = require('./explanationBuilder')
const { buildBenchmarkComparison, humanEquivalentFromOverall } = require('./benchmarkInterpreter')
const { buildUxFeatureSnapshot } = require('../uxFeatureExtractor')
const { buildFixPlan, buildGrowthPlan } = require('./fixPlanEngine')
const { buildEvidenceStrengths, buildEvidenceRisks } = require('./evidenceNarrator')
const { assessMobileOverflow } = require('./evidenceDetectors')

function computeConfidenceScore({ pages, visualAudit, safetyResult, aggregated, crawlHealth, benchmark }) {
  let score = 35
  const pageCount = pages?.length || 0
  if (pageCount >= 5) score += 15
  else if (pageCount >= 3) score += 10
  else if (pageCount >= 1) score += 5

  if (visualAudit?.ok) score += 20
  else if (visualAudit?.enabled === false) score += 5
  else score -= 5

  if (safetyResult?.status === 'safe') score += 10
  else if (safetyResult?.configured) score += 5

  const textLen = aggregated.content_signals?.total_text_length || 0
  if (textLen >= 1500) score += 10
  else if (textLen >= 700) score += 5

  if (crawlHealth.hasContact || crawlHealth.hasServices) score += 5
  if (benchmark?.enabled) score += 5

  return Math.max(0, Math.min(100, Math.round(score)))
}

function mapLegacyFields(categoryDetails) {
  const legacy = {}
  for (const [categoryKey, legacyKey] of Object.entries(LEGACY_FIELD_MAP)) {
    legacy[legacyKey] = categoryDetails[categoryKey]?.score ?? 0
  }
  return legacy
}

function calculateAnalyzerV2Scores(aggregated, business, pages, options = {}) {
  const rubric = resolveScoringRubric(business, aggregated)
  const mismatchWarnings = detectMismatchWarnings(rubric, aggregated, business)
  const { crawlHealth, signals, uxFeatures } = buildScoringContext(aggregated, business, pages, {
    ...options,
    rubric,
  })
  const safetyResult = options.safetyResult || null

  const categoryDetails = {
    safety_trust: scoreSafetyTrust({
      aggregated,
      pages,
      safetyResult,
      crawlHealth,
      rubric,
      signals,
    }),
    technical_functionality: scoreTechnicalFunctionality({
      aggregated,
      pages,
      crawlHealth,
      visualAudit: options.visualAudit,
      options,
    }),
    ux_ui_visual: scoreUxUiVisual({
      pages,
      aggregated,
      uxFeatures,
      visualAudit: options.visualAudit,
      rubric,
      signals,
    }),
    offer_business_fit: (() => {
      const fit = scoreOfferBusinessFit(
        rubric,
        { aggregated, business, pages, signals, visualAudit: options.visualAudit, uxFeatures },
        CATEGORY_WEIGHTS.offer_business_fit,
      )
      return {
        score: fit.score,
        max: CATEGORY_WEIGHTS.offer_business_fit,
        confidence: 75,
        strengths: fit.strengths,
        problems: fit.problems,
        evidence: fit.evidence,
        recommended_fixes: fit.recommended_fixes,
      }
    })(),
    customer_attraction: scoreCustomerAttraction({
      aggregated,
      pages,
      signals,
      rubric,
      uxFeatures,
      crawlHealth,
    }),
  }

  const categoryScores = {}
  for (const [key, detail] of Object.entries(categoryDetails)) {
    categoryScores[key] = detail.score
  }

  let overall_score = Object.values(categoryScores).reduce((sum, value) => sum + value, 0)

  const noReadableContent =
    (aggregated.content_signals?.total_text_length || 0) < 120 && pages.length > 0
  const overflowAssessment = assessMobileOverflow({
    uxFeatures,
    visualAudit: options.visualAudit,
  })
  const severeMobileOverflow = overflowAssessment.should_cap_score
  const severeBusinessMismatch = detectSevereBusinessMismatch(rubric, aggregated, mismatchWarnings)
  const noConversionPath = detectNoConversionPath(signals, rubric)
  const safetyStatus =
    safetyResult?.status === 'unsafe'
      ? 'unsafe'
      : safetyResult?.status === 'safe'
        ? 'safe'
        : 'unknown'

  const capResult = applyScoreCaps(overall_score, {
    safetyStatus,
    homepageOk: crawlHealth.homepageOk,
    noReadableContent,
    severeBusinessMismatch,
    severeMobileOverflow,
    noConversionPath,
  })
  overall_score = capResult.overall_score

  const legacyFields = mapLegacyFields(categoryDetails)
  const benchmarkComparison = options.includeBenchmark === false
    ? null
    : buildBenchmarkComparison({
        business,
        scores: { ...legacyFields, overall_score, scoring_rubric: rubric },
        benchmarkRows: options.benchmarkRows,
        datasetPath: options.benchmarkDatasetPath,
      })

  const confidence_score = computeConfidenceScore({
    pages,
    visualAudit: options.visualAudit,
    safetyResult,
    aggregated,
    crawlHealth,
    benchmark: benchmarkComparison,
  })

  const fix_plan = buildFixPlan({
    categoryDetails,
    uxFeatures,
    capReasons: capResult.cap_reasons,
    rubric,
    pages,
    benchmarkComparison,
  })
  const growth_plan = buildGrowthPlan({
    categoryDetails,
    uxFeatures,
    capReasons: capResult.cap_reasons,
    rubric,
    pages,
    benchmarkComparison,
    aggregated,
    business,
    fixPlan: fix_plan,
  })
  const priority_fixes = fix_plan
  const readable_summary = buildReadableSummary({
    overallScore: overall_score,
    confidenceScore: confidence_score,
    rubric,
    categoryDetails,
    capReasons: capResult.cap_reasons,
    benchmark: benchmarkComparison,
  })

  const legacyCategoryScores = scoreForRubric(rubric, {
    aggregated,
    business,
    pages,
    signals,
    explanations: [],
  })
  const legacy = legacyScoresFromCategories(legacyCategoryScores)

  const visualOk = Boolean(options.visualAudit?.ok)
  const result = {
    overall_score,
    scoring_version: SCORING_VERSION,
    scoring_rubric: rubric,
    confidence_score,
    human_equivalent_score: humanEquivalentFromOverall(overall_score),
    category_scores: categoryScores,
    category_details: categoryDetails,
    priority_fixes,
    fix_plan,
    growth_plan,
    benchmark_comparison: benchmarkComparison?.enabled ? benchmarkComparison : { enabled: false, reason: benchmarkComparison?.reason },
    score_caps_applied: capResult.score_caps_applied,
    cap_reasons: capResult.cap_reasons,
    mismatch_warnings: mismatchWarnings,
    readable_summary,
    strengths: buildEvidenceStrengths(categoryDetails, { rubric }),
    risks: buildEvidenceRisks(categoryDetails, { rubric }, mismatchWarnings),
    recommended_actions: growth_plan.map((item) => item.action),
    score_explanation: buildScoreExplanation(categoryDetails),
    ...legacyFields,
  }

  result.safety_status = safetyStatus
  result.ux_scoring_mode = visualOk ? 'visual_audit_v2' : 'crawler_static_v2'
  result.visual_audit_status = {
    enabled: Boolean(options.visualAudit?.enabled),
    ok: visualOk,
    skipped: Boolean(options.visualAudit?.skipped),
    reason: options.visualAudit?.reason || options.visualAudit?.error || null,
  }
  result.ux_features = uxFeatures
  result.ux_feature_snapshot = buildUxFeatureSnapshot(uxFeatures)
  result.ux_scoring_inputs = uxFeatures?.ux_scoring_inputs || null
  result.ux_score_components = uxFeatures?.ux_score_components || null
  result.visual_score_100 = uxFeatures?.visual_score ?? null
  result.ux_confidence = uxFeatures?.ux_confidence ?? null
  result.crawl_ux_ui_score = result.ux_ui_score
  result.deterministic_ux_ui_score = result.ux_ui_score

  Object.assign(result, legacy)

  const validation = validateWeightedScore(result)
  if (!validation.valid) {
    result.score_validation_errors = validation.errors
  }

  return result
}

module.exports = {
  calculateAnalyzerV2Scores,
  computeConfidenceScore,
  SCORING_VERSION,
}
