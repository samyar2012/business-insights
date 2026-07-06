export const BUSINESS_TYPES = [
  'Shopify',
  'Dropshipping',
  'Social-first',
  'B2B SaaS',
  'Agency',
  'Other',
]

export const BUSINESS_MODELS = [
  { value: 'ecommerce_store', label: 'E-commerce store, online only' },
  { value: 'online_plus_offline_store', label: 'Online plus offline store' },
  { value: 'online_gallery_physical_service', label: 'Online gallery store with physical services' },
  { value: 'online_plus_physical_service', label: 'Online plus physical service' },
  { value: 'local_service_business', label: 'Local service business' },
  { value: 'content_business', label: 'Content business' },
  { value: 'blog', label: 'Blog' },
  { value: 'listing', label: 'Listing / marketplace profile' },
]

export const BUSINESS_MODEL_HELPERS = {
  ecommerce_store:
    'We score product discovery, pricing, checkout/cart path, shipping/returns, reviews, and mobile shopping UX.',
  online_plus_offline_store:
    'We score store/location info, hours, online catalog, visit/contact CTA, map signals, and local trust.',
  online_gallery_physical_service:
    'We score gallery quality, portfolio proof, service explanation, consultation/contact CTA, and inquiry path — not checkout.',
  online_plus_physical_service:
    'We score service explanation, quote/booking/contact flow, service area, proof, testimonials, and clarity.',
  local_service_business:
    'We score phone/contact, local area, service pages, reviews, booking/quote CTA, trust, and local SEO signals.',
  content_business:
    'We score niche clarity, content organization, social links, newsletter capture, audience CTAs, and creator identity.',
  blog:
    'We score article structure, readability, navigation, categories, internal links, author trust, and content depth.',
  listing:
    'We score listing title, images, description, reviews, CTA/contact/buy path, limitations, and trust — not full site structure.',
}

export const BUSINESS_MODEL_LABELS = Object.fromEntries(
  BUSINESS_MODELS.map((item) => [item.value, item.label]),
)

export function getBusinessModelLabel(model) {
  if (!model) return ''
  const aliases = {
    content_social_business: 'content_business',
    marketplace_listing: 'listing',
    online_plus_physical: 'online_plus_physical_service',
    physical_service: 'online_plus_physical_service',
    ecommerce: 'ecommerce_store',
    shopify: 'ecommerce_store',
    marketplace: 'listing',
  }
  const canonical = aliases[model] || model
  return BUSINESS_MODEL_LABELS[canonical] || canonical.replace(/_/g, ' ')
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

  const aliases = {
    content_social_business: 'content_business',
    marketplace_listing: 'listing',
    online_plus_physical: 'online_plus_physical_service',
    physical_service: 'online_plus_physical_service',
    ecommerce: 'ecommerce_store',
    shopify: 'ecommerce_store',
    marketplace: 'listing',
  }

  return {
    owner_name: business.owner_name || displayName || '',
    business_name: business.business_name || '',
    business_type: business.business_type || 'Shopify',
    business_model: aliases[business.business_model] || business.business_model || 'ecommerce_store',
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
