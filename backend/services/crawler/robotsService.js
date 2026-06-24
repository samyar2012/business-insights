const { fetchPage } = require('./pageFetcher')
const { DEFAULT_UA } = require('./crawlerConfig')

function parseRobotsTxt(text, hostname) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())

  const disallow = []
  const sitemaps = []
  let applies = false
  let seenSpecificAgent = false

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue
    const [directive, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    const key = directive.toLowerCase()

    if (key === 'user-agent') {
      const agent = value.toLowerCase()
      applies = agent === '*' || agent.includes('businessinsights')
      if (agent !== '*') seenSpecificAgent = true
      if (agent === '*' && seenSpecificAgent) applies = false
    } else if (key === 'disallow' && applies && value) {
      disallow.push(value)
    } else if (key === 'sitemap' && value) {
      try {
        const url = new URL(value, `https://${hostname}`)
        sitemaps.push(url.href)
      } catch {
        // skip invalid sitemap
      }
    }
  }

  return { disallow, sitemaps }
}

function isPathDisallowed(pathname, disallowRules) {
  const path = pathname || '/'
  for (const rule of disallowRules || []) {
    if (!rule) continue
    if (rule === '/') return true
    if (path.startsWith(rule)) return true
  }
  return false
}

async function fetchRobots(hostname, options = {}) {
  const robotsUrl = `https://${hostname}/robots.txt`
  try {
    const result = await fetchPage(robotsUrl, {
      allowedHostname: hostname,
      userAgent: options.userAgent || DEFAULT_UA,
      skipDelay: true,
    })
    if (!result.ok || !result.html) {
      return { disallow: [], sitemaps: [], fetched: false }
    }
    const parsed = parseRobotsTxt(result.html, hostname)
    return { ...parsed, fetched: true }
  } catch {
    return { disallow: [], sitemaps: [], fetched: false }
  }
}

module.exports = {
  parseRobotsTxt,
  isPathDisallowed,
  fetchRobots,
}
