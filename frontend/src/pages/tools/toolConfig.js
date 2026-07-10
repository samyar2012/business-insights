export const TOOL_GROUPS = [
  { id: 'analyze', label: 'Analyze', description: 'Scan your site and understand what is blocking customers.' },
  { id: 'plan', label: 'Plan', description: 'Turn findings into prioritized tasks you can execute.' },
  { id: 'improve', label: 'Improve', description: 'Fix trust, content, and conversion gaps on your site.' },
  { id: 'compare', label: 'Compare', description: 'Benchmark against competitors and market positioning.' },
  { id: 'grow', label: 'Grow', description: 'Create content and get coaching to keep momentum.' },
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
      'Crawl your public pages, score safety, UX, business fit, and conversion paths — then get ranked fixes.',
    icon: 'website',
    accent: 'indigo',
    live: true,
  },
  {
    slug: 'business-scanner',
    to: '/app/tools/business-scanner',
    group: 'analyze',
    title: 'Business Scanner',
    tagline: 'Quick health check across store, trust, and content signals.',
    description:
      'Run a structured scan with your URLs and checklist answers. Complements the full website analyzer.',
    icon: 'scan',
    accent: 'slate',
    live: true,
  },
  {
    slug: 'growth-coach',
    to: '/app/tools/growth-coach',
    group: 'plan',
    title: 'AI Growth Coach',
    tagline: 'Ask what to fix first — grounded in your reports and plan.',
    description:
      'Chat with a strategy coach that uses your website report, scans, action plan, and optional web search.',
    icon: 'coach',
    accent: 'emerald',
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
    accent: 'blue',
    live: true,
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
    accent: 'rose',
    live: true,
  },
  {
    slug: 'social-analyzer',
    to: '/app/tools/social-analyzer',
    group: 'compare',
    title: 'Social Content Analyzer',
    tagline: 'Measure hook quality and posting consistency.',
    description:
      'Score social profiles and content notes to find gaps between your website promise and social presence.',
    icon: 'social',
    accent: 'violet',
    live: true,
  },
  {
    slug: 'competitor-tracker',
    to: '/app/tools/competitor-tracker',
    group: 'compare',
    title: 'Competitor Tracker',
    tagline: 'Benchmark offers, pricing, and positioning.',
    description:
      'Research a competitor with search-backed public info, positioning, and content angles.',
    icon: 'track',
    accent: 'amber',
    live: true,
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

export function toolsByGroup() {
  return TOOL_GROUPS.map((group) => ({
    ...group,
    tools: TOOL_CATALOG.filter((tool) => tool.group === group.id),
  })).filter((group) => group.tools.length > 0)
}
