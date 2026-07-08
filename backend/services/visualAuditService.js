const { validatePublicUrl } = require('./crawler/urlSecurity')
const { DEFAULT_UA, BROWSER_UA } = require('./crawler/crawlerConfig')
const {
  collectVisualEvidence,
  summarizeVisualEvidence,
  saveDebugVisualAuditArtifacts,
} = require('./visualEvidenceService')

const DESKTOP_VIEWPORT = { width: 1280, height: 800 }
const MOBILE_VIEWPORT = { width: 390, height: 844 }
const DEFAULT_MOBILE_DEVICE = process.env.VISUAL_AUDIT_MOBILE_DEVICE || 'iPhone 13'
const AUDIT_TIMEOUT_MS = Number(process.env.VISUAL_AUDIT_TIMEOUT_MS || 25000)
const AUDIT_SETTLE_MS = Number(process.env.VISUAL_AUDIT_SETTLE_MS || 1500)
const CTA_PATTERN =
  /buy|shop|browse|explore|order|subscribe|book|get started|add to cart|learn more|contact|quote|schedule|sign up|try free|swatch|measurement|showroom|view cart|shop now|get quote|free consultation/i

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

function resolveMobileDeviceConfig(deviceName = DEFAULT_MOBILE_DEVICE) {
  const { devices } = require('playwright')
  const device = devices[deviceName]
  if (!device) {
    const err = new Error(`Unknown Playwright mobile device: ${deviceName}`)
    err.code = 'UNKNOWN_MOBILE_DEVICE'
    throw err
  }
  return { name: deviceName, device }
}

async function navigateAuditPage(page, url) {
  await page.goto(url, {
    timeout: AUDIT_TIMEOUT_MS,
    waitUntil: 'domcontentloaded',
  })
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, AUDIT_SETTLE_MS))
}

async function collectViewportMetrics(page, meta = {}) {
  const viewportSize = page.viewportSize() || DESKTOP_VIEWPORT
  await new Promise((resolve) => setTimeout(resolve, meta.settleMs ?? 400))

  const metrics = await page.evaluate(
    ({ ctaPatternSource }) => {
      const ctaPattern = new RegExp(ctaPatternSource, 'i')
      const doc = document.documentElement
      const body = document.body
      const pageHeight = Math.max(doc.scrollHeight, body?.scrollHeight || 0)
      const viewportWidth = window.innerWidth
      const viewportH = window.innerHeight
      const overflowPx = Math.max(0, doc.scrollWidth - viewportWidth)
      const horizontalOverflow = overflowPx > 24
      const overflowSeverity =
        overflowPx <= 24 ? 'none' : overflowPx <= 80 ? 'minor' : 'major'

      const hasMobileViewport = Boolean(
        document.querySelector('meta[name="viewport"][content*="width"]'),
      )

      const isVisible = (el) => {
        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
          return false
        }
        const rect = el.getBoundingClientRect()
        return rect.width > 4 && rect.height > 4
      }

      const navLinkSeen = new Set()
      const navElements = []
      const primaryNavSeen = new Set()
      const primaryNavElements = []

      const isNestedSubmenuLink = (el) => {
        if (el.closest('[class*="sub-menu" i], [class*="submenu" i], [class*="dropdown-menu" i], [class*="mega-menu" i], [aria-hidden="true"]')) {
          return true
        }
        const parentUl = el.parentElement?.closest('ul')
        if (!parentUl) return false
        const outerLi = parentUl.parentElement
        if (outerLi?.tagName === 'LI' && outerLi.closest('ul')) return true
        return false
      }

      const pushNavLink = (el, { primaryCandidate = false } = {}) => {
        if (!isVisible(el)) return
        const text = (el.innerText || el.getAttribute('aria-label') || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80)
        if (!text || text.length < 2) return
        const key = text.toLowerCase()
        if (navLinkSeen.has(key)) return
        navLinkSeen.add(key)
        const rect = el.getBoundingClientRect()
        const item = {
          text,
          above_fold: rect.top < viewportH && rect.bottom > 0,
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          is_primary_candidate: primaryCandidate,
        }
        navElements.push(item)
        if (primaryCandidate && !isNestedSubmenuLink(el)) {
          if (!primaryNavSeen.has(key)) {
            primaryNavSeen.add(key)
            primaryNavElements.push(item)
          }
        }
      }

      document.querySelectorAll('nav > ul > li > a, header nav > ul > li > a, [role="navigation"] > ul > li > a').forEach((el) => {
        pushNavLink(el, { primaryCandidate: true })
      })
      document.querySelectorAll('nav > div > a, header nav > div > a, nav > a').forEach((el) => {
        if (el.closest('ul')) return
        pushNavLink(el, { primaryCandidate: true })
      })

      const navSelectors = [
        'nav a',
        'header a',
        '[role="navigation"] a',
        '[class*="nav"] a',
        '[class*="menu"] a',
        '[class*="header"] a',
      ].join(', ')
      document.querySelectorAll(navSelectors).forEach((el) => {
        pushNavLink(el, { primaryCandidate: false })
      })

      if (primaryNavElements.length === 0 && navElements.length > 0) {
        const headerLinks = navElements.filter((item) => item.top >= 0 && item.top < 120)
        if (headerLinks.length) {
          const minTop = Math.min(...headerLinks.map((item) => item.top))
          for (const item of headerLinks) {
            if (item.top <= minTop + 16 && !primaryNavSeen.has(item.text.toLowerCase())) {
              primaryNavSeen.add(item.text.toLowerCase())
              primaryNavElements.push({ ...item, is_primary_candidate: true })
            }
          }
        }
      }

      const textBlocks = []
      const selectors = 'p, li, article, section'
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
          const inChrome = Boolean(
            el.closest(
              'nav, footer, [role="navigation"], header [class*="menu" i], [class*="drawer" i], [class*="mega" i], [class*="dropdown" i]',
            ),
          )
          const rect = el.getBoundingClientRect()
          headings.push({
            tag,
            text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
            top: Math.round(rect.top),
            above_fold: rect.top < viewportH && rect.bottom > 0,
            in_chrome: inChrome,
          })
        })
      })

      const textCandidates = []
      document.querySelectorAll('h1, h2, h3, p, a, button, div, span').forEach((el) => {
        if (!isVisible(el)) return
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim()
        if (text.length < 8 || text.length > 180) return
        const rect = el.getBoundingClientRect()
        if (rect.top > viewportH * 1.2 || rect.bottom < 0) return
        const style = window.getComputedStyle(el)
        const fontSize = Number.parseFloat(style.fontSize) || 0
        const weight = Number.parseInt(style.fontWeight, 10) || 400
        textCandidates.push({
          tag: el.tagName.toLowerCase(),
          text: text.slice(0, 160),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          above_fold: rect.top < viewportH && rect.bottom > 0,
          font_size_px: fontSize,
          font_weight: weight,
          score: Math.round(fontSize * 2 + (weight >= 600 ? 12 : 0) + (rect.top < viewportH ? 15 : 0)),
        })
      })
      textCandidates.sort((a, b) => b.score - a.score)

      const clickable = []
      document.querySelectorAll('a, button, [role="button"], input[type="submit"]').forEach((el) => {
        if (!isVisible(el)) return
        const rect = el.getBoundingClientRect()
        const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('value') || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120)
        const aria = el.getAttribute('aria-label') || ''
        const inPromoBar = Boolean(
          el.closest('[class*="announcement" i], [class*="promo" i], [class*="marquee" i], [class*="slideshow" i]'),
        )
        const inNav = Boolean(el.closest('nav, header nav, [role="navigation"]'))
        clickable.push({
          tag: el.tagName.toLowerCase(),
          text,
          top: Math.round(rect.top),
          above_fold: rect.top < viewportH && rect.bottom > 0,
          is_cta: (ctaPattern.test(text) || ctaPattern.test(aria)) && !(inNav && el.tagName === 'A'),
          is_promo: inPromoBar,
          in_nav: inNav,
        })
      })

      const ctaElements = clickable.filter((item) => item.is_cta && item.text.length > 1)

      const bodyText = (body?.innerText || '').replace(/\s+/g, ' ').trim()
      const templateDebtSignals = []
      if (/made with squarespace/i.test(bodyText)) templateDebtSignals.push('squarespace_template_footer')
      if (/123 demo st|\(555\)555-5555|555-555-5555/i.test(bodyText)) {
        templateDebtSignals.push('placeholder_demo_contact')
      }
      if (/lorem ipsum/i.test(bodyText)) templateDebtSignals.push('lorem_ipsum')
      const sentences = bodyText
        .split(/[.!?]+/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.length > 42)
      const sentenceCounts = {}
      for (const sentence of sentences) {
        sentenceCounts[sentence] = (sentenceCounts[sentence] || 0) + 1
      }
      const duplicateCopyCount = Object.values(sentenceCounts).filter((count) => count >= 2).length

      const iconElements = []
      document
        .querySelectorAll(
          'svg, img[src*="icon" i], img[alt*="icon" i], i[class*="icon"], span[class*="icon"], [class*="fa-"], [class*="material-icons"], button svg, a svg',
        )
        .forEach((el) => {
          if (!isVisible(el)) return
          const rect = el.getBoundingClientRect()
          if (rect.width < 8 || rect.height < 8) return
          iconElements.push({
            tag: el.tagName.toLowerCase(),
            above_fold: rect.top < viewportH && rect.bottom > 0,
            in_nav: Boolean(el.closest('nav, header, [role="navigation"]')),
          })
        })

      const hasStructuredHeader = Boolean(
        document.querySelector('header') &&
          (document.querySelector('nav, [role="navigation"]') ||
            document.querySelector('[class*="nav"], [class*="menu"]')),
      )

      const aboveFoldImages = []
      document.querySelectorAll('img, picture img').forEach((el) => {
        if (!isVisible(el)) return
        const rect = el.getBoundingClientRect()
        if (rect.top >= viewportH || rect.bottom <= 0) return
        if (rect.width < 40 || rect.height < 40) return
        aboveFoldImages.push({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
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
      const readBackground = (el) => {
        let node = el
        for (let depth = 0; depth < 6 && node; depth += 1) {
          const style = window.getComputedStyle(node)
          const bg = style.backgroundColor
          if (bg && !/rgba?\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg) && bg !== 'transparent') {
            return bg
          }
          node = node.parentElement
        }
        return 'rgb(255, 255, 255)'
      }

      document.querySelectorAll('h1, h2, p, a, button').forEach((el) => {
        if (!isVisible(el)) return
        if (contrastSamples.length >= 16) return
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim()
        if (text.length < 8) return
        const style = window.getComputedStyle(el)
        contrastSamples.push({
          tag: el.tagName.toLowerCase(),
          color: style.color,
          background: readBackground(el),
          font_size_px: Number.parseFloat(style.fontSize) || 0,
        })
      })

      const visibleTextLength = (body?.innerText || '').replace(/\s+/g, ' ').trim().length
      const foldArea = viewportWidth * viewportH
      const textDensity = foldArea > 0 ? visibleTextLength / foldArea : 0

      let aboveFoldTextLength = 0
      let maxAboveFoldTextBlock = 0
      document.querySelectorAll('p, li, h1, h2, h3, div').forEach((el) => {
        if (!isVisible(el)) return
        const rect = el.getBoundingClientRect()
        if (rect.top >= viewportH || rect.bottom <= 0) return
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim()
        if (text.length < 20) return
        if (el.querySelector('p, li, h1, h2, h3')) return
        aboveFoldTextLength += text.length
        if (text.length > maxAboveFoldTextBlock) maxAboveFoldTextBlock = text.length
      })

      const sectionCount = [
        ...document.querySelectorAll('main section, main article, [role="main"] section, [role="main"] article'),
      ].filter((el) => isVisible(el) && (el.innerText || '').trim().length > 60).length

      const qualityImages = []
      const layoutImages = []
      let imagesWithAltCount = 0
      let misalignedImageCount = 0
      document.querySelectorAll('img').forEach((el) => {
        if (!isVisible(el)) return
        const rect = el.getBoundingClientRect()
        const alt = (el.getAttribute('alt') || '').trim()
        if (alt.length > 2) imagesWithAltCount += 1
        const inNav = Boolean(el.closest('nav, header, [role="navigation"]'))
        const inMain = Boolean(el.closest('main, article, section, [class*="product" i], [class*="gallery" i], [class*="hero" i]'))
        const isDecorativeIcon = inNav && rect.width < 56 && rect.height < 56
        const style = window.getComputedStyle(el)
        const objectFit = style.objectFit || ''
        const aspect = rect.height > 0 ? rect.width / rect.height : 0
        const parent = el.parentElement
        const parentRect = parent?.getBoundingClientRect?.() || rect
        const overflowsParent =
          parent &&
          (rect.width > parentRect.width * 1.15 || rect.height > parentRect.height * 1.25)
        const extremeAspect = aspect > 0 && (aspect < 0.2 || aspect > 5)
        const inProductGrid = Boolean(
          el.closest(
            '[class*="product" i], [class*="card" i], [data-product-id], [data-product], .product-card, .grid__item, [class*="collection-grid" i], [class*="product-grid" i], [class*="product-item" i], .card__media, .product-media, li[class*="grid" i]',
          ),
        )
        const isCatalogImage = inProductGrid && rect.width >= 48 && rect.height >= 48
        const layoutFits =
          isDecorativeIcon ||
          (isCatalogImage && !extremeAspect && !overflowsParent) ||
          (inMain &&
            rect.width >= 80 &&
            rect.height >= 60 &&
            !overflowsParent &&
            !extremeAspect &&
            (objectFit === 'cover' || objectFit === 'contain' || objectFit === '' || rect.width <= viewportWidth))

        if (layoutFits) {
          layoutImages.push({
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            above_fold: rect.top < viewportH && rect.bottom > 0,
            has_alt: alt.length > 2,
            decorative: isDecorativeIcon,
            in_product_grid: isCatalogImage,
          })
        } else if (
          !isDecorativeIcon &&
          !isCatalogImage &&
          inMain &&
          rect.width >= 40 &&
          rect.height >= 40
        ) {
          misalignedImageCount += 1
        }

        if (rect.width >= 80 && rect.height >= 60) {
          qualityImages.push({
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            above_fold: rect.top < viewportH && rect.bottom > 0,
            has_alt: alt.length > 2,
            layout_fits: layoutFits,
          })
        }
      })

      const fontSizes = contrastSamples.map((s) => s.font_size_px).filter((n) => n > 0)
      const fontSizeStats =
        fontSizes.length > 0
          ? {
              min: Math.min(...fontSizes),
              max: Math.max(...fontSizes),
              median: fontSizes.sort((a, b) => a - b)[Math.floor(fontSizes.length / 2)],
            }
          : null

      let animationDetected = false
      let disruptiveMotion = false
      const motionSample = [...document.querySelectorAll('body *')].slice(0, 120)
      for (const el of motionSample) {
        const style = window.getComputedStyle(el)
        if (style.animationName && style.animationName !== 'none') animationDetected = true
        if (style.transitionDuration && parseFloat(style.transitionDuration) > 0.6) animationDetected = true
        if (parseFloat(style.transform?.replace(/[^0-9.-]/g, '') || 0) > 50) disruptiveMotion = true
      }

      const valuePropPattern =
        /shop|buy|service|quality|trusted|best|free|custom|professional|delivery|consult|gallery|portfolio|since|welcome|official|\d{4}/i
      const heroSectionSelectors = [
        'header',
        '[class*="hero" i]',
        '[class*="banner" i]',
        '[class*="masthead" i]',
        'main > section:first-of-type',
        'main > div:first-of-type',
        '[role="banner"]',
      ].join(', ')

      const heroHeadingCandidates = []
      const pushHeroCandidate = (el, source) => {
        if (!isVisible(el)) return
        const text = (el.innerText || el.getAttribute('aria-label') || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 140)
        if (text.length < 8 || text.length > 180) return
        const rect = el.getBoundingClientRect()
        const style = window.getComputedStyle(el)
        const fontSize = Number.parseFloat(style.fontSize) || 0
        const aboveFold = rect.top < viewportH * 0.85 && rect.bottom > 0
        const centerBias =
          rect.left >= viewportWidth * 0.05 && rect.left + rect.width <= viewportWidth * 0.95 ? 8 : 0
        const topBias = rect.top < viewportH * 0.45 ? 14 : rect.top < viewportH * 0.7 ? 6 : 0
        const valuePropBias = valuePropPattern.test(text) ? 10 : 0
        const tagBonus = el.tagName.toLowerCase() === 'h1' ? 24 : el.tagName.toLowerCase() === 'h2' ? 12 : 0
        const inHeroSection = Boolean(el.closest(heroSectionSelectors))
        const sectionBonus = inHeroSection ? 16 : 0
        const score =
          fontSize * 1.4 + topBias + centerBias + valuePropBias + tagBonus + sectionBonus + (aboveFold ? 20 : 0)
        heroHeadingCandidates.push({
          text,
          source,
          font_size_px: fontSize,
          above_fold: aboveFold,
          top: Math.round(rect.top),
          in_hero_section: inHeroSection,
          score,
        })
      }

      document.querySelectorAll('h1').forEach((el) => pushHeroCandidate(el, 'h1'))
      document.querySelectorAll(heroSectionSelectors).forEach((section) => {
        ;['h1', 'h2', 'h3', 'p', 'span', 'div'].forEach((tag) => {
          section.querySelectorAll(`:scope > ${tag}, :scope ${tag}`).forEach((el) => {
            if (el.querySelector('h1, h2, h3')) return
            pushHeroCandidate(el, 'hero_section_text')
          })
        })
      })
      document.querySelectorAll('h1, h2, h3').forEach((el) => {
        pushHeroCandidate(el, el.tagName.toLowerCase() === 'h1' ? 'h1' : 'visual_largest_text')
      })

      heroHeadingCandidates.sort((a, b) => b.score - a.score)
      const bestHero = heroHeadingCandidates[0] || null
      const heroHeading = bestHero
        ? {
            text: bestHero.text,
            source:
              bestHero.source === 'h1'
                ? 'h1'
                : bestHero.in_hero_section
                  ? 'hero_section_text'
                  : 'visual_largest_text',
            above_fold: bestHero.above_fold,
            font_size_px: bestHero.font_size_px,
            confidence: Math.max(
              35,
              Math.min(
                95,
                Math.round(
                  30 +
                    (bestHero.above_fold ? 25 : 0) +
                    Math.min(20, bestHero.font_size_px / 2) +
                    (bestHero.in_hero_section ? 15 : 0) +
                    (valuePropPattern.test(bestHero.text) ? 10 : 0),
                ),
              ),
            ),
          }
        : null

      const bulletCount = document.querySelectorAll('ul li, ol li').length
      let mobileFoldText = 0
      document.querySelectorAll('p, li, h1, h2, h3, div').forEach((el) => {
        if (!isVisible(el)) return
        const rect = el.getBoundingClientRect()
        if (rect.top >= viewportH || rect.bottom <= 0) return
        mobileFoldText += (el.innerText || '').replace(/\s+/g, ' ').trim().length
      })
      const mobileTextDensity =
        foldArea > 0 ? Number((mobileFoldText / foldArea).toFixed(6)) : 0

      return {
        page_height: pageHeight,
        scroll_depth_ratio: viewportH > 0 ? pageHeight / viewportH : 0,
        horizontal_overflow: horizontalOverflow,
        overflow_px: overflowPx,
        overflow_severity: overflowSeverity,
        has_mobile_viewport: hasMobileViewport,
        image_count: document.querySelectorAll('img').length,
        text_block_lengths: textBlocks.slice(0, 40),
        avg_text_block_length:
          textBlocks.length > 0
            ? Math.round(textBlocks.reduce((sum, n) => sum + n, 0) / textBlocks.length)
            : 0,
        max_text_block_length: textBlocks.length > 0 ? Math.max(...textBlocks) : 0,
        headings,
        hero_text_candidates: textCandidates.slice(0, 12),
        clickable_elements: clickable.slice(0, 40),
        cta_elements: ctaElements.slice(0, 15),
        cta_above_fold: ctaElements.some((item) => item.above_fold),
        nav_elements: navElements.slice(0, 30),
        primary_nav_elements: primaryNavElements.slice(0, 12),
        nav_above_fold: navElements.some((item) => item.above_fold),
        nav_link_count: navElements.length,
        primary_nav_link_count: primaryNavElements.length,
        icon_elements: iconElements.slice(0, 30),
        icon_count: iconElements.length,
        icons_above_fold: iconElements.filter((item) => item.above_fold).length,
        icons_in_nav: iconElements.filter((item) => item.in_nav).length,
        has_structured_header: hasStructuredHeader,
        above_fold_images: aboveFoldImages.slice(0, 12),
        above_fold_image_count: aboveFoldImages.length,
        hero_image_present: aboveFoldImages.some((img) => img.width >= 200 && img.height >= 120),
        above_fold_elements: aboveFoldElements.slice(0, 25),
        visible_text_length: visibleTextLength,
        above_fold_text_length: aboveFoldTextLength,
        max_above_fold_text_block: maxAboveFoldTextBlock,
        section_count: sectionCount,
        quality_images: qualityImages.slice(0, 20),
        layout_images: layoutImages.slice(0, 20),
        layout_fitted_image_count: layoutImages.length,
        product_grid_image_count: layoutImages.filter((img) => img.in_product_grid).length,
        misaligned_image_count: misalignedImageCount,
        images_with_alt_count: imagesWithAltCount,
        font_size_stats: fontSizeStats,
        animation_detected: animationDetected,
        disruptive_motion: disruptiveMotion,
        text_density: Number(textDensity.toFixed(6)),
        mobile_text_density: mobileTextDensity,
        contrast_samples: contrastSamples,
        hero_heading: heroHeading,
        bullet_count: bulletCount,
        heading_to_body_ratio:
          visibleTextLength > 0 ? Number((headings.length / Math.max(1, visibleTextLength / 200)).toFixed(3)) : 0,
        template_debt_signals: templateDebtSignals,
        duplicate_copy_count: duplicateCopyCount,
      }
    },
    { ctaPatternSource: CTA_PATTERN.source },
  )

  return {
    ...metrics,
    viewport: viewportSize,
    emulation_mode: meta.emulationMode || 'unknown',
    device_name: meta.deviceName || null,
  }
}

function scoreContrastSamples(samples = []) {
  const ratios = []
  for (const sample of samples) {
    const fg = parseRgb(sample.color)
    const bg = parseRgb(sample.background)
    if (!fg) continue
    const bgChannels = bg || { r: 255, g: 255, b: 255 }
    const ratio = contrastRatio(luminance(fg.r, fg.g, fg.b), luminance(bgChannels.r, bgChannels.g, bgChannels.b))
    if (ratio >= 1.8) ratios.push(ratio)
  }
  if (!ratios.length) return null
  const sorted = [...ratios].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const avg = ratios.reduce((sum, n) => sum + n, 0) / ratios.length
  const min = sorted[0]
  return {
    average_ratio: Number(avg.toFixed(2)),
    min_ratio: Number(min.toFixed(2)),
    median_ratio: Number(median.toFixed(2)),
    sample_count: ratios.length,
    wcag_aa_likely: median >= 4.5,
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

    const desktopContext = await browser.newContext({
      userAgent: options.userAgent || options.browserUserAgent || BROWSER_UA,
      viewport: DESKTOP_VIEWPORT,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
      locale: 'en-US',
    })
    const desktopPage = await desktopContext.newPage()
    await navigateAuditPage(desktopPage, parsed.href)

    const desktopMetrics = await collectViewportMetrics(desktopPage, {
      emulationMode: 'desktop',
    })
    const desktopEvidence = await collectVisualEvidence(desktopPage)
    const desktopScreenshot = await captureScreenshot(desktopPage)
    const finalUrl = desktopPage.url()

    const mobileDeviceName = options.mobileDevice || DEFAULT_MOBILE_DEVICE
    let mobileMetrics
    let mobileScreenshot
    let mobileDeviceLabel = mobileDeviceName

    try {
      const { name, device } = resolveMobileDeviceConfig(mobileDeviceName)
      mobileDeviceLabel = name
      const mobileContext = await browser.newContext({
        ...device,
        locale: 'en-US',
      })
      try {
        const mobilePage = await mobileContext.newPage()
        await navigateAuditPage(mobilePage, finalUrl)
        mobileMetrics = await collectViewportMetrics(mobilePage, {
          emulationMode: 'mobile_device',
          deviceName: name,
        })
        const mobileEvidence = await collectVisualEvidence(mobilePage)
        mobileMetrics.visual_evidence = mobileEvidence
        mobileScreenshot = await captureScreenshot(mobilePage)
      } finally {
        await mobileContext.close()
      }
    } catch (mobileErr) {
      await desktopContext.close()
      throw mobileErr
    }

    desktopMetrics.visual_evidence = desktopEvidence

    await desktopContext.close()

    const desktopContrast = scoreContrastSamples(desktopMetrics.contrast_samples)
    const mobileContrast = scoreContrastSamples(mobileMetrics.contrast_samples)
    const visualEvidence = summarizeVisualEvidence(desktopEvidence, mobileMetrics.visual_evidence || {})

    const auditResult = {
      enabled: true,
      ok: true,
      url: parsed.href,
      final_url: finalUrl,
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
        desktop_emulation: {
          mode: desktopMetrics.emulation_mode,
          viewport: desktopMetrics.viewport,
        },
        mobile_emulation: {
          mode: mobileMetrics.emulation_mode,
          device: mobileMetrics.device_name,
          viewport: mobileMetrics.viewport,
        },
        page_height: desktopMetrics.page_height,
        scroll_depth_ratio: desktopMetrics.scroll_depth_ratio,
        desktop_text_density: visualEvidence.desktop_text_density || desktopMetrics.text_density,
        mobile_text_density: visualEvidence.mobile_text_density || mobileMetrics.mobile_text_density || mobileMetrics.text_density,
        mobile_text_density_score: visualEvidence.mobile_text_density_score,
        desktop_text_density_score: visualEvidence.desktop_text_density_score,
        density_confidence: visualEvidence.density_confidence,
        high_mobile_text_density: visualEvidence.high_mobile_text_density,
        cta_above_fold: desktopMetrics.cta_above_fold || mobileMetrics.cta_above_fold,
        nav_above_fold: desktopMetrics.nav_above_fold || mobileMetrics.nav_above_fold,
        horizontal_overflow_desktop: desktopMetrics.horizontal_overflow,
        horizontal_overflow_mobile: mobileMetrics.horizontal_overflow,
        overflow_severity_desktop: desktopMetrics.overflow_severity,
        overflow_severity_mobile: mobileMetrics.overflow_severity,
        has_mobile_viewport:
          desktopMetrics.has_mobile_viewport || mobileMetrics.has_mobile_viewport,
        image_count: Math.max(desktopMetrics.image_count, mobileMetrics.image_count),
        avg_text_block_length: desktopMetrics.avg_text_block_length,
        max_text_block_length: Math.max(
          desktopMetrics.max_text_block_length,
          mobileMetrics.max_text_block_length,
        ),
        nav_link_count: Math.max(desktopMetrics.nav_link_count || 0, mobileMetrics.nav_link_count || 0),
        primary_nav_link_count: Math.max(
          desktopMetrics.primary_nav_link_count || 0,
          mobileMetrics.primary_nav_link_count || 0,
        ),
        icon_count: Math.max(desktopMetrics.icon_count || 0, mobileMetrics.icon_count || 0),
        icons_above_fold: Math.max(desktopMetrics.icons_above_fold || 0, mobileMetrics.icons_above_fold || 0),
        icons_in_nav: Math.max(desktopMetrics.icons_in_nav || 0, mobileMetrics.icons_in_nav || 0),
        has_structured_header:
          desktopMetrics.has_structured_header || mobileMetrics.has_structured_header,
        above_fold_image_count: Math.max(
          desktopMetrics.above_fold_image_count || 0,
          mobileMetrics.above_fold_image_count || 0,
        ),
        hero_image_present:
          desktopMetrics.hero_image_present || mobileMetrics.hero_image_present,
        hero_heading: desktopMetrics.hero_heading || mobileMetrics.hero_heading || null,
        section_count: Math.max(desktopMetrics.section_count || 0, mobileMetrics.section_count || 0),
        above_fold_text_length: Math.max(
          desktopMetrics.above_fold_text_length || 0,
          mobileMetrics.above_fold_text_length || 0,
        ),
        layout_fitted_image_count: Math.max(
          desktopMetrics.layout_fitted_image_count || 0,
          mobileMetrics.layout_fitted_image_count || 0,
        ),
        product_grid_image_count: Math.max(
          desktopMetrics.product_grid_image_count || 0,
          mobileMetrics.product_grid_image_count || 0,
        ),
        misaligned_image_count: visualEvidence.misaligned_image_count,
        misalignment_confidence: visualEvidence.misalignment_confidence,
        evidence_confidence: visualEvidence.evidence_confidence,
        visual_issues: visualEvidence.high_confidence_issues,
        template_debt_signals: [
          ...new Set([
            ...(desktopMetrics.template_debt_signals || []),
            ...(mobileMetrics.template_debt_signals || []),
          ]),
        ],
        duplicate_copy_count: Math.max(
          desktopMetrics.duplicate_copy_count || 0,
          mobileMetrics.duplicate_copy_count || 0,
        ),
      },
      evidence_snippets: {
        desktop_nav: (desktopMetrics.nav_elements || []).slice(0, 5).map((n) => n.text),
        mobile_nav: (mobileMetrics.nav_elements || []).slice(0, 5).map((n) => n.text),
        h1: (desktopMetrics.headings || []).find((h) => h.tag === 'h1')?.text || null,
        hero_heading: desktopMetrics.hero_heading?.text || mobileMetrics.hero_heading?.text || null,
        hero_heading_source: desktopMetrics.hero_heading?.source || mobileMetrics.hero_heading?.source || null,
        cta_samples: [...(desktopMetrics.cta_elements || []), ...(mobileMetrics.cta_elements || [])]
          .slice(0, 5)
          .map((c) => c.text),
      },
      visual_evidence: visualEvidence,
    }

    await saveDebugVisualAuditArtifacts({
      hostname: new URL(finalUrl).hostname,
      desktopScreenshot,
      mobileScreenshot,
      desktopEvidence,
      mobileEvidence: mobileMetrics.visual_evidence || {},
      summary: auditResult.summary,
    }).catch(() => {})

    return auditResult
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
    if (clone[viewport]?.metrics?.visual_evidence) {
      const evidence = clone[viewport].metrics.visual_evidence
      clone[viewport].metrics.visual_evidence = {
        viewport: evidence.viewport,
        image_alignment: evidence.image_alignment,
        text_density: evidence.text_density,
        issues: evidence.issues,
      }
    }
  }
  if (clone.visual_evidence) {
    clone.visual_evidence = {
      ...clone.visual_evidence,
      high_confidence_issues: clone.visual_evidence.high_confidence_issues,
      medium_confidence_issues: clone.visual_evidence.medium_confidence_issues,
    }
  }
  return clone
}

module.exports = {
  isVisualAuditEnabled,
  isPlaywrightAvailable,
  runVisualAudit,
  collectViewportMetrics,
  navigateAuditPage,
  resolveMobileDeviceConfig,
  stripScreenshotsForStorage,
  DESKTOP_VIEWPORT,
  MOBILE_VIEWPORT,
  DEFAULT_MOBILE_DEVICE,
  CTA_PATTERN,
}
