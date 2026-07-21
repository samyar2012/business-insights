const {
  MAX_REDIRECTS,
  validatePublicUrl,
  validateRedirectUrl,
} = require('./urlSecurity')
const { DEFAULT_UA, BROWSER_UA, isBrowserCrawlEnabled } = require('./crawlerConfig')

const FETCH_TIMEOUT_MS = Number(process.env.CRAWLER_TIMEOUT_MS || 10000)
const BROWSER_FETCH_TIMEOUT_MS = Number(process.env.CRAWLER_BROWSER_TIMEOUT_MS || 30000)
const MAX_RESPONSE_BYTES = Number(process.env.CRAWLER_MAX_BYTES || 3 * 1024 * 1024)
const DOMAIN_DELAY_MS = Number(process.env.CRAWLER_DOMAIN_DELAY_MS || 300)

const BOT_CHALLENGE_RE =
  /verifying your connection|just a moment|attention required|cf-browser-verification|challenge-platform|checking your browser|ddos protection|please enable javascript/i

const CRAWL_LIMITATION_USER_MESSAGE =
  'This site blocked automated crawling. Try browser-based scan mode or rescan later.'

function crawlLimitationFields(result = {}) {
  const status = Number(result.status || 0)
  return {
    bot_blocked: true,
    crawl_blocked: true,
    block_reason: status === 403 ? 'http_403' : 'bot_protection',
    user_message: CRAWL_LIMITATION_USER_MESSAGE,
  }
}

const lastFetchByDomain = new Map()
let sharedBrowserPromise = null

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function enforceDomainDelay(hostname) {
  const key = hostname.replace(/^www\./, '').toLowerCase()
  const last = lastFetchByDomain.get(key) || 0
  const wait = DOMAIN_DELAY_MS - (Date.now() - last)
  if (wait > 0) await sleep(wait)
  lastFetchByDomain.set(key, Date.now())
}

async function readLimitedBody(response, maxBytes) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      await reader.cancel()
      const err = new Error('Response exceeds maximum size')
      err.code = 'RESPONSE_TOO_LARGE'
      throw err
    }
    chunks.push(value)
  }

  const buffer = Buffer.concat(chunks)
  return buffer.toString('utf8')
}

function extractHtmlTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? match[1].replace(/\s+/g, ' ').trim() : ''
}

function isBotBlockedResponse(result) {
  if (!result) return false
  const html = String(result.html || '')
  const title = extractHtmlTitle(html)
  const status = Number(result.status || 0)

  if ([401, 403, 429, 503].includes(status)) return true
  if (BOT_CHALLENGE_RE.test(title)) return true
  if (BOT_CHALLENGE_RE.test(html.slice(0, 4000))) return true
  if (/cdn-cgi\/challenge-platform|cf-chl-|g-recaptcha|hcaptcha/i.test(html)) return true

  return false
}

function shouldUseBrowserFallback(result) {
  if (!result) return false
  if (isBotBlockedResponse(result)) return true
  return Boolean(result.ok && result.html && appearsJsRendered(result.html))
}

async function fetchWithRedirects(url, options = {}) {
  const allowedHostname = options.allowedHostname
  let current = (await validatePublicUrl(url)).href
  let redirectCount = 0
  let lastStatus = 0
  let lastHeaders = {}

  while (redirectCount <= MAX_REDIRECTS) {
    if (!options.skipDelay) {
      await enforceDomainDelay(new URL(current).hostname)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    try {
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': options.userAgent || DEFAULT_UA,
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })

      lastStatus = res.status
      lastHeaders = Object.fromEntries(res.headers.entries())

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location')
        if (!location) break
        const next = await validateRedirectUrl(new URL(location, current).href, allowedHostname)
        current = next.href
        redirectCount += 1
        continue
      }

      const contentType = (res.headers.get('content-type') || '').toLowerCase()
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        return {
          ok: false,
          status: res.status,
          finalUrl: current,
          html: '',
          contentType,
          error: 'Non-HTML response',
        }
      }

      const html = await readLimitedBody(res, MAX_RESPONSE_BYTES)
      return {
        ok: res.ok,
        status: res.status,
        finalUrl: current,
        html,
        contentType,
        redirectCount,
      }
    } catch (err) {
      return {
        ok: false,
        status: lastStatus,
        finalUrl: current,
        html: '',
        error: err.message,
        headers: lastHeaders,
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    ok: false,
    status: lastStatus,
    finalUrl: current,
    html: '',
    error: 'Too many redirects',
  }
}

function appearsJsRendered(html) {
  const text = String(html || '')
  const stripped = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')
  const visible = stripped.replace(/\s+/g, ' ').trim()
  if (visible.length > 400) return false
  const scriptCount = (text.match(/<script/gi) || []).length
  const hasRoot = /id=["']root["']|id=["']__next["']|data-reactroot/i.test(text)
  return scriptCount >= 3 && hasRoot && visible.length < 200
}

async function getSharedBrowser() {
  if (!sharedBrowserPromise) {
    const { chromium } = require('playwright')
    sharedBrowserPromise = chromium.launch({ headless: true }).catch((err) => {
      sharedBrowserPromise = null
      throw err
    })
  }
  return sharedBrowserPromise
}

async function waitForBotChallenge(page) {
  const title = await page.title().catch(() => '')
  if (!BOT_CHALLENGE_RE.test(title)) return

  await page
    .waitForFunction(
      () => !/verifying your connection|just a moment|attention required|checking your browser/i.test(document.title),
      { timeout: 20000 },
    )
    .catch(() => {})
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
  await sleep(500)
}

async function fetchWithBrowser(url, options = {}) {
  if (!isBrowserCrawlEnabled()) {
    return { ok: false, html: '', error: 'Browser fetch disabled' }
  }

  try {
    const parsed = await validatePublicUrl(url)
    await validateRedirectUrl(parsed.href, options.allowedHostname)

    const browser = options.browser || (await getSharedBrowser())
    const context = await browser.newContext({
      userAgent: options.browserUserAgent || BROWSER_UA,
      viewport: { width: 1365, height: 900 },
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })

    try {
      const page = await context.newPage()
      await page.route('**/*', (route) => {
        const type = route.request().resourceType()
        if (['image', 'font', 'media'].includes(type)) {
          return route.abort()
        }
        const reqUrl = route.request().url()
        try {
          const host = new URL(reqUrl).hostname.replace(/^www\./, '')
          const allowed = options.allowedHostname.replace(/^www\./, '')
          if (host !== allowed) return route.abort()
        } catch {
          return route.abort()
        }
        return route.continue()
      })

      const response = await page.goto(parsed.href, {
        timeout: BROWSER_FETCH_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      })
      await waitForBotChallenge(page)
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})

      const html = await page.content()
      const title = await page.title()
      const status = response?.status() || 200
      const blocked = BOT_CHALLENGE_RE.test(title) || BOT_CHALLENGE_RE.test(html.slice(0, 4000))

      if (blocked) {
        return {
          ok: false,
          status,
          finalUrl: page.url(),
          html: html.slice(0, MAX_RESPONSE_BYTES),
          error: 'Bot protection challenge did not clear in time',
          viaBrowser: true,
          ...crawlLimitationFields({ status }),
        }
      }

      return {
        ok: true,
        status,
        finalUrl: page.url(),
        html: html.slice(0, MAX_RESPONSE_BYTES),
        viaBrowser: true,
      }
    } finally {
      await context.close()
    }
  } catch (err) {
    if (/Cannot find module 'playwright'|playwright install/i.test(err.message)) {
      return {
        ok: false,
        html: '',
        error: 'Playwright is not installed. Run: npm install playwright && npx playwright install chromium',
      }
    }
    return { ok: false, html: '', error: err.message }
  }
}

async function fetchPage(url, options = {}) {
  const result = await fetchWithRedirects(url, options)
  const blocked = isBotBlockedResponse(result)
  const needsBrowser = shouldUseBrowserFallback(result)

  if (needsBrowser && isBrowserCrawlEnabled()) {
    const browserResult = await fetchWithBrowser(result.finalUrl || url, options)
    if (browserResult.ok && browserResult.html) {
      return {
        ...browserResult,
        requires_browser: true,
        fetched_via_browser: true,
        bot_blocked: blocked,
        prior_status: result.status,
      }
    }
    if (blocked) {
      return {
        ...result,
        ...crawlLimitationFields(result),
        error:
          browserResult.error ||
          'Site bot protection blocked automated access even with browser fallback.',
        fetch_method: 'browser_failed',
      }
    }
  }

  if (blocked) {
    return {
      ...result,
      ...crawlLimitationFields(result),
      error:
        result.error ||
        `Site returned bot protection (HTTP ${result.status || 'challenge page'}). Set CRAWLER_USE_PLAYWRIGHT=true to crawl with a browser.`,
      fetch_method: 'http',
    }
  }

  if (result.ok && result.html && appearsJsRendered(result.html)) {
    result.requires_browser = true
  }
  return result
}

module.exports = {
  FETCH_TIMEOUT_MS,
  BROWSER_FETCH_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  fetchPage,
  fetchWithRedirects,
  appearsJsRendered,
  fetchWithBrowser,
  isBotBlockedResponse,
  shouldUseBrowserFallback,
}
