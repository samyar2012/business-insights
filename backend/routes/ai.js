const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { loadFullContext } = require('../services/contextService')
const { searchWeb } = require('../services/searchService')
const {
  generateChatAnswer,
  generateContentIdeas,
  summarizeCompetitor,
  analyzeSocial,
  analyzeStoreHealth,
  wantsCurrentInfo,
} = require('../services/aiService')
const { saveChatMessage, learnFromUserMessage } = require('../services/memoryService')
const { getLatestResearchProfile } = require('../services/businessResearchService')
const { getBusinessContext } = require('../services/retrievalService')
const { query } = require('../db')

const router = express.Router()

async function loadBusiness(userId, businessId) {
  if (!businessId) return null
  const result = await query(`SELECT * FROM businesses WHERE id = $1 AND user_id = $2`, [
    businessId,
    userId,
  ])
  return result.rows[0] || null
}

router.post('/chat', requireAuth, async (req, res) => {
  const message = String(req.body?.message || '').trim()
  if (!message) return res.status(400).json({ error: 'message is required' })

  try {
    const businessId = req.body?.business_id || null
    const business = businessId
      ? await loadBusiness(req.auth.sub, businessId)
      : (await loadFullContext(req.auth.sub)).businesses?.[0] || null

    if (businessId && !business) {
      return res.status(404).json({ error: 'Business not found' })
    }

    const ctx = await loadFullContext(req.auth.sub)
    const research = business
      ? await getLatestResearchProfile(req.auth.sub, business.id)
      : null

    const retrievalContext = business
      ? await getBusinessContext({
          userId: req.auth.sub,
          businessId: business.id,
          query: message,
          limit: 5,
        })
      : null

    const businessScans = business
      ? (ctx.scans || []).filter((s) => s.business_id === business.id)
      : ctx.scans || []

    const businessActions = business
      ? (ctx.actions || []).filter((a) => a.business_id === business.id)
      : ctx.actions || []

    let searchResults = null
    if (req.body?.use_search || wantsCurrentInfo(message)) {
      const q =
        req.body?.search_query ||
        `${business?.business_name || 'ecommerce'} ${business?.product_sold || ''} market trends`.trim()
      searchResults = await searchWeb(q, {
        userId: req.auth.sub,
        businessId: business?.id,
        limit: 4,
      })
    }

    const result = await generateChatAnswer({
      business,
      research,
      retrievalContext,
      scans: businessScans,
      actions: businessActions,
      memories: ctx.memories,
      message,
      searchResults,
      businesses: ctx.businesses,
    })

    await saveChatMessage(req.auth.sub, {
      role: 'user',
      content: message,
      business_id: business?.id,
      metadata: {},
    })
    await saveChatMessage(req.auth.sub, {
      role: 'assistant',
      content: result.answer,
      business_id: business?.id,
      metadata: {
        provider: result.provider,
        score_context: result.score_context,
        suggested_actions: result.suggested_actions,
      },
    })
    await learnFromUserMessage(req.auth.sub, message)

    return res.json({
      answer: result.answer,
      score_context: result.score_context,
      sources: result.sources,
      suggested_actions: result.suggested_actions,
      used_memory: result.used_memory,
      provider: result.provider,
      reply: result.answer,
    })
  } catch (err) {
    console.error('ai chat:', err.message)
    return res.status(500).json({ error: 'Failed to generate advice' })
  }
})

router.post('/content', requireAuth, async (req, res) => {
  try {
    const ctx = await loadFullContext(req.auth.sub)
    const input = {
      topic: req.body?.topic,
      format: req.body?.format,
      platform: req.body?.platform,
      notes: req.body?.notes,
    }
    const result = await generateContentIdeas({ ctx, input })
    return res.json({ ...result, input })
  } catch (err) {
    console.error('ai content:', err.message)
    return res.status(500).json({ error: 'Failed to generate content' })
  }
})

router.post('/competitor-research', requireAuth, async (req, res) => {
  const competitorName = String(req.body?.competitor_name || '').trim()
  const competitorUrl = String(req.body?.competitor_url || '').trim()
  if (!competitorName && !competitorUrl) {
    return res.status(400).json({ error: 'competitor_name or competitor_url is required' })
  }

  try {
    const ctx = await loadFullContext(req.auth.sub)
    const business = ctx.businesses?.[0]
    const queryText = competitorName || competitorUrl
    const searchResults = await searchWeb(`${queryText} ecommerce store offers`, {
      userId: req.auth.sub,
      businessId: business?.id,
      limit: 6,
    })
    const result = await summarizeCompetitor({
      ctx,
      input: { competitor_name: competitorName, competitor_url: competitorUrl },
      searchResults,
    })
    return res.json({ ...result, search_provider: searchResults.provider })
  } catch (err) {
    console.error('ai competitor:', err.message)
    return res.status(500).json({ error: 'Failed to research competitor' })
  }
})

router.post('/social-analysis', requireAuth, async (req, res) => {
  try {
    const ctx = await loadFullContext(req.auth.sub)
    const business = ctx.businesses?.[0]
    const input = {
      profile_url: req.body?.profile_url,
      content_notes: req.body?.content_notes,
      posting_frequency: req.body?.posting_frequency,
      niche: req.body?.niche,
    }

    let searchResults = null
    if (input.profile_url) {
      searchResults = await searchWeb(`${input.profile_url} social content strategy`, {
        userId: req.auth.sub,
        businessId: business?.id,
        limit: 4,
      })
    }

    const result = await analyzeSocial({ ctx, input, searchResults })
    return res.json({ ...result, search_provider: searchResults?.provider || null })
  } catch (err) {
    console.error('ai social:', err.message)
    return res.status(500).json({ error: 'Failed to analyze social content' })
  }
})

router.post('/store-health', requireAuth, async (req, res) => {
  try {
    const ctx = await loadFullContext(req.auth.sub)
    const business = ctx.businesses?.[0]
    if (business) {
      ctx.research = await getLatestResearchProfile(req.auth.sub, business.id)
    }
    const input = {
      store_url: req.body?.store_url,
      focus: req.body?.focus,
      topic: req.body?.topic,
    }

    let searchResults = null
    if (input.store_url || input.topic) {
      const q = input.topic || `${input.store_url} storefront conversion trust signals`
      searchResults = await searchWeb(q, {
        userId: req.auth.sub,
        businessId: business?.id,
        limit: 4,
      })
    }

    const result = await analyzeStoreHealth({ ctx, input, searchResults })
    return res.json({ ...result, search_provider: searchResults?.provider || null })
  } catch (err) {
    console.error('ai store health:', err.message)
    return res.status(500).json({ error: 'Failed to analyze store health' })
  }
})

module.exports = { aiRouter: router }
