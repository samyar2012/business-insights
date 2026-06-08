export const TOOL_CATALOG = [
  {
    slug: 'business-scanner',
    to: '/app/tools/business-scanner',
    title: 'Business Scanner',
    tagline: 'Score your store, trust, content, and competitive position.',
    description:
      'Enter your storefront and social links to get an overall health score with strengths, risks, and next actions.',
    icon: 'scan',
    accent: 'indigo',
    live: true,
  },
  {
    slug: 'store-health',
    to: '/app/tools/store-health',
    title: 'Store Health Report',
    tagline: 'Deep dive on conversion, speed, and merchandising.',
    description:
      'Audit product pages, checkout flow, and on-site trust signals. Full automated crawl coming soon.',
    icon: 'health',
    accent: 'blue',
    live: false,
  },
  {
    slug: 'social-analyzer',
    to: '/app/tools/social-analyzer',
    title: 'Social Content Analyzer',
    tagline: 'Measure hook quality and posting consistency.',
    description:
      'Review recent posts for engagement patterns and content gaps across your social channels.',
    icon: 'social',
    accent: 'violet',
    live: false,
  },
  {
    slug: 'competitor-tracker',
    to: '/app/tools/competitor-tracker',
    title: 'Competitor Tracker',
    tagline: 'Benchmark offers, pricing, and positioning.',
    description:
      'Track competitor storefronts and campaigns so you know when to match, beat, or ignore.',
    icon: 'track',
    accent: 'amber',
    live: false,
  },
  {
    slug: 'growth-coach',
    to: '/app/tools/growth-coach',
    title: 'AI Growth Coach',
    tagline: 'Weekly priorities tailored to your business.',
    description:
      'Get actionable growth playbooks for offers, creatives, and retention - powered by your scan data.',
    icon: 'coach',
    accent: 'emerald',
    live: false,
  },
]

export const TOOL_ICONS = {
  scan: 'o',
  health: '▤',
  social: '◉',
  track: '◈',
  coach: '*',
}
