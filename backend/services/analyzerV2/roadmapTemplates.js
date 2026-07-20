/**
 * Business-model-specific roadmap templates.
 * The analyzer stays evidence-driven; these templates only control language per rubric.
 */

const {
  isContentRubric,
  isStoreRubric,
  isServiceRubric,
} = require('./evidenceFilters')

const CONVERSION_PATH = {
  ecommerce_store: {
    title: 'Put a clear Shop or Add to cart action above the fold',
    why_it_matters:
      'DTC shoppers decide in seconds whether to browse products — without an obvious shop path, paid traffic bounces before seeing the catalog.',
    steps: [
      'Add a persistent "Shop now" or "Add to cart" button above the fold.',
      'Repeat the primary CTA after your hero product or collection section.',
      'Link shipping, returns, and secure checkout cues near the buy action.',
      'Rescan after publishing to confirm the conversion-path cap clears.',
    ],
  },
  blog: {
    title: 'Make recipe navigation and newsletter signup obvious',
    why_it_matters:
      'Recipe readers need fast paths to categories, search, and email signup — not a generic contact or purchase CTA.',
    steps: [
      'Add clear category or recipe-type navigation above the fold.',
      'Place a newsletter signup near the top and after featured posts.',
      'Link a "start here" or popular recipes section for first-time readers.',
      'Improve internal links between related recipes.',
    ],
  },
  content_business: {
    title: 'Make niche navigation and subscribe paths obvious',
    why_it_matters:
      'Content businesses grow by helping readers find the right topic fast and capturing email — not by pushing phone or purchase CTAs.',
    steps: [
      'Add category or topic navigation above the fold.',
      'Place newsletter or follow CTAs near the hero and after key content.',
      'Add a "start here" page for new visitors.',
      'Link related articles to keep readers in your content loop.',
    ],
  },
  local_service_business: {
    title: 'Make the booking path obvious before visitors scroll',
    why_it_matters:
      'Local service customers decide quickly whether to call or book — hiding the path costs ready-to-hire leads.',
    steps: [
      'Add a "Book now" or "Get a quote" button above the fold.',
      'Show a clickable phone number in the header.',
      'State the areas you serve near the primary CTA.',
      'Repeat the booking CTA after your services section.',
    ],
  },
  default: {
    title: 'Give visitors one obvious next step on the homepage',
    why_it_matters:
      'Without one clear action, visitors read and leave instead of converting.',
    steps: [
      'Add one high-contrast primary CTA above the fold.',
      'Repeat that CTA further down the page.',
      'Remove competing buttons near the primary action.',
    ],
  },
}

const WEAK_CTA = {
  ecommerce_store: {
    title: 'Make the primary shop action impossible to miss',
    why_it_matters:
      'Shoppers who cannot immediately see how to browse or buy will bounce, even when the catalog is strong.',
    steps: CONVERSION_PATH.ecommerce_store.steps,
  },
  blog: CONVERSION_PATH.blog,
  content_business: CONVERSION_PATH.content_business,
  local_service_business: CONVERSION_PATH.local_service_business,
  default: CONVERSION_PATH.default,
}

const TRUST_MISSING = {
  ecommerce_store: {
    title: 'Add the checkout trust signals shoppers expect',
    why_it_matters:
      'Baymard research shows missing policies and weak checkout trust cues drive cart abandonment — a header phone is optional for DTC brands.',
    steps: [
      'Publish shipping, returns, and privacy policies and link them from footer and checkout.',
      'Show product reviews or star ratings near the product grid.',
      'Add secure-checkout and payment badges near the buy button.',
      'Offer Help / Contact via chat, email, or a contact page.',
    ],
  },
  blog: {
    title: 'Strengthen author trust and reader paths',
    why_it_matters:
      'Recipe readers trust the author, navigation, and subscribe path — commerce-style reviews are usually the wrong lever.',
    steps: [
      'Add an About page naming the author and why readers should trust the recipes.',
      'Make category and search navigation easy to find from the homepage.',
      'Place newsletter signup above the fold and after posts.',
      'Link active social profiles that prove the author is real.',
    ],
  },
  content_business: {
    title: 'Strengthen author trust and audience-building paths',
    why_it_matters:
      'Readers decide whether to trust content from the author, niche clarity, and subscribe path — not from product reviews.',
    steps: [
      'Add an About section explaining who creates the content.',
      'Clarify category navigation and what the site covers.',
      'Make newsletter or follow CTAs obvious above the fold.',
      'Link social profiles that reinforce legitimacy.',
    ],
  },
  local_service_business: {
    title: 'Add the trust details customers check before they book',
    why_it_matters:
      'Google and BrightLocal research supports complete business info, reviews, and contact clarity for local visibility and conversion.',
    steps: [
      'Add a clickable phone number in the header.',
      'Place reviews or testimonials near the booking CTA.',
      'State the cities or areas you serve.',
      'Add a short About section naming who runs the business.',
    ],
  },
  default: {
    title: 'Add stronger trust and proof signals',
    why_it_matters:
      'New visitors decide whether to trust a business within seconds — missing proof increases bounce before they reach your offer.',
    steps: [
      'Add visible contact or support paths appropriate to your business model.',
      'Place proof (reviews, policies, or author context) near the primary action.',
    ],
  },
}

function templateFor(map, rubric) {
  return map[rubric] || map.default
}

function conversionPathFix(rubric) {
  if (isServiceRubric(rubric)) {
    return (
      CONVERSION_PATH[rubric] ||
      CONVERSION_PATH.local_service_business ||
      CONVERSION_PATH.default
    )
  }
  if (isStoreRubric(rubric)) return CONVERSION_PATH.ecommerce_store
  if (isContentRubric(rubric)) return CONVERSION_PATH[rubric] || CONVERSION_PATH.blog
  return CONVERSION_PATH.default
}

function weakCtaFix(rubric) {
  if (isServiceRubric(rubric)) {
    return WEAK_CTA[rubric] || WEAK_CTA.local_service_business || WEAK_CTA.default
  }
  if (isStoreRubric(rubric)) return WEAK_CTA.ecommerce_store
  if (isContentRubric(rubric)) return WEAK_CTA[rubric] || WEAK_CTA.blog
  return WEAK_CTA.default
}

function trustMissingFix(rubric) {
  if (isServiceRubric(rubric)) {
    return TRUST_MISSING[rubric] || TRUST_MISSING.local_service_business
  }
  if (isStoreRubric(rubric)) return TRUST_MISSING.ecommerce_store
  if (isContentRubric(rubric)) return TRUST_MISSING[rubric] || TRUST_MISSING.blog
  return TRUST_MISSING.default
}

function defaultTrustSteps(rubric) {
  return trustMissingFix(rubric).steps
}

function defaultCtaSteps(rubric) {
  return conversionPathFix(rubric).steps
}

module.exports = {
  conversionPathFix,
  weakCtaFix,
  trustMissingFix,
  defaultTrustSteps,
  defaultCtaSteps,
  templateFor,
}
