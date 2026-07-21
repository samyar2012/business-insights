// Fix Plan Engine: maps score-deduction evidence (crawler + visual audit + business-model
// rubric signals) into a small set of meaningful, evidence-backed fix items instead of one
// task per point deducted. See docs/fix-plan-research.md for the full mapping rationale.
const { CATEGORY_LABELS: CORE_CATEGORY_LABELS } = require('./explanationBuilder')
const {
  filterEvidenceLines,
  filterProblemLines,
  filterSteps,
  shouldDropFixForRubric,
  isPositiveEvidenceNote,
  isPillarFillerText,
  isGenericFillerStep,
  isGenericCommerceAdvice,
  isContentRubric,
} = require('./evidenceFilters')
const {
  conversionPathFix,
  weakCtaFix,
  trustMissingFix,
  defaultTrustSteps,
  defaultCtaSteps,
} = require('./roadmapTemplates')

const OFFER_TITLES = {
  ecommerce_store: 'Clarify your product catalog and pricing.',
  online_plus_offline_store: 'Strengthen your local storefront presence online.',
  online_plus_physical_service: 'Clarify your services and how customers book them.',
  local_service_business: 'Clarify your services and how customers book them.',
  online_gallery_physical_service: 'Showcase your work and simplify inquiries.',
  content_business: 'Clarify your niche and audience-building paths.',
  blog: 'Strengthen article depth and navigation.',
  listing: 'Improve your marketplace listing quality.',
}

const CTA_STEPS_BY_RUBRIC = {
  ecommerce_store: [
    'Add a persistent "Shop now" or "Add to cart" button above the fold.',
    'Repeat the primary CTA at the end of each product or category section.',
    'Use a high-contrast color for the CTA so it stands out from surrounding content.',
    'Remove or de-emphasize secondary buttons competing with the primary CTA.',
  ],
  online_plus_offline_store: [
    'Add a clear "Shop online" or "Visit us" CTA above the fold.',
    'Show store hours, address, and a "Get directions" button near the top.',
    'Repeat the primary CTA after your product or catalog section.',
    'Reduce competing buttons near the primary CTA.',
  ],
  online_plus_physical_service: [
    'Add a "Book now" or "Get a quote" button above the fold.',
    'Show your phone number as a clickable link in the header.',
    'Repeat the primary CTA after your services section.',
    'Reduce the number of competing buttons near the primary CTA.',
  ],
  local_service_business: [
    'Add a "Book now" or "Get a quote" button above the fold.',
    'Show your phone number as a clickable link in the header.',
    'State the areas or cities you serve near the CTA for local trust.',
    'Repeat the primary CTA after your services section.',
  ],
  online_gallery_physical_service: [
    'Add a "Request a consultation" or "Get a quote" CTA above the fold.',
    'Place the CTA near your strongest gallery or portfolio images.',
    'Show your phone number or a contact form as a backup action.',
    'Reduce the number of competing buttons near the primary CTA.',
  ],
  content_business: [
    'Add a clear "Subscribe" or "Follow" CTA above the fold.',
    'Repeat the CTA after your strongest piece of content.',
    'Link your most active social or newsletter channel near the CTA.',
  ],
  blog: [
    'Add an email signup CTA above the fold and after posts.',
    'Add category or "start here" navigation so readers know what to click next.',
    'Link social or newsletter follow prompts inside each post.',
  ],
  listing: [
    'Make sure your listing title and first image clearly state the offer.',
    'Add pricing, reviews, and clear next-step instructions in the listing description.',
    'Respond quickly to inquiries to keep the listing marked as responsive.',
  ],
}
const DEFAULT_CTA_STEPS = defaultCtaSteps('ecommerce_store')

// Business-model-specific trust/proof steps. Which proof signals matter (reviews, policies,
// service area, portfolio credibility) genuinely differs by business type, so this is not the
// same generic checklist for every site.
const TRUST_STEPS_BY_RUBRIC = {
  ecommerce_store: [
    'Publish shipping, returns, and privacy policies and link them from the footer and checkout.',
    'Show customer reviews or star ratings near the product grid and on product pages.',
    'Add recognizable trust badges (secure checkout, payment logos) near the buy button.',
    'Offer a clear Help / Contact path (chat, email, or contact page) — a header phone is optional for DTC brands.',
  ],
  online_plus_offline_store: [
    'Show your store address, hours, and phone number near the top of the homepage.',
    'Add a "Get directions" or map link for the physical location.',
    'Add customer reviews or ratings, especially pulled from Google/Maps.',
    'Publish any relevant in-store or online return policy.',
  ],
  online_plus_physical_service: [
    'Add a clickable phone number in the header.',
    'State the cities or areas you serve so local visitors know you cover them.',
    'Add reviews or testimonials from past clients near your services section.',
    'Add a short About section naming who runs the business.',
  ],
  local_service_business: [
    'Add a clickable phone number in the header.',
    'State the cities or areas you serve so local visitors know you cover them.',
    'Add reviews or testimonials from past clients near your services section.',
    'Add a short About section naming who runs the business.',
  ],
  online_gallery_physical_service: [
    'Add a visible contact or consultation-request method near your portfolio.',
    'Add client testimonials or before/after proof near your strongest work.',
    'Add a short About or artist statement so visitors know who they would be hiring.',
  ],
  blog: [
    'Add an About page naming the author and why readers should trust the recipes or posts.',
    'Strengthen category, search, or "start here" navigation so readers find recipes fast.',
    'Make the newsletter or email signup obvious above the fold and after posts.',
  ],
  content_business: [
    'Add an About page or section explaining who writes or runs the content.',
    'Link active social or newsletter profiles to reinforce legitimacy.',
    'Add a clear subscribe / start-here path so new readers know what to do next.',
  ],
  listing: [
    'Add clear contact or response information to the listing.',
    'Add reviews or ratings to the listing if the platform supports them.',
    'Respond quickly to inquiries to keep the listing marked as responsive.',
  ],
}
const DEFAULT_TRUST_STEPS = defaultTrustSteps('ecommerce_store')

// Business-model-specific content-depth steps. What "add more content" should actually mean
// differs sharply between a product catalog, a service page, and a blog.
const CONTENT_STEPS_BY_RUBRIC = {
  ecommerce_store: [
    'Write product descriptions that explain materials, sizing, or use cases, not just a title and price.',
    'Add category or collection pages that group related products.',
    'Add an FAQ or shipping/returns section that answers common buyer questions.',
  ],
  online_plus_offline_store: [
    'Add a short section on what makes your store worth visiting or ordering from.',
    'List your product categories or bestsellers with enough detail to act on.',
    'Add an FAQ covering shipping, pickup, or in-store availability.',
  ],
  online_plus_physical_service: [
    'Add a services section describing what is included and typical pricing or ranges.',
    'Add a short "what to expect" or process section.',
    'Add an FAQ answering common questions before someone books.',
  ],
  local_service_business: [
    'Add a services section describing what is included and typical pricing or ranges.',
    'Add a short "what to expect" or process section.',
    'Add an FAQ answering common questions before someone books.',
  ],
  online_gallery_physical_service: [
    'Add descriptions to portfolio pieces (materials, process, timeline).',
    'Add an FAQ about commissioning, booking, or pricing.',
  ],
  blog: [
    'Add recipe or post cards with clear titles, photos, and links from the homepage.',
    'Strengthen category and search navigation so readers find what they came for.',
    'Add a newsletter signup and internal links between related posts.',
  ],
  content_business: [
    'Publish additional articles or expand thin ones with more depth.',
    'Add an About or "start here" page so new readers know where to begin.',
    'Add category navigation and a clear subscribe path.',
  ],
  listing: [
    'Expand the listing description with the details buyers actually ask about.',
    'Add more photos or specifics that answer common buyer questions.',
  ],
}
const DEFAULT_CONTENT_STEPS = [
  'Expand the homepage with a clear description of what you offer and who it is for.',
  'Add supporting detail: process, materials, service area, or FAQs.',
  'Break the additional copy into short sections with headings.',
]

// Research grounding: every entry names a specific, published, verifiable study and (where the
// study gives one) its actual number. Rules for this map:
//   1. Only cite findings that can be found by searching the source name + the stat
//      (e.g. "Baymard cart abandonment 70%", "Google SOASTA bounce 32%", "Stanford web
//      credibility 46%", "Sistrix first result 28% clicks").
//   2. Never invent a percentage or attribute a claim to a source that did not publish it.
//   3. Picked per (fix category, business model) so an online store gets ecommerce research and
//      a local service business gets local-consumer research, not the same recycled sentence.
const RESEARCH_BASIS = {
  safety: {
    default:
      'Google Safe Browsing puts a full-screen red warning in front of flagged sites in Chrome, Firefox, and Safari - until the flag is cleared, that warning intercepts visitors before your page can load at all.',
  },
  functionality: {
    default:
      'Google/SOASTA research on 900,000+ mobile landing pages found bounce probability rises 32% as load time goes from 1 to 3 seconds, and Google reports 53% of mobile visits are abandoned when a page takes over 3 seconds to load.',
  },
  mobile: {
    default:
      'Google reports 53% of mobile visits are abandoned when a page takes over 3 seconds to load, and since mobile-first indexing Google ranks sites primarily by their mobile version - a broken phone layout costs both visitors and search rankings.',
  },
  business_fit: {
    ecommerce_store:
      "Nielsen Norman Group's page-visit research ('How Long Do Users Stay on Web Pages?') found most visitors leave within 10-20 seconds unless the value is clear - for a store, that means what you sell and roughly what it costs must be visible in that window.",
    online_plus_offline_store:
      "Think with Google's local search research found 76% of people who search for something nearby on their phone visit a related business within a day - but only when the offer, hours, and location are easy to find on the site.",
    online_plus_physical_service:
      "Nielsen Norman Group's page-visit research found most visitors leave within 10-20 seconds unless the value is clear - for a service business, that means the service, the area you cover, and how to book must be visible almost immediately.",
    local_service_business:
      "Nielsen Norman Group's page-visit research found most visitors leave within 10-20 seconds unless the value is clear - for a service business, that means the service, the area you cover, and how to book must be visible almost immediately.",
    online_gallery_physical_service:
      "Nielsen Norman Group's page-visit research found most visitors leave within 10-20 seconds - for a portfolio business, your strongest work and how to commission it have to land inside that window.",
    content_business:
      "Nielsen Norman Group's page-visit research found most visitors leave within 10-20 seconds unless the value is clear - readers decide in that window whether your niche matches what they came for.",
    blog:
      "Nielsen Norman Group's page-visit research found most visitors leave within 10-20 seconds unless the value is clear - readers decide in that window whether your niche matches what they came for.",
    listing:
      "Baymard Institute's product-page research finds shoppers judge a listing on photos and concrete specifics - listings missing them get skipped, not given the benefit of the doubt.",
    default:
      "Nielsen Norman Group's page-visit research ('How Long Do Users Stay on Web Pages?') found most visitors leave within 10-20 seconds unless the page communicates clear value in that window.",
  },
  customer_attraction: {
    ecommerce_store:
      "Baymard Institute's running average across ~50 cart-abandonment studies puts typical abandonment near 70% - their checkout surveys list an unclear path to purchase and not trusting the site among the top reasons shoppers give up.",
    online_plus_offline_store:
      "Think with Google's local search research found 76% of people who search for something nearby on their phone visit a related business within a day - an obvious 'shop online or visit us' action is what converts that intent.",
    online_plus_physical_service:
      "BrightLocal's annual Local Consumer Review Survey finds nearly all consumers read online reviews for local businesses and most have a minimum star rating they will consider - reviews plus an obvious way to call or book decide who gets contacted.",
    local_service_business:
      "BrightLocal's annual Local Consumer Review Survey finds nearly all consumers read online reviews for local businesses and most have a minimum star rating they will consider - reviews plus an obvious way to call or book decide who gets contacted.",
    online_gallery_physical_service:
      "Nielsen Norman Group's eye-tracking research shows visitors scan rather than read - an inquiry action placed next to your strongest work gets seen; one buried below it does not.",
    content_business:
      'The Data & Marketing Association measures email marketing at roughly a 42:1 return per unit spent - which is why one clear subscribe action beats any styling change for turning readers into a returning audience.',
    blog:
      'The Data & Marketing Association measures email marketing at roughly a 42:1 return per unit spent - which is why an above-the-fold email signup, repeated after posts, beats any styling change for audience growth.',
    listing:
      "Baymard Institute's product-page research finds shoppers rely on photos, pricing, and concrete specifics to judge an offer - listings missing them are skipped, not forgiven.",
    default:
      "Baymard Institute's conversion research consistently finds one clear, repeated next step outperforms pages with competing or missing calls to action.",
  },
  trust: {
    ecommerce_store:
      "In Baymard Institute's checkout surveys, roughly 1 in 5 US online shoppers report abandoning an order specifically because they didn't trust the site with their credit card information - visible contact details, policies, and reviews are the direct fix for that objection.",
    online_plus_physical_service:
      "BrightLocal's annual Local Consumer Review Survey finds nearly all consumers read online reviews before choosing a local business - missing reviews, contact details, or an identifiable owner sends them to a competitor who has them.",
    local_service_business:
      "BrightLocal's annual Local Consumer Review Survey finds nearly all consumers read online reviews before choosing a local business - missing reviews, contact details, or an identifiable owner sends them to a competitor who has them.",
    default:
      "Stanford's Web Credibility Research (the largest academic study of how people judge websites, 2,600+ participants) found people decide whether to trust a site within moments, based heavily on visible contact information, outside proof, and professionalism.",
  },
  content: {
    default:
      "Google's own search documentation explicitly targets 'thin content with little or no added value' for filtering, and its helpful-content system rewards pages with substantive first-hand detail - thin pages get filtered out of results before customers ever see them.",
  },
  seo: {
    default:
      "Sistrix's analysis of over 80 million search clicks found the first organic result takes roughly 28% of clicks with a steep drop-off below it - and title/description quality measurably shifts click-through even at the same ranking position.",
  },
  ux_ui: {
    default:
      "Stanford's Web Credibility Research found 46% of consumers assess a site's credibility from its visual design, and Nielsen Norman Group's eye-tracking studies show visitors read only about 20% of the words on a page - presentation problems cost trust before your offer is read.",
  },
  overall: {
    default:
      "Nielsen Norman Group's page-visit research ('How Long Do Users Stay on Web Pages?') found most visitors decide to stay or leave within the first 10-20 seconds - this issue hits that first-impression window for every single visitor.",
  },
}

const PILLAR_LABELS = {
  acquire: 'Acquire',
  convert: 'Convert',
  retain: 'Retain',
  operate: 'Operate',
}

function inferPillarFromFix(fix) {
  const id = String(fix.id || '')
  const category = String(fix.category || '')
  if (category === 'seo' || category === 'content' || id === 'benchmark_gap') return 'acquire'
  if (category === 'safety' || category === 'functionality') return 'operate'
  return 'convert'
}

function defaultOutcomeForPillar(pillar, rubric) {
  if (pillar === 'acquire') {
    return 'More qualified visitors discover the business through search, local listings, and social channels.'
  }
  if (pillar === 'retain') {
    return 'More first-time customers return and refer others because follow-up and reputation loops are in place.'
  }
  if (pillar === 'operate') {
    return ['online_plus_physical_service', 'local_service_business', 'online_gallery_physical_service'].includes(
      rubric,
    )
      ? 'Faster response and clearer service operations help the team convert more demand without bottlenecks.'
      : 'Operations can handle more demand without delays, confusion, or support overload.'
  }
  return 'More visitors from existing traffic become calls, bookings, inquiries, or checkouts.'
}

function askAiPromptFor(item) {
  const evidenceLine = item.evidence?.[0] ? `Use this evidence: ${item.evidence[0]}` : 'Use the current website report evidence.'
  return `I am executing Step ${item.rank}: "${item.title}" in my ${PILLAR_LABELS[item.pillar]} pillar. ${evidenceLine} Give me a practical implementation checklist for this business, including what to do first, exact copy/examples, and how to measure success this week.`
}

function researchBasisFor(category, rubric) {
  const entry = RESEARCH_BASIS[category]
  if (!entry) return null
  return entry[rubric] || entry.default || null
}

const CATCHALL_TITLES = {
  safety_trust: 'Shore up remaining trust and safety gaps.',
  technical_functionality: 'Resolve remaining technical crawl issues.',
  ux_ui_visual: 'Polish remaining layout and readability issues.',
  customer_attraction: 'Strengthen remaining conversion signals.',
}
const CATCHALL_GRANULAR = {
  safety_trust: 'trust',
  technical_functionality: 'functionality',
  ux_ui_visual: 'ux_ui',
  customer_attraction: 'customer_attraction',
}

const VERIFY_STEPS_BY_RUBRIC = {
  blog: [
    'Check category navigation, search, and newsletter signup on a phone-sized screen.',
    'Rescan after publishing to confirm reader paths improved.',
  ],
  content_business: [
    'Check topic navigation and subscribe paths on a phone-sized screen.',
    'Rescan after publishing to confirm reader paths improved.',
  ],
  ecommerce_store: [
    'Verify Shop / Add to cart is visible above the fold on mobile.',
    'Rescan after publishing to confirm checkout trust cues improved.',
  ],
  local_service_business: [
    'Verify booking or quote CTA and phone link work on mobile.',
    'Rescan after publishing to confirm the service path improved.',
  ],
  default: [
    'Apply the change on the homepage and retest on a phone-sized screen.',
    'Rescan after publishing to confirm the related category scores improved.',
  ],
}

function verifyStepsFor(rubric) {
  return VERIFY_STEPS_BY_RUBRIC[rubric] || VERIFY_STEPS_BY_RUBRIC.default
}

function dedupe(list) {
  return [...new Set((list || []).filter(Boolean))]
}

function claim(events, categories, pattern) {
  const cats = Array.isArray(categories) ? categories : [categories]
  const matched = events.filter((e) => !e.used && cats.includes(e.category) && pattern.test(e.text))
  matched.forEach((e) => {
    e.used = true
  })
  return matched
}

function collectEvents({ categoryDetails = {}, uxFeatures = {}, capReasons = [], rubric = null }) {
  const events = []
  const seenText = new Set()
  const push = (category, text, extra = {}) => {
    const trimmed = String(text || '').trim()
    if (!trimmed || isPositiveEvidenceNote(trimmed) || isPillarFillerText(trimmed)) return
    if (rubric && isGenericCommerceAdvice(trimmed, rubric)) return
    events.push({ category, text: trimmed, used: false, ...extra })
  }

  for (const cap of capReasons || []) {
    push('overall', cap.reason, { kind: 'cap', capId: cap.cap })
  }

  for (const [category, detail] of Object.entries(categoryDetails)) {
    for (const problem of filterProblemLines(detail.problems || [], rubric)) {
      push(category, problem, { kind: 'problem' })
      seenText.add(problem)
    }
  }

  for (const item of categoryDetails.customer_attraction?.point_breakdown || []) {
    if ((item.earned || 0) > 0) continue
    const text = item.type === 'penalty' ? `${item.label}: ${item.note}` : item.note
    if (!text || seenText.has(text)) continue
    push('customer_attraction', text, { kind: item.type === 'penalty' ? 'penalty' : 'breakdown_zero', key: item.key })
    seenText.add(text)
  }

  for (const key of ['readability_problems', 'layout_problems', 'visual_problems']) {
    for (const problem of filterProblemLines(uxFeatures?.[key] || [], rubric)) {
      if (seenText.has(problem)) continue
      push('ux_ui_visual', problem, { kind: 'ux_feature' })
      seenText.add(problem)
    }
  }

  return events
}

function priorityFromGap(categoryDetails, affectedScores) {
  let maxRatio = 0
  for (const key of affectedScores) {
    const detail = categoryDetails?.[key]
    if (!detail || !detail.max) continue
    maxRatio = Math.max(maxRatio, 1 - detail.score / detail.max)
  }
  if (maxRatio >= 0.65) return 'critical'
  if (maxRatio >= 0.45) return 'high'
  if (maxRatio >= 0.25) return 'medium'
  return 'low'
}

function estimateLift(affectedScores, categoryDetails, matchedCount) {
  const parts = []
  for (const key of affectedScores) {
    const detail = categoryDetails?.[key]
    if (!detail || !detail.max) continue
    const gap = Math.max(0, detail.max - detail.score)
    if (gap <= 0) continue
    const portion = matchedCount >= 3 ? 0.55 : matchedCount === 2 ? 0.4 : 0.3
    const high = Math.max(1, Math.round(gap * portion))
    const low = Math.max(1, Math.min(high, Math.round(high * 0.5)))
    parts.push({ key, low, high })
  }
  if (!parts.length) {
    return { label: 'Removes a blocker that is currently limiting your overall score.', parts: [] }
  }
  const label = parts
    .map((p) => `+${p.low}-${p.high} pts (${CORE_CATEGORY_LABELS[p.key] || String(p.key).replace(/_/g, ' ')})`)
    .join(', ')
  return { label, parts }
}

function finalizeSteps(rawSteps, rubric = null) {
  let steps = filterSteps(
    dedupe((rawSteps || []).map((s) => String(s).trim()).filter(Boolean)),
    rubric,
  )
  if (steps.length > 6) steps = steps.slice(0, 6)
  const verify = verifyStepsFor(rubric)
  for (const filler of verify) {
    if (steps.length >= 3) break
    if (!steps.includes(filler)) steps.push(filler)
  }
  if (!steps.some((s) => /rescan/i.test(s))) {
    steps.push('Rescan your website after making changes to confirm the score improves.')
  }
  return dedupe(steps).slice(0, 6)
}

function relatedPagesFor(category, pages) {
  const list = pages || []
  const home = list.find((p) => p.page_type === 'homepage') || list[0]
  const results = []
  const pageUrl = (p) => p?.final_url || p?.url || null
  if (home && pageUrl(home)) results.push({ url: pageUrl(home), title: home.title || 'Homepage' })

  const keywordMap = {
    trust: /contact|about/i,
    customer_attraction: /contact|shop|services|pricing/i,
    business_fit: /shop|products|services|pricing|gallery/i,
    seo: /homepage/i,
  }
  const pattern = keywordMap[category]
  if (pattern) {
    for (const page of list) {
      if (results.length >= 2) break
      if (page === home) continue
      const type = String(page.page_type || '').toLowerCase()
      if (pattern.test(type) && pageUrl(page)) {
        results.push({ url: pageUrl(page), title: page.title || type })
      }
    }
  }
  return results.slice(0, 2)
}

// --- individual clusters -----------------------------------------------------------------

function runUnsafeSite(events) {
  const matched = claim(events, ['overall', 'safety_trust'], /unsafe|malware|phishing|flagged this site/i)
  if (!matched.length) return null
  return {
    id: 'unsafe_site',
    title: 'Resolve the Safe Browsing safety flag before driving any traffic.',
    category: 'safety',
    why_it_matters:
      'Browsers, search engines, and ad platforms actively warn visitors away from sites flagged as unsafe, so this must be fixed before any other marketing spend is worthwhile.',
    steps: [
      'Confirm the exact threat type and affected URLs in Google Search Console / Safe Browsing.',
      'Remove or quarantine the malicious, phishing, or injected content that triggered the flag.',
      'Scan the site and server for malware, injected scripts, or compromised plugins.',
      'Request a review from Google Safe Browsing once the site is clean.',
      'Rescan your website after the review clears to confirm the flag is gone.',
    ],
    affected: ['safety_trust'],
    difficulty: 'hard',
    forcedPriority: 'critical',
    matched,
  }
}

function runHomepageDown(events) {
  const matched = claim(events, ['overall', 'technical_functionality'], /homepage failed to load|homepage did not load successfully/i)
  if (!matched.length) return null
  return {
    id: 'homepage_down',
    title: 'Fix homepage errors so the site reliably loads.',
    category: 'functionality',
    why_it_matters:
      'If the homepage does not reliably load, every other improvement is wasted because visitors and search engines cannot reach the business at all.',
    steps: [
      'Check hosting status and SSL certificate validity right now.',
      'Test the homepage URL from multiple networks and devices to confirm the outage.',
      'Review server error logs for the failure cause (DNS, SSL, or server error).',
      'Fix the underlying issue with your host or developer and confirm a successful page load.',
      'Rescan the site once the homepage loads successfully.',
    ],
    affected: ['technical_functionality'],
    difficulty: 'hard',
    forcedPriority: 'critical',
    matched,
  }
}

function runCrawlBlocked(events) {
  const matched = claim(
    events,
    ['technical_functionality', 'overall'],
    /blocked automated crawling|bot protection|http 403/i,
  )
  if (!matched.length) return null
  return {
    id: 'crawl_blocked',
    title: 'This site blocked automated crawling — rescan with a real browser.',
    category: 'functionality',
    why_it_matters:
      'When the site returns HTTP 403 or a bot challenge, the analyzer cannot see products, offers, or layout — any scores from that crawl are incomplete and should not drive roadmap decisions.',
    steps: [
      'Enable browser/Playwright crawling (CRAWLER_USE_PLAYWRIGHT=true) and a rendered visual audit.',
      'Rescan the homepage and key pages after the browser fetch succeeds.',
      'If the site still blocks bots, whitelist your crawler IP or use an approved monitoring path.',
      'Treat the previous crawl-only roadmap as incomplete until a successful browser scan finishes.',
    ],
    affected: ['technical_functionality'],
    difficulty: 'medium',
    forcedPriority: 'critical',
    matched,
  }
}

function runEcommerceCatalog(events, ctx) {
  const rubric = ctx?.rubric || ''
  if (rubric !== 'ecommerce_store' && rubric !== 'online_plus_offline_store') return null
  const matched = claim(
    events,
    ['offer_business_fit', 'customer_attraction'],
    /no reliable product|no extractable products|catalog layout|collection pages|product cards|no clear product pricing/i,
  )
  if (!matched.length) return null
  return {
    id: 'ecommerce_catalog',
    title: 'Make product and collection pages obvious to shoppers.',
    category: 'business_fit',
    why_it_matters:
      'DTC shoppers need a clear path into collections and product cards — without that, paid traffic never reaches a buyable item.',
    steps: [
      'Publish collection pages with named products, images, and prices.',
      'Link Shop / Collections from the header above the fold.',
      'Ensure product cards include name, price, image, and a detail-page link.',
      'Server-render product names and prices so crawlers and SEO can read the catalog.',
    ],
    affected: ['offer_business_fit', 'customer_attraction'],
    difficulty: 'medium',
    matched,
  }
}

function runEcommerceCheckoutTrust(events, ctx) {
  const rubric = ctx?.rubric || ''
  if (rubric !== 'ecommerce_store' && rubric !== 'online_plus_offline_store') return null
  // Prefer dedicated checkout/policy wording; contact-trust runner still handles soft placement.
  const matched = claim(
    events,
    ['offer_business_fit', 'safety_trust', 'customer_attraction'],
    /no shipping or returns policy|expected ecommerce policies|no customer reviews or testimonials detected|no add-to-cart, buy now, or checkout path/i,
  )
  if (!matched.length) return null
  // If weak_cta already claimed the checkout line, still allow policy/review bundle.
  const policyOrReviews = matched.filter((e) => /shipping|returns|policy|review|testimonial/i.test(e.text))
  const checkoutOnly = matched.filter((e) => /add-to-cart|checkout path/i.test(e.text))
  const use = policyOrReviews.length ? policyOrReviews : checkoutOnly
  if (!use.length) return null
  return {
    id: 'ecommerce_checkout_trust',
    title: 'Add the checkout trust signals shoppers expect.',
    category: 'trust',
    why_it_matters:
      'Missing shipping/returns policies and review proof near buy actions drive cart abandonment even when the catalog is strong.',
    steps: [
      'Publish shipping, returns, and privacy policies and link them from footer and checkout.',
      'Show product reviews or star ratings near product grids and PDP buy buttons.',
      'Add a visible Shop / Add to cart path above the fold if it is missing.',
      'Add secure-checkout or payment badges near the buy action.',
    ],
    affected: ['offer_business_fit', 'safety_trust', 'customer_attraction'],
    difficulty: 'medium',
    matched: use,
  }
}

function runBusinessModelMismatch(events, ctx) {
  const matched = claim(events, ['overall'], /business model badly mismatches/i)
  if (!matched.length) return null

  const aggregated = ctx?.aggregated || {}
  const pages = ctx?.pages || []
  const pageText = pages.map((p) => String(p.extracted_text || '')).join(' ')
  const ctaBlob = (aggregated.content_signals?.ctas || []).join(' ')
  const hasServiceConversion =
    Boolean(aggregated.contact_signals?.phones?.length) ||
    Boolean(aggregated.contact_signals?.has_tel) ||
    Boolean(aggregated.contact_signals?.has_text_phone) ||
    Boolean(aggregated.contact_signals?.has_contact_cta) ||
    Boolean(aggregated.trust_signals?.review_indicators) ||
    (aggregated.services || []).length > 0 ||
    /quote|consultation|estimate|book now|schedule|free in-home|in-home consult|request (a )?consult/i.test(
      `${ctaBlob} ${pageText}`,
    )

  // Hybrid product+service sites (blinds, shades, cleaning, etc.) are not mismatches
  if (
    ['online_plus_physical_service', 'local_service_business', 'online_gallery_physical_service', 'online_plus_offline_store'].includes(
      ctx?.rubric,
    ) &&
    hasServiceConversion
  ) {
    return null
  }

  return {
    id: 'business_model_mismatch',
    title: 'Resolve the business model mismatch.',
    category: 'business_fit',
    why_it_matters:
      'When the selected business model does not match what the crawler finds on the site, scoring becomes unreliable and visitors may also be confused about what you actually offer.',
    steps: [
      'Re-check the business model selected during onboarding.',
      'Update the business model in your profile if the site has genuinely changed direction.',
      'Otherwise, update homepage content so it matches the selected business model.',
      'Rescan after aligning the business model with your site content.',
    ],
    affected: ['offer_business_fit'],
    difficulty: 'medium',
    forcedPriority: 'medium',
    confidence: 'medium',
    matched,
  }
}

function runNoConversionPath(events, ctx) {
  const matched = claim(events, ['overall'], /no clear cta, contact, or purchase path/i)
  if (!matched.length) return null
  const rubric = ctx?.rubric || 'ecommerce_store'
  const tpl = conversionPathFix(rubric)
  return {
    id: 'no_conversion_path',
    title: tpl.title,
    category: 'customer_attraction',
    why_it_matters: tpl.why_it_matters,
    steps: tpl.steps,
    affected: ['customer_attraction'],
    difficulty: 'easy',
    forcedPriority: 'critical',
    matched,
  }
}

function runMobileOverflow(events, ctx) {
  const signals = ctx.uxFeatures?.signals || {}
  // Hard contradiction gate: visual audit said no overflow → never recommend overflow fixes
  if (
    signals.horizontal_overflow_mobile === false ||
    signals.overflow_severity_mobile === 'none' ||
    signals.overflow_px_mobile === 0
  ) {
    return null
  }

  const severe = claim(
    events,
    ['overall', 'ux_ui_visual', 'technical_functionality', 'customer_attraction'],
    /severe mobile layout overflow/i,
  )
  const possible = claim(
    events,
    ['overall', 'ux_ui_visual', 'technical_functionality', 'customer_attraction'],
    /possible mobile layout issue|minor mobile horizontal overflow/i,
  )
  const overflowProof = signals.overflow_offenders_mobile || []
  const overflowPx = signals.overflow_px_mobile
  const severity = signals.overflow_severity_mobile
  const horizontal = signals.horizontal_overflow_mobile === true

  // Require measured horizontal overflow — never invent from layout_balance or severity alone
  if (!horizontal) return null

  if (severe.length && overflowProof.length && severity === 'major') {
    const matched = [...severe]
    matched.push({
      text: `Overflowing element: ${overflowProof[0].selector || 'unknown'}${overflowProof[0].text ? ` (“${overflowProof[0].text}”)` : ''}`,
    })
    if (overflowPx != null) matched.push({ text: `Measured overflow ~${Math.round(overflowPx)}px at mobile viewport.` })
    return {
      id: 'mobile_overflow',
      title: 'Fix mobile layout overflow and horizontal scrolling.',
      category: 'mobile',
      why_it_matters:
        'Horizontal scrolling or overflowing content on phones makes the site feel broken, which drives mobile visitors away before they ever see your offer.',
      steps: [
        'Test the homepage on a real phone or a 375px-wide browser emulator.',
        `Inspect the overflowing element (${overflowProof[0].selector || 'widest container'}) and constrain its width.`,
        'Add responsive widths (max-width: 100%) to the affected elements.',
        'Re-test at 375px and 414px widths to confirm the scrolling is gone.',
        'Rescan your website once the overflow is fixed.',
      ],
      affected: ['ux_ui_visual'],
      difficulty: 'hard',
      forcedPriority: 'high',
      confidence: 'high',
      matched,
    }
  }

  if (possible.length || severity === 'minor' || (severity === 'major' && !overflowProof.length)) {
    return {
      id: 'mobile_overflow_verify',
      title: 'Verify a possible mobile layout issue.',
      category: 'mobile',
      why_it_matters:
        'A possible overflow was flagged without strong element-level proof. Confirm it on a real phone before investing in a layout rewrite.',
      steps: [
        'Open the flagged page at ~390px width and check for horizontal scrolling.',
        'If scrolling appears, identify the widest element and constrain it with max-width: 100%.',
        'If no scrolling appears, no action is needed — rescan to clear the soft warning.',
      ],
      affected: ['ux_ui_visual'],
      difficulty: 'medium',
      forcedPriority: 'low',
      confidence: 'low',
      matched: possible.length
        ? possible
        : [{ text: `Possible mobile overflow to verify${overflowPx != null ? ` (~${Math.round(overflowPx)}px)` : ''}.` }],
    }
  }

  return null
}

function runMobileReadability(events, ctx) {
  // Static crawl text is not above-fold proof — require a rendered visual audit.
  const visualOk = Boolean(
    ctx?.uxFeatures?.source === 'visual_audit+crawler' ||
      ctx?.uxFeatures?.ux_scoring_inputs?.visual_audit_ok ||
      ctx?.uxFeatures?.signals?.visual_audit_ok,
  )
  if (!visualOk) return null

  const matched = claim(
    events,
    ['ux_ui_visual', 'customer_attraction'],
    /dense|text block|paragraph|readability|tiring copy|hard to scan|hard to read/i,
  )
  if (!matched.length) return null
  return {
    id: 'mobile_readability',
    title: 'Improve mobile readability above the fold.',
    category: 'mobile',
    why_it_matters:
      'Dense text above the fold makes visitors scan past your message before they reach your call to action, which lowers both how the site feels to use and how many visitors act on it.',
    steps: [
      'Shorten the hero paragraph to 2-3 lines and move supporting detail below the fold.',
      'Break long paragraphs into short sentences with subheadings or bullet points.',
      'Increase base font size and line spacing on mobile screens.',
      'Test the homepage on a 375px-wide viewport and confirm the CTA is visible without scrolling.',
    ],
    affected: ['ux_ui_visual', 'customer_attraction'],
    difficulty: 'medium',
    matched,
  }
}

function runWeakCta(events, ctx) {
  const matched = claim(
    events,
    ['customer_attraction', 'offer_business_fit'],
    /no add-to-cart, buy now, or checkout|no consultation, quote, shop, or contact|no clear inquiry or consultation|no directions or visit-store|no clear action path|no visible phone, contact, booking, or purchase/i,
  )
  if (!matched.length) return null
  const rubric = ctx.rubric
  const tpl = weakCtaFix(rubric)
  return {
    id: 'weak_cta',
    title: tpl.title,
    category: 'customer_attraction',
    why_it_matters: tpl.why_it_matters,
    steps: CTA_STEPS_BY_RUBRIC[rubric] || defaultCtaSteps(rubric),
    affected: ['customer_attraction', 'offer_business_fit'],
    difficulty: 'easy',
    matched,
  }
}

function runMissingTrust(events, ctx) {
  const rubric = ctx.rubric || ''
  const isContent = rubric === 'blog' || rubric === 'content_business'
  const isEcommerce = rubric === 'ecommerce_store'

  const absoluteMissing = claim(
    events,
    ['safety_trust', 'customer_attraction', 'offer_business_fit'],
    /no phone, email, contact form, or clear contact cta was found|no phone number or email found on crawled pages|expected ecommerce policies|business name or identity is unclear|no on-page reviews, testimonials, or rating markup|no testimonial or review proof visible|no customer reviews or testimonials|no reviews or local proof|no phone number or contact page detected|no review or testimonial proof|no shipping or returns policy signals found/i,
  )
  const softContact = claim(
    events,
    ['safety_trust', 'customer_attraction'],
    /contact path exists but may be hard|contact details were not clearly detected|a contact path exists \(form/i,
  )
  const softReviews = claim(
    events,
    ['safety_trust', 'customer_attraction'],
    /review or rating signals exist but may need|possible review language was detected|review or testimonial proof was not clearly detected/i,
  )

  // Blogs/content sites: commerce-style reviews are not the growth lever — drop review claims.
  const filteredAbsolute = isContent
    ? absoluteMissing.filter((e) => !/review|testimonial|rating markup/i.test(e.text))
    : absoluteMissing
  const filteredSoftReviews = isContent ? [] : softReviews

  // DTC ecommerce: phone-in-header is not a top trust move when policies/reviews are the gap.
  const ecommerceAbsolute = isEcommerce
    ? filteredAbsolute.filter((e) => {
        if (/expected ecommerce policies|shipping or returns policy/i.test(e.text)) return true
        if (/review|testimonial|rating/i.test(e.text)) return true
        if (/business name or identity/i.test(e.text)) return true
        // Keep absolute contact absence only when no phone AND no email/form wording
        if (/no phone, email, contact form|no phone number or email found/i.test(e.text)) return true
        if (/no phone number or contact page/i.test(e.text) && !/email|form|chat|help/i.test(e.text)) {
          return false
        }
        return true
      })
    : filteredAbsolute

  if (ecommerceAbsolute.length || filteredAbsolute.length) {
    const matched = isEcommerce ? ecommerceAbsolute : filteredAbsolute
    if (!matched.length && !filteredSoftReviews.length && !softContact.length) return null
    if (matched.length) {
      const tpl = trustMissingFix(ctx.rubric)
      return {
        id: 'missing_contact_trust',
        title: tpl.title,
        category: 'trust',
        why_it_matters: tpl.why_it_matters,
        steps: TRUST_STEPS_BY_RUBRIC[ctx.rubric] || defaultTrustSteps(ctx.rubric),
        affected: ['safety_trust', 'customer_attraction'],
        difficulty: 'easy',
        confidence: 'high',
        matched,
      }
    }
  }

  if (softContact.length || filteredSoftReviews.length) {
    const matched = [...softContact, ...filteredSoftReviews]
    const isPlacement = softContact.some((e) => /hard for visitors to notice|weakly|contact path exists/i.test(e.text))
    const isReviewPlacement = filteredSoftReviews.some((e) =>
      /placement|attribution|possible review language/i.test(e.text),
    )
    const softSteps = isReviewPlacement
      ? [
          'Move your strongest review or testimonial near the primary offer above the fold.',
          'Name the source (Google, customers, platform) next to each quote or rating.',
          'Keep at least one fresh review visible on the homepage.',
        ]
      : isEcommerce
        ? [
            'Add a clear Help / Contact or chat entry in the header or footer.',
            'Link shipping and returns near the buy button or cart.',
            'Keep support email or contact form easy to find without requiring a phone number.',
          ]
        : isContent
          ? [
              'Make the About / author link easy to find from the homepage.',
              'Place newsletter signup above the fold and after posts.',
              'Link social profiles that prove the author is active.',
            ]
          : [
              'Place a clickable phone number or email in the header.',
              'Repeat a clear Contact / Book / Quote CTA above the fold.',
              'Keep footer contact details as a backup, not the only path.',
            ]
    return {
      id: 'strengthen_trust_visibility',
      title: isReviewPlacement && !isPlacement
        ? 'Improve review visibility and attribution.'
        : isPlacement && !isReviewPlacement
          ? isEcommerce
            ? 'Make Help / Contact easier to find.'
            : isContent
              ? 'Make author and subscribe paths more visible.'
              : 'Make the contact path more visible.'
          : 'Strengthen trust signal visibility.',
      category: 'trust',
      why_it_matters:
        'Trust signals that exist but are hard to notice still leave first-time visitors unsure. Clearer placement usually converts better than adding brand-new content.',
      steps: softSteps,
      affected: ['safety_trust', 'customer_attraction'],
      difficulty: 'easy',
      forcedPriority: 'medium',
      confidence: 'medium',
      matched,
    }
  }

  return null
}

function runThinContent(events, ctx) {
  const matched = claim(
    events,
    ['technical_functionality', 'customer_attraction', 'offer_business_fit'],
    /very little readable content|thin homepage content|content depth is too thin|few article pages or posts/i,
  )
  if (!matched.length) return null
  const steps = dedupe([...(CONTENT_STEPS_BY_RUBRIC[ctx.rubric] || DEFAULT_CONTENT_STEPS), 'Rescan after publishing the additional content.'])
  return {
    id: 'thin_content',
    title: 'Add more substantive content to key pages.',
    category: 'content',
    why_it_matters:
      'Thin pages give visitors and search engines almost nothing to evaluate the business on, which hurts both first impressions and organic discovery.',
    steps,
    affected: ['technical_functionality', 'customer_attraction'],
    difficulty: 'medium',
    matched,
  }
}

function runNoHttps(events) {
  const matched = claim(events, ['safety_trust'], /https was not detected/i)
  if (!matched.length) return null
  return {
    id: 'no_https',
    title: 'Enable HTTPS across the entire domain.',
    category: 'safety',
    why_it_matters:
      'Without HTTPS, browsers show a "not secure" warning that can scare visitors away before they read anything, and many ad platforms will not run traffic to insecure pages.',
    steps: [
      'Install an SSL certificate through your host or a free provider like Let\'s Encrypt.',
      'Force-redirect all HTTP traffic to HTTPS.',
      'Update internal links and assets to use HTTPS URLs.',
      'Rescan to confirm the secure padlock appears on every page.',
    ],
    affected: ['safety_trust'],
    difficulty: 'easy',
    forcedPriority: 'high',
    matched,
  }
}

function runNoMobileViewport(events) {
  const matched = claim(events, ['technical_functionality'], /no mobile viewport meta tag/i)
  if (!matched.length) return null
  return {
    id: 'no_mobile_viewport',
    title: 'Add responsive mobile viewport support.',
    category: 'mobile',
    why_it_matters:
      'Without a mobile viewport tag, phones may render a zoomed-out desktop layout, forcing visitors to pinch and zoom just to read the page.',
    steps: [
      'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the page head.',
      'Confirm your theme or template uses responsive CSS breakpoints.',
      'Test the homepage on a real phone after the change.',
      'Rescan to confirm mobile rendering improves.',
    ],
    affected: ['technical_functionality'],
    difficulty: 'hard',
    matched,
  }
}

function runJsRenderedSparse(events) {
  const matched = claim(events, ['technical_functionality'], /sparse or js-rendered html/i)
  if (!matched.length) return null
  return {
    id: 'js_rendered_sparse',
    title: 'Serve key content in crawlable, server-rendered HTML.',
    category: 'functionality',
    why_it_matters:
      'When content only appears after JavaScript runs, some crawlers, link previews, and slower devices see a mostly empty page, which hurts both SEO and first impressions.',
    steps: [
      'Server-render (or statically generate) the homepage and top landing pages.',
      'Confirm headings, offer copy, and CTAs are present in the initial HTML response.',
      'Use progressive enhancement for interactive widgets rather than requiring JS for core content.',
      'Rescan to confirm readable content is now detected without JavaScript.',
    ],
    affected: ['technical_functionality'],
    difficulty: 'hard',
    matched,
  }
}

function runWeakSeoMeta(events) {
  const matched = claim(events, ['customer_attraction'], /weak seo title\/meta\/heading clarity/i)
  if (!matched.length) return null
  return {
    id: 'weak_seo_meta',
    title: 'Strengthen SEO title, meta, and heading clarity.',
    category: 'seo',
    why_it_matters:
      'A missing or vague title, meta description, or heading makes it harder for search visitors to know what they will find, which lowers click-through even when you rank.',
    steps: [
      'Write a homepage <title> that names the business and its core offer.',
      'Add a meta description summarizing the offer and a reason to click.',
      'Confirm a single, descriptive H1 states what the page is about.',
      'Rescan after publishing the updated title, meta, and heading.',
    ],
    affected: ['customer_attraction'],
    difficulty: 'easy',
    matched,
  }
}

function runNavClutter(events, ctx) {
  const matched = claim(events, ['ux_ui_visual', 'customer_attraction'], /overcrowded|navigation clutter|primary nav links/i)
  if (!matched.length) return null
  const rubric = ctx?.rubric || ''
  const isStore = rubric === 'ecommerce_store' || rubric === 'online_plus_offline_store'
  const visualOk = Boolean(
    ctx?.uxFeatures?.source === 'visual_audit+crawler' || ctx?.uxFeatures?.ux_scoring_inputs?.visual_audit_ok,
  )
  // Mega-menu HTML often looks "cluttered" in crawls for DTC brands — require rendered proof.
  if (isStore && !visualOk) return null
  return {
    id: 'nav_clutter',
    title: isStore ? 'Simplify shop navigation above the fold.' : 'Simplify navigation above the fold.',
    category: 'ux_ui',
    why_it_matters: isStore
      ? 'Too many top-level shop links make buyers hesitate about where to start — clearer collection paths usually convert better than a packed mega-menu.'
      : 'Too many top-level choices make visitors hesitate about what to click first, which slows them down on the way to your primary offer.',
    steps: isStore
      ? [
          'Keep 5-8 primary shop links visible (collections, bestsellers, sale) and tuck the rest into menus.',
          'Make Shop / Collections the clearest path above the fold.',
          'Do not let promo banners replace real collection navigation.',
          'Rescan after simplifying the navigation.',
        ]
      : [
          'Group secondary links into a small number of dropdown menus.',
          'Keep 4-6 primary links visible in the main navigation.',
          'Make sure the primary CTA is not competing with navigation for attention.',
          'Rescan after simplifying the navigation.',
        ],
    affected: ['ux_ui_visual', 'customer_attraction'],
    difficulty: 'easy',
    matched,
  }
}

function runVisualPolish(events) {
  const matched = claim(
    events,
    ['customer_attraction'],
    /overall visual appeal|polish & modern feel/i,
  )
  if (!matched.length) return null
  // Require concrete scored penalty text — skip generic layout cleanliness filler
  const concrete = matched.filter((e) => /visual appeal index|display polish|overall visual score/i.test(e.text))
  if (!concrete.length) return null
  return {
    id: 'visual_polish',
    title: 'Refresh visual polish and layout cleanliness.',
    category: 'ux_ui',
    why_it_matters:
      'A dated or cluttered layout lowers trust before visitors read a single word - people judge credibility from visual polish within seconds of landing.',
    steps: [
      'Standardize spacing, alignment, and section widths across the homepage.',
      'Refresh imagery so it matches a consistent style and aspect ratio.',
      'Reduce competing colors and fonts to a small, consistent palette.',
      'Rescan after the visual refresh to confirm the improvement.',
    ],
    affected: ['customer_attraction', 'ux_ui_visual'],
    difficulty: 'medium',
    confidence: 'medium',
    matched: concrete,
  }
}

function runMisalignedImages(events, ctx) {
  const alignConfidence =
    ctx?.uxFeatures?.visual_evidence_summary?.misalignment_confidence ??
    ctx?.uxFeatures?.signals?.misalignment_confidence ??
    0
  if (!(Number(alignConfidence) > 0)) return null

  const matched = claim(
    events,
    ['customer_attraction'],
    /^image alignment:|images look misaligned or poorly fitted/i,
  )
  if (!matched.length) return null
  // Never keep a fix when evidence/strengths say alignment is fine
  const strengthBlob = collectStrengthBlob(ctx.categoryDetails)
  if (/no image alignment issue detected/i.test(`${matched.map((e) => e.text).join(' ')} ${strengthBlob}`)) {
    return null
  }
  return {
    id: 'misaligned_images',
    title: 'Fix misaligned or poorly fitted images.',
    category: 'ux_ui',
    why_it_matters:
      'Misaligned images read as unfinished or low-effort, which undermines trust even when the underlying offer is strong.',
    steps: [
      'Crop images to a consistent aspect ratio before uploading.',
      'Align image grids to the same top/bottom edges and spacing.',
      'Use object-fit: cover (or equivalent) so images fill their containers cleanly.',
      'Rescan after fixing image alignment.',
    ],
    affected: ['customer_attraction'],
    difficulty: 'medium',
    confidence: Number(alignConfidence) >= 0.6 ? 'high' : 'medium',
    matched,
  }
}

function runUnclearOffer(events, ctx) {
  const matchedOffer = claim(events, ['offer_business_fit'], /[\s\S]/)
  const matchedAttraction = claim(
    events,
    ['customer_attraction'],
    /offer clarity is weak|visitors may not quickly understand what you sell/i,
  )
  const matched = [...matchedOffer, ...matchedAttraction]
  if (!matched.length) return null
  const detail = ctx.categoryDetails.offer_business_fit || {}
  const rubricSteps = filterSteps(detail.recommended_fixes || [], ctx.rubric)
  const evidenceSteps = matched
    .map((e) => e.text)
    .filter((text) => !isPositiveEvidenceNote(text))
    .slice(0, 3)
  return {
    id: 'unclear_offer',
    title: OFFER_TITLES[ctx.rubric] || 'Clarify what you offer and how customers engage.',
    category: 'business_fit',
    why_it_matters:
      'Visitors who cannot quickly tell what you sell, who it is for, or how to get it will leave for a competitor whose offer is clearer.',
    steps: rubricSteps.length ? rubricSteps : evidenceSteps.length ? evidenceSteps : verifyStepsFor(ctx.rubric),
    affected: ['offer_business_fit'],
    difficulty: 'medium',
    matched,
  }
}

function runCategoryCatchAll(events, ctx) {
  if (isContentRubric(ctx.rubric)) return []
  const items = []
  for (const key of ['safety_trust', 'technical_functionality', 'ux_ui_visual', 'customer_attraction']) {
    const remaining = events.filter((e) => !e.used && e.category === key)
    if (!remaining.length) continue
    remaining.forEach((e) => {
      e.used = true
    })
    const detail = ctx.categoryDetails[key] || {}
    const rubricSteps = filterSteps(detail.recommended_fixes || [], ctx.rubric)
    const evidenceSteps = remaining
      .map((e) => e.text)
      .filter((text) => !isPositiveEvidenceNote(text) && !isGenericFillerStep(text))
      .slice(0, 3)
    items.push({
      id: `catchall_${key}`,
      title: CATCHALL_TITLES[key],
      category: CATCHALL_GRANULAR[key],
      why_it_matters: `Several smaller ${(CORE_CATEGORY_LABELS[key] || key).toLowerCase()} issues are still holding back the score (${detail.score ?? 0}/${detail.max ?? '-'}), even though none was severe enough to flag on its own.`,
      steps: rubricSteps.length ? rubricSteps : evidenceSteps.length ? evidenceSteps : verifyStepsFor(ctx.rubric),
      affected: [key],
      difficulty: 'medium',
      matched: remaining,
    })
  }
  return items
}

function runBenchmarkGap(benchmark, categoryDetails, rubric) {
  if (!benchmark?.enabled) return null
  const gap = benchmark.gaps?.gap_to_average
  if (!gap || gap <= 0.5) return null
  const weakest = (benchmark.category_comparisons || []).filter((c) => c.gap > 0).sort((a, b) => b.gap - a.gap)[0]
  const affectedKey = weakest?.key && categoryDetails[weakest.key] ? weakest.key : 'ux_ui_visual'
  return {
    id: 'benchmark_gap',
    title: `Close the gap versus similar ${String(rubric || 'business').replace(/_/g, ' ')} websites.`,
    category: 'ux_ui',
    why_it_matters: `Comparable sites average ${benchmark.benchmark_average_human_score ?? 17}/20, while this site is tracking ${benchmark.current_human_equivalent_score ?? benchmark.target_human_score}/20 - a gap of about ${gap} points on the benchmark scale that likely reflects softer conversion, trust, or presentation compared to competitors.`,
    steps:
      benchmark.ux_improvement_actions?.length
        ? benchmark.ux_improvement_actions.slice(0, 6)
        : [
            'Review 2-3 top-performing same-model sites in the benchmark examples.',
            'Identify one concrete layout or trust difference and apply it.',
            'Rescan after changes to see the updated benchmark gap.',
          ],
    affected: [affectedKey],
    difficulty: 'medium',
    matched: [
      { text: `Benchmark gap to average: ${gap} pts on the 20-point scale.` },
      weakest ? { text: `Weakest category vs benchmark: ${weakest.label || weakest.key} (gap ${weakest.gap}).` } : null,
    ].filter(Boolean),
  }
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 }

// Sequencing model: instead of just labeling each fix "critical/high/medium", the engine orders
// fixes into dependency-aware waves so the plan reads as "do this first, so the next fix actually
// works" rather than a flat priority list. Earlier waves block or undermine later ones - e.g. a
// mobile layout fix is wasted if the site is still flagged unsafe, and a CTA fix is wasted if
// mobile visitors can't read the page it lives on.
const TIER_SEQUENCE = [
  {
    ids: ['unsafe_site', 'homepage_down', 'crawl_blocked', 'business_model_mismatch', 'no_conversion_path'],
    first:
      'Do this first - nothing else on this list matters until visitors can safely reach your site and tell what you sell.',
    next: 'Do this next - it is still blocking every visitor from reaching or trusting the rest of the site.',
  },
  {
    ids: ['no_https'],
    first:
      'Do this first - an insecure connection triggers browser warnings before visitors ever see your other fixes.',
    next:
      'Unlocked now - fix this next, because browsers keep warning visitors away until the connection is secure.',
  },
  {
    ids: ['no_mobile_viewport', 'mobile_overflow', 'mobile_readability'],
    first:
      'Do this first - most visitors are on mobile, so a broken phone layout hides every other fix from most of your traffic.',
    next: 'Unlocked now - with the basics secure, fix mobile next so the rest of your fixes are actually visible.',
  },
  {
    ids: ['mobile_overflow_verify', 'strengthen_trust_visibility'],
    first: 'Start here - these are lower-confidence improvements worth verifying before a full rebuild.',
    next: 'Unlocked now - verify these softer findings once the critical blockers are handled.',
  },
  {
    ids: [
      'weak_cta',
      'missing_contact_trust',
      'ecommerce_catalog',
      'ecommerce_checkout_trust',
      'unclear_offer',
    ],
    first: 'Do this first - without one clear next step, visitors read the page and leave instead of converting.',
    next: 'Unlocked now - visitors can safely reach and read the site, so give them an obvious way to act next.',
  },
  {
    ids: (id) => id.startsWith('catchall_') || ['thin_content', 'js_rendered_sparse', 'weak_seo_meta'].includes(id),
    first: 'Start here - deepen content and technical signals so search engines and visitors trust the site long-term.',
    next: 'Unlocked now - with the essentials solid, strengthen content and technical depth next.',
  },
  {
    ids: ['nav_clutter', 'visual_polish', 'misaligned_images'],
    first: 'Start here - polish the layout so it matches the trust you already built with the fixes above.',
    next: 'Unlocked now - this is the polish pass, worth doing once the fixes above are in place.',
  },
  {
    ids: ['benchmark_gap'],
    first: 'Start here - use this to close the remaining gap versus similar businesses.',
    next: 'Unlocked last - once you are ahead on the fundamentals, use this to close the gap versus competitors.',
  },
]

function tierIndexFor(id) {
  for (let i = 0; i < TIER_SEQUENCE.length; i++) {
    const matcher = TIER_SEQUENCE[i].ids
    const matches = typeof matcher === 'function' ? matcher(id) : matcher.includes(id)
    if (matches) return i
  }
  return 4
}

// Defensive guard: fix-plan text must only ever describe something the site owner can act on.
// Internal ops/config strings (env vars, API keys, etc.) must never reach the customer-facing plan.
const INTERNAL_TEXT_PATTERN = /_API_KEY|process\.env|localhost:\d|GOOGLE_SAFE_BROWSING/i

function sanitize(list) {
  return (list || []).filter((text) => !INTERNAL_TEXT_PATTERN.test(String(text)))
}

function finalizeItem(raw, ctx) {
  const affected = dedupe(raw.affected || [])
  const priority = raw.forcedPriority || priorityFromGap(ctx.categoryDetails, affected)
  const lift = estimateLift(affected, ctx.categoryDetails, raw.matched.length)
  const research = researchBasisFor(raw.category, ctx.rubric)
  const confidence = raw.confidence || (priority === 'critical' || priority === 'high' ? 'medium' : 'medium')
  return {
    id: raw.id,
    title: raw.title,
    category: raw.category,
    evidence: sanitize(filterEvidenceLines(dedupe((raw.matched || []).map((e) => e.text)), ctx.rubric)).slice(0, 4),
    why_it_matters: raw.why_it_matters,
    steps: sanitize(filterSteps(finalizeSteps(raw.steps, ctx.rubric), ctx.rubric)),
    expected_score_lift: lift.label,
    affected_scores: affected,
    priority,
    difficulty: raw.difficulty || 'medium',
    confidence,
    source: 'analyzer',
    related_pages: relatedPagesFor(raw.category, ctx.pages),
    research_basis: research ? sanitize([research])[0] || null : null,
    _tier: tierIndexFor(raw.id),
  }
}

function collectStrengthBlob(categoryDetails = {}) {
  return Object.values(categoryDetails)
    .flatMap((detail) => [...(detail.strengths || []), ...(detail.evidence || []).map((e) => e.detail || e.label || '')])
    .join(' | ')
}

function passesEvidenceGate(item, ctx = {}) {
  if (!item) return false
  if (shouldDropFixForRubric(item, ctx.rubric)) return false
  if (!Array.isArray(item.evidence) || item.evidence.length === 0) return false
  if (!item.why_it_matters || !Array.isArray(item.steps) || item.steps.length === 0) return false
  if (!item.confidence) return false

  // Drop filler / unverified soft items from the customer-facing roadmap
  if (/^pillar_backfill_/i.test(item.id || '')) return false
  if (item.id === 'operate_response_playbook' && item.confidence !== 'high') return false
  if (item.confidence === 'low' && !/verify|_verify$/i.test(item.id || '')) return false

  const signals = ctx.uxFeatures?.signals || {}
  const strengths = collectStrengthBlob(ctx.categoryDetails)
  const evidenceBlob = item.evidence.join(' | ')
  const titleBlob = `${item.title} ${item.why_it_matters}`

  // Visual audit contradiction: never keep overflow actions when audit says no overflow
  if (/overflow|horizontal scroll/i.test(`${item.id} ${titleBlob} ${evidenceBlob}`)) {
    if (
      signals.horizontal_overflow_mobile === false ||
      signals.overflow_severity_mobile === 'none' ||
      signals.overflow_px_mobile === 0
    ) {
      return false
    }
    if (item.id === 'mobile_overflow' && item.confidence !== 'high') return false
    if (item.id === 'mobile_overflow' && !(signals.overflow_offenders_mobile || []).length) return false
  }

  // Image alignment contradiction: confidence 0 OR explicit "no issue" evidence means drop
  if (/misaligned_images|image alignment|poorly fitted images|fix misaligned/i.test(`${item.id} ${titleBlob}`)) {
    const alignConfidence =
      ctx.uxFeatures?.visual_evidence_summary?.misalignment_confidence ??
      signals.misalignment_confidence ??
      0
    if (!(Number(alignConfidence) > 0)) return false
    if (/no image alignment issue detected/i.test(`${evidenceBlob} ${strengths}`)) return false
  }

  // Never recommend "no phone/contact" when contact proof exists
  if (/no phone|no contact|missing contact|add stronger trust/i.test(titleBlob)) {
    if (
      /contact information .*discoverable|phone number is visible|clickable phone|phones=true|tel_link|visual_tel|visual_text/i.test(
        `${strengths} ${evidenceBlob}`,
      ) ||
      (ctx.aggregated?.contact_signals?.phones || []).length > 0 ||
      ctx.aggregated?.contact_signals?.has_tel ||
      ctx.aggregated?.contact_signals?.has_text_phone
    ) {
      if (/no phone|no contact found|across crawled pages/i.test(evidenceBlob)) return false
    }
  }

  // Never recommend add-reviews when review proof already exists
  if (/add reviews|missing review|no on-page reviews/i.test(`${titleBlob} ${evidenceBlob}`)) {
    if (
      /reviews or testimonials|review or testimonial evidence|aggregaterating|testimonial|4\.\d out of 5|5-star reviews/i.test(
        strengths,
      ) ||
      ctx.aggregated?.trust_signals?.has_strong_reviews ||
      ctx.aggregated?.trust_signals?.review_strength === 'strong'
    ) {
      return false
    }
  }

  // Never recommend add-reviews for blogs/content — commerce proof is the wrong lever
  if (
    (ctx.rubric === 'blog' || ctx.rubric === 'content_business') &&
    /add reviews|missing review|no on-page reviews|testimonial|move reviews/i.test(`${titleBlob} ${evidenceBlob}`)
  ) {
    return false
  }

  // DTC ecommerce: never keep phone-in-header as a standalone roadmap item
  if (
    ctx.rubric === 'ecommerce_store' &&
    /phone (?:number )?(?:clickable|visible|in the header)|add a (?:visible )?phone/i.test(titleBlob) &&
    !/policy|shipping|return|review|checkout|help|contact form/i.test(titleBlob)
  ) {
    return false
  }

  // Business model mismatch contradicted by hybrid service conversion signals
  if (item.id === 'business_model_mismatch') {
    const blob = `${(ctx.aggregated?.content_signals?.ctas || []).join(' ')} ${(ctx.pages || [])
      .map((p) => p.extracted_text || '')
      .join(' ')}`
    if (/quote|consultation|estimate|book now|schedule|free in-home/i.test(blob)) return false
  }

  return true
}

function compareFixItems(a, b) {
  if (a._tier !== b._tier) return a._tier - b._tier
  const pa = PRIORITY_ORDER[a.priority] ?? 9
  const pb = PRIORITY_ORDER[b.priority] ?? 9
  if (pa !== pb) return pa - pb
  if (a.evidence.length !== b.evidence.length) return b.evidence.length - a.evidence.length
  return a.id.localeCompare(b.id)
}

function unlockReasonFor(tier, index, previousTier, previousRank) {
  const meta = TIER_SEQUENCE[tier] || TIER_SEQUENCE[TIER_SEQUENCE.length - 1]
  if (index === 0) return meta.first
  if (previousTier !== tier) return meta.next
  return `Tackle this right after Fix #${previousRank} - it is part of the same fix wave, so handle both together.`
}

const CLUSTER_RUNNERS = [
  runUnsafeSite,
  runHomepageDown,
  runCrawlBlocked,
  runBusinessModelMismatch,
  runNoConversionPath,
  runMobileOverflow,
  runEcommerceCatalog,
  runEcommerceCheckoutTrust,
  runMobileReadability,
  runWeakCta,
  runMissingTrust,
  runThinContent,
  runNoHttps,
  runNoMobileViewport,
  runJsRenderedSparse,
  runWeakSeoMeta,
  runNavClutter,
  runVisualPolish,
  runMisalignedImages,
  runUnclearOffer,
]

function buildFixPlan(input = {}) {
  const categoryDetails = input.categoryDetails || {}
  const uxFeatures = input.uxFeatures || {}
  const capReasons = input.capReasons || []
  const rubric = input.rubric || 'ecommerce_store'
  const pages = input.pages || []
  const aggregated = input.aggregated || {}
  const benchmarkComparison = input.benchmarkComparison || null

  const events = collectEvents({ categoryDetails, uxFeatures, capReasons, rubric })
  const ctx = { rubric, categoryDetails, uxFeatures, pages, aggregated }

  const rawItems = []
  for (const runner of CLUSTER_RUNNERS) {
    const result = runner(events, ctx)
    if (result) rawItems.push(result)
  }
  rawItems.push(...runCategoryCatchAll(events, ctx))
  const benchmarkItem = runBenchmarkGap(benchmarkComparison, categoryDetails, rubric)
  if (benchmarkItem) rawItems.push(benchmarkItem)

  let finalized = rawItems.map((raw) => finalizeItem(raw, ctx)).filter((item) => passesEvidenceGate(item, ctx))
  finalized.sort(compareFixItems)

  // The plan should be dominated by fixes that attract and convert customers, not design
  // polish. Allow at most one visual-polish item (the strongest one); fold the evidence from
  // any others into it so nothing found by the audit is silently dropped.
  const polishTier = tierIndexFor('visual_polish')
  const polishItems = finalized.filter((item) => item._tier === polishTier)
  if (polishItems.length > 1) {
    const [keep, ...rest] = polishItems
    keep.evidence = dedupe([...keep.evidence, ...rest.flatMap((r) => r.evidence)]).slice(0, 4)
    finalized = finalized.filter((item) => item._tier !== polishTier || item === keep)
  }

  const sequenced = finalized.slice(0, 9)
  let previousTier = null
  let previousRank = null
  return sequenced.map((item, index) => {
    const rank = index + 1
    const unlockReason = unlockReasonFor(item._tier, index, previousTier, previousRank)
    previousTier = item._tier
    previousRank = rank
    const { _tier, ...rest } = item
    return {
      ...rest,
      rank,
      unlock_reason: unlockReason,
      action: item.title,
      reason: item.why_it_matters,
      expected_impact: item.expected_score_lift,
    }
  })
}

function buildRetainAndOperateItems({
  categoryDetails,
  rubric,
  aggregated,
  existingIds,
  nextRankStart,
}) {
  if (isContentRubric(rubric)) return []

  const items = []
  let rank = nextRankStart
  const trustProblems = categoryDetails?.safety_trust?.problems || []
  const attractionProblems = categoryDetails?.customer_attraction?.problems || []
  const reviewStrength = aggregated?.trust_signals?.review_strength
  const hasStrongReviews =
    Boolean(aggregated?.trust_signals?.has_strong_reviews) || reviewStrength === 'strong'
  const absoluteReviewMissing = [...trustProblems, ...attractionProblems].some((line) =>
    /no on-page reviews, testimonials, or rating markup was detected/i.test(line),
  )
  const reviewsMissing =
    !['blog', 'content_business'].includes(rubric) &&
    !hasStrongReviews &&
    absoluteReviewMissing &&
    !aggregated?.trust_signals?.review_indicators
  if (reviewsMissing && !existingIds.has('retain_reviews_loop')) {
    items.push({
      id: 'retain_reviews_loop',
      rank: rank++,
      pillar: 'retain',
      title: 'Build a review and referral follow-up loop.',
      category: 'trust',
      confidence: 'medium',
      why_it_matters:
        'Retention and referrals start right after a successful customer interaction. A consistent review and referral loop compounds trust and lowers customer acquisition cost over time.',
      evidence: sanitize([
        trustProblems.find((line) => /review|testimonial/i.test(line)) ||
          attractionProblems.find((line) => /review|testimonial/i.test(line)) ||
          'No on-page review markup was detected with high confidence.',
      ]),
      steps: [
        'Create a same-day follow-up template asking for a review after each completed order or service.',
        'Send customers to your strongest review destination first (Google, marketplace profile, or platform reviews).',
        'Add a simple referral request in the same follow-up message with one clear next step.',
        'Show fresh reviews on your website and key profile pages every week.',
      ],
      expected_business_outcome:
        'More repeat purchases and referral leads, with stronger social proof that improves conversion for new visitors.',
      expected_score_lift: '+1-3 pts (Safety & trust, Customer attraction)',
      affected_scores: ['safety_trust', 'customer_attraction'],
      difficulty: 'medium',
      unlock_reason:
        'Unlocked now - once core conversion blockers are being handled, make each completed customer interaction create future demand.',
      research_basis:
        "BrightLocal's Local Consumer Review Survey consistently finds most consumers read reviews before choosing local businesses, making review volume and freshness a direct growth lever.",
      related_pages: relatedPagesFor('trust', aggregated?.pages || []),
      source: 'analyzer',
    })
  }

  const contact = aggregated?.contact_signals || {}
  const hasPhone = Boolean(contact.phones?.length || contact.has_tel || contact.has_text_phone)
  const hasEmail = Boolean(contact.emails?.length || contact.has_mailto)
  const hasContactPath =
    hasPhone ||
    hasEmail ||
    contact.has_contact_form ||
    contact.has_contact_page_link ||
    contact.has_contact_cta
  const missingResponseOps = !hasContactPath
  const policyCount = Number(aggregated?.policy_signals?.policy_count || aggregated?.trust_signals?.policy_count || 0)
  const policyWeak = ['ecommerce_store', 'online_plus_offline_store'].includes(rubric)
    ? policyCount < 2
    : false
  if ((missingResponseOps || policyWeak) && !existingIds.has('operate_response_playbook')) {
    items.push({
      id: 'operate_response_playbook',
      rank: rank++,
      pillar: 'operate',
      title: 'Set a response-speed and service-handling playbook.',
      category: 'functionality',
      confidence: missingResponseOps ? 'high' : 'medium',
      why_it_matters:
        'Growth stalls when the business cannot respond quickly and consistently to incoming demand. A clear response playbook protects conversion gains as lead volume grows.',
      evidence: sanitize([
        missingResponseOps
          ? 'No clear contact path (phone, email, form, or contact CTA) was detected for rapid response.'
          : null,
        policyWeak
          ? 'Policy coverage appears thin for a business model that needs clear fulfillment or return expectations.'
          : null,
      ]).slice(0, 3),
      steps: [
        'Define an owner for new inquiries and set response SLAs (for example: within 15 minutes during business hours).',
        'Create ready-to-send reply templates for phone, contact form, and email inquiries.',
        'Document booking/checkout escalation steps so no lead gets stuck without a next action.',
        'Review response-time logs weekly and remove recurring delays.',
      ],
      expected_business_outcome:
        'Higher lead-to-customer conversion from faster response times and fewer dropped inquiries.',
      expected_score_lift: null,
      affected_scores: ['technical_functionality', 'customer_attraction'],
      difficulty: 'medium',
      unlock_reason:
        'Unlocked now - stronger demand only helps if your team can respond and fulfill consistently.',
      research_basis:
        "Nielsen Norman Group's response-time research shows delays quickly reduce trust and task completion, so operational responsiveness directly affects conversion outcomes.",
      related_pages: relatedPagesFor('customer_attraction', aggregated?.pages || []),
      source: 'analyzer',
    })
  }

  return items
}

// ensurePillarCoverage removed: never invent pillar_backfill_* items without real evidence.

function buildGrowthPlan(input = {}) {
  const rubric = input.rubric || 'ecommerce_store'
  const fixPlan = input.fixPlan || buildFixPlan(input)
  const aggregated = input.aggregated || {}
  const categoryDetails = input.categoryDetails || {}

  const growthFromFixes = fixPlan.map((fix) => ({
    ...fix,
    pillar: inferPillarFromFix(fix),
    expected_business_outcome: defaultOutcomeForPillar(inferPillarFromFix(fix), rubric),
    ask_ai_prompt: '', // filled below so prompt can include rank.
  }))

  const extraItems = buildRetainAndOperateItems({
    categoryDetails,
    rubric,
    aggregated,
    existingIds: new Set(growthFromFixes.map((item) => item.id)),
    nextRankStart: growthFromFixes.length + 1,
  })

  const merged = [...growthFromFixes, ...extraItems]
    .filter((item) => item.confidence && item.confidence !== 'low')
    .filter((item) => !/^pillar_backfill_/i.test(item.id || ''))
    .filter((item) => !shouldDropFixForRubric(item, rubric))
    .slice(0, 12)
  // Do not backfill empty pillars with generic filler — only keep evidence-backed items
  const withCoverage = merged

  return withCoverage.map((item, index) => {
    const rank = index + 1
    const confidence = item.confidence || 'medium'
    const normalized = {
      ...item,
      rank,
      step_label: `Step ${rank}`,
      action: item.title,
      reason: item.why_it_matters,
      expected_impact: item.expected_score_lift || item.expected_business_outcome,
      confidence,
    }
    return {
      ...normalized,
      ask_ai_prompt: askAiPromptFor(normalized),
    }
  })
}

module.exports = {
  buildFixPlan,
  buildGrowthPlan,
  collectEvents,
  priorityFromGap,
  estimateLift,
  passesEvidenceGate,
}
