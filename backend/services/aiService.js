const AI_PROVIDER = (process.env.AI_PROVIDER || 'mock').toLowerCase()

function wantsCurrentInfo(message) {
  return /current|latest|today|now|trend|news|recent|market/i.test(message)
}

function pickScoreContext(research, scans, webProfile) {
  if (webProfile?.scores) {
    return {
      source: 'website_crawl',
      overall_score: webProfile.scores.overall_score,
      store_score: webProfile.scores.store_score,
      trust_score: webProfile.scores.trust_score,
      content_score: webProfile.scores.content_score,
      offer_score: webProfile.scores.offer_score,
      technical_score: webProfile.scores.technical_score,
    }
  }
  if (research?.scores) {
    return {
      source: 'research',
      overall_score: research.scores.overall_score,
      store_score: research.scores.store_score,
      trust_score: research.scores.trust_score,
      content_score: research.scores.content_score,
      offer_score: research.scores.offer_score,
      market_score: research.scores.market_score,
    }
  }
  const scan = scans?.[0]
  if (scan) {
    return {
      source: 'scan',
      overall_score: scan.overall_score,
      store_score: scan.store_score,
      trust_score: scan.trust_score,
      content_score: scan.content_score,
      competitor_score: scan.competitor_score,
    }
  }
  return { source: 'none' }
}

function buildMockChatAnswer({
  business,
  research,
  retrievalContext,
  scans,
  actions,
  memories,
  message,
  searchResults,
}) {
  const name = business?.business_name || 'your business'
  const scores = pickScoreContext(research, scans, webProfile)
  const openActions = (actions || []).filter((a) => a.status !== 'done')

  const webProfile = retrievalContext?.profile
  const websiteChunks = retrievalContext?.website_chunks || []

  const researchStrengths = research?.scores?.strengths || webProfile?.scores?.strengths || []
  const researchRisks = research?.scores?.risks || webProfile?.scores?.risks || []
  const researchActions =
    research?.scores?.next_actions || webProfile?.scores?.recommended_actions || []

  const sources = [
    ...(retrievalContext?.sources || []),
    ...(research?.search_summary?.sources || []).slice(0, 4),
    ...(searchResults?.results || []).slice(0, 2).map((r) => ({
      title: r.title,
      url: r.url,
      query: searchResults.query,
    })),
  ]

  const memorySummary = (memories || []).slice(0, 6).map((m) => ({
    type: m.memory_type,
    key: m.key,
    value: m.value,
  }))

  let answer = `For ${name}: ${message}\n\n`
  if (scores.source === 'research' || scores.source === 'website_crawl') {
    answer += `Research score is ${scores.overall_score}/100 (store ${scores.store_score}, trust ${scores.trust_score}, offer ${scores.offer_score}${scores.market_score != null ? `, market ${scores.market_score}` : ''}). `
  } else if (scores.source === 'scan') {
    answer += `Latest scan score is ${scores.overall_score}/100. `
  } else {
    answer += 'Run business research or a scan to unlock score-based coaching. '
  }

  if (researchRisks.length) {
    answer += `Top risk: ${researchRisks[0]}. `
  }
  if (websiteChunks.length) {
    const snippet = websiteChunks[0].content.slice(0, 120)
    answer += `From your website (${websiteChunks[0].title || websiteChunks[0].url}): "${snippet}..." `
  }
  if (openActions.length) {
    answer += `You have ${openActions.length} open action item(s) - start with "${openActions[0].title}". `
  } else if (researchActions.length) {
    answer += `Suggested next step: ${researchActions[0]}. `
  }

  answer +=
    '\n\nBusiness Insights saves research and user memory to personalize recommendations. This is not model training yet.'

  const suggested_actions = [
    ...researchActions.slice(0, 2),
    ...openActions.slice(0, 2).map((a) => a.title),
  ].filter(Boolean).slice(0, 4)

  return {
    answer,
    score_context: scores,
    sources: sources.slice(0, 6),
    suggested_actions,
    used_memory: memorySummary,
    provider: AI_PROVIDER,
  }
}

async function generateChatAnswer(ctx) {
  if (AI_PROVIDER !== 'mock') {
    // Future: call CUSTOM_AI_BASE_URL when configured
    const base = process.env.CUSTOM_AI_BASE_URL
    const key = process.env.CUSTOM_AI_API_KEY
    if (base && key) {
      // placeholder for custom model integration
    }
  }
  return buildMockChatAnswer(ctx)
}

function mockContentIdeas(ctx, input) {
  const business = ctx.businesses?.[0]
  const name = business?.business_name || 'your business'
  const topic = input.topic || business?.product_sold || 'your hero product'
  return {
    hooks: [
      `Why ${topic} is the upgrade ${name} customers keep reordering`,
      `3 mistakes buyers make before choosing ${topic}`,
      `I tested ${topic} for 30 days - honest results`,
    ],
    captions: [`New drop from ${name}. Link in bio.`],
    ad_copy: [`Stop scrolling - ${topic} solves the #1 pain point for busy shoppers.`],
    email_ideas: [`Subject: Your ${topic} cart is waiting`],
    product_page: [`Headline: ${topic} built for everyday wins.`],
    provider: 'mock',
  }
}

async function generateContentIdeas({ ctx, input }) {
  return mockContentIdeas(ctx, input)
}

function mockCompetitorSummary(input, searchResults) {
  const name = input.competitor_name || input.competitor_url || 'Competitor'
  return {
    positioning: `${name} appears to compete on convenience and offer clarity.`,
    offer_ideas: ['Bundle with free shipping threshold', 'Limited-time welcome discount'],
    content_angles: ['Before/after customer results', 'Founder story behind the product'],
    risks: ['They may outspend you on paid social'],
    search_snippets: (searchResults?.results || []).slice(0, 3),
    provider: 'mock',
    summary: searchResults?.results?.[0]?.snippet || 'Limited public data in mock mode.',
  }
}

async function summarizeCompetitor({ ctx, input, searchResults }) {
  return mockCompetitorSummary(input, searchResults)
}

function mockSocialAnalysis(input) {
  return {
    content_score: input.posting_frequency === 'daily' ? 78 : input.posting_frequency === 'weekly' ? 65 : 48,
    hook_ideas: ['POV: you finally found a product that actually works'],
    posting_plan: ['Mon: product demo', 'Wed: customer story', 'Fri: offer/reminder'],
    content_gaps: ['No clear CTA in recent posts'],
    provider: 'mock',
  }
}

async function analyzeSocial({ ctx, input, searchResults }) {
  return mockSocialAnalysis(input)
}

function mockStoreHealth(ctx, input) {
  const research = ctx.research?.scores
  const scan = ctx.scans?.[0]
  return {
    overall: research?.overall_score ?? scan?.store_score ?? 62,
    findings: [
      { area: 'Offer clarity', status: (research?.offer_score ?? scan?.store_score ?? 0) >= 70 ? 'good' : 'needs_work' },
      { area: 'Trust signals', status: (research?.trust_score ?? scan?.trust_score ?? 0) >= 70 ? 'good' : 'needs_work' },
    ],
    recommendations: research?.next_actions?.slice(0, 3) || ['Move primary CTA above the fold'],
    provider: 'mock',
    note: input.focus || 'General storefront health review',
  }
}

async function analyzeStoreHealth({ ctx, input, searchResults }) {
  return mockStoreHealth(ctx, input)
}

module.exports = {
  generateChatAnswer,
  generateContentIdeas,
  summarizeCompetitor,
  analyzeSocial,
  analyzeStoreHealth,
  wantsCurrentInfo,
  pickScoreContext,
}
