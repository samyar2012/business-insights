const { validatePublicUrl } = require('./crawler/urlSecurity')
const { DEFAULT_UA } = require('./crawler/crawlerConfig')

const DESKTOP_VIEWPORT = { width: 1280, height: 800 }
const MOBILE_VIEWPORT = { width: 390, height: 844 }
const AUDIT_TIMEOUT_MS = Number(process.env.VISUAL_AUDIT_TIMEOUT_MS || 15000)
const CTA_PATTERN =
  /buy|shop|order|subscribe|book|get started|add to cart|learn more|contact|quote|schedule|sign up|try free/i

function isVisualAuditEnabled() {
  return process.env.VISUAL_AUDIT_ENABLED === 'true'
}

function isPlaywrightAvailable() {
  try {
    require.resolve('playwright')
    return true
  } catch {
    return false
  }
}

function disabledResult(reason) {
  return {
    enabled: false,
    ok: false,
    skipped: true,
    reason,
    captured_at: new Date().toISOString(),
  }
}

function luminance(r, g, b) {
  const channels = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

function parseRgb(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return null
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) }
}

async function collectViewportMetrics(page, viewport) {
  await page.setViewportSize(viewport)
  await new Promise((resolve) => setTimeout(resolve, 250))

  return page.evaluate(
    ({ viewportHeight, ctaPatternSource }) => {
      const ctaPattern = new RegExp(ctaPatternSource, 'i')
      const doc = document.documentElement
      const body = document.body
      const pageHeight = Math.max(doc.scrollHeight, body?.scrollHeight || 0)
      const viewportWidth = window.innerWidth
      const viewportH = window.innerHeight
      const horizontalOverflow = doc.scrollWidth > viewportWidth + 1

      const isVisible = (el) => {
        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false
        }
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      }

      const textBlocks = []
      const selectors = 'p, li, div, span, article section'
      document.querySelectorAll(selectors).forEach((el) => {
        if (!isVisible(el)) return
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim()
        if (text.length < 40) return
        if (el.querySelector(selectors)) return
        textBlocks.push(text.length)
      })

      const headings = []
      ;['h1', 'h2', 'h3', 'h4'].forEach((tag) => {
        document.querySelectorAll(tag).forEach((el) => {
          if (!isVisible(el)) return
          const rect = el.getBoundingClientRect()
          headings.push({
            tag,
            text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
            top: Math.round(rect.top),
            above_fold: rect.top < viewportH && rect.bottom > 0,
          })
        })
      })

      const clickable = []
      document.querySelectorAll('a, button, [role="button"], input[type="submit"]').forEach((el) => {
        if (!isVisible(el)) return
        const rect = el.getBoundingClientRect()
        const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('value') || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120)
        clickable.push({
          tag: el.tagName.toLowerCase(),
          text,
          top: Math.round(rect.top),
          above_fold: rect.top < viewportH && rect.bottom > 0,
          is_cta: ctaPattern.test(text),
        })
      })

      const ctaElements = clickable.filter((item) => item.is_cta)
      const navElements = []
      document.querySelectorAll('nav a, header a, [role="navigation"] a').forEach((el) => {
        if (!isVisible(el)) return
        const rect = el.getBoundingClientRect()
        navElements.push({
          text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          above_fold: rect.top < viewportH && rect.bottom > 0,
        })
      })

      const aboveFoldElements = []
      document.querySelectorAll('h1, h2, a, button, img, nav').forEach((el) => {
        if (!isVisible(el)) return
        const rect = el.getBoundingClientRect()
        if (rect.top >= viewportH || rect.bottom <= 0) return
        aboveFoldElements.push({
          tag: el.tagName.toLowerCase(),
          text: (el.innerText || el.getAttribute('alt') || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        })
      })

      const contrastSamples = []
      document.querySelectorAll('h1, h2, p, a, button').forEach((el) => {
        if (!isVisible(el)) return
        if (contrastSamples.length >= 12) return
        const style = window.getComputedStyle(el)
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim()
        if (text.length < 8) return
        contrastSamples.push({
          tag: el.tagName.toLowerCase(),
          color: style.color,
          background: style.backgroundColor,
          font_size_px: Number.parseFloat(style.fontSize) || 0,
        })
      })

      const visibleTextLength = (body?.innerText || '').replace(/\s+/g, ' ').trim().length
      const foldArea = viewportWidth * viewportH
      const textDensity = foldArea > 0 ? visibleTextLength / foldArea : 0

      return {
        viewport,
        page_height: pageHeight,
        scroll_depth_ratio: viewportH > 0 ? pageHeight / viewportH : 0,
        horizontal_overflow: horizontalOverflow,
        image_count: document.querySelectorAll('img').length,
        text_block_lengths: textBlocks.slice(0, 40),
        avg_text_block_length:
          textBlocks.length > 0
            ? Math.round(textBlocks.reduce((sum, n) => sum + n, 0) / textBlocks.length)
            : 0,
        max_text_block_length: textBlocks.length > 0 ? Math.max(...textBlocks) : 0,
        headings,
        clickable_elements: clickable.slice(0, 40),
        cta_elements: ctaElements.slice(0, 15),
        cta_above_fold: ctaElements.some((item) => item.above_fold),
        nav_elements: navElements.slice(0, 20),
        nav_above_fold: navElements.some((item) => item.above_fold),
        above_fold_elements: aboveFoldElements.slice(0, 25),
        visible_text_length: visibleTextLength,
        text_density: Number(textDensity.toFixed(6)),
        contrast_samples: contrastSamples,
      }
    },
    { viewportHeight: viewport.height, ctaPatternSource: CTA_PATTERN.source },
  )
}

function scoreContrastSamples(samples = []) {
  const ratios = []
  for (const sample of samples) {
    const fg = parseRgb(sample.color)
    const bg = parseRgb(sample.background)
    if (!fg) continue
    const bgChannels = bg || { r: 255, g: 255, b: 255 }
    const ratio = contrastRatio(luminance(fg.r, fg.g, fg.b), luminance(bgChannels.r, bgChannels.g, bgChannels.b))
    ratios.push(ratio)
  }
  if (!ratios.length) return null
  const avg = ratios.reduce((sum, n) => sum + n, 0) / ratios.length
  const min = Math.min(...ratios)
  return {
    average_ratio: Number(avg.toFixed(2)),
    min_ratio: Number(min.toFixed(2)),
    sample_count: ratios.length,
    wcag_aa_likely: min >= 4.5,
  }
}

async function captureScreenshot(page) {
  try {
    const buffer = await page.screenshot({ type: 'jpeg', quality: 60, fullPage: false })
    return {
      format: 'jpeg',
      width: page.viewportSize()?.width || null,
      height: page.viewportSize()?.height || null,
      base64: buffer.toString('base64'),
    }
  } catch {
    return null
  }
}

async function runVisualAudit(url, options = {}) {
  if (!isVisualAuditEnabled()) {
    return disabledResult('Visual audit disabled (VISUAL_AUDIT_ENABLED is not true).')
  }

  if (!isPlaywrightAvailable()) {
    return {
      enabled: true,
      ok: false,
      skipped: true,
      reason: 'Playwright is not installed. Run: npm install playwright && npx playwright install chromium',
      url,
      captured_at: new Date().toISOString(),
    }
  }

  let parsed
  try {
    parsed = await validatePublicUrl(url)
  } catch (err) {
    return {
      enabled: true,
      ok: false,
      error: err.message,
      url,
      captured_at: new Date().toISOString(),
    }
  }

  const { chromium } = require('playwright')
  let browser

  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
      userAgent: options.userAgent || DEFAULT_UA,
      viewport: DESKTOP_VIEWPORT,
    })
    const page = await context.newPage()

    await page.goto(parsed.href, {
      timeout: AUDIT_TIMEOUT_MS,
      waitUntil: 'domcontentloaded',
    })

    const desktopMetrics = await collectViewportMetrics(page, DESKTOP_VIEWPORT)
    const desktopScreenshot = await captureScreenshot(page)
    const mobileMetrics = await collectViewportMetrics(page, MOBILE_VIEWPORT)
    const mobileScreenshot = await captureScreenshot(page)

    const desktopContrast = scoreContrastSamples(desktopMetrics.contrast_samples)
    const mobileContrast = scoreContrastSamples(mobileMetrics.contrast_samples)

    return {
      enabled: true,
      ok: true,
      url: parsed.href,
      final_url: page.url(),
      captured_at: new Date().toISOString(),
      desktop: {
        screenshot: desktopScreenshot,
        metrics: desktopMetrics,
        contrast: desktopContrast,
      },
      mobile: {
        screenshot: mobileScreenshot,
        metrics: mobileMetrics,
        contrast: mobileContrast,
      },
      summary: {
        page_height: desktopMetrics.page_height,
        scroll_depth_ratio: desktopMetrics.scroll_depth_ratio,
        desktop_text_density: desktopMetrics.text_density,
        mobile_text_density: mobileMetrics.text_density,
        cta_above_fold: desktopMetrics.cta_above_fold || mobileMetrics.cta_above_fold,
        nav_above_fold: desktopMetrics.nav_above_fold || mobileMetrics.nav_above_fold,
        horizontal_overflow_desktop: desktopMetrics.horizontal_overflow,
        horizontal_overflow_mobile: mobileMetrics.horizontal_overflow,
        image_count: Math.max(desktopMetrics.image_count, mobileMetrics.image_count),
        avg_text_block_length: desktopMetrics.avg_text_block_length,
        max_text_block_length: Math.max(
          desktopMetrics.max_text_block_length,
          mobileMetrics.max_text_block_length,
        ),
      },
    }
  } catch (err) {
    return {
      enabled: true,
      ok: false,
      error: err.message,
      url: parsed?.href || url,
      captured_at: new Date().toISOString(),
    }
  } finally {
    if (browser) await browser.close()
  }
}

function stripScreenshotsForStorage(visualAudit) {
  if (!visualAudit || typeof visualAudit !== 'object') return visualAudit
  const clone = JSON.parse(JSON.stringify(visualAudit))
  for (const viewport of ['desktop', 'mobile']) {
    if (clone[viewport]?.screenshot?.base64) {
      clone[viewport].screenshot = {
        ...clone[viewport].screenshot,
        base64: undefined,
        stored: false,
        note: 'Screenshot omitted from persisted profile to reduce payload size.',
      }
    }
  }
  return clone
}

module.exports = {
  isVisualAuditEnabled,
  isPlaywrightAvailable,
  runVisualAudit,
  stripScreenshotsForStorage,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  CTA_PATTERN,
}
