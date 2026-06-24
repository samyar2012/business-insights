const DEFAULT_UA =
  process.env.CRAWLER_USER_AGENT ||
  `BusinessInsights-Crawler/1.0 (+${process.env.APP_URL || 'https://business-insights.local'})`

module.exports = { DEFAULT_UA }
