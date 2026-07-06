const SCORING_VERSION = 'business_insights_analyzer_v2'

const CATEGORY_WEIGHTS = {
  safety_trust: 20,
  technical_functionality: 15,
  ux_ui_visual: 25,
  offer_business_fit: 20,
  customer_attraction: 20,
}

const LEGACY_FIELD_MAP = {
  safety_trust: 'safety_score',
  technical_functionality: 'functionality_score',
  ux_ui_visual: 'ux_ui_score',
  offer_business_fit: 'business_fit_score',
  customer_attraction: 'customer_attraction_score',
}

const TOTAL_SCORE = Object.values(CATEGORY_WEIGHTS).reduce((sum, max) => sum + max, 0)

function legacyMaxForCategory(categoryKey) {
  return CATEGORY_WEIGHTS[categoryKey] ?? 0
}

module.exports = {
  SCORING_VERSION,
  CATEGORY_WEIGHTS,
  LEGACY_FIELD_MAP,
  TOTAL_SCORE,
  legacyMaxForCategory,
}
