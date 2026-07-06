const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { mapVisualScoreToCategoryPoints } = require('./uxFeatureExtractor')
const { SCORING_VERSION } = require('./analyzerV2/scoringWeights')

const UX_UI_MAX = 20
const UX_UI_MAX_V2 = 25
const DETERMINISTIC_WEIGHT = 0.35
const ML_WEIGHT = 0.65
const MODEL_VERSION = 'ux_score_model_v1'
const DEFAULT_TIMEOUT_MS = Number(process.env.UX_MODEL_TIMEOUT_MS || 8000)

function clamp(value, min = 0, max = UX_UI_MAX) {
  return Math.max(min, Math.min(max, Math.round(value)))
}

function isUxModelEnabled() {
  return process.env.UX_MODEL_ENABLED === 'true'
}

function resolveRepoRoot() {
  return path.resolve(__dirname, '..', '..')
}

function resolveModelPath() {
  const configured = process.env.UX_MODEL_PATH
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(resolveRepoRoot(), configured)
  }
  return path.resolve(resolveRepoRoot(), 'ml', 'ux_model', 'models', 'ux_score_model.joblib')
}

function resolvePredictScriptPath() {
  const configured = process.env.UX_MODEL_SCRIPT_PATH
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(resolveRepoRoot(), configured)
  }
  return path.resolve(resolveRepoRoot(), 'ml', 'ux_model', 'predict_ux_score.py')
}

function resolvePythonExecutable() {
  return process.env.UX_MODEL_PYTHON || 'python'
}

function scoreTextDensity(density) {
  if (density <= 0) return 70
  if (density < 0.0008) return 85
  if (density < 0.0015) return 70
  if (density < 0.0025) return 55
  return 35
}

function isAnalyzerV2(scorePayload = {}) {
  return scorePayload.scoring_version === SCORING_VERSION
}

function resolveUxUiMax(scorePayload = {}) {
  return isAnalyzerV2(scorePayload) ? UX_UI_MAX_V2 : UX_UI_MAX
}

function featureUxScoreFromVisual(uxFeatures, maxPoints = UX_UI_MAX) {
  const visual = uxFeatures?.visual_score ?? uxFeatures?.overall_static_ux_score
  if (visual == null) return null
  return Math.max(0, Math.min(maxPoints, Math.round((visual / 100) * maxPoints)))
}

function syncV2UxCategoryScore(scorePayload, uxScore) {
  if (!isAnalyzerV2(scorePayload)) return
  if (scorePayload.category_details?.ux_ui_visual) {
    scorePayload.category_details.ux_ui_visual.score = uxScore
  }
  if (scorePayload.category_scores) {
    scorePayload.category_scores.ux_ui_visual = uxScore
  }
  scorePayload.visual_score_100 =
    scorePayload.visual_score_100 ?? scorePayload.ux_features?.visual_score ?? null
  scorePayload.ux_score_mapping = {
    visual_score_100: scorePayload.visual_score_100,
    ux_category_score: uxScore,
    ux_category_max: UX_UI_MAX_V2,
    formula: 'visual_score / 4 rounded (equivalent to visual% × 25)',
  }
}

function featureUxScoreOn20(uxFeatures) {
  return featureUxScoreFromVisual(uxFeatures, UX_UI_MAX)
}

function buildModelInput({ scores = {}, uxFeatures = {}, business = {} } = {}) {
  const desktopDensity = uxFeatures.desktop_text_density ?? 0
  const mobileDensity = uxFeatures.mobile_text_density ?? 0
  const layoutUxScore = featureUxScoreOn20(uxFeatures) ?? scores.ux_ui_score ?? 0

  return {
    safety_score: scores.safety_score ?? 0,
    functionality_score: scores.functionality_score ?? 0,
    ux_ui_score: layoutUxScore,
    ui_score: uxFeatures.ui_score ?? uxFeatures.overall_static_ux_score ?? layoutUxScore,
    business_fit_score: scores.business_fit_score ?? 0,
    customer_attraction_score: scores.customer_attraction_score ?? 0,
    desktop_text_density_score:
      uxFeatures.desktop_text_density_score ?? scoreTextDensity(desktopDensity),
    mobile_text_density_score:
      uxFeatures.mobile_text_density_score ?? scoreTextDensity(mobileDensity),
    average_paragraph_length:
      uxFeatures.average_paragraph_length ?? uxFeatures.avg_paragraph_length ?? 0,
    max_text_block_length: uxFeatures.max_text_block_length ?? 0,
    cta_above_fold: uxFeatures.cta_above_fold ?? false,
    navbar_visibility_score:
      uxFeatures.navbar_visibility_score ?? uxFeatures.nav_visibility_score ?? 0,
    visual_hierarchy_score: uxFeatures.visual_hierarchy_score ?? 0,
    readability_score: uxFeatures.readability_score ?? 0,
    mobile_usability_score: uxFeatures.mobile_usability_score ?? 0,
    image_support_score: uxFeatures.image_support_score ?? 0,
    layout_overflow_score: uxFeatures.layout_overflow_score ?? 0,
    business_model: business.business_model || '',
    scoring_rubric: scores.scoring_rubric || business.scoring_rubric || '',
  }
}

function resolveBlendWeights(uxFeatures = {}) {
  const visualVerified = uxFeatures.source === 'visual_audit+crawler'
  const strongLayout = (uxFeatures.overall_static_ux_score ?? 0) >= 82
  const polished = (uxFeatures.display_polish_score ?? 0) >= 78

  if (visualVerified && (strongLayout || polished)) {
    return { deterministic: 0.62, ml: 0.38 }
  }
  if (visualVerified) {
    return { deterministic: 0.52, ml: 0.48 }
  }
  return { deterministic: DETERMINISTIC_WEIGHT, ml: ML_WEIGHT }
}

function mergeUxUiScore(deterministicUxUiScore, mlPrediction, options = {}) {
  const deterministic = clamp(deterministicUxUiScore, 0, UX_UI_MAX)
  if (!mlPrediction || mlPrediction.predicted_ux_score == null) {
    return {
      finalScore: deterministic,
      deterministicScore: deterministic,
      mlScoreOn20Scale: null,
      usedMl: false,
      confidence: 0,
      blendWeights: resolveBlendWeights(options.uxFeatures),
    }
  }

  const mlScoreOn20Scale = clamp(mlPrediction.predicted_ux_score / 5, 0, UX_UI_MAX)
  const weights = resolveBlendWeights(options.uxFeatures)
  let blended = deterministic * weights.deterministic + mlScoreOn20Scale * weights.ml

  if (options.uxFeatures?.source === 'visual_audit+crawler' && deterministic >= 15) {
    blended = Math.max(blended, deterministic - 1)
  }

  return {
    finalScore: clamp(blended, 0, UX_UI_MAX),
    deterministicScore: deterministic,
    mlScoreOn20Scale,
    usedMl: true,
    confidence: Number(mlPrediction.confidence || 0),
    blendWeights: weights,
  }
}

function appendUxExplanation(scorePayload, reason, delta = 0) {
  if (!reason) return
  const explanations = Array.isArray(scorePayload.score_explanation)
    ? [...scorePayload.score_explanation]
    : []
  explanations.push({ category: 'ux_ui', delta, reason })
  scorePayload.score_explanation = explanations.slice(0, 24)
}

function recalculateOverallScore(scorePayload, uxMax = resolveUxUiMax(scorePayload)) {
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

async function predictUxScore(input, options = {}) {
  if (!isUxModelEnabled()) {
    return { ok: false, disabled: true, error: 'UX model disabled' }
  }

  const modelPath = options.modelPath || resolveModelPath()
  if (!fs.existsSync(modelPath)) {
    return { ok: false, error: `Model file not found: ${modelPath}` }
  }

  const scriptPath = options.scriptPath || resolvePredictScriptPath()
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `Prediction script not found: ${scriptPath}` }
  }

  const pythonExecutable = options.pythonExecutable || resolvePythonExecutable()
  const payload = {
    ...input,
    model_path: modelPath,
  }

  return new Promise((resolve) => {
    const child = spawn(pythonExecutable, [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ ok: false, error: `UX model prediction timed out after ${DEFAULT_TIMEOUT_MS}ms` })
    }, options.timeoutMs || DEFAULT_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ ok: false, error: error.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      try {
        const parsed = JSON.parse(stdout.trim() || '{}')
        if (!parsed.ok) {
          resolve({
            ok: false,
            error: parsed.error || stderr.trim() || `Python exited with code ${code}`,
          })
          return
        }
        resolve({
          ok: true,
          predicted_ux_score: parsed.predicted_ux_score,
          confidence: parsed.confidence,
          model_version: parsed.model_version || MODEL_VERSION,
          notes: parsed.notes || [],
        })
      } catch {
        resolve({
          ok: false,
          error: stderr.trim() || stdout.trim() || `Failed to parse UX model output (code ${code})`,
        })
      }
    })

    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

async function applyUxModelLayer(scorePayload, { uxFeatures = {}, business = {} } = {}, options = {}) {
  const uxMax = resolveUxUiMax(scorePayload)
  const visualBased = featureUxScoreFromVisual(uxFeatures, uxMax)
  const categoryUx = scorePayload.category_details?.ux_ui_visual?.score

  if (isAnalyzerV2(scorePayload)) {
    const finalUx =
      categoryUx ??
      visualBased ??
      mapVisualScoreToCategoryPoints(uxFeatures?.visual_score ?? uxFeatures?.overall_static_ux_score ?? 0, UX_UI_MAX_V2)

    scorePayload.crawl_ux_ui_score = finalUx
    scorePayload.deterministic_ux_ui_score = finalUx
    scorePayload.ux_ui_score = finalUx
    scorePayload.ux_scoring_mode = isUxModelEnabled() ? 'visual_audit_v2_ml_advisory' : 'visual_audit_v2'
    syncV2UxCategoryScore(scorePayload, finalUx)

    if (!isUxModelEnabled()) {
      scorePayload.ux_model = { enabled: false, used: false }
      appendUxExplanation(
        scorePayload,
        `UX/UI category score follows visual audit (${scorePayload.visual_score_100 ?? visualBased}/100 → ${finalUx}/${UX_UI_MAX_V2}).`,
        0,
      )
      recalculateOverallScore(scorePayload, uxMax)
      return scorePayload
    }

    const modelInput = buildModelInput({ scores: scorePayload, uxFeatures, business })
    const prediction = await predictUxScore(modelInput, options)

    if (!prediction.ok) {
      scorePayload.ux_model = { enabled: true, used: false, error: prediction.error }
      appendUxExplanation(
        scorePayload,
        `UX/UI category score follows visual audit (${finalUx}/${UX_UI_MAX_V2}). ML advisory unavailable.`,
        0,
      )
      recalculateOverallScore(scorePayload, uxMax)
      return scorePayload
    }

    const mlOn25 = clamp((prediction.predicted_ux_score / 100) * UX_UI_MAX_V2, 0, UX_UI_MAX_V2)
    scorePayload.ux_model = {
      enabled: true,
      used: true,
      advisory_only: true,
      predicted_ux_score: prediction.predicted_ux_score,
      predicted_ux_score_on_25_scale: mlOn25,
      predicted_ux_score_on_20_scale: clamp(prediction.predicted_ux_score / 5, 0, UX_UI_MAX),
      confidence: prediction.confidence,
      model_version: prediction.model_version,
      notes: prediction.notes || [],
    }
    appendUxExplanation(
      scorePayload,
      `UX/UI category ${finalUx}/${UX_UI_MAX_V2} from visual audit (${scorePayload.visual_score_100}/100). ML advisory: ${mlOn25}/${UX_UI_MAX_V2} — not blended into category score.`,
      0,
    )
    recalculateOverallScore(scorePayload, uxMax)
    return scorePayload
  }

  const deterministicUxUiScore = featureUxScoreOn20(uxFeatures) ?? scorePayload.ux_ui_score

  if (!isUxModelEnabled()) {
    scorePayload.ux_scoring_mode = scorePayload.ux_scoring_mode || 'deterministic'
    scorePayload.ux_model = { enabled: false, used: false }
    appendUxExplanation(
      scorePayload,
      'UX model disabled; using deterministic UX/UI scoring.',
      0,
    )
    return scorePayload
  }

  if (options.mockPrediction) {
    const merged = mergeUxUiScore(deterministicUxUiScore, options.mockPrediction, {
      uxFeatures,
    })
    scorePayload.deterministic_ux_ui_score = merged.deterministicScore
    scorePayload.ux_ui_score = merged.finalScore
    scorePayload.ux_scoring_mode = 'deterministic_plus_ml'
    scorePayload.ux_model = {
      enabled: true,
      used: true,
      predicted_ux_score: options.mockPrediction.predicted_ux_score,
      predicted_ux_score_on_20_scale: merged.mlScoreOn20Scale,
      confidence: merged.confidence,
      model_version: options.mockPrediction.model_version || MODEL_VERSION,
      deterministic_weight: merged.blendWeights.deterministic,
      ml_weight: merged.blendWeights.ml,
      notes: options.mockPrediction.notes || [],
    }
    recalculateOverallScore(scorePayload)
    appendUxExplanation(
      scorePayload,
      `UX model blended layout signals (${merged.deterministicScore}/${UX_UI_MAX}) with trained predictions (${merged.mlScoreOn20Scale}/${UX_UI_MAX}).`,
      merged.finalScore - merged.deterministicScore,
    )
    return scorePayload
  }

  const modelInput = buildModelInput({ scores: scorePayload, uxFeatures, business })
  const prediction = await predictUxScore(modelInput, options)

  if (!prediction.ok) {
    scorePayload.ux_scoring_mode = scorePayload.ux_scoring_mode || 'deterministic'
    scorePayload.ux_model = {
      enabled: true,
      used: false,
      error: prediction.error,
    }
    appendUxExplanation(
      scorePayload,
      `UX model unavailable; using deterministic UX/UI scoring. (${prediction.error})`,
      0,
    )
    return scorePayload
  }

  const merged = mergeUxUiScore(deterministicUxUiScore, prediction, { uxFeatures })
  scorePayload.deterministic_ux_ui_score = merged.deterministicScore
  scorePayload.ux_ui_score = merged.finalScore
  scorePayload.ux_scoring_mode = 'deterministic_plus_ml'
  scorePayload.ux_model = {
    enabled: true,
    used: true,
    predicted_ux_score: prediction.predicted_ux_score,
    predicted_ux_score_on_20_scale: merged.mlScoreOn20Scale,
    confidence: merged.confidence,
    model_version: prediction.model_version,
    deterministic_weight: DETERMINISTIC_WEIGHT,
    ml_weight: ML_WEIGHT,
    notes: prediction.notes || [],
  }
  recalculateOverallScore(scorePayload)
  appendUxExplanation(
    scorePayload,
    `UX model blended layout signals (${merged.deterministicScore}/${UX_UI_MAX}) with trained predictions (${merged.mlScoreOn20Scale}/${UX_UI_MAX}).`,
    merged.finalScore - merged.deterministicScore,
  )
  return scorePayload
}

module.exports = {
  UX_UI_MAX,
  DETERMINISTIC_WEIGHT,
  ML_WEIGHT,
  MODEL_VERSION,
  isUxModelEnabled,
  resolveModelPath,
  resolvePredictScriptPath,
  featureUxScoreOn20,
  resolveBlendWeights,
  buildModelInput,
  mergeUxUiScore,
  predictUxScore,
  applyUxModelLayer,
}
