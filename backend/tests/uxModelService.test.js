const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const {
  applyUxModelLayer,
  mergeUxUiScore,
  buildModelInput,
  isUxModelEnabled,
  DETERMINISTIC_WEIGHT,
  ML_WEIGHT,
  UX_UI_MAX,
} = require('../services/uxModelService')

function baseScorePayload(uxUiScore = 14) {
  return {
    overall_score: 30 + 16 + uxUiScore + 15 + 8,
    safety_score: 30,
    functionality_score: 16,
    ux_ui_score: uxUiScore,
    business_fit_score: 15,
    customer_attraction_score: 8,
    scoring_rubric: 'local_service_business',
    score_explanation: [],
  }
}

const sampleUxFeatures = {
  desktop_text_density: 0.001,
  mobile_text_density: 0.0012,
  desktop_text_density_score: 70,
  mobile_text_density_score: 70,
  avg_paragraph_length: 180,
  average_paragraph_length: 180,
  max_text_block_length: 260,
  cta_above_fold: true,
  nav_visibility_score: 80,
  navbar_visibility_score: 80,
  visual_hierarchy_score: 75,
  readability_score: 72,
  mobile_usability_score: 68,
  image_support_score: 55,
  layout_overflow_score: 90,
  overall_static_ux_score: 74,
  ui_score: 74,
}

describe('uxModelService', () => {
  let originalEnabled
  let originalModelPath

  beforeEach(() => {
    originalEnabled = process.env.UX_MODEL_ENABLED
    originalModelPath = process.env.UX_MODEL_PATH
  })

  afterEach(() => {
    process.env.UX_MODEL_ENABLED = originalEnabled
    process.env.UX_MODEL_PATH = originalModelPath
  })

  it('returns deterministic score when UX model is disabled', async () => {
    process.env.UX_MODEL_ENABLED = 'false'
    const payload = baseScorePayload(14)
    const result = await applyUxModelLayer(payload, {
      uxFeatures: sampleUxFeatures,
      business: { business_model: 'local_service_business' },
    })

    assert.equal(result.ux_ui_score, 14)
    assert.equal(result.ux_model.used, false)
    assert.ok(
      result.score_explanation.some((item) =>
        item.reason.includes('UX model disabled; using deterministic UX/UI scoring.'),
      ),
    )
  })

  it('falls back safely when model file is missing', async () => {
    process.env.UX_MODEL_ENABLED = 'true'
    process.env.UX_MODEL_PATH = 'ml/ux_model/models/does-not-exist.joblib'
    const payload = baseScorePayload(12)
    const result = await applyUxModelLayer(payload, {
      uxFeatures: sampleUxFeatures,
      business: { business_model: 'local_service_business' },
    })

    assert.equal(result.ux_ui_score, 12)
    assert.equal(result.ux_model.used, false)
    assert.ok(result.ux_model.error)
    assert.ok(
      result.score_explanation.some((item) =>
        item.reason.includes('UX model unavailable; using deterministic UX/UI scoring.'),
      ),
    )
  })

  it('blends deterministic and ML scores using 70/30 weighting', () => {
    const merged = mergeUxUiScore(14, {
      predicted_ux_score: 85,
      confidence: 0.42,
      model_version: 'ux_score_model_v1',
    })

    const expected = Math.round(14 * DETERMINISTIC_WEIGHT + (85 / 5) * ML_WEIGHT)
    assert.equal(merged.finalScore, expected)
    assert.equal(merged.mlScoreOn20Scale, 17)
    assert.equal(merged.usedMl, true)
  })

  it('keeps blended UX/UI score within 0-20 range', async () => {
    process.env.UX_MODEL_ENABLED = 'true'
    const payload = baseScorePayload(2)
    const result = await applyUxModelLayer(
      payload,
      { uxFeatures: sampleUxFeatures, business: { business_model: 'local_service_business' } },
      {
        mockPrediction: {
          predicted_ux_score: 100,
          confidence: 0.5,
          model_version: 'ux_score_model_v1',
        },
      },
    )

    assert.ok(result.ux_ui_score >= 0)
    assert.ok(result.ux_ui_score <= UX_UI_MAX)
    assert.equal(result.ux_model.used, true)
    assert.ok(
      result.score_explanation.some((item) =>
        item.reason.includes(
          'UX model adjusted the UX/UI score using trained visual-layout patterns.',
        ),
      ),
    )
  })

  it('builds model input with training feature names', () => {
    const input = buildModelInput({
      scores: baseScorePayload(14),
      uxFeatures: sampleUxFeatures,
      business: { business_model: 'local_service_business' },
    })

    assert.equal(input.navbar_visibility_score, 80)
    assert.equal(input.average_paragraph_length, 180)
    assert.equal(input.ui_score, 74)
    assert.equal(input.business_model, 'local_service_business')
  })

  it('reports disabled state from env gate', () => {
    process.env.UX_MODEL_ENABLED = 'false'
    assert.equal(isUxModelEnabled(), false)
    process.env.UX_MODEL_ENABLED = 'true'
    assert.equal(isUxModelEnabled(), true)
  })
})
