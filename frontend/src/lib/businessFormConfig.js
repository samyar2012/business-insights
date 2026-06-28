export const BUSINESS_TYPES = [
  'Shopify',
  'Dropshipping',
  'Social-first',
  'B2B SaaS',
  'Agency',
  'Other',
]

export const BUSINESS_MODELS = [
  { value: 'ecommerce_store', label: 'E-commerce store (online only)' },
  { value: 'online_plus_offline_store', label: 'Online + offline store' },
  { value: 'online_plus_physical_service', label: 'Online + physical service' },
  { value: 'local_service_business', label: 'Local service business' },
  { value: 'content_social_business', label: 'Content / social business' },
  { value: 'marketplace_listing', label: 'Marketplace listing' },
]

export const BUSINESS_MODEL_HELPERS = {
  ecommerce_store:
    'We score product pages, prices, checkout signals, shipping/returns, and reviews.',
  online_plus_offline_store:
    'We score location, hours, contact info, and local trust — not just online checkout.',
  online_plus_physical_service:
    'We score quote/booking CTAs, service area, gallery proof, and reviews — not product cards.',
  local_service_business:
    'We score phone, service pages, local wording, and proof — not e-commerce checkout.',
  content_social_business:
    'We score social links, content depth, niche clarity, and audience-building CTAs.',
  marketplace_listing:
    'Marketplace URLs have limited brand control; scoring reflects listing-page constraints.',
}

export const EMPTY_BUSINESS_FORM = {
  owner_name: '',
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

export function businessToFormValues(business, displayName) {
  if (!business) {
    return {
      ...EMPTY_BUSINESS_FORM,
      owner_name: displayName || '',
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

export function serializeBusinessForm(form) {
  return {
    owner_name: form.owner_name.trim(),
    business_name: form.business_name.trim(),
    business_type: form.business_type,
    business_model: form.business_model,
    product_sold: form.product_sold.trim(),
    target_customers: form.target_customers.trim(),
    store_url: form.store_url.trim(),
    monthly_revenue: form.monthly_revenue === '' ? null : Number(form.monthly_revenue),
    customer_count: form.customer_count === '' ? null : Number(form.customer_count),
    monthly_orders: form.monthly_orders === '' ? null : Number(form.monthly_orders),
  }
}
