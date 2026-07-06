const BUSINESS_MODELS = [
  'ecommerce_store',
  'online_plus_offline_store',
  'online_gallery_physical_service',
  'online_plus_physical_service',
  'local_service_business',
  'content_business',
  'blog',
  'listing',
]

const BUSINESS_MODEL_SET = new Set(BUSINESS_MODELS)

const BUSINESS_MODEL_LABELS = {
  ecommerce_store: 'E-commerce store, online only',
  online_plus_offline_store: 'Online plus offline store',
  online_gallery_physical_service: 'Online gallery store with physical services',
  online_plus_physical_service: 'Online plus physical service',
  local_service_business: 'Local service business',
  content_business: 'Content business',
  blog: 'Blog',
  listing: 'Listing / marketplace profile',
}

const BUSINESS_MODEL_ALIASES = {
  content_social_business: 'content_business',
  marketplace_listing: 'listing',
  online_plus_physical: 'online_plus_physical_service',
  physical_service: 'online_plus_physical_service',
  ecommerce: 'ecommerce_store',
  shopify: 'ecommerce_store',
  marketplace: 'listing',
  content: 'content_business',
  social: 'content_business',
  service: 'local_service_business',
}

const BUSINESS_TYPE_TO_MODEL = {
  shopify: 'ecommerce_store',
  dropshipping: 'ecommerce_store',
  'social-first': 'content_business',
  'b2b saas': 'online_plus_physical_service',
  agency: 'online_plus_physical_service',
}

const SERVICE_MODELS = new Set([
  'online_gallery_physical_service',
  'online_plus_physical_service',
  'local_service_business',
])

const ECOMMERCE_MODELS = new Set(['ecommerce_store', 'online_plus_offline_store'])

const CONTENT_MODELS = new Set(['content_business', 'blog'])

const GALLERY_SERVICE_MODELS = new Set(['online_gallery_physical_service'])

function resolveCanonicalBusinessModel(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (BUSINESS_MODEL_SET.has(raw)) return raw
  return BUSINESS_MODEL_ALIASES[raw] || null
}

function normalizeBusinessModel(value, { required = false } = {}) {
  const raw = String(value || '').trim()
  if (!raw) {
    if (required) {
      const err = new Error('Business model is required')
      err.code = 'VALIDATION'
      throw err
    }
    return 'ecommerce_store'
  }
  const canonical = resolveCanonicalBusinessModel(raw)
  if (canonical) return canonical
  const err = new Error(`Invalid business model. Choose one of: ${BUSINESS_MODELS.join(', ')}`)
  err.code = 'VALIDATION'
  throw err
}

function getBusinessModelLabel(model) {
  const canonical = resolveCanonicalBusinessModel(model) || model
  return BUSINESS_MODEL_LABELS[canonical] || String(canonical || '').replace(/_/g, ' ')
}

function businessTypeToModel(businessType) {
  const key = String(businessType || '').trim().toLowerCase()
  return BUSINESS_TYPE_TO_MODEL[key] || null
}

function siteClassificationToModel(classification) {
  switch (classification) {
    case 'marketplace':
      return 'listing'
    case 'service':
      return 'local_service_business'
    case 'content_social':
      return 'content_business'
    case 'shopify_dtc':
    case 'single_brand_ecommerce':
      return 'ecommerce_store'
    default:
      return null
  }
}

function resolveScoringRubric(business, aggregated) {
  const fromBusiness = resolveCanonicalBusinessModel(business?.business_model)
  if (fromBusiness) return fromBusiness

  const fromType = businessTypeToModel(business?.business_type)
  if (fromType) return fromType

  const fromSite = siteClassificationToModel(aggregated?.site_classification?.classification)
  if (fromSite) return fromSite

  return 'ecommerce_store'
}

function isServiceModel(model) {
  return SERVICE_MODELS.has(resolveCanonicalBusinessModel(model) || model)
}

function isEcommerceModel(model) {
  return ECOMMERCE_MODELS.has(resolveCanonicalBusinessModel(model) || model)
}

function isContentModel(model) {
  return CONTENT_MODELS.has(resolveCanonicalBusinessModel(model) || model)
}

function isGalleryServiceModel(model) {
  return GALLERY_SERVICE_MODELS.has(resolveCanonicalBusinessModel(model) || model)
}

function isListingModel(model) {
  return (resolveCanonicalBusinessModel(model) || model) === 'listing'
}

module.exports = {
  BUSINESS_MODELS,
  BUSINESS_MODEL_SET,
  BUSINESS_MODEL_LABELS,
  BUSINESS_MODEL_ALIASES,
  SERVICE_MODELS,
  ECOMMERCE_MODELS,
  CONTENT_MODELS,
  GALLERY_SERVICE_MODELS,
  resolveCanonicalBusinessModel,
  normalizeBusinessModel,
  getBusinessModelLabel,
  resolveScoringRubric,
  businessTypeToModel,
  siteClassificationToModel,
  isServiceModel,
  isEcommerceModel,
  isContentModel,
  isGalleryServiceModel,
  isListingModel,
}
