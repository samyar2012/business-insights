const AI_PROVIDER = (process.env.AI_PROVIDER || 'mock').toLowerCase()
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

function buildContextSummary(ctx) {
  const business = ctx.businesses?.[0]
  const scan = ctx.scans?.[0]
  const openActions = (ctx.actions || []).filter((a) => a.status !== 'done')

  return {
    businessName: business?.business_name || 'your business',
    businessType: business?.business_type || 'ecommerce',
    latestScanScore: scan?.overall_score ?? null,
    openActionCount: openActions.length,
    topActions: openActions.slice(0, 3).map((a) => a.title),
    memories: (ctx.memories || []).slice(0, 8),
  }
}

async function callOpenAI(systemPrompt, userPrompt) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('OPENAI_API_KEY not configured')

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'OpenAI request failed')
  return data.choices?.[0]?.message?.content || ''
}

async function generateWithProvider(systemPrompt, userPrompt) {
  if (AI_PROVIDER === 'openai' && process.env.OPENAI_API_KEY) {
    const text = await callOpenAI(systemPrompt, userPrompt)
    return { provider: 'openai', text }
  }
  return { provider: 'mock', text: null }
}

function mockBusinessAdvice(ctx, message, searchResults) {
  const summary = buildContextSummary(ctx)
  const searchNote = searchResults?.results?.length
    ? `Web context: ${searchResults.results[0].snippet}`
    : 'No live web search configured - using your saved profile and scans.'

  return {
    reply: `Coach for ${summary.businessName}: ${message}\n\nBased on your latest scan (${summary.latestScanScore ?? 'none yet'}) and ${summary.openActionCount} open tasks, focus on one high-leverage move this week. ${searchNote}\n\nSuggested priorities:\n1. Fix your highest-risk scan item\n2. Ship one offer test\n3. Post 3 pieces of social proof content`,
    insights: [
      'Prioritize trust signals if scan trust score is below 70.',
      'Turn top scan next_actions into action plan tasks.',
    ],
    provider: 'mock',
  }
}

async function generateBusinessAdvice({ ctx, message, searchResults, scanContext }) {
  const summary = buildContextSummary(ctx)
  const systemPrompt = `You are a pragmatic ecommerce growth coach. Be concise and actionable. Do not claim model training on user data; you only use provided context.`
  const userPrompt = JSON.stringify({
    message,
    summary,
    scanContext,
    searchResults: searchResults?.results?.slice(0, 3),
    memories: ctx.memories,
    recentActions: ctx.actions?.slice(0, 5),
  })

  try {
    const ai = await generateWithProvider(systemPrompt, userPrompt)
    if (ai.text) {
      return { reply: ai.text, insights: [], provider: ai.provider }
    }
  } catch (err) {
    console.warn('AI provider fallback:', err.message)
  }

  return mockBusinessAdvice(ctx, message, searchResults)
}

function mockContentIdeas(ctx, input) {
  const name = buildContextSummary(ctx).businessName
  const topic = input.topic || 'your hero product'
  return {
    hooks: [
      `Why ${topic} is the upgrade ${name} customers keep reordering`,
      `3 mistakes buyers make before choosing ${topic}`,
      `I tested ${topic} for 30 days - honest results`,
    ],
    captions: [
      `New drop from ${name}. Link in bio.`,
      `Limited bundle this week only. Comment "INFO" for details.`,
    ],
    ad_copy: [`Stop scrolling - ${topic} solves the #1 pain point for busy shoppers.`],
    email_ideas: [`Subject: Your ${topic} cart is waiting`],
    product_page: [`Headline: ${topic} built for everyday wins. Subhead: Free returns + fast ship.`],
    provider: 'mock',
  }
}

async function generateContentIdeas({ ctx, input }) {
  const systemPrompt = 'Generate short-form ecommerce content ideas as JSON with keys: hooks, captions, ad_copy, email_ideas, product_page (arrays of strings).'
  const userPrompt = JSON.stringify({ input, context: buildContextSummary(ctx) })

  try {
    const ai = await generateWithProvider(systemPrompt, userPrompt)
    if (ai.text) {
      try {
        return { ...JSON.parse(ai.text), provider: ai.provider }
      } catch {
        return { raw: ai.text, provider: ai.provider }
      }
    }
  } catch (err) {
    console.warn('content AI fallback:', err.message)
  }

  return mockContentIdeas(ctx, input)
}

function mockCompetitorSummary(input, searchResults) {
  const name = input.competitor_name || input.competitor_url || 'Competitor'
  const snippet = searchResults?.results?.[0]?.snippet || 'Limited public data in mock mode.'
  return {
    positioning: `${name} appears to compete on convenience and offer clarity.`,
    offer_ideas: ['Bundle with free shipping threshold', 'Limited-time welcome discount'],
    content_angles: ['Before/after customer results', 'Founder story behind the product'],
    risks: ['They may outspend you on paid social', 'Similar offer may reduce differentiation'],
    search_snippets: (searchResults?.results || []).slice(0, 3),
    provider: 'mock',
    summary: snippet,
  }
}

async function summarizeCompetitor({ ctx, input, searchResults }) {
  const systemPrompt = 'Summarize competitor positioning for an ecommerce operator. Return JSON: positioning, offer_ideas, content_angles, risks (arrays where appropriate).'
  const userPrompt = JSON.stringify({ input, searchResults, context: buildContextSummary(ctx) })

  try {
    const ai = await generateWithProvider(systemPrompt, userPrompt)
    if (ai.text) {
      try {
        return { ...JSON.parse(ai.text), provider: ai.provider, search_snippets: searchResults?.results?.slice(0, 3) }
      } catch {
        return { summary: ai.text, provider: ai.provider }
      }
    }
  } catch (err) {
    console.warn('competitor AI fallback:', err.message)
  }

  return mockCompetitorSummary(input, searchResults)
}

function mockSocialAnalysis(input) {
  return {
    content_score: input.posting_frequency === 'daily' ? 78 : input.posting_frequency === 'weekly' ? 65 : 48,
    hook_ideas: [
      'POV: you finally found a product that actually works',
      'Stop doing this if you want more repeat customers',
      'What we shipped this week (behind the scenes)',
    ],
    posting_plan: ['Mon: product demo', 'Wed: customer story', 'Fri: offer/reminder'],
    content_gaps: ['No clear CTA in recent posts', 'Add more proof before price reveal'],
    provider: 'mock',
  }
}

async function analyzeSocial({ ctx, input, searchResults }) {
  const systemPrompt = 'Analyze social content strategy. Return JSON: content_score (0-100), hook_ideas, posting_plan, content_gaps.'
  const userPrompt = JSON.stringify({ input, searchResults, context: buildContextSummary(ctx) })

  try {
    const ai = await generateWithProvider(systemPrompt, userPrompt)
    if (ai.text) {
      try {
        return { ...JSON.parse(ai.text), provider: ai.provider }
      } catch {
        return { summary: ai.text, provider: ai.provider }
      }
    }
  } catch (err) {
    console.warn('social AI fallback:', err.message)
  }

  return mockSocialAnalysis(input)
}

function mockStoreHealth(ctx, input) {
  const scan = ctx.scans?.[0]
  return {
    overall: scan?.store_score ?? 62,
    findings: [
      { area: 'Offer clarity', status: scan?.store_score >= 70 ? 'good' : 'needs_work' },
      { area: 'Trust signals', status: scan?.trust_score >= 70 ? 'good' : 'needs_work' },
      { area: 'Content momentum', status: scan?.content_score >= 70 ? 'good' : 'needs_work' },
    ],
    recommendations: [
      'Move primary CTA above the fold',
      'Add shipping/returns policy links in footer',
      'Refresh hero product photography',
    ],
    provider: 'mock',
    note: input.focus || 'General storefront health review',
  }
}

async function analyzeStoreHealth({ ctx, input, searchResults }) {
  const systemPrompt = 'Provide store health analysis as JSON: overall (0-100), findings (array of {area, status}), recommendations (array).'
  const userPrompt = JSON.stringify({ input, searchResults, scans: ctx.scans?.slice(0, 2), context: buildContextSummary(ctx) })

  try {
    const ai = await generateWithProvider(systemPrompt, userPrompt)
    if (ai.text) {
      try {
        return { ...JSON.parse(ai.text), provider: ai.provider }
      } catch {
        return { summary: ai.text, provider: ai.provider }
      }
    }
  } catch (err) {
    console.warn('store health AI fallback:', err.message)
  }

  return mockStoreHealth(ctx, input)
}

module.exports = {
  generateBusinessAdvice,
  generateContentIdeas,
  summarizeCompetitor,
  analyzeSocial,
  analyzeStoreHealth,
  buildContextSummary,
}
