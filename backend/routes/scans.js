const express = require('express')
const { query } = require('../db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

const SCAN_SELECT = `
  SELECT s.*, b.business_name, b.business_type
  FROM business_scans s
  LEFT JOIN businesses b ON b.id = s.business_id
`

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function parseBool(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return Boolean(value)
}

function scoreUrl(url, kind) {
  let score = 50
  const trimmed = String(url || '').trim()
  if (!trimmed) return kind === 'store' ? 35 : 40

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (parsed.protocol === 'https:') score += 15
    if (parsed.hostname.includes('.')) score += 10
    if (kind === 'store' && /shopify|myshopify|woocommerce|squarespace|etsy/i.test(parsed.hostname)) {
      score += 10
    }
    if (kind === 'social' && /instagram|tiktok|facebook|youtube|twitter|x\.com|linkedin/i.test(parsed.hostname)) {
      score += 15
    }
    if (parsed.pathname.length > 1) score += 5
  } catch {
    score -= 20
  }

  return clampScore(score)
}

function runMockScan({
  store_url,
  social_url,
  competitor_url,
  notes,
  checklist = {},
}) {
  let storeScore = scoreUrl(store_url, 'store')
  let contentScore = social_url ? scoreUrl(social_url, 'social') : clampScore(storeScore - 10)
  let competitorScore = competitor_url ? scoreUrl(competitor_url, 'store') : 55
  let trustScore = clampScore((storeScore + contentScore) / 2 + (store_url?.startsWith('https') ? 8 : 0))

  const hasReviews = parseBool(checklist.has_reviews)
  const hasShipping = parseBool(checklist.has_shipping_policy)
  const hasReturn = parseBool(checklist.has_return_policy)
  const hasPhotos = parseBool(checklist.has_clear_product_photos)
  const postsWeekly = parseBool(checklist.posts_weekly)
  const hasCompetitorFlag = parseBool(checklist.has_competitor)
  const offerClear = parseBool(checklist.offer_is_clear)

  if (hasReviews) trustScore = clampScore(trustScore + 8)
  if (hasShipping) trustScore = clampScore(trustScore + 6)
  if (hasReturn) trustScore = clampScore(trustScore + 6)
  if (hasPhotos) storeScore = clampScore(storeScore + 8)
  if (offerClear) storeScore = clampScore(storeScore + 10)
  if (postsWeekly) contentScore = clampScore(contentScore + 12)
  if (hasCompetitorFlag || competitor_url) {
    competitorScore = clampScore(competitorScore + (hasCompetitorFlag ? 10 : 0))
  }

  const overallScore = clampScore(
    storeScore * 0.35 + trustScore * 0.25 + contentScore * 0.25 + competitorScore * 0.15,
  )

  const strengths = []
  const risks = []
  const nextActions = []

  if (storeScore >= 70) strengths.push('Store URL looks well-structured and reachable.')
  else risks.push('Store presence score is low - check HTTPS, domain, and landing page clarity.')

  if (offerClear) strengths.push('Your offer reads clearly to new visitors.')
  else {
    risks.push('Offer clarity is weak - headline and primary CTA may not be obvious.')
    nextActions.push('Rewrite your homepage hero: one promise, one product, one CTA.')
  }

  if (hasPhotos) strengths.push('Product photos appear strong enough to support conversions.')
  else nextActions.push('Add clear, well-lit product photos on key landing pages.')

  if (social_url && contentScore >= 65) strengths.push('Social profile link points to a recognized platform.')
  else if (!social_url) risks.push('No social URL provided - harder to assess content and brand reach.')
  else risks.push('Social profile score is weak - verify the link and posting consistency.')

  if (postsWeekly) strengths.push('Weekly posting habit supports content momentum.')
  else nextActions.push('Post 3-5 times per week aligned with your top offer.')

  if (hasReviews) strengths.push('Reviews or social proof are in place for trust.')
  else nextActions.push('Collect and surface customer reviews on product and homepage.')

  if (hasShipping && hasReturn) strengths.push('Shipping and return policies help reduce purchase friction.')
  else {
    if (!hasShipping) nextActions.push('Publish a clear shipping policy with timelines and regions.')
    if (!hasReturn) nextActions.push('Add a return policy customers can find before checkout.')
  }

  if (trustScore >= 70) strengths.push('Basic trust signals (secure URL, policies, proof) look solid.')
  else risks.push('Trust score needs work - add policies, contact info, and consistent branding.')

  if (competitor_url || hasCompetitorFlag) {
    if (competitorScore >= storeScore) risks.push('Competitor storefront may be stronger on first impressions.')
    else strengths.push('Your store URL scores ahead of the competitor context you provided.')
  } else {
    nextActions.push('Add a competitor URL or confirm you track one competitor.')
  }

  if (notes && notes.length > 20) {
    strengths.push('You provided useful context in notes for follow-up actions.')
  }

  nextActions.push('Run weekly scans after updating store copy, offers, or social posts.')
  if (storeScore < 75) nextActions.push('Improve store homepage: clear value prop, social proof, and primary CTA above the fold.')
  if (contentScore < 70) nextActions.push('Align social content with your top product and post consistently.')
  if (trustScore < 70) nextActions.push('Add or refresh shipping, returns, and privacy pages on your storefront.')

  const uniqueStrengths = [...new Set(strengths)].slice(0, 5)
  const uniqueRisks = [...new Set(risks)].slice(0, 5)
  const uniqueActions = [...new Set(nextActions)].slice(0, 6)

  return {
    overall_score: overallScore,
    store_score: storeScore,
    trust_score: trustScore,
    content_score: contentScore,
    competitor_score: competitorScore,
    top_strengths: uniqueStrengths,
    top_risks: uniqueRisks,
    next_actions: uniqueActions,
    checklist: {
      has_reviews: hasReviews,
      has_shipping_policy: hasShipping,
      has_return_policy: hasReturn,
      has_clear_product_photos: hasPhotos,
      posts_weekly: postsWeekly,
      has_competitor: hasCompetitorFlag,
      offer_is_clear: offerClear,
    },
  }
}

async function assertBusinessOwned(userId, businessId) {
  const result = await query(`SELECT id FROM businesses WHERE id = $1 AND user_id = $2`, [
    businessId,
    userId,
  ])
  return Boolean(result.rows[0])
}

function formatScanRow(row) {
  const result = row.result_json || {}
  return {
    id: row.id,
    business_id: row.business_id,
    business_name: row.business_name || null,
    business_type: row.business_type || null,
    store_url: row.store_url,
    social_url: row.social_url,
    competitor_url: row.competitor_url,
    notes: row.notes,
    overall_score: row.overall_score,
    store_score: row.store_score,
    trust_score: row.trust_score,
    content_score: row.content_score,
    competitor_score: row.competitor_score,
    top_strengths: result.top_strengths || [],
    top_risks: result.top_risks || [],
    next_actions: result.next_actions || [],
    checklist: result.checklist || null,
    created_at: row.created_at,
  }
}

router.post('/', requireAuth, async (req, res) => {
  const businessId = String(req.body?.business_id || '').trim()
  const storeUrl = String(req.body?.store_url || '').trim()
  const socialUrl = String(req.body?.social_url || '').trim()
  const competitorUrl = String(req.body?.competitor_url || '').trim()
  const notes = String(req.body?.notes || '').trim()
  const checklist = {
    has_reviews: req.body?.has_reviews,
    has_shipping_policy: req.body?.has_shipping_policy,
    has_return_policy: req.body?.has_return_policy,
    has_clear_product_photos: req.body?.has_clear_product_photos,
    posts_weekly: req.body?.posts_weekly,
    has_competitor: req.body?.has_competitor,
    offer_is_clear: req.body?.offer_is_clear,
  }

  if (!businessId) {
    return res.status(400).json({ error: 'business_id is required' })
  }
  if (!storeUrl) {
    return res.status(400).json({ error: 'store_url is required' })
  }

  try {
    const owned = await assertBusinessOwned(req.auth.sub, businessId)
    if (!owned) {
      return res.status(403).json({ error: 'You can only scan your own businesses' })
    }

    const scores = runMockScan({
      store_url: storeUrl,
      social_url: socialUrl,
      competitor_url: competitorUrl,
      notes,
      checklist,
    })

    const resultJson = {
      top_strengths: scores.top_strengths,
      top_risks: scores.top_risks,
      next_actions: scores.next_actions,
      checklist: scores.checklist,
    }

    const insert = await query(
      `INSERT INTO business_scans (
         user_id, business_id, store_url, social_url, competitor_url, notes,
         overall_score, store_score, trust_score, content_score, competitor_score, result_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        req.auth.sub,
        businessId,
        storeUrl || null,
        socialUrl || null,
        competitorUrl || null,
        notes || null,
        scores.overall_score,
        scores.store_score,
        scores.trust_score,
        scores.content_score,
        scores.competitor_score,
        JSON.stringify(resultJson),
      ],
    )

    const joined = await query(`${SCAN_SELECT} WHERE s.id = $1`, [insert.rows[0].id])
    return res.status(201).json({ scan: formatScanRow(joined.rows[0]) })
  } catch (err) {
    console.error('create scan:', err.message)
    return res.status(500).json({ error: 'Failed to run scan' })
  }
})

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `${SCAN_SELECT}
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT 50`,
      [req.auth.sub],
    )
    return res.json({ scans: result.rows.map(formatScanRow) })
  } catch (err) {
    console.error('list scans:', err.message)
    return res.status(500).json({ error: 'Failed to load scans' })
  }
})

router.post('/:id/create-action-plan', requireAuth, async (req, res) => {
  try {
    const { createActionPlanFromScan } = require('../services/actionPlanService')
    const result = await createActionPlanFromScan(req.auth.sub, req.params.id)
    if (result.error === 'not_found') {
      return res.status(404).json({ error: 'Scan not found' })
    }
    if (result.error === 'no_actions') {
      return res.status(400).json({ error: result.message })
    }
    return res.status(result.already_exists ? 200 : 201).json({
      already_exists: result.already_exists,
      actions: result.actions,
    })
  } catch (err) {
    console.error('create action plan:', err.message)
    return res.status(500).json({ error: 'Failed to create action plan' })
  }
})

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const result = await query(`${SCAN_SELECT} WHERE s.id = $1 AND s.user_id = $2`, [
      req.params.id,
      req.auth.sub,
    ])
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Scan not found' })
    }
    return res.json({ scan: formatScanRow(result.rows[0]) })
  } catch (err) {
    console.error('get scan:', err.message)
    return res.status(500).json({ error: 'Failed to load scan' })
  }
})

module.exports = { scansRouter: router }
