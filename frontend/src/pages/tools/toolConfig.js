export const TOOL_GROUPS = [
  { id: 'analyze', label: 'Analyze', description: 'Scan your site and understand what is blocking customers.' },
  { id: 'plan', label: 'Plan', description: 'Turn findings into an ordered, evidence-based growth roadmap.' },
  { id: 'improve', label: 'Improve', description: 'Fix trust, content, and conversion gaps on your site.' },
  { id: 'compare', label: 'Compare', description: 'Benchmark against competitors and market positioning.' },
  { id: 'grow', label: 'Grow', description: 'Get coaching and content ideas to keep momentum.' },
]

export const TOOL_CATALOG = [
  {
    slug: 'website-analyzer',
    to: '/app',
    resolveTo: 'website-report',
    group: 'analyze',
    title: 'Website Analyzer',
    tagline: 'Find what stops visitors from buying or contacting you.',
    description:
      'Crawl your public pages, score safety, UX, business fit, and conversion paths - then surface growth opportunities.',
    icon: 'website',
    live: true,
  },
  {
    slug: 'business-scanner',
    to: '/app/tools/business-scanner',
    group: 'analyze',
    title: 'Business Scanner',
    tagline: 'Quick health check across store, trust, and content signals.',
    description:
      'Run a structured scan with your URLs and checklist answers. Complements the full Website Analyzer.',
    icon: 'scan',
    live: false,
  },
  {
    slug: 'growth-roadmap',
    to: '/app/action-plan',
    group: 'plan',
    title: 'Growth Roadmap',
    tagline: 'Execute growth opportunities step by step, in order.',
    description:
      'Your ordered growth plan across acquire, convert, retain, and operate. Each step shows evidence, exact instructions, and the expected outcome.',
    icon: 'plan',
    live: true,
  },
  {
    slug: 'growth-coach',
    to: '/app/tools/growth-coach',
    group: 'plan',
    title: 'AI Growth Coach',
    tagline: 'Ask how to execute each growth step - grounded in your report and roadmap.',
    description:
      'Chat with a coach that reads your website report, growth roadmap, and business profile to answer "how do I do this?"',
    icon: 'coach',
    live: true,
  },
  {
    slug: 'store-health',
    to: '/app/tools/store-health',
    group: 'improve',
    title: 'Store Health Report',
    tagline: 'Deep dive on conversion, trust, and merchandising.',
    description:
      'Detailed storefront review using your scan history plus optional URL and web search context.',
    icon: 'health',
    live: false,
  },
  {
    slug: 'content-generator',
    to: '/app/tools/content-generator',
    group: 'improve',
    title: 'Content Generator',
    tagline: 'Turn report insights into hooks, copy, and scripts.',
    description:
      'Generate headlines, captions, emails, ads, and page copy aligned with your business and website findings.',
    icon: 'content',
    live: false,
  },
  {
    slug: 'competitor-tracker',
    to: '/app/tools/competitor-tracker',
    group: 'compare',
    title: 'Competitor Tracker',
    tagline: 'Benchmark offers, pricing, and positioning.',
    description:
      'Research a competitor with public info, positioning, and content angles.',
    icon: 'track',
    live: false,
  },
  {
    slug: 'social-analyzer',
    to: '/app/tools/social-analyzer',
    group: 'grow',
    title: 'Social Content Analyzer',
    tagline: 'Measure hook quality and posting consistency.',
    description:
      'Score social profiles and content notes to find gaps between your website promise and social presence.',
    icon: 'social',
    live: false,
  },
]

/** Resolve dynamic tool links (e.g. website report needs a business id). */
export function resolveToolPath(tool, businessId) {
  if (tool.resolveTo === 'website-report' && businessId) {
    return `/app/businesses/${businessId}/website-report`
  }
  if (tool.resolveTo === 'website-report') {
    return '/app/businesses'
  }
  return tool.to
}

export function toolBySlug(slug) {
  return TOOL_CATALOG.find((tool) => tool.slug === slug) || null
}

export function toolsByGroup() {
  return TOOL_GROUPS.map((group) => ({
    ...group,
    tools: TOOL_CATALOG.filter((tool) => tool.group === group.id),
  })).filter((group) => group.tools.length > 0)
}
