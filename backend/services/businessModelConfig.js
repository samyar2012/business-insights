const BUSINESS_MODELS = [
  'ecommerce_store',
  'online_plus_offline_store',
  'online_plus_physical_service',
  'local_service_business',
  'content_social_business',
  'marketplace_listing',
]

const BUSINESS_MODEL_SET = new Set(BUSINESS_MODELS)

const BUSINESS_TYPE_TO_MODEL = {
  shopify: 'ecommerce_store',
  dropshipping: 'ecommerce_store',
  'social-first': 'content_social_business',
  'b2b saas': 'online_plus_physical_service',
  agency: 'online_plus_physical_service',
}

function normalizeBusinessModel(value, { required = false } = {}) {
  const model = String(value || '').trim()
  if (!model) {
    if (required) {
      const err = new Error('Business model is required')
      err.code = 'VALIDATION'
      throw err
    }
    return 'ecommerce_store'
  }
  if (!BUSINESS_MODEL_SET.has(model)) {
    const err = new Error(`Invalid business model. Choose one of: ${BUSINESS_MODELS.join(', ')}`)
    err.code = 'VALIDATION'
    throw err
  }
  return model
}

function businessTypeToModel(businessType) {
  const key = String(businessType || '').trim().toLowerCase()
  return BUSINESS_TYPE_TO_MODEL[key] || null
}

function siteClassificationToModel(classification) {
  switch (classification) {
    case 'marketplace':
      return 'marketplace_listing'
    case 'service':
      return 'local_service_business'
    case 'content_social':
      return 'content_social_business'
    case 'shopify_dtc':
    case 'single_brand_ecommerce':
      return 'ecommerce_store'
    default:
      return null
  }
}

function resolveScoringRubric(business, aggregated) {
  if (business?.business_model && BUSINESS_MODEL_SET.has(business.business_model)) {
    return business.business_model
  }

  const fromType = businessTypeToModel(business?.business_type)
  if (fromType) return fromType

  const fromSite = siteClassificationToModel(aggregated?.site_classification?.classification)
  if (fromSite) return fromSite

  return 'ecommerce_store'
}

module.exports = {
  BUSINESS_MODELS,
  BUSINESS_MODEL_SET,
  normalizeBusinessModel,
  resolveScoringRubric,
  businessTypeToModel,
  siteClassificationToModel,
}
