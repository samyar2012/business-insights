// Rewrites the deterministic, evidence-derived strengths/problems produced by the category
// scorers into business-impact framed sentences instead of generic technical labels.
// Every input string already comes from real crawler/visual-audit/rubric evidence - this
// module only changes how that evidence is *phrased*, never fabricates new evidence.

const IMPACT_KEYWORDS =
  /visitor|customer|trust|convert|buy|book|contact|credibility|confidence|attract|engage|bounce|conversion|legitimacy|purchase/i

function rubricAware(ctx, map) {
  return map[ctx?.rubric] || map.default
}

const REWRITE_STRENGTHS = new Map([
  [
    'Homepage loaded successfully.',
    (ctx) =>
      rubricAware(ctx, {
        default: 'Visitors can reach your homepage without errors, so first impressions are not lost to a broken page.',
        local_service_business:
          'Visitors can reach your homepage and contact/booking paths without errors, which supports local service conversion.',
        online_plus_physical_service:
          'Visitors can reach your homepage and booking paths without errors, which supports local service conversion.',
        online_plus_offline_store:
          'Visitors can reach your homepage and store details without errors, which supports in-store and online conversion.',
      }),
  ],
  [
    'Site is served over HTTPS.',
    () => 'Visitors see a secure, padlocked connection (HTTPS), avoiding the browser warnings that cause people to leave.',
  ],
  [
    'Google Safe Browsing reports no malware or phishing threats.',
    () => 'Google confirms the site is free of malware or phishing, so visitors and ad platforms will not see safety warnings.',
  ],
  [
    'Multiple supporting pages were crawled successfully.',
    () => 'Multiple pages beyond the homepage are reachable, giving visitors more than one way to learn about the business before deciding.',
  ],
  [
    'No page fetch failures during crawl.',
    () => 'No broken pages were found during the crawl, so visitors are unlikely to hit dead links while browsing.',
  ],
  [
    'A limited set of pages was crawled.',
    () => 'A small set of supporting pages is reachable, though more depth would give visitors additional reasons to stay and trust the business.',
  ],
  [
    'Homepage and additional pages are reachable without crawl failures.',
    () => 'The homepage and supporting pages all load cleanly, so visitors can move through the site without hitting errors.',
  ],
  [
    'Contact information (phone or email) is discoverable.',
    () => 'Visitors can find a phone number or email quickly, lowering the effort needed to ask a question before buying.',
  ],
  [
    'Business identity is reasonably clear from headings and navigation.',
    () => 'Headings and navigation make it clear whose site this is, which builds basic legitimacy for a first-time visitor.',
  ],
  [
    'Mobile viewport or rendered mobile audit supports responsive layout.',
    () => 'The site is set up to adapt to mobile screens, so phone visitors are not shown a broken, desktop-only layout.',
  ],
  [
    'Enough readable content extracted for analysis.',
    () => 'There is enough real text content for visitors - and search engines - to understand what the business actually offers.',
  ],
  [
    'Rendered audit suggests acceptable homepage load performance.',
    () => 'The homepage loads at an acceptable speed, so visitors are less likely to abandon the page before it renders.',
  ],
])

const REWRITE_RISKS = new Map([
  [
    'HTTPS was not detected — visitors may see security warnings.',
    () =>
      'The site is not served over HTTPS, so browsers show a "not secure" warning that can scare visitors away before they read anything.',
  ],
  [
    'No phone number or email found on crawled pages.',
    () =>
      'No phone number or email was found on crawled pages with high confidence, so visitors who want to ask a question may struggle to reach the business.',
  ],
  [
    'No phone, email, contact form, or clear contact CTA was found across crawled pages.',
    () =>
      'No phone, email, contact form, or clear contact CTA was found across crawled pages, so visitors who want to ask a question may struggle to reach the business.',
  ],
  [
    'Contact path exists but may be hard for visitors to notice.',
    () =>
      'A contact path exists, but it may be easy to miss — making phone, email, or a contact CTA more visible in the header usually helps visitors take the next step.',
  ],
  [
    'A phone number is visible but may not be clickable or prominent enough.',
    () =>
      'A phone number is visible, but making it a clickable tel: link in the header usually helps visitors take the next step faster.',
  ],
  [
    'Contact details were not clearly detected in crawled HTML; verify phone, email, or a contact form are visible.',
    () =>
      'Contact details were not clearly detected in the crawl — verify that a phone number, email, or contact form is easy for visitors to find.',
  ],
  [
    'No on-page reviews, testimonials, or rating markup was detected on crawled pages.',
    () =>
      'No on-page reviews, testimonials, or rating markup was detected, so new visitors lack social proof near the offer.',
  ],
  [
    'Review or testimonial proof was not clearly detected; verify ratings or quotes are visible to visitors.',
    () =>
      'Review or testimonial proof was not clearly detected — verify ratings or customer quotes are visible near your main offer.',
  ],
  [
    'Review or rating signals exist but may need clearer placement or source attribution.',
    () =>
      'Review signals exist, but clearer placement and source attribution near the main offer would make that proof easier to trust.',
  ],
  [
    'Severe mobile layout overflow detected.',
    () =>
      'Severe horizontal overflow was measured on a mobile viewport, which can make the site feel broken on phones.',
  ],
  [
    'Possible mobile layout issue to verify.',
    () =>
      'A possible mobile layout issue was flagged with lower confidence — verify on a phone-width viewport before treating it as a top fix.',
  ],
  [
    'Homepage failed to load or returned an error.',
    () => 'The homepage itself failed to load during the crawl, meaning some visitors may see an error page instead of the business.',
  ],
  [
    'Very few pages were crawled — site depth is limited.',
    () => 'Very few pages exist beyond the homepage, giving visitors little reason to explore further or trust the business.',
  ],
  [
    'Very little readable content on crawled pages.',
    () =>
      'Crawled pages contain very little readable text, so visitors - and search engines - have almost nothing to learn about the business from.',
  ],
  [
    'No mobile viewport meta tag detected.',
    () =>
      'There is no mobile viewport configuration, so phone visitors likely see a zoomed-out desktop layout instead of a responsive one.',
  ],
  [
    'Sparse or JS-rendered HTML reduced content extractability.',
    () =>
      'Key content only appears after JavaScript runs, so some crawlers, link previews, and slower devices see a mostly empty page.',
  ],
])

function categoryImpactClause(category) {
  switch (category) {
    case 'safety_trust':
      return ' This affects how safe and credible the business feels to a new visitor.'
    case 'technical_functionality':
      return ' This affects whether visitors can reliably reach and use the site at all.'
    case 'ux_ui_visual':
      return ' This affects how easy the site is to read, scan, and use on any device.'
    case 'offer_business_fit':
      return ' This affects whether visitors quickly understand what the business sells or offers.'
    case 'customer_attraction':
      return ' This affects whether visitors take the next step toward becoming a customer.'
    default:
      return ''
  }
}

function narrateOne(text, category, ctx, rewriteMap) {
  const rewrite = rewriteMap.get(text)
  if (rewrite) return typeof rewrite === 'function' ? rewrite(ctx) : rewrite
  if (IMPACT_KEYWORDS.test(text)) return text
  return `${text.replace(/\.?\s*$/, '.')}${categoryImpactClause(category)}`
}

function buildEvidenceStrengths(categoryDetails = {}, ctx = {}) {
  const seen = new Set()
  const out = []
  for (const [category, detail] of Object.entries(categoryDetails)) {
    for (const raw of detail.strengths || []) {
      const narrated = narrateOne(raw, category, ctx, REWRITE_STRENGTHS)
      if (!seen.has(narrated)) {
        seen.add(narrated)
        out.push(narrated)
      }
    }
  }
  return out.slice(0, 8)
}

function buildEvidenceRisks(categoryDetails = {}, ctx = {}, extraWarnings = []) {
  const seen = new Set()
  const out = []
  for (const [category, detail] of Object.entries(categoryDetails)) {
    for (const raw of detail.problems || []) {
      const narrated = narrateOne(raw, category, ctx, REWRITE_RISKS)
      if (!seen.has(narrated)) {
        seen.add(narrated)
        out.push(narrated)
      }
    }
  }
  for (const warning of extraWarnings || []) {
    if (!seen.has(warning)) {
      seen.add(warning)
      out.push(warning)
    }
  }
  if (!out.length) return ['No major risks detected from this crawl.']
  return out.slice(0, 8)
}

module.exports = {
  buildEvidenceStrengths,
  buildEvidenceRisks,
}
