const { validatePublicUrl } = require('./crawler/urlSecurity')

function parseOptionalNumber(value) {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const { normalizeBusinessModel } = require('./businessModelConfig')

async function parseBusinessFormBody(body, { requireCore = true } = {}) {
  const ownerName = String(body?.owner_name || '').trim()
  const businessName = String(body?.business_name || '').trim()
  const businessType = String(body?.business_type || '').trim()
  const productSold = String(body?.product_sold || '').trim() || null
  const targetCustomers = String(body?.target_customers || '').trim() || null

  let storeUrl = null
  const rawUrl = String(body?.store_url || '').trim()
  if (rawUrl) {
    const parsed = await validatePublicUrl(rawUrl)
    storeUrl = parsed.href
  }

  const monthlyRevenue = parseOptionalNumber(body?.monthly_revenue)
  const customerCount = parseOptionalNumber(body?.customer_count)
  const monthlyOrders = parseOptionalNumber(body?.monthly_orders)
  const businessModel = normalizeBusinessModel(body?.business_model, {
    required: requireCore,
  })

  if (requireCore) {
    if (!ownerName) {
      const err = new Error('Your name is required')
      err.code = 'VALIDATION'
      throw err
    }
    if (!businessName) {
      const err = new Error('Business name is required')
      err.code = 'VALIDATION'
      throw err
    }
    if (!businessType) {
      const err = new Error('Business type is required')
      err.code = 'VALIDATION'
      throw err
    }
  }

  return {
    ownerName,
    businessName,
    businessType,
    productSold,
    targetCustomers,
    storeUrl,
    monthlyRevenue: monthlyRevenue ?? null,
    customerCount: customerCount ?? null,
    monthlyOrders: monthlyOrders ?? null,
    businessModel,
  }
}

function businessToFormValues(business, displayName) {
  if (!business) {
    return {
      owner_name: displayName || '',
      business_name: '',
      business_type: 'Shopify',
      business_model: '',
      product_sold: '',
      target_customers: '',
      store_url: '',
      monthly_revenue: '',
      customer_count: '',
      monthly_orders: '',
    }
  }

  return {
    owner_name: business.owner_name || displayName || '',
    business_name: business.business_name || '',
    business_type: business.business_type || 'Shopify',
    business_model: business.business_model || 'ecommerce_store',
    product_sold: business.product_sold || '',
    target_customers: business.target_customers || '',
    store_url: business.store_url || '',
    monthly_revenue: business.monthly_revenue ?? '',
    customer_count: business.customer_count ?? '',
    monthly_orders: business.monthly_orders ?? '',
  }
}

module.exports = {
  parseBusinessFormBody,
  parseOptionalNumber,
  businessToFormValues,
}
