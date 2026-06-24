const {
  MAX_REDIRECTS,
  validatePublicUrl,
  validateRedirectUrl,
} = require('./urlSecurity')
const { DEFAULT_UA } = require('./crawlerConfig')

const FETCH_TIMEOUT_MS = Number(process.env.CRAWLER_TIMEOUT_MS || 10000)
const MAX_RESPONSE_BYTES = Number(process.env.CRAWLER_MAX_BYTES || 3 * 1024 * 1024)
const DOMAIN_DELAY_MS = Number(process.env.CRAWLER_DOMAIN_DELAY_MS || 300)

const lastFetchByDomain = new Map()

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

async function fetchWithBrowser(url, options = {}) {
  if (process.env.CRAWLER_USE_PLAYWRIGHT !== 'true') {
    return { ok: false, html: '', error: 'Browser fetch disabled' }
  }

  try {
    const { chromium } = require('playwright')
    const parsed = await validatePublicUrl(url)
    await validateRedirectUrl(parsed.href, options.allowedHostname)

    const browser = await chromium.launch({ headless: true })
    try {
      const context = await browser.newContext({
        userAgent: options.userAgent || DEFAULT_UA,
      })
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

      await page.goto(parsed.href, {
        timeout: FETCH_TIMEOUT_MS,
        waitUntil: 'domcontentloaded',
      })
      const html = await page.content()
      return {
        ok: true,
        status: 200,
        finalUrl: page.url(),
        html: html.slice(0, MAX_RESPONSE_BYTES),
        viaBrowser: true,
      }
    } finally {
      await browser.close()
    }
  } catch (err) {
    return { ok: false, html: '', error: err.message }
  }
}

async function fetchPage(url, options = {}) {
  const result = await fetchWithRedirects(url, options)
  if (result.ok && result.html && appearsJsRendered(result.html)) {
    result.requires_browser = true
    if (process.env.CRAWLER_USE_PLAYWRIGHT === 'true') {
      const browserResult = await fetchWithBrowser(result.finalUrl || url, options)
      if (browserResult.ok && browserResult.html) {
        return { ...browserResult, requires_browser: true, fetched_via_browser: true }
      }
    }
  }
  return result
}

module.exports = {
  FETCH_TIMEOUT_MS,
  MAX_RESPONSE_BYTES,
  fetchPage,
  fetchWithRedirects,
  appearsJsRendered,
  fetchWithBrowser,
}
