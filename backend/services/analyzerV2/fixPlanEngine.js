// Fix Plan Engine: maps score-deduction evidence (crawler + visual audit + business-model
// rubric signals) into a small set of meaningful, evidence-backed fix items instead of one
// task per point deducted. See docs/fix-plan-research.md for the full mapping rationale.
const { CATEGORY_LABELS: CORE_CATEGORY_LABELS } = require('./explanationBuilder')

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
const DEFAULT_CTA_STEPS = [
  'Add one clear, high-contrast primary call-to-action above the fold.',
  'Repeat that same CTA further down the page.',
  'Remove or de-emphasize buttons that compete with the primary action.',
  'Make your phone number or contact link visible as a backup action.',
]

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

const GENERIC_FILLER_STEPS = [
  'Review this area on both desktop and mobile.',
  'Ask the AI growth coach to double-check the change before you publish it.',
  'Rescan your website after making changes to confirm the score improves.',
]

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

function collectEvents({ categoryDetails = {}, uxFeatures = {}, capReasons = [] }) {
  const events = []
  const seenText = new Set()
  const push = (category, text, extra = {}) => {
    const trimmed = String(text || '').trim()
    if (!trimmed) return
    events.push({ category, text: trimmed, used: false, ...extra })
  }

  for (const cap of capReasons || []) {
    push('overall', cap.reason, { kind: 'cap', capId: cap.cap })
  }

  for (const [category, detail] of Object.entries(categoryDetails)) {
    for (const problem of detail.problems || []) {
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
    for (const problem of uxFeatures?.[key] || []) {
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

function finalizeSteps(rawSteps) {
  let steps = dedupe((rawSteps || []).map((s) => String(s).trim()).filter(Boolean))
  if (steps.length > 6) steps = steps.slice(0, 6)
  let fillerIndex = 0
  while (steps.length < 3 && fillerIndex < GENERIC_FILLER_STEPS.length) {
    const filler = GENERIC_FILLER_STEPS[fillerIndex++]
    if (!steps.includes(filler)) steps.push(filler)
  }
  if (steps.length < 6 && !steps.some((s) => /rescan/i.test(s))) {
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

function runBusinessModelMismatch(events) {
  const matched = claim(events, ['overall'], /business model badly mismatches/i)
  if (!matched.length) return null
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
    forcedPriority: 'critical',
    matched,
  }
}

function runNoConversionPath(events) {
  const matched = claim(events, ['overall'], /no clear cta, contact, or purchase path/i)
  if (!matched.length) return null
  return {
    id: 'no_conversion_path',
    title: 'Add a clear path for visitors to buy, book, or contact you.',
    category: 'customer_attraction',
    why_it_matters:
      'With no visible phone, contact, booking, or purchase path, ready-to-buy visitors have no way to act, which caps the whole site regardless of how good the rest looks.',
    steps: [
      'Add one obvious phone number, contact form, booking, or "Buy now" action above the fold.',
      'Repeat that same action at the bottom of the homepage.',
      'Make sure the action works on mobile without extra taps.',
      'Rescan after adding the action to confirm the score cap is removed.',
    ],
    affected: ['customer_attraction'],
    difficulty: 'easy',
    forcedPriority: 'critical',
    matched,
  }
}

function runMobileOverflow(events) {
  const matched = claim(
    events,
    ['overall', 'ux_ui_visual', 'technical_functionality', 'customer_attraction'],
    /overflow|horizontal scroll/i,
  )
  if (!matched.length) return null
  return {
    id: 'mobile_overflow',
    title: 'Fix mobile layout overflow and horizontal scrolling.',
    category: 'mobile',
    why_it_matters:
      'Horizontal scrolling or overflowing content on phones makes the site feel broken, which drives mobile visitors away before they ever see your offer.',
    steps: [
      'Test the homepage on a real phone or a 375px-wide browser emulator.',
      'Find elements wider than the viewport (fixed-width images, tables, or containers).',
      'Add responsive widths (max-width: 100%) to the affected elements.',
      'Re-test at 375px and 414px widths to confirm the scrolling is gone.',
      'Rescan your website once the overflow is fixed.',
    ],
    affected: ['ux_ui_visual'],
    difficulty: 'hard',
    forcedPriority: 'high',
    matched,
  }
}

function runMobileReadability(events) {
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
  const why =
    rubric === 'ecommerce_store'
      ? 'Visitors who cannot immediately see how to buy will bounce, even when your catalog and pricing are otherwise ready to convert.'
      : ['online_plus_physical_service', 'local_service_business', 'online_gallery_physical_service', 'online_plus_offline_store'].includes(
            rubric,
          )
        ? 'Visitors need one obvious next step - book, call, or request a quote - or they will leave without ever contacting the business.'
        : 'Without one clear next step, visitors read the page and leave instead of converting into a lead, subscriber, or customer.'
  return {
    id: 'weak_cta',
    title: 'Make the primary customer action clearer.',
    category: 'customer_attraction',
    why_it_matters: why,
    steps: CTA_STEPS_BY_RUBRIC[rubric] || DEFAULT_CTA_STEPS,
    affected: ['customer_attraction', 'offer_business_fit'],
    difficulty: 'easy',
    matched,
  }
}

function runMissingTrust(events) {
  const matched = claim(
    events,
    ['safety_trust', 'customer_attraction', 'offer_business_fit'],
    /no phone number or email found|expected ecommerce policies|business name or identity is unclear|no testimonial or review proof|no customer reviews or testimonials|no reviews or local proof|no phone number or contact page detected|no review or testimonial proof|no shipping or returns policy signals found/i,
  )
  if (!matched.length) return null
  return {
    id: 'missing_contact_trust',
    title: 'Add stronger trust and proof signals.',
    category: 'trust',
    why_it_matters:
      'New visitors decide whether to trust a business within seconds - missing contact details, policies, or proof makes that decision harder and increases bounce before visitors ever reach your offer.',
    steps: [
      'Add a visible phone number and email in the header and footer.',
      'Publish privacy, shipping, and return policies (where relevant) and link them from the footer.',
      'Add customer reviews, testimonials, or ratings near your main offer.',
      'Link at least one active social profile to reinforce legitimacy.',
      'Add a short About section stating who runs the business.',
    ],
    affected: ['safety_trust', 'customer_attraction'],
    difficulty: 'easy',
    matched,
  }
}

function runThinContent(events) {
  const matched = claim(
    events,
    ['technical_functionality', 'customer_attraction', 'offer_business_fit'],
    /very little readable content|thin homepage content|content depth is too thin|few article pages or posts/i,
  )
  if (!matched.length) return null
  return {
    id: 'thin_content',
    title: 'Add more substantive content to key pages.',
    category: 'content',
    why_it_matters:
      'Thin pages give visitors and search engines almost nothing to evaluate the business on, which hurts both first impressions and organic discovery.',
    steps: [
      'Expand the homepage with a clear description of what you offer and who it is for.',
      'Add supporting detail: process, materials, service area, or FAQs.',
      'Break the additional copy into short sections with headings.',
      'Rescan after publishing the additional content.',
    ],
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

function runNavClutter(events) {
  const matched = claim(events, ['ux_ui_visual', 'customer_attraction'], /overcrowded|navigation clutter|primary nav links/i)
  if (!matched.length) return null
  return {
    id: 'nav_clutter',
    title: 'Simplify navigation above the fold.',
    category: 'ux_ui',
    why_it_matters:
      'Too many top-level choices make visitors hesitate about what to click first, which slows them down on the way to your primary offer.',
    steps: [
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
    /overall visual appeal|layout cleanliness|polish & modern feel|how easy it is to scan|multiple layout red flags/i,
  )
  if (!matched.length) return null
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
    matched,
  }
}

function runMisalignedImages(events) {
  const matched = claim(events, ['customer_attraction'], /image alignment|images look misaligned/i)
  if (!matched.length) return null
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
  return {
    id: 'unclear_offer',
    title: OFFER_TITLES[ctx.rubric] || 'Clarify what you offer and how customers engage.',
    category: 'business_fit',
    why_it_matters:
      'Visitors who cannot quickly tell what you sell, who it is for, or how to get it will leave for a competitor whose offer is clearer.',
    steps: detail.recommended_fixes?.length ? detail.recommended_fixes : matched.map((e) => `Address: ${e.text}`),
    affected: ['offer_business_fit'],
    difficulty: 'medium',
    matched,
  }
}

function runCategoryCatchAll(events, ctx) {
  const items = []
  for (const key of ['safety_trust', 'technical_functionality', 'ux_ui_visual', 'customer_attraction']) {
    const remaining = events.filter((e) => !e.used && e.category === key)
    if (!remaining.length) continue
    remaining.forEach((e) => {
      e.used = true
    })
    const detail = ctx.categoryDetails[key] || {}
    items.push({
      id: `catchall_${key}`,
      title: CATCHALL_TITLES[key],
      category: CATCHALL_GRANULAR[key],
      why_it_matters: `Several smaller ${(CORE_CATEGORY_LABELS[key] || key).toLowerCase()} issues are still holding back the score (${detail.score ?? 0}/${detail.max ?? '-'}), even though none was severe enough to flag on its own.`,
      steps: detail.recommended_fixes?.length ? detail.recommended_fixes : remaining.map((e) => `Address: ${e.text}`),
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

function finalizeItem(raw, ctx) {
  const affected = dedupe(raw.affected || [])
  const priority = raw.forcedPriority || priorityFromGap(ctx.categoryDetails, affected)
  const lift = estimateLift(affected, ctx.categoryDetails, raw.matched.length)
  return {
    id: raw.id,
    title: raw.title,
    category: raw.category,
    evidence: dedupe(raw.matched.map((e) => e.text)).slice(0, 4),
    why_it_matters: raw.why_it_matters,
    steps: finalizeSteps(raw.steps),
    expected_score_lift: lift.label,
    affected_scores: affected,
    priority,
    difficulty: raw.difficulty || 'medium',
    source: 'analyzer',
    related_pages: relatedPagesFor(raw.category, ctx.pages),
  }
}

const CLUSTER_RUNNERS = [
  runUnsafeSite,
  runHomepageDown,
  runBusinessModelMismatch,
  runNoConversionPath,
  runMobileOverflow,
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
  const benchmarkComparison = input.benchmarkComparison || null

  const events = collectEvents({ categoryDetails, uxFeatures, capReasons })
  const ctx = { rubric, categoryDetails, uxFeatures, pages }

  const rawItems = []
  for (const runner of CLUSTER_RUNNERS) {
    const result = runner(events, ctx)
    if (result) rawItems.push(result)
  }
  rawItems.push(...runCategoryCatchAll(events, ctx))
  const benchmarkItem = runBenchmarkGap(benchmarkComparison, categoryDetails, rubric)
  if (benchmarkItem) rawItems.push(benchmarkItem)

  const finalized = rawItems.map((raw) => finalizeItem(raw, ctx))
  finalized.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9))

  return finalized.slice(0, 9).map((item, index) => ({
    ...item,
    rank: index + 1,
    action: item.title,
    reason: item.why_it_matters,
    expected_impact: item.expected_score_lift,
  }))
}

module.exports = {
  buildFixPlan,
  collectEvents,
  priorityFromGap,
  estimateLift,
}
