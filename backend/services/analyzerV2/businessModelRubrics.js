const {
  pointsForStrength,
  strengthFromBoolean,
  strengthFromCount,
  combineStrengths,
  evidenceLabel,
} = require('./signalStrength')

const OFFER_CATEGORY_PATTERN =
  /product|collection|shop|catalog|curtain|blind|shade|drape|roman|motoriz|treatment|swatch|installation|custom|service|gallery|inspiration/i

function pageData(page) {
  if (!page) return {}
  const raw = page.extracted_data_json
  if (raw && typeof raw === 'object') return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return {}
}

function clamp(value, max) {
  return Math.max(0, Math.min(max, Math.round(value)))
}

function addSignal(result, { id, strength, points, maxPoints, label, evidence, problem, fix }) {
  if (points > 0) {
    result.earned += points
    result.strengths.push(label)
    result.evidence.push({ signal: id, strength, label, detail: evidence })
  } else if (problem) {
    result.problems.push(problem)
    if (fix) result.recommended_fixes.push(fix)
    result.evidence.push({ signal: id, strength: strength || 'none', label: problem, detail: evidence })
  }
}

function collectOfferLabels(ctx) {
  const labels = new Set()
  const { aggregated, pages, visualAudit } = ctx

  for (const label of aggregated.content_signals?.navigation_labels || []) {
    if (label) labels.add(String(label).trim())
  }

  const snippets = visualAudit?.evidence_snippets || {}
  for (const label of [...(snippets.desktop_nav || []), ...(snippets.mobile_nav || [])]) {
    if (label) labels.add(String(label).trim())
  }

  for (const page of pages || []) {
    const data = pageData(page)
    for (const h of [...(data.headings?.h1 || []), ...(data.headings?.h2 || []), ...(data.headings?.h3 || [])]) {
      if (OFFER_CATEGORY_PATTERN.test(h)) labels.add(String(h).trim())
    }
    const url = String(page.final_url || page.url || '')
    const match = url.match(/\/(?:collections|products|shop)\/([^/?#]+)/i)
    if (match) labels.add(match[1].replace(/-/g, ' '))
  }

  return [...labels].filter(Boolean)
}

function resolveOfferSignals(ctx) {
  const { signals, pages, aggregated, visualAudit } = ctx
  const labels = collectOfferLabels(ctx)
  const text = (pages || []).map((p) => String(p.extracted_text || '')).join(' ').toLowerCase()
  const hasCollectionUrls = (pages || []).some((p) =>
    /\/collections\/|\/products\/|\/shop\b/i.test(String(p.final_url || p.url || '')),
  )
  const hasProductLineLanguage =
    /window treatments|custom curtains|custom blinds|shades|drapes|roman shades|plantation shutters|motorized shades|roller shades|bespoke blinds/i.test(
      text,
    )
  const hasCategoryNav = labels.some((label) => OFFER_CATEGORY_PATTERN.test(label))
  const summary = visualAudit?.summary || {}
  const hasVisualCatalog = (summary.product_grid_image_count || 0) >= 4
  const hasStructuredShopNav =
    summary.has_structured_header && (summary.primary_nav_link_count || 0) >= 2 && hasCategoryNav

  const has_product_categories =
    signals.has_product_categories || hasCategoryNav || hasCollectionUrls || hasProductLineLanguage
  const has_service_categories =
    signals.has_service_categories || (aggregated.services || []).length > 0 || hasCategoryNav
  const has_service_pages =
    signals.has_service_pages || hasCollectionUrls || hasCategoryNav || (aggregated.services || []).length > 0
  const has_offer_categories =
    has_product_categories ||
    has_service_categories ||
    hasVisualCatalog ||
    hasStructuredShopNav ||
    hasCollectionUrls

  return {
    ...signals,
    has_product_categories,
    has_service_categories,
    has_service_pages,
    has_offer_categories,
    offer_labels: labels,
  }
}

function removeContradictoryOfferProblems(result, offerSignals, catalog) {
  const hasOfferExplanation =
    offerSignals.has_offer_categories ||
    offerSignals.has_product_categories ||
    offerSignals.has_service_categories ||
    offerSignals.has_service_pages ||
    catalog.hasCatalogLayout ||
    catalog.hasWeakCatalog ||
    catalog.productCount >= 1

  if (!hasOfferExplanation) return

  result.problems = result.problems.filter(
    (problem) =>
      !/no clear product lines|service pages|shop categories|service explanation is thin|service categories/i.test(
        problem,
      ),
  )
  result.recommended_fixes = result.recommended_fixes.filter(
    (fix) => !/shop categories or service pages|describe services, process/i.test(fix),
  )
}

function inferCatalogSignals(ctx) {
  const { aggregated, signals, visualAudit, uxFeatures, pages } = ctx
  const meta = aggregated.extraction_meta || {}
  const summary = visualAudit?.summary || {}
  const snippets = visualAudit?.evidence_snippets || {}
  const navLabels = [
    ...(aggregated.content_signals?.navigation_labels || []),
    ...(snippets.desktop_nav || []),
    ...(snippets.mobile_nav || []),
  ]
  const hasCollectionUrls = (pages || []).some((p) =>
    /\/collections\/|\/products\/|\/shop\b/i.test(String(p.final_url || p.url || '')),
  )
  const hasShopNav = navLabels.some((label) => /shop|collection|catalog|curtain|blind|shade/i.test(label))
  const productCount = Math.max(
    meta.high_confidence_product_count || 0,
    (aggregated.high_confidence_products || []).length,
    (aggregated.products || []).length,
  )
  const productGridCount = Math.max(
    summary.product_grid_image_count || 0,
    uxFeatures?.ux_scoring_inputs?.product_grid_image_count || 0,
    uxFeatures?.visual_evidence_summary?.product_grid_image_count || 0,
  )
  const imageCount = Math.max(
    summary.image_count || 0,
    uxFeatures?.ux_scoring_inputs?.image_count || 0,
  )
  const hasCollectionNav = Boolean(signals?.has_product_categories || hasShopNav || hasCollectionUrls)
  const hasPricing = (aggregated.pricing_signals || []).length > 0
  const hasShopCta = Boolean(
    signals?.has_add_to_cart ||
      /shop|buy|cart|browse collection/i.test((aggregated.content_signals?.ctas || []).join(' ')),
  )
  const hasCatalogLayout =
    productGridCount >= 4 || (productCount >= 2 && hasCollectionNav) || (hasCollectionUrls && productGridCount >= 2)
  const hasWeakCatalog =
    hasCollectionNav ||
    hasPricing ||
    hasShopCta ||
    hasShopNav ||
    hasCollectionUrls ||
    productGridCount >= 2 ||
    imageCount >= 10 ||
    /shopify|woocommerce|bigcommerce/i.test(String(aggregated.platform || '').toLowerCase())

  return {
    productCount,
    productGridCount,
    imageCount,
    hasCatalogLayout,
    hasWeakCatalog,
    hasShopCta,
    hasReliableCards: Boolean(meta.has_reliable_product_cards),
    hasJsonLd: Boolean(meta.has_json_ld_products),
  }
}

function scoreEcommerceOffer(ctx, max) {
  const { aggregated, signals } = ctx
  const meta = aggregated.extraction_meta || {}
  const catalog = inferCatalogSignals(ctx)
  const result = { earned: 0, strengths: [], problems: [], evidence: [], recommended_fixes: [] }

  let productStrength = strengthFromCount(catalog.productCount, {
    weak: 1,
    medium: 2,
    strong: 3,
  })
  if (productStrength === 'none' && catalog.hasCatalogLayout) {
    productStrength = 'medium'
  } else if (productStrength === 'none' && catalog.hasWeakCatalog) {
    productStrength = 'weak'
  }
  addSignal(result, {
    id: 'products',
    strength: productStrength,
    points: pointsForStrength(productStrength, 6),
    maxPoints: 6,
    label:
      catalog.productCount > 0
        ? `${catalog.productCount} high-confidence product(s) with clear names.`
        : catalog.hasCatalogLayout
          ? 'Product catalog layout detected from collections and product imagery.'
          : 'Catalog or shop navigation suggests products are sold online.',
    evidence: `Product cards/detail pages: ${meta.has_reliable_product_cards ? 'yes' : 'no'}, JSON-LD: ${meta.has_json_ld_products ? 'yes' : 'no'}, grid images: ${catalog.productGridCount}.`,
    problem:
      productStrength === 'none'
        ? 'No reliable product cards, catalog layout, or shop navigation were found.'
        : null,
    fix: 'Add product cards with name, price, image, and link on collection pages.',
  })

  const priceStrength =
    aggregated.pricing_signals?.length > 0 && (meta.high_confidence_product_count || 0) > 0
      ? 'strong'
      : aggregated.pricing_signals?.length > 0
        ? 'weak'
        : 'none'
  addSignal(result, {
    id: 'pricing',
    strength: priceStrength,
    points: pointsForStrength(priceStrength, 4),
    maxPoints: 4,
    label: 'Prices are visible alongside products.',
    evidence: `${aggregated.pricing_signals?.length || 0} price signal(s) extracted.`,
    problem: priceStrength === 'none' ? 'No clear product pricing was detected.' : null,
    fix: 'Show prices on product cards and detail pages.',
  })

  const cartStrength = strengthFromBoolean(signals.has_add_to_cart)
  addSignal(result, {
    id: 'checkout',
    strength: cartStrength,
    points: pointsForStrength(cartStrength, 4),
    maxPoints: 4,
    label: 'Add-to-cart or checkout CTA detected.',
    evidence: cartStrength !== 'none' ? 'Purchase CTA language found.' : 'No purchase CTA found.',
    problem: cartStrength === 'none' ? 'No add-to-cart, buy now, or checkout path detected.' : null,
    fix: 'Add a visible Shop or Add to cart button above the fold.',
  })

  const policyCount = [
    aggregated.policy_signals?.shipping,
    aggregated.policy_signals?.returns,
    aggregated.policy_signals?.privacy,
  ].filter(Boolean).length
  const policyStrength = strengthFromCount(policyCount, { weak: 1, medium: 2, strong: 3 })
  addSignal(result, {
    id: 'policies',
    strength: policyStrength,
    points: pointsForStrength(policyStrength, 3),
    maxPoints: 3,
    label: 'Shipping, returns, or privacy policies are discoverable.',
    evidence: `Policies found: shipping=${Boolean(aggregated.policy_signals?.shipping)}, returns=${Boolean(aggregated.policy_signals?.returns)}.`,
    problem: policyStrength === 'none' ? 'No shipping or returns policy signals found.' : null,
    fix: 'Link shipping and return policies from the footer and checkout.',
  })

  const reviewStrength = strengthFromBoolean(aggregated.trust_signals?.review_indicators)
  addSignal(result, {
    id: 'reviews',
    strength: reviewStrength,
    points: pointsForStrength(reviewStrength, 3),
    maxPoints: 3,
    label: 'Customer reviews or testimonials support purchase confidence.',
    evidence: reviewStrength !== 'none' ? 'Review language detected on crawled pages.' : 'No review proof detected.',
    problem: reviewStrength === 'none' ? 'No customer reviews or testimonials detected.' : null,
    fix: 'Add star ratings or testimonials near product listings.',
  })

  if (catalog.productCount === 0 && !catalog.hasWeakCatalog) {
    result.earned = Math.min(result.earned, Math.round(max * 0.35))
    result.problems.push('Ecommerce store has no extractable products or catalog signals — offer clarity is severely limited.')
    result.recommended_fixes.push('Publish product collection pages with named items, prices, and images.')
  } else if (catalog.productCount === 0 && catalog.hasWeakCatalog) {
    result.earned = Math.min(result.earned, Math.round(max * 0.72))
    if (!result.strengths.some((s) => /catalog|product/i.test(s))) {
      result.strengths.push('Shop/catalog signals detected even though product extraction was incomplete.')
    }
  }
  if (
    !meta.has_reliable_product_cards &&
    catalog.productCount > 0 &&
    !catalog.hasCatalogLayout
  ) {
    result.earned = Math.min(result.earned, Math.round(max * 0.62))
    result.problems.push('Products were inferred weakly without reliable product card markup.')
  }

  return { score: clamp(result.earned, max), ...result }
}

function scoreHybridStoreOffer(ctx, max) {
  const { aggregated, signals } = ctx
  const result = { earned: 0, strengths: [], problems: [], evidence: [], recommended_fixes: [] }

  const localStrength = combineStrengths([
    strengthFromBoolean(signals.has_phone),
    strengthFromBoolean(signals.has_address),
    strengthFromBoolean(signals.has_hours),
  ])
  addSignal(result, {
    id: 'local_presence',
    strength: localStrength,
    points: pointsForStrength(localStrength, 6),
    maxPoints: 6,
    label: 'Local storefront signals (phone, address, or hours) are visible.',
    evidence: `Phone=${signals.has_phone}, address=${signals.has_address}, hours=${signals.has_hours}.`,
    problem: localStrength === 'none' ? 'No phone, address, or hours detected for the physical location.' : null,
    fix: 'Add address, hours, and phone number on the homepage and contact page.',
  })

  const catalogStrength = combineStrengths([
    strengthFromBoolean((aggregated.high_confidence_products || []).length > 0),
    strengthFromBoolean(signals.has_product_categories),
    strengthFromBoolean(signals.has_service_categories),
  ])
  addSignal(result, {
    id: 'catalog',
    strength: catalogStrength,
    points: pointsForStrength(catalogStrength, 6),
    maxPoints: 6,
    label: 'Online catalog or service explanation is visible.',
    evidence: `${aggregated.high_confidence_products?.length || 0} products, service categories=${signals.has_service_categories}.`,
    problem: catalogStrength === 'none' ? 'Neither online catalog nor clear service/product explanation found.' : null,
    fix: 'Link shop collections or explain what customers can buy online vs in store.',
  })

  const visitStrength = combineStrengths([
    strengthFromBoolean(signals.has_map_directions),
    strengthFromBoolean(signals.has_booking_cta || signals.has_quote_cta),
  ])
  addSignal(result, {
    id: 'visit_cta',
    strength: visitStrength,
    points: pointsForStrength(visitStrength, 4),
    maxPoints: 4,
    label: 'Visit store or directions CTA supports in-person traffic.',
    evidence: `Directions=${signals.has_map_directions}, visit CTA=${visitStrength !== 'none'}.`,
    problem: visitStrength === 'none' ? 'No directions or visit-store call to action found.' : null,
    fix: 'Add Get directions or Visit us CTA with map link.',
  })

  const proofStrength = strengthFromBoolean(aggregated.trust_signals?.review_indicators)
  addSignal(result, {
    id: 'local_proof',
    strength: proofStrength,
    points: pointsForStrength(proofStrength, 4),
    maxPoints: 4,
    label: 'Reviews or local proof build hybrid-store trust.',
    evidence: evidenceLabel(proofStrength),
    problem: proofStrength === 'none' ? 'No reviews or local proof detected.' : null,
    fix: 'Show Google reviews or customer photos from your location.',
  })

  return { score: clamp(result.earned, max), ...result }
}

function scorePhysicalServiceOffer(ctx, max) {
  const { aggregated } = ctx
  const offer = resolveOfferSignals(ctx)
  const catalog = inferCatalogSignals({ ...ctx, signals: offer })
  const result = { earned: 0, strengths: [], problems: [], evidence: [], recommended_fixes: [] }

  const offerStrength = combineStrengths([
    strengthFromBoolean(offer.has_service_categories),
    strengthFromBoolean(offer.has_service_pages),
    strengthFromBoolean(offer.has_product_categories),
    strengthFromBoolean(offer.has_offer_categories),
    catalog.hasCatalogLayout ? 'strong' : catalog.hasWeakCatalog ? 'medium' : 'none',
    strengthFromCount(catalog.productCount, { weak: 1, medium: 2, strong: 4 }),
  ])
  addSignal(result, {
    id: 'services',
    strength: offerStrength,
    points: pointsForStrength(offerStrength, 5),
    maxPoints: 5,
    label:
      catalog.hasCatalogLayout || offer.has_product_categories
        ? 'Product lines or shop categories explain what you sell.'
        : offer.has_service_categories
          ? 'Service categories explain what you offer.'
          : 'Dedicated pages or categories explain what you do.',
    evidence: `Offer labels=${offer.offer_labels.slice(0, 4).join(', ') || 'none'}, catalog layout=${catalog.hasCatalogLayout}.`,
    problem:
      offerStrength === 'none'
        ? 'Visitors cannot quickly tell what products or services you offer.'
        : null,
    fix: 'Add clear shop categories or service pages in the main navigation.',
  })

  const salesPathStrength = combineStrengths([
    strengthFromBoolean(offer.has_booking_cta),
    strengthFromBoolean(offer.has_quote_cta),
    strengthFromBoolean(offer.has_consultation),
    strengthFromBoolean(offer.has_phone),
    strengthFromBoolean(offer.has_contact_page),
    strengthFromBoolean(offer.has_showroom),
    catalog.hasShopCta ? 'medium' : 'none',
  ])
  addSignal(result, {
    id: 'booking',
    strength: salesPathStrength,
    points: pointsForStrength(salesPathStrength, 5),
    maxPoints: 5,
    label: 'Quote, booking, consultation, shop, or contact path matches how customers buy.',
    evidence: `Quote=${offer.has_quote_cta}, booking=${offer.has_booking_cta}, shop=${catalog.hasShopCta}, phone=${offer.has_phone}.`,
    problem:
      salesPathStrength === 'none'
        ? 'No consultation, quote, shop, or contact path detected.'
        : null,
    fix: 'Add Book consultation, Get a quote, Shop, or Contact above the fold.',
  })

  const areaStrength = combineStrengths([
    strengthFromBoolean(offer.has_service_area),
    strengthFromBoolean(offer.has_local_city),
  ])
  addSignal(result, {
    id: 'service_area',
    strength: areaStrength,
    points: pointsForStrength(areaStrength, 4),
    maxPoints: 4,
    label: 'Service area helps nearby customers know you serve them.',
    evidence: evidenceLabel(areaStrength),
    problem: areaStrength === 'none' ? 'Service area or city coverage not stated.' : null,
    fix: 'State cities or regions you serve on the homepage.',
  })

  const galleryStrength = strengthFromBoolean(offer.has_gallery)
  addSignal(result, {
    id: 'portfolio',
    strength: galleryStrength,
    points: pointsForStrength(galleryStrength, 3),
    maxPoints: 3,
    label: 'Gallery or portfolio proves past work.',
    evidence: evidenceLabel(galleryStrength),
    problem: galleryStrength === 'none' ? 'No gallery, portfolio, or before/after examples found.' : null,
    fix: 'Add a project gallery with captions and outcomes.',
  })

  const contactStrength = combineStrengths([
    strengthFromBoolean(offer.has_phone),
    strengthFromBoolean(offer.has_contact_page),
  ])
  addSignal(result, {
    id: 'contact',
    strength: contactStrength,
    points: pointsForStrength(contactStrength, 3),
    maxPoints: 3,
    label: 'Phone or contact page makes it easy to reach you.',
    evidence: `Phone=${offer.has_phone}, contact page=${offer.has_contact_page}.`,
    problem: contactStrength === 'none' ? 'No phone number or contact page detected.' : null,
    fix: 'Put click-to-call phone number in the header.',
  })

  removeContradictoryOfferProblems(result, offer, catalog)
  return { score: clamp(result.earned, max), ...result }
}

function scoreLocalServiceOffer(ctx, max) {
  return scorePhysicalServiceOffer(ctx, max)
}

function scoreGalleryPhysicalServiceOffer(ctx, max) {
  const { aggregated } = ctx
  const offer = resolveOfferSignals(ctx)
  const catalog = inferCatalogSignals({ ...ctx, signals: offer })
  const result = { earned: 0, strengths: [], problems: [], evidence: [], recommended_fixes: [] }

  const galleryStrength = combineStrengths([
    strengthFromBoolean(offer.has_gallery),
    strengthFromBoolean(offer.has_showroom),
    strengthFromCount((aggregated.images || []).length, { weak: 2, medium: 4, strong: 6 }),
    catalog.hasCatalogLayout ? 'strong' : catalog.hasWeakCatalog ? 'medium' : 'none',
    catalog.productCount >= 2 ? 'medium' : 'none',
    offer.has_offer_categories ? 'medium' : 'none',
  ])
  addSignal(result, {
    id: 'gallery',
    strength: galleryStrength,
    points: pointsForStrength(galleryStrength, 7),
    maxPoints: 7,
    label:
      catalog.hasCatalogLayout || catalog.productCount > 0 || offer.has_product_categories
        ? 'Product catalog or visual gallery showcases work and options.'
        : 'Gallery or portfolio showcases work quality.',
    evidence: `Gallery=${offer.has_gallery}, offer labels=${offer.offer_labels.slice(0, 4).join(', ') || 'none'}, grid images=${catalog.productGridCount}.`,
    problem:
      galleryStrength === 'none'
        ? 'No gallery, portfolio, showroom, or product catalog proof detected.'
        : null,
    fix: 'Add a visual gallery or shoppable catalog with project photos and short captions.',
  })

  const inquiryStrength = combineStrengths([
    strengthFromBoolean(offer.has_quote_cta),
    strengthFromBoolean(offer.has_consultation),
    strengthFromBoolean(offer.has_booking_cta),
    strengthFromBoolean(offer.has_contact_page),
    strengthFromBoolean(offer.has_phone),
    strengthFromBoolean(offer.has_showroom),
    catalog.hasShopCta ? 'medium' : 'none',
  ])
  addSignal(result, {
    id: 'inquiry',
    strength: inquiryStrength,
    points: pointsForStrength(inquiryStrength, 6),
    maxPoints: 6,
    label: 'Quote, booking, or consultation path matches how customers start a project.',
    evidence: `Quote=${offer.has_quote_cta}, contact=${offer.has_contact_page}, phone=${offer.has_phone}.`,
    problem: inquiryStrength === 'none' ? 'No clear inquiry or consultation path detected.' : null,
    fix: 'Add Request consultation or Get a quote above the fold.',
  })

  const serviceStrength = combineStrengths([
    strengthFromBoolean(offer.has_service_pages || offer.has_service_area),
    strengthFromBoolean(offer.has_service_categories || offer.has_offer_categories),
    strengthFromBoolean(offer.has_product_categories || catalog.hasWeakCatalog || catalog.hasCatalogLayout),
  ])
  addSignal(result, {
    id: 'service_explanation',
    strength: serviceStrength,
    points: pointsForStrength(serviceStrength, 4),
    maxPoints: 4,
    label:
      offer.has_product_categories || catalog.hasCatalogLayout
        ? 'Product lines and services are explained through shop categories or pages.'
        : 'Service explanation helps visitors understand what you deliver.',
    evidence: `Offer labels=${offer.offer_labels.slice(0, 4).join(', ') || 'none'}, service pages=${offer.has_service_pages}.`,
    problem:
      serviceStrength === 'none'
        ? 'Visitors may not quickly see what products or services you offer.'
        : null,
    fix: 'Add clear shop categories or service pages in the main navigation.',
  })

  const reviewStrength = strengthFromBoolean(aggregated.trust_signals?.review_indicators)
  addSignal(result, {
    id: 'reviews',
    strength: reviewStrength,
    points: pointsForStrength(reviewStrength, 3),
    maxPoints: 3,
    label: 'Reviews or testimonials build trust for custom work.',
    evidence: evidenceLabel(reviewStrength),
    problem: reviewStrength === 'none' ? 'No review or testimonial proof detected.' : null,
    fix: 'Add client testimonials near gallery examples.',
  })

  removeContradictoryOfferProblems(result, offer, catalog)
  return { score: clamp(result.earned, max), ...result }
}

function scoreBlogOffer(ctx, max) {
  const { aggregated, signals } = ctx
  const result = { earned: 0, strengths: [], problems: [], evidence: [], recommended_fixes: [] }

  const articleStrength = strengthFromCount(aggregated.content_signals?.article_count || aggregated.pages?.length || 0, {
    weak: 1,
    medium: 3,
    strong: 5,
  })
  addSignal(result, {
    id: 'articles',
    strength: articleStrength,
    points: pointsForStrength(articleStrength, 6),
    maxPoints: 6,
    label: 'Article structure and content depth support the blog model.',
    evidence: `${aggregated.content_signals?.article_count || 0} article-like page(s) detected.`,
    problem: articleStrength === 'none' ? 'Few article pages or posts were detected.' : null,
    fix: 'Publish posts with clear titles, dates, and categories.',
  })

  const navStrength = strengthFromCount((aggregated.content_signals?.navigation_labels || []).length, {
    weak: 2,
    medium: 4,
    strong: 6,
  })
  addSignal(result, {
    id: 'navigation',
    strength: navStrength,
    points: pointsForStrength(navStrength, 5),
    maxPoints: 5,
    label: 'Navigation and category organization help readers explore content.',
    evidence: `${aggregated.content_signals?.navigation_labels?.length || 0} nav labels found.`,
    problem: navStrength === 'none' ? 'Blog navigation or categories are weak.' : null,
    fix: 'Add category links and a visible blog index.',
  })

  const audienceStrength = strengthFromBoolean(aggregated.content_signals?.newsletter_indicators || signals.has_creator_links)
  addSignal(result, {
    id: 'audience',
    strength: audienceStrength,
    points: pointsForStrength(audienceStrength, 5),
    maxPoints: 5,
    label: 'Newsletter or social follow path grows audience.',
    evidence: evidenceLabel(audienceStrength),
    problem: audienceStrength === 'none' ? 'No newsletter or follow CTA detected.' : null,
    fix: 'Add email signup or social follow prompts on posts.',
  })

  const trustStrength = strengthFromBoolean(signals.has_about_page || aggregated.trust_signals?.review_indicators)
  addSignal(result, {
    id: 'author_trust',
    strength: trustStrength,
    points: pointsForStrength(trustStrength, 4),
    maxPoints: 4,
    label: 'Author or business trust signals support credibility.',
    evidence: evidenceLabel(trustStrength),
    problem: trustStrength === 'none' ? 'Author/about trust signals are missing.' : null,
    fix: 'Add author bio and about page linked from posts.',
  })

  return { score: clamp(result.earned, max), ...result }
}

function scoreContentBusinessOffer(ctx, max) {
  const { aggregated, signals } = ctx
  const result = { earned: 0, strengths: [], problems: [], evidence: [], recommended_fixes: [] }

  const nicheStrength = strengthFromBoolean(
    aggregated.content_signals?.total_text_length > 1200 && signals.has_niche_language,
  )
  addSignal(result, {
    id: 'niche',
    strength: nicheStrength,
    points: pointsForStrength(nicheStrength, 6),
    maxPoints: 6,
    label: 'Niche and audience focus are clear from content depth.',
    evidence: `${aggregated.content_signals?.total_text_length || 0} characters of readable content.`,
    problem: nicheStrength === 'none' ? 'Content depth is too thin to establish niche authority.' : null,
    fix: 'Clarify who you help and what topic you own on the homepage.',
  })

  const socialStrength = strengthFromCount((aggregated.social_channels || []).length, {
    weak: 1,
    medium: 2,
    strong: 3,
  })
  addSignal(result, {
    id: 'social_links',
    strength: socialStrength,
    points: pointsForStrength(socialStrength, 6),
    maxPoints: 6,
    label: 'Social profile links support audience building.',
    evidence: `${aggregated.social_channels?.length || 0} social link(s) found.`,
    problem: socialStrength === 'none' ? 'No social profile links detected.' : null,
    fix: 'Link Instagram, TikTok, or YouTube from the header/footer.',
  })

  const audienceStrength = strengthFromBoolean(aggregated.content_signals?.newsletter_indicators)
  addSignal(result, {
    id: 'newsletter',
    strength: audienceStrength,
    points: pointsForStrength(audienceStrength, 4),
    maxPoints: 4,
    label: 'Email or newsletter CTA grows owned audience.',
    evidence: evidenceLabel(audienceStrength),
    problem: audienceStrength === 'none' ? 'No newsletter or email signup CTA found.' : null,
    fix: 'Add a simple email signup with a lead magnet.',
  })

  const identityStrength = strengthFromBoolean(
    Boolean(aggregated.content_signals?.navigation_labels?.length >= 3) || signals.has_creator_links,
  )
  addSignal(result, {
    id: 'identity',
    strength: identityStrength,
    points: pointsForStrength(identityStrength, 4),
    maxPoints: 4,
    label: 'Creator or business identity is easy to understand.',
    evidence: `${aggregated.content_signals?.navigation_labels?.length || 0} nav labels, creator links=${signals.has_creator_links}.`,
    problem: identityStrength === 'none' ? 'Creator/business identity is unclear from navigation and links.' : null,
    fix: 'Add About page and consistent brand name in H1.',
  })

  return { score: clamp(result.earned, max), ...result }
}

function scoreListingOffer(ctx, max) {
  const { aggregated } = ctx
  const meta = aggregated.extraction_meta || {}
  const result = {
    earned: 3,
    strengths: ['Marketplace listing detected — brand control is limited compared to an owned website.'],
    problems: [],
    evidence: [
      {
        signal: 'marketplace_context',
        strength: 'medium',
        label: 'Listing quality scored instead of full brand site expectations.',
        detail: 'Scores focus on listing clarity within marketplace constraints.',
      },
    ],
    recommended_fixes: [],
  }

  const listingStrength = combineStrengths([
    strengthFromBoolean(meta.has_reliable_product_cards || (aggregated.products || []).length > 0),
    strengthFromBoolean(aggregated.pricing_signals?.length > 0),
    strengthFromBoolean(aggregated.trust_signals?.review_indicators),
  ])
  const listingPoints = pointsForStrength(listingStrength, max - 3)
  result.earned += listingPoints
  if (listingStrength !== 'none') {
    result.strengths.push('Listing shows product proof, pricing, or reviews within marketplace format.')
    result.evidence.push({
      signal: 'listing_quality',
      strength: listingStrength,
      label: 'Listing content quality',
      detail: `Products=${(aggregated.products || []).length}, reviews=${Boolean(aggregated.trust_signals?.review_indicators)}.`,
    })
  } else {
    result.problems.push('Marketplace listing lacks product proof, descriptions, or reviews.')
    result.recommended_fixes.push('Improve listing title, images, description, and review count on the marketplace.')
  }

  return { score: clamp(result.earned, max), ...result }
}

function scoreOfferBusinessFit(rubric, ctx, max) {
  switch (rubric) {
    case 'online_plus_offline_store':
      return scoreHybridStoreOffer(ctx, max)
    case 'online_gallery_physical_service':
      return scoreGalleryPhysicalServiceOffer(ctx, max)
    case 'online_plus_physical_service':
      return scorePhysicalServiceOffer(ctx, max)
    case 'local_service_business':
      return scoreLocalServiceOffer(ctx, max)
    case 'content_business':
      return scoreContentBusinessOffer(ctx, max)
    case 'blog':
      return scoreBlogOffer(ctx, max)
    case 'listing':
      return scoreListingOffer(ctx, max)
    case 'ecommerce_store':
    default:
      return scoreEcommerceOffer(ctx, max)
  }
}

module.exports = {
  scoreOfferBusinessFit,
  scoreEcommerceOffer,
  scoreHybridStoreOffer,
  scorePhysicalServiceOffer,
  scoreGalleryPhysicalServiceOffer,
  scoreLocalServiceOffer,
  scoreContentBusinessOffer,
  scoreBlogOffer,
  scoreListingOffer,
  scoreContentSocialOffer: scoreContentBusinessOffer,
  scoreMarketplaceOffer: scoreListingOffer,
}
