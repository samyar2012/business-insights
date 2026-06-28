const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { parseBusinessFormBody } = require('../services/businessFormService')
const { normalizeBusinessModel } = require('../services/businessModelConfig')

const validBody = {
  owner_name: 'Alex Owner',
  business_name: 'Acme Co',
  business_type: 'Shopify',
  business_model: 'local_service_business',
  product_sold: 'HVAC repair',
  target_customers: 'Homeowners in Austin',
  store_url: '',
  monthly_revenue: '',
  customer_count: '',
  monthly_orders: '',
}

describe('normalizeBusinessModel', () => {
  it('throws VALIDATION when required and missing', () => {
    assert.throws(
      () => normalizeBusinessModel('', { required: true }),
      (err) => err.code === 'VALIDATION' && /required/i.test(err.message),
    )
  })

  it('throws VALIDATION for invalid model', () => {
    assert.throws(
      () => normalizeBusinessModel('not_a_real_model', { required: true }),
      (err) => err.code === 'VALIDATION' && /invalid business model/i.test(err.message),
    )
  })

  it('accepts a known business model', () => {
    assert.equal(
      normalizeBusinessModel('online_plus_physical_service', { required: true }),
      'online_plus_physical_service',
    )
  })
})

describe('parseBusinessFormBody', () => {
  it('throws VALIDATION when business_model is missing and requireCore is true', async () => {
    await assert.rejects(
      () => parseBusinessFormBody({ ...validBody, business_model: '' }, { requireCore: true }),
      (err) => err.code === 'VALIDATION' && /business model is required/i.test(err.message),
    )
  })

  it('throws VALIDATION when business_model is invalid and requireCore is true', async () => {
    await assert.rejects(
      () => parseBusinessFormBody({ ...validBody, business_model: 'bad_model' }, { requireCore: true }),
      (err) => err.code === 'VALIDATION' && /invalid business model/i.test(err.message),
    )
  })

  it('parses a valid business profile body', async () => {
    const fields = await parseBusinessFormBody(validBody, { requireCore: true })
    assert.equal(fields.businessModel, 'local_service_business')
    assert.equal(fields.businessName, 'Acme Co')
    assert.equal(fields.ownerName, 'Alex Owner')
    assert.equal(fields.storeUrl, null)
  })
})
