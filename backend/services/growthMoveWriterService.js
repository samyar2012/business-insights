/**
 * Growth Move Writer
 *
 * Turns deterministic analyzer fix/growth plan evidence into consultant-style
 * growth moves. Does not invent scores or evidence — only rewrites language
 * and structures recommendations for business owners.
 *
 * Providers:
 *   AI_PROVIDER=mock|custom|local (default: mock → deterministic fallback)
 *   CUSTOM_AI_BASE_URL / CUSTOM_AI_API_KEY — optional future custom model
 */

const AI_PROVIDER = String(process.env.AI_PROVIDER || 'mock').toLowerCase()

const SERVICE_RUBRICS = new Set([
  'online_plus_physical_service',
  'local_service_business',
  'online_gallery_physical_service',
])

const STORE_RUBRICS = new Set(['ecommerce_store', 'online_plus_offline_store'])

const CONTENT_RUBRICS = new Set(['blog', 'content_business'])

const VAGUE_TITLE_RE =
  /polish remaining|strengthen (?:remaining )?conversion|shore up|improve business fit|strengthen remaining|remaining layout|remaining technical|catchall|tighten the primary conversion|weekly discovery-growth|repeat-customer follow-up|document operations for demand/i

function isContent(rubric) {
  return CONTENT_RUBRICS.has(rubric)
}

const CATEGORY_LABELS = {
  safety_trust: 'Safety & trust',
  technical_functionality: 'Technical functionality',
  ux_ui_visual: 'UX / UI & visual quality',
  offer_business_fit: 'Offer clarity & business fit',
  customer_attraction: 'Customer attraction & conversion',
  safety: 'Safety & trust',
  functionality: 'Technical functionality',
  ux_ui: 'UX / UI & visual quality',
  business_fit: 'Offer clarity & business fit',
  trust: 'Safety & trust',
  content: 'Customer attraction & conversion',
  seo: 'Customer attraction & conversion',
  mobile: 'UX / UI & visual quality',
}

const CORE_SCORE_KEYS = [
  'safety_trust',
  'technical_functionality',
  'ux_ui_visual',
  'offer_business_fit',
  'customer_attraction',
]

function isService(rubric) {
  return SERVICE_RUBRICS.has(rubric)
}

function isStore(rubric) {
  return STORE_RUBRICS.has(rubric)
}

function dedupe(list) {
  return [...new Set((list || []).filter(Boolean).map((s) => String(s).trim()).filter(Boolean))]
}

function evidenceBlob(item) {
  return (item.evidence || []).join(' | ')
}

function normalizeConfidence(value) {
  if (value === 'high' || value === 'medium' || value === 'low') return value
  return 'medium'
}

function mapAffectedScores(raw = []) {
  return dedupe(
    raw.map((key) => {
      if (CORE_SCORE_KEYS.includes(key)) return key
      if (key === 'safety' || key === 'trust') return 'safety_trust'
      if (key === 'functionality') return 'technical_functionality'
      if (key === 'ux_ui' || key === 'mobile') return 'ux_ui_visual'
      if (key === 'business_fit') return 'offer_business_fit'
      if (key === 'content' || key === 'seo' || key === 'customer_attraction') return 'customer_attraction'
      return key
    }),
  ).filter((key) => CORE_SCORE_KEYS.includes(key))
}

function businessLabel(input) {
  return String(input.business_name || input.business?.business_name || 'this business').trim()
}

function rubricOf(input) {
  return (
    input.business_model ||
    input.scoring_rubric ||
    input.rubric ||
    input.business?.business_model ||
    'ecommerce_store'
  )
}

function collectSourceItems(input) {
  const growth = Array.isArray(input.growth_plan) ? input.growth_plan : []
  const fix = Array.isArray(input.fix_plan) ? input.fix_plan : []
  const source = growth.length ? growth : fix
  return source.filter((item) => item && !/^pillar_backfill_/i.test(item.id || ''))
}

function collectUxEvidence(input) {
  const ux = input.ux_features || input.uxFeatures || {}
  const visual = input.visual_evidence || ux.visual_evidence_summary || {}
  const lines = []
  for (const key of ['readability_problems', 'layout_problems', 'visual_problems']) {
    for (const line of ux[key] || []) lines.push(line)
  }
  for (const signal of visual.template_debt_signals || ux.signals?.template_debt_signals || []) {
    lines.push(`Template/demo residue detected: ${signal}`)
  }
  return dedupe(lines)
}

function hasTemplateDebt(input, evidenceText = '') {
  const ux = input.ux_features || input.uxFeatures || {}
  const visual = input.visual_evidence || ux.visual_evidence_summary || {}
  const signals = [
    ...(visual.template_debt_signals || []),
    ...(ux.signals?.template_debt_signals || []),
    ...(ux.template_debt_signals || []),
  ]
  return (
    signals.length > 0 ||
    /template|demo|placeholder|lorem ipsum|squarespace|unfinished/i.test(evidenceText)
  )
}

function pickEvidence(item, input, max = 4) {
  const fromItem = Array.isArray(item.evidence) ? item.evidence.map(String) : []
  const uxExtra = collectUxEvidence(input).filter((line) => {
    if (!fromItem.length) return true
    // Only attach UX lines that support this move's theme
    const theme = `${item.id || ''} ${item.title || ''} ${fromItem.join(' ')}`
    if (/template|demo|polish|visual|layout/i.test(theme)) {
      return /template|demo|placeholder|layout|visual|polish|overflow|align/i.test(line)
    }
    if (/review|trust|contact|phone/i.test(theme)) {
      return /review|testimonial|phone|contact|trust|tel/i.test(line)
    }
    return false
  })
  // Never keep positive "no issue" lines as problem evidence
  return dedupe([...fromItem, ...uxExtra])
    .filter((line) => !/^no .+ (?:issue|problem) detected\.?$/i.test(line))
    .slice(0, max)
}

function titleForItem(item, input) {
  const rubric = rubricOf(input)
  const evidence = evidenceBlob(item)
  const id = String(item.id || '')
  const hasNegativeAlignment =
    /misaligned|poorly fitted|poorly integrated|alignment inconsistency/i.test(evidence) &&
    !/no image alignment issue detected/i.test(evidence)

  if (id === 'unsafe_site') {
    return 'Clear the Safe Browsing warning before spending on ads or SEO'
  }
  if (id === 'homepage_down') {
    return 'Fix the homepage so visitors can actually load your site'
  }
  if (id === 'no_https') {
    return 'Turn on HTTPS so browsers stop warning visitors away'
  }
  if (id === 'no_conversion_path' || id === 'weak_cta') {
    if (isService(rubric)) return 'Make the booking path obvious before visitors scroll'
    if (isStore(rubric)) return 'Put a clear Shop or Add to cart action above the fold'
    if (isContent(rubric)) {
      return 'Add one obvious subscribe or newsletter action above the fold'
    }
    return 'Give visitors one obvious next step on the homepage'
  }
  if (id === 'missing_contact_trust') {
    if (isContent(rubric)) {
      if (/about|author|identity/i.test(evidence)) {
        return 'Add a clear About / author page so readers know who to trust'
      }
      return 'Strengthen author trust, navigation, and the subscribe path'
    }
    if (isStore(rubric)) {
      if (/policy|shipping|return/i.test(evidence)) {
        return 'Publish shipping, returns, and privacy links buyers expect'
      }
      if (/review|testimonial|rating/i.test(evidence)) {
        return 'Place product reviews next to the buy decision'
      }
      if (/phone|email|contact/i.test(evidence)) {
        return 'Add a clear Help / Contact path — chat, email, or contact page'
      }
      return 'Add the trust signals shoppers check before they buy'
    }
    if (/phone|email|contact/i.test(evidence) && /review|testimonial/i.test(evidence)) {
      return isService(rubric)
        ? 'Add a clickable phone number and place proof near the booking CTA'
        : 'Add visible contact details and customer proof near the purchase path'
    }
    if (/review|testimonial|rating/i.test(evidence)) {
      return 'Move reviews next to the decision point'
    }
    if (/phone|email|contact/i.test(evidence)) {
      return 'Make the phone number clickable and visible in the header'
    }
    if (/policy|shipping|return/i.test(evidence)) {
      return 'Publish shipping, returns, and privacy links buyers expect'
    }
    return isService(rubric)
      ? 'Add trust details customers check before they book'
      : 'Add the trust details shoppers check before they buy'
  }
  if (id === 'strengthen_trust_visibility') {
    if (isContent(rubric)) {
      return 'Make author and newsletter paths easier to find'
    }
    if (isStore(rubric)) {
      if (/review|testimonial|attribution/i.test(`${item.title} ${evidence}`)) {
        return 'Place product reviews next to the buy decision'
      }
      return 'Make Help / Contact and policy links easier to find'
    }
    if (/review|testimonial|attribution/i.test(`${item.title} ${evidence}`)) {
      return 'Move reviews next to the decision point'
    }
    return 'Make the phone number clickable and visible in the header'
  }
  if (id === 'unclear_offer' || id === 'business_model_mismatch') {
    if (isContent(rubric)) {
      return 'Make categories, search, and “start here” navigation obvious on the homepage'
    }
    if (isService(rubric)) {
      return 'Rewrite the homepage so customers understand the service in 5 seconds'
    }
    if (isStore(rubric)) {
      return 'Rewrite the homepage so shoppers know what you sell in 5 seconds'
    }
    return 'Rewrite the homepage so visitors understand the offer in 5 seconds'
  }
  if (id === 'mobile_overflow' || id === 'mobile_overflow_verify') {
    return 'Stop horizontal scrolling on phones so the page feels usable'
  }
  if (id === 'mobile_readability') {
    return isContent(rubric)
      ? 'Improve recipe and post readability on phones'
      : 'Shorten above-the-fold copy so phones can read the offer fast'
  }
  if (id === 'thin_content') {
    if (isContent(rubric)) {
      return 'Add recipe cards, category navigation, and internal links readers expect'
    }
    if (isService(rubric)) return 'Add service details, process, and FAQs that answer booking questions'
    if (isStore(rubric)) return 'Add product detail buyers need before they add to cart'
    return 'Add enough on-page detail for visitors and search engines to trust the offer'
  }
  if (id === 'weak_seo_meta') {
    return isContent(rubric)
      ? 'Rewrite titles and meta so recipe and post search clicks know what they get'
      : 'Rewrite the title and meta description so search clicks know what they get'
  }
  if (id === 'nav_clutter') {
    return isContent(rubric)
      ? 'Simplify navigation so categories and search are easy to find'
      : 'Simplify the top navigation so the main action is hard to miss'
  }
  if (id === 'visual_polish' || id === 'misaligned_images' || id.startsWith('catchall_ux')) {
    if (hasTemplateDebt(input, evidence)) {
      return 'Remove template/demo content that makes the business look unfinished'
    }
    if (hasNegativeAlignment) {
      return 'Fix misaligned images so the site looks finished'
    }
    return 'Clean up spacing and layout so the first screen looks intentional'
  }
  if (id === 'no_mobile_viewport') {
    return 'Add mobile viewport support so phones stop showing a tiny desktop layout'
  }
  if (id === 'js_rendered_sparse') {
    return 'Serve core offer copy in HTML so crawlers and slow phones can see it'
  }
  if (id === 'benchmark_gap') {
    return `Close the conversion gap versus similar ${String(rubric).replace(/_/g, ' ')} sites`
  }
  if (id === 'retain_reviews_loop') {
    return isContent(rubric)
      ? 'Ask engaged readers to subscribe and share their favorite posts'
      : 'Ask every completed customer for a review within 24 hours'
  }
  if (id === 'operate_response_playbook') {
    return isService(rubric)
      ? 'Set a same-day response playbook for quote and booking inquiries'
      : isStore(rubric)
        ? 'Set a fast support playbook for order and return questions'
        : 'Set a fast response playbook so new leads are not left waiting'
  }
  if (id.startsWith('catchall_safety') || (id.startsWith('catchall_') && /trust|safety/i.test(id))) {
    return 'Fix remaining trust blockers that still push visitors away'
  }
  if (id.includes('catchall_customer')) {
    return isService(rubric)
      ? 'Remove conversion friction from the booking path'
      : isContent(rubric)
        ? 'Remove friction from subscribe and find-a-post paths'
        : 'Remove conversion friction from the primary purchase path'
  }
  if (id.includes('catchall_technical')) {
    return 'Fix technical crawl and load issues that still hide the offer'
  }

  // Last resort: rewrite vague titles using evidence cues
  const existing = String(item.title || item.action || '').trim()
  if (existing && !VAGUE_TITLE_RE.test(existing)) return existing.replace(/\.$/, '')

  if (hasTemplateDebt(input, evidence)) {
    return 'Remove template/demo content that makes the business look unfinished'
  }
  if (hasNegativeAlignment) {
    return 'Fix misaligned images so the site looks finished'
  }
  if (/book|quote|consult|cta|phone/i.test(evidence) && isService(rubric)) {
    return 'Make the booking path obvious before visitors scroll'
  }
  if (/review|testimonial/i.test(evidence) && !isContent(rubric)) {
    return isStore(rubric)
      ? 'Place product reviews next to the buy decision'
      : 'Move reviews next to the decision point'
  }
  if (/offer|service|what you sell|unclear/i.test(evidence)) {
    if (isContent(rubric)) {
      return 'Make categories, search, and “start here” navigation obvious on the homepage'
    }
    return isService(rubric)
      ? 'Rewrite the homepage so customers understand the service in 5 seconds'
      : 'Rewrite the homepage so shoppers know what you sell in 5 seconds'
  }
  return existing || 'Fix the highest-friction issue on the customer path'
}

function customerProblemFor(item, input) {
  const rubric = rubricOf(input)
  const evidence = evidenceBlob(item)
  const id = String(item.id || '')
  const name = businessLabel(input)

  if (id === 'weak_cta' || id === 'no_conversion_path') {
    return isService(rubric)
      ? `A visitor ready to book ${name} cannot quickly see how to call, quote, or schedule.`
      : `A visitor ready to buy from ${name} cannot quickly see the next purchase step.`
  }
  if (id === 'unclear_offer' || id === 'business_model_mismatch') {
    return `Someone landing on ${name} for the first time may leave before understanding what is offered.`
  }
  if (id === 'missing_contact_trust' || id === 'strengthen_trust_visibility') {
    if (/review/i.test(evidence)) {
      return 'Shoppers hesitate because proof is missing or not placed where the decision happens.'
    }
    return 'First-time visitors cannot quickly verify that a real, reachable business is behind the site.'
  }
  if (id === 'mobile_overflow' || id === 'mobile_readability' || id === 'no_mobile_viewport') {
    return 'Phone visitors struggle to read or use the page, so they bounce before converting.'
  }
  if (hasTemplateDebt(input, evidence) || /template|demo|placeholder/i.test(evidence)) {
    return 'Demo or template residue makes the business look unfinished, which kills trust before the offer is considered.'
  }
  if (item.why_it_matters) return item.why_it_matters
  return `This issue is currently reducing how many visitors become customers for ${name}.`
}

function whatToChangeFor(item, input) {
  const steps = Array.isArray(item.steps) ? item.steps.filter(Boolean) : []
  if (steps.length) {
    // Lead with the concrete change; keep it action-oriented
    return steps.slice(0, 2).join(' ')
  }
  return String(item.owner_action || item.action || item.title || 'Implement the analyzer-backed change on the live homepage.')
}

function whyItMattersFor(item, input) {
  const rubric = rubricOf(input)
  if (item.why_it_matters && !/score/i.test(item.why_it_matters.split(' ')[0] || '')) {
    // Prefer business cost framing
    const base = item.why_it_matters
    if (/visitor|customer|buyer|shopper|book|convert|trust|leave|bounce/i.test(base)) return base
  }
  if (isService(rubric)) {
    return 'Local service customers decide in seconds whether to call or keep searching — friction here loses booked jobs.'
  }
  if (isStore(rubric)) {
    return 'Store visitors abandon when the path to purchase or trust cues is unclear — this directly costs checkout intent.'
  }
  return item.why_it_matters || 'This friction costs conversions from traffic the business already paid to attract.'
}

function implementationStepsFor(item, input) {
  const steps = Array.isArray(item.steps) ? item.steps.map(String).filter(Boolean) : []
  if (steps.length >= 2) return dedupe(steps).slice(0, 6)

  const title = titleForItem(item, input)
  const fallback = [
    `Implement: ${title}.`,
    'Apply the change on the homepage and any linked booking/contact page.',
    'Check the result on a phone-sized screen.',
    'Rescan the website to confirm the related category scores improve.',
  ]
  return dedupe([...steps, ...fallback]).slice(0, 6)
}

function expectedOutcomeFor(item, input) {
  if (item.expected_business_outcome) return item.expected_business_outcome
  if (item.expected_outcome) return item.expected_outcome
  const rubric = rubricOf(input)
  if (isService(rubric)) {
    return 'More qualified visitors call, request quotes, or book without bouncing.'
  }
  if (isStore(rubric)) {
    return 'More visitors reach product pages or checkout instead of leaving the homepage.'
  }
  return item.expected_score_lift || 'Measurable improvement in conversion and related category scores after a rescan.'
}

function howToVerifyFor(item) {
  const affected = mapAffectedScores(item.affected_scores || [])
  const labels = affected.map((k) => CATEGORY_LABELS[k] || k).join(', ')
  if (labels) {
    return `Rescan the site and confirm ${labels} improve, then spot-check the live page on phone and desktop.`
  }
  return 'Rescan the website and confirm the related category scores rose; spot-check the live change on phone and desktop.'
}

function buildDiagnosis(input, moves) {
  const name = businessLabel(input)
  const rubric = rubricOf(input)
  const overall = input.overall_score
  const risks = Array.isArray(input.risks) ? input.risks.filter(Boolean) : []
  const strengths = Array.isArray(input.strengths) ? input.strengths.filter(Boolean) : []
  const modelLabel = String(rubric).replace(/_/g, ' ')

  const scoreBit =
    typeof overall === 'number'
      ? `${name} scores ${overall}/100 as a ${modelLabel}.`
      : `${name} was analyzed as a ${modelLabel}.`

  const topTitles = moves.slice(0, 3).map((m) => m.title)
  const focusBit = topTitles.length
    ? ` The highest-leverage growth work is: ${topTitles.join('; ')}.`
    : ' No high-confidence growth moves met the evidence bar yet — rescan after the next site change.'

  const riskBit = risks[0] ? ` Main risk: ${risks[0]}` : ''
  const strengthBit = strengths[0] ? ` Already working: ${strengths[0]}` : ''

  return `${scoreBit}${focusBit}${riskBit}${strengthBit}`.replace(/\s+/g, ' ').trim()
}

function writeMoveFromItem(item, input, index) {
  const evidence = pickEvidence(item, input)
  const confidence = normalizeConfidence(item.confidence)
  const affected = mapAffectedScores(item.affected_scores || [])
  const sourceIds = dedupe([item.id].filter(Boolean))

  return {
    id: item.id || `growth_move_${index + 1}`,
    title: titleForItem(item, input),
    customer_problem: customerProblemFor(item, input),
    what_to_change: whatToChangeFor(item, input),
    why_it_matters: whyItMattersFor(item, input),
    evidence,
    implementation_steps: implementationStepsFor(item, input),
    expected_outcome: expectedOutcomeFor(item, input),
    how_to_verify: howToVerifyFor(item),
    confidence,
    affected_scores: affected,
    source_fix_ids: sourceIds,
    tier: index < 3 ? 'primary' : 'secondary',
    rank: index + 1,
    // Carry-through for action plan / growth_plan compatibility
    pillar: item.pillar || null,
    category: item.category || null,
    priority: item.priority || (index < 3 ? 'high' : 'medium'),
    difficulty: item.difficulty || 'medium',
    steps: implementationStepsFor(item, input),
    why_it_matters_raw: item.why_it_matters || null,
    expected_score_lift: item.expected_score_lift || null,
    expected_business_outcome: expectedOutcomeFor(item, input),
    related_pages: Array.isArray(item.related_pages) ? item.related_pages : [],
    research_basis: item.research_basis || null,
    unlock_reason: item.unlock_reason || null,
    ask_ai_prompt: '',
  }
}

/**
 * Deterministic writer — always available, never invents evidence.
 */
function writeGrowthMovesDeterministic(input = {}) {
  const items = collectSourceItems(input)
  const moves = items.map((item, index) => writeMoveFromItem(item, input, index))

  // Hard cap: no invented pillar filler
  const cleaned = moves.filter((move) => {
    if (/^pillar_backfill_/i.test(move.id || '')) return false
    if (!move.evidence.length) return false
    if (VAGUE_TITLE_RE.test(move.title) && !move.evidence.length) return false
    // Drop contradictory alignment moves
    if (
      /fix misaligned images/i.test(move.title) &&
      /no image alignment issue detected/i.test((move.evidence || []).join(' '))
    ) {
      return false
    }
    // DTC: never surface phone-in-header as a growth move
    if (
      isStore(rubricOf(input)) &&
      /phone number clickable and visible in the header|phone in the header/i.test(move.title)
    ) {
      return false
    }
    // Blog/content: never surface commerce review / "understand the offer" moves
    if (
      isContent(rubricOf(input)) &&
      /reviews next to the decision|understand the (?:offer|service) in 5 seconds|add reviews/i.test(
        move.title,
      )
    ) {
      return false
    }
    return true
  })

  // Re-rank after filtering
  const ranked = cleaned.map((move, index) => ({
    ...move,
    rank: index + 1,
    tier: index < 3 ? 'primary' : 'secondary',
  }))

  for (const move of ranked) {
    move.ask_ai_prompt = `Help me implement this growth move for ${businessLabel(input)}: "${move.title}". Customer problem: ${move.customer_problem} Evidence: ${move.evidence[0] || 'use the report evidence'}. Give exact copy, placement, and a one-week verification checklist.`
  }

  const diagnosis = buildDiagnosis(input, ranked)
  const primary = ranked.filter((m) => m.tier === 'primary').slice(0, 3)
  const secondary = ranked.filter((m) => m.tier === 'secondary')

  return {
    diagnosis,
    growth_moves: ranked,
    primary_growth_moves: primary,
    secondary_growth_moves: secondary,
    provider: 'deterministic',
  }
}

/**
 * Validate AI output: keep only language improvements; evidence must stay
 * grounded in the deterministic source set.
 */
function mergeAiLanguage(aiPayload, fallback) {
  if (!aiPayload || typeof aiPayload !== 'object') return fallback

  const allowedEvidence = new Set(
    fallback.growth_moves.flatMap((m) => m.evidence || []).map((e) => String(e).trim()),
  )

  const aiMoves = Array.isArray(aiPayload.growth_moves) ? aiPayload.growth_moves : []

  const mergedMoves = fallback.growth_moves.map((base, index) => {
    const ai =
      aiMoves.find(
        (m) =>
          (m.source_fix_ids || []).some((id) => (base.source_fix_ids || []).includes(id)) ||
          m.title === base.title,
      ) || aiMoves[index]

    if (!ai) return base

    const aiEvidence = Array.isArray(ai.evidence) ? ai.evidence.map(String) : []
    // Reject invented evidence — only keep lines already known
    const safeEvidence = aiEvidence.filter((line) => allowedEvidence.has(line.trim()))
    const evidence = safeEvidence.length ? safeEvidence : base.evidence

    return {
      ...base,
      title: String(ai.title || base.title).trim() || base.title,
      customer_problem: String(ai.customer_problem || base.customer_problem).trim(),
      what_to_change: String(ai.what_to_change || base.what_to_change).trim(),
      why_it_matters: String(ai.why_it_matters || base.why_it_matters).trim(),
      implementation_steps:
        Array.isArray(ai.implementation_steps) && ai.implementation_steps.length
          ? ai.implementation_steps.map(String).slice(0, 6)
          : base.implementation_steps,
      expected_outcome: String(ai.expected_outcome || base.expected_outcome).trim(),
      evidence,
      // Never trust AI for scores/confidence inventiveness beyond original set
      confidence: base.confidence,
      affected_scores: base.affected_scores,
      source_fix_ids: base.source_fix_ids,
    }
  })

  const diagnosis =
    typeof aiPayload.diagnosis === 'string' && aiPayload.diagnosis.trim().length > 20
      ? aiPayload.diagnosis.trim()
      : fallback.diagnosis

  const ranked = mergedMoves.map((move, index) => ({
    ...move,
    rank: index + 1,
    tier: index < 3 ? 'primary' : 'secondary',
  }))

  return {
    diagnosis,
    growth_moves: ranked,
    primary_growth_moves: ranked.filter((m) => m.tier === 'primary').slice(0, 3),
    secondary_growth_moves: ranked.filter((m) => m.tier === 'secondary'),
    provider: 'custom',
  }
}

async function callCustomGrowthModel(input, fallback) {
  const base = process.env.CUSTOM_AI_BASE_URL
  if (!base) return null

  const url = `${String(base).replace(/\/$/, '')}/growth-moves`
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }
  const key = process.env.CUSTOM_AI_API_KEY
  if (key) headers.Authorization = `Bearer ${key}`

  const payload = {
    task: 'growth_move_writer',
    constraints: {
      do_not_invent_scores: true,
      do_not_invent_evidence: true,
      primary_limit: 3,
      use_only_provided_evidence: true,
    },
    input: {
      business_name: businessLabel(input),
      business_model: rubricOf(input),
      website_url: input.website_url || input.business?.store_url || null,
      overall_score: input.overall_score ?? null,
      category_scores: input.category_scores || {},
      risks: input.risks || [],
      strengths: input.strengths || [],
      growth_plan: input.growth_plan || [],
      fix_plan: input.fix_plan || [],
      ux_feature_evidence: collectUxEvidence(input),
      visual_evidence: input.visual_evidence || null,
      analyzed_pages: (input.analyzed_pages || input.pages || []).map((p) => ({
        url: p.final_url || p.url || null,
        title: p.title || null,
        page_type: p.page_type || null,
      })),
      benchmark_comparison: input.benchmark_comparison || input.benchmarkComparison || null,
      fallback_draft: fallback,
    },
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.CUSTOM_AI_TIMEOUT_MS || 8000))
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) return null
    return await res.json()
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Main entry. Defaults to deterministic. Optional custom/local model only
 * rewrites language and must pass evidence grounding.
 */
async function writeGrowthMoves(input = {}) {
  const fallback = writeGrowthMovesDeterministic(input)
  const provider = AI_PROVIDER

  if (provider === 'mock' || provider === 'deterministic') {
    return fallback
  }

  if ((provider === 'custom' || provider === 'local') && process.env.CUSTOM_AI_BASE_URL) {
    try {
      const aiPayload = await callCustomGrowthModel(input, fallback)
      if (aiPayload) return mergeAiLanguage(aiPayload, fallback)
    } catch {
      // Fall through to deterministic
    }
  }

  return { ...fallback, provider: 'deterministic_fallback' }
}

/**
 * Sync helper for analyzer pipeline (always deterministic / mock-safe).
 */
function writeGrowthMovesSync(input = {}) {
  return writeGrowthMovesDeterministic(input)
}

/**
 * Map writer output onto growth_plan-shaped items for existing UI consumers.
 */
function toGrowthPlanItems(writerResult) {
  return (writerResult?.growth_moves || []).map((move) => ({
    id: move.id,
    rank: move.rank,
    step_label: move.tier === 'primary' ? `Growth Move ${move.rank}` : `Secondary ${move.rank}`,
    title: move.title,
    action: move.title,
    pillar: move.pillar,
    category: move.category,
    evidence: move.evidence,
    why_it_matters: move.why_it_matters,
    customer_problem: move.customer_problem,
    what_to_change: move.what_to_change,
    steps: move.implementation_steps,
    implementation_steps: move.implementation_steps,
    expected_outcome: move.expected_outcome,
    expected_business_outcome: move.expected_outcome,
    how_to_verify: move.how_to_verify,
    expected_score_lift: move.expected_score_lift,
    expected_impact: move.expected_score_lift || move.expected_outcome,
    affected_scores: move.affected_scores,
    confidence: move.confidence,
    priority: move.priority,
    difficulty: move.difficulty,
    related_pages: move.related_pages,
    research_basis: move.research_basis,
    unlock_reason: move.unlock_reason,
    ask_ai_prompt: move.ask_ai_prompt,
    source_fix_ids: move.source_fix_ids,
    tier: move.tier,
    reason: move.why_it_matters,
    source: 'growth_move_writer',
  }))
}

module.exports = {
  writeGrowthMoves,
  writeGrowthMovesSync,
  writeGrowthMovesDeterministic,
  toGrowthPlanItems,
  mergeAiLanguage,
  VAGUE_TITLE_RE,
  titleForItem,
  AI_PROVIDER,
}
