const express = require('express')
const { requireAuth } = require('../middleware/auth')
const { loadFullContext } = require('../services/contextService')
const { searchWeb } = require('../services/searchService')
const {
  generateBusinessAdvice,
  generateContentIdeas,
  summarizeCompetitor,
  analyzeSocial,
  analyzeStoreHealth,
} = require('../services/aiService')
const { saveChatMessage, learnFromUserMessage } = require('../services/memoryService')
const { query } = require('../db')

const router = express.Router()

async function loadScanContext(userId, scanId) {
  if (!scanId) return null
  const result = await query(
    `SELECT s.*, b.business_name, b.business_type
     FROM business_scans s
     LEFT JOIN businesses b ON b.id = s.business_id
     WHERE s.id = $1 AND s.user_id = $2`,
    [scanId, userId],
  )
  const row = result.rows[0]
  if (!row) return null
  const resultJson = row.result_json || {}
  return {
    id: row.id,
    overall_score: row.overall_score,
    store_score: row.store_score,
    trust_score: row.trust_score,
    content_score: row.content_score,
    competitor_score: row.competitor_score,
    business_name: row.business_name,
    top_strengths: resultJson.top_strengths || [],
    top_risks: resultJson.top_risks || [],
    next_actions: resultJson.next_actions || [],
    checklist: resultJson.checklist || {},
  }
}

router.post('/chat', requireAuth, async (req, res) => {
  const message = String(req.body?.message || '').trim()
  if (!message) return res.status(400).json({ error: 'message is required' })

  try {
    const ctx = await loadFullContext(req.auth.sub)
    const scanContext = await loadScanContext(req.auth.sub, req.body?.scan_id)

    let searchResults = null
    if (req.body?.use_search) {
      const q = req.body.search_query || `${message} ecommerce growth strategy`
      searchResults = await searchWeb(q, { limit: 5 })
    }

    const result = await generateBusinessAdvice({
      ctx,
      message,
      searchResults,
      scanContext,
    })

    await saveChatMessage(req.auth.sub, {
      role: 'user',
      content: message,
      business_id: req.body?.business_id,
      metadata: { scan_id: req.body?.scan_id || null },
    })
    await saveChatMessage(req.auth.sub, {
      role: 'assistant',
      content: result.reply,
      business_id: req.body?.business_id,
      metadata: { provider: result.provider, insights: result.insights },
    })
    await learnFromUserMessage(req.auth.sub, message)

    return res.json({
      reply: result.reply,
      insights: result.insights || [],
      provider: result.provider,
      search: searchResults ? { provider: searchResults.provider, count: searchResults.results?.length } : null,
      context: {
        business: ctx.businesses?.[0]?.business_name || null,
        open_actions: (ctx.actions || []).filter((a) => a.status !== 'done').length,
      },
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
    const queryText = competitorName || competitorUrl
    const searchResults = await searchWeb(`${queryText} ecommerce store offers`, { limit: 6 })
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
    const input = {
      profile_url: req.body?.profile_url,
      content_notes: req.body?.content_notes,
      posting_frequency: req.body?.posting_frequency,
      niche: req.body?.niche,
    }

    let searchResults = null
    if (input.profile_url) {
      searchResults = await searchWeb(`${input.profile_url} social content strategy`, { limit: 4 })
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
    const input = {
      store_url: req.body?.store_url,
      focus: req.body?.focus,
      topic: req.body?.topic,
    }

    let searchResults = null
    if (input.store_url || input.topic) {
      const q = input.topic || `${input.store_url} storefront conversion trust signals`
      searchResults = await searchWeb(q, { limit: 4 })
    }

    const result = await analyzeStoreHealth({ ctx, input, searchResults })
    return res.json({ ...result, search_provider: searchResults?.provider || null })
  } catch (err) {
    console.error('ai store health:', err.message)
    return res.status(500).json({ error: 'Failed to analyze store health' })
  }
})

module.exports = { aiRouter: router }
