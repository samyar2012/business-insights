const DEFAULT_UA =
  process.env.CRAWLER_USER_AGENT ||
  `BusinessInsights-Crawler/1.0 (+${process.env.APP_URL || 'https://business-insights.local'})`

const BROWSER_UA =
  process.env.CRAWLER_BROWSER_USER_AGENT ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

function isBrowserCrawlEnabled() {
  if (process.env.CRAWLER_USE_PLAYWRIGHT === 'true') return true
  if (process.env.CRAWLER_USE_PLAYWRIGHT === 'false') return false
  return process.env.VISUAL_AUDIT_ENABLED === 'true'
}

module.exports = { DEFAULT_UA, BROWSER_UA, isBrowserCrawlEnabled }
