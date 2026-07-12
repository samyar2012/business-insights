/** Product homepage content - centered on Website Analyzer workflow */

export const productPillars = [
  {
    title: 'Website Analyzer',
    desc: 'Crawl your site and score safety, functionality, UX, business fit, and customer attraction.',
  },
  {
    title: 'Prioritized growth opportunities',
    desc: 'See ranked opportunities with impact - not a generic audit PDF.',
  },
  {
    title: 'Growth roadmap',
    desc: 'Turn recommendations into step-by-step actions you can execute and track.',
  },
  {
    title: 'AI growth tools',
    desc: 'Coach, content, and competitor tools that use your scan context.',
  },
  {
    title: 'Business model aware',
    desc: 'Scoring adapts to stores, services, listings, galleries, and hybrid models.',
  },
  {
    title: 'Rescan and improve',
    desc: 'Measure progress as you fix trust, UX, and conversion blockers.',
  },
]

export const howItWorks = [
  {
    step: 1,
    title: 'Add your business URL',
    body: 'Tell us your business type and website. We crawl public same-domain pages - no code install required.',
  },
  {
    step: 2,
    title: 'Review your report',
    body: 'Get an overall score, category breakdown, and the top problems blocking purchases or contact.',
  },
  {
    step: 3,
    title: 'Build your growth roadmap',
    body: 'Convert ranked opportunities into an execution roadmap across acquire, convert, retain, and operate.',
  },
  {
    step: 4,
    title: 'Ask the AI coach',
    body: 'Get help prioritizing, writing copy, and deciding what growth step to execute next - grounded in your report.',
  },
]

export const businessTypes = [
  {
    id: 'stores',
    badge: 'Online store',
    title: 'E-commerce and online-only businesses',
    blurb:
      'Find checkout friction, missing policies, weak product pages, and trust gaps that cost sales.',
  },
  {
    id: 'hybrid',
    badge: 'Online + offline',
    title: 'Stores with physical locations or services',
    blurb:
      'Make sure your site explains hours, location, booking, and how online and in-person work together.',
  },
  {
    id: 'services',
    badge: 'Services',
    title: 'Local and professional service businesses',
    blurb:
      'Score contact paths, service clarity, proof, and mobile UX - what drives calls and bookings.',
  },
  {
    id: 'content',
    badge: 'Content & listings',
    title: 'Blogs, galleries, directories, and listings',
    blurb:
      'Check readability, navigation, SEO signals, and whether visitors know what to do next.',
  },
]

export const aiToolsPreview = [
  {
    title: 'AI Growth Coach',
    desc: 'Ask what to execute first using your website report, scans, and growth roadmap.',
    tag: 'Plan',
  },
  {
    title: 'Content Generator',
    desc: 'Draft headlines, captions, and page copy aligned with your findings.',
    tag: 'Improve',
  },
  {
    title: 'Store Health Report',
    desc: 'Deep dive on trust, merchandising, and conversion using your scan history.',
    tag: 'Improve',
  },
  {
    title: 'Competitor Tracker',
    desc: 'Benchmark positioning and offers against businesses in your space.',
    tag: 'Compare',
  },
  {
    title: 'Social Analyzer',
    desc: 'Check whether your social presence matches your website promise.',
    tag: 'Compare',
  },
  {
    title: 'Business Scanner',
    desc: 'Quick structured scan across URLs and checklist signals.',
    tag: 'Analyze',
  },
]

export const reportHighlights = [
  {
    label: 'Overall score',
    value: '0-100',
    detail: 'Weighted across five customer-facing categories.',
  },
  {
    label: 'Top opportunities',
    value: 'Ranked',
    detail: 'High-leverage growth steps surfaced before technical noise.',
  },
  {
    label: 'Business model',
    value: 'Matched',
    detail: 'Scoring rubric fits your type of business.',
  },
]

/** Legacy export names used by Product and Solutions pages */
export const aiProducts = aiToolsPreview
export const primaryServices = productPillars
export const trialFlow = howItWorks
export const businessVerticals = businessTypes.map((type) => ({
  ...type,
  services: [type.blurb],
  aiTools: [],
}))
export const serviceTracks = howItWorks.map((step) => ({
  id: `step-${step.step}`,
  tag: `Step ${step.step}`,
  title: step.title,
  items: [step.body],
}))
