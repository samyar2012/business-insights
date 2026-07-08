const fs = require('node:fs')
const path = require('node:path')

const ALIGN_TOP_DELTA_PX = 24
const ALIGN_SIZE_DELTA_RATIO = 0.18
const MIN_COMPARABLE_IMAGES = 3
const HIGH_CONFIDENCE = 0.75
const MEDIUM_CONFIDENCE = 0.6

function isDebugVisualAuditEnabled() {
  return process.env.DEBUG_VISUAL_AUDIT === 'true'
}

function round2(value) {
  return Number(Number(value).toFixed(2))
}

function bboxArea(box) {
  if (!box) return 0
  return Math.max(0, box.width) * Math.max(0, box.height)
}

function boxesOverlap(a, b) {
  if (!a || !b) return false
  return !(
    a.left + a.width <= b.left ||
    b.left + b.width <= a.left ||
    a.top + a.height <= b.top ||
    b.top + b.height <= a.top
  )
}

function sectionForPoint(sections, x, y) {
  for (const section of sections) {
    const box = section.bbox
    if (!box) continue
    if (x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height) {
      return section
    }
  }
  return null
}

function groupImagesBySection(images, sections) {
  const groups = new Map()
  for (const image of images) {
    const centerX = image.bbox.left + image.bbox.width / 2
    const centerY = image.bbox.top + image.bbox.height / 2
    const section = sectionForPoint(sections, centerX, centerY)
    const key = section?.id || image.section_id || 'ungrouped'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(image)
  }
  return groups
}

function clusterImagesIntoRows(images, rowTolerance = 20) {
  const sorted = [...images].sort((a, b) => a.bbox.top - b.bbox.top || a.bbox.left - b.bbox.left)
  const rows = []
  for (const image of sorted) {
    const row = rows.find((candidate) => Math.abs(candidate.top - image.bbox.top) <= rowTolerance)
    if (row) {
      row.images.push(image)
      row.top = (row.top * (row.images.length - 1) + image.bbox.top) / row.images.length
    } else {
      rows.push({ top: image.bbox.top, images: [image] })
    }
  }
  return rows
}

function comparableGridImages(images) {
  return images.filter((image) => {
    if (image.decorative) return false
    if (image.bbox.width < 40 || image.bbox.height < 40) return false
    if (!image.in_grid && !image.in_product_grid) return false
    return true
  })
}

function detectImageAlignmentIssues(images = [], sections = []) {
  const issues = []
  let misalignedImageCount = 0
  let maxConfidence = 0

  const visibleImages = images.filter((image) => image.visible !== false)
  const sectionGroups = groupImagesBySection(visibleImages, sections)

  for (const [sectionId, sectionImages] of sectionGroups.entries()) {
    const gridImages = comparableGridImages(sectionImages)
    if (gridImages.length < MIN_COMPARABLE_IMAGES) continue

    const rows = clusterImagesIntoRows(gridImages)
    for (const row of rows) {
      if (row.images.length < MIN_COMPARABLE_IMAGES) continue

      const tops = row.images.map((image) => image.bbox.top)
      const widths = row.images.map((image) => image.bbox.width)
      const heights = row.images.map((image) => image.bbox.height)
      const maxTopDelta = Math.max(...tops) - Math.min(...tops)
      const avgWidth = widths.reduce((sum, n) => sum + n, 0) / widths.length
      const avgHeight = heights.reduce((sum, n) => sum + n, 0) / heights.length
      const maxWidthDelta = Math.max(...widths.map((w) => Math.abs(w - avgWidth)))
      const maxHeightDelta = Math.max(...heights.map((h) => Math.abs(h - avgHeight)))
      const widthDeltaRatio = avgWidth > 0 ? maxWidthDelta / avgWidth : 0
      const heightDeltaRatio = avgHeight > 0 ? maxHeightDelta / avgHeight : 0

      const topMisaligned = maxTopDelta > ALIGN_TOP_DELTA_PX
      const sizeMisaligned =
        widthDeltaRatio > ALIGN_SIZE_DELTA_RATIO || heightDeltaRatio > ALIGN_SIZE_DELTA_RATIO
      if (!topMisaligned && !sizeMisaligned) continue

      const topScore = Math.min(1, maxTopDelta / (ALIGN_TOP_DELTA_PX * 2))
      const sizeScore = Math.min(1, Math.max(widthDeltaRatio, heightDeltaRatio) / (ALIGN_SIZE_DELTA_RATIO * 2))
      const countScore = Math.min(1, row.images.length / 6)
      let confidence = 0.42 + countScore * 0.15
      if (topMisaligned) confidence += topScore * 0.25
      if (sizeMisaligned) confidence += sizeScore * 0.3
      confidence = round2(Math.min(0.98, confidence))

      if (confidence < MEDIUM_CONFIDENCE) continue

      misalignedImageCount += row.images.length
      maxConfidence = Math.max(maxConfidence, confidence)

      issues.push({
        category: 'image_alignment',
        severity: confidence >= HIGH_CONFIDENCE ? 'high' : 'medium',
        confidence,
        message:
          confidence >= HIGH_CONFIDENCE
            ? `Image alignment issue detected with ${confidence} confidence: ${row.images.length} images in the ${sectionId} grid have inconsistent ${topMisaligned ? `top alignment greater than ${ALIGN_TOP_DELTA_PX}px` : 'rendered dimensions'}.`
            : `Possible image alignment inconsistency in ${sectionId} (${row.images.length} images, confidence ${confidence}).`,
        evidence: {
          section_id: sectionId,
          image_count: row.images.length,
          max_top_delta_px: Math.round(maxTopDelta),
          max_width_delta_ratio: round2(widthDeltaRatio),
          max_height_delta_ratio: round2(heightDeltaRatio),
          bounding_boxes: row.images.map((image) => image.bbox),
        },
      })
    }
  }

  return {
    misaligned_image_count: misalignedImageCount,
    misalignment_confidence: round2(maxConfidence),
    issues,
    evaluated_image_count: visibleImages.length,
    reliable: maxConfidence >= HIGH_CONFIDENCE || issues.length === 0,
  }
}

function dedupeLeafTextBlocks(blocks = []) {
  return blocks.filter((block, index) => {
    return !blocks.some((other, otherIndex) => {
      if (index === otherIndex) return false
      const a = block.bbox
      const b = other.bbox
      if (!a || !b) return false
      const contained =
        a.left >= b.left &&
        a.top >= b.top &&
        a.left + a.width <= b.left + b.width &&
        a.top + a.height <= b.top + b.height
      return contained && (other.characters || 0) >= (block.characters || 0)
    })
  })
}

function calculateAboveFoldTextDensity(viewport = {}, visibleTextBlocks = [], headingsAboveFold = []) {
  const viewportHeight = viewport.height || 0
  const viewportWidth = viewport.width || 0
  const viewportArea = viewportWidth * viewportHeight
  const leafBlocks = dedupeLeafTextBlocks(
    visibleTextBlocks.filter(
      (block) => block.visible !== false && block.bbox.top < viewportHeight && block.bbox.bottom > 0,
    ),
  )

  const characterCount = leafBlocks.reduce((sum, block) => sum + (block.characters || 0), 0)
  const largestBlock = leafBlocks.reduce((max, block) => Math.max(max, block.characters || 0), 0)
  const textArea = leafBlocks.reduce((sum, block) => sum + bboxArea(block.bbox), 0)
  const rawAreaRatio = viewportArea > 0 ? textArea / viewportArea : 0
  const visibleTextAreaRatio = Math.min(1, rawAreaRatio)
  const headingCount = headingsAboveFold.length
  const blockCount = leafBlocks.length
  const tightLineHeightBlocks = leafBlocks.filter((block) => block.line_height_tight).length
  const overlappingBlocks = leafBlocks.filter((block, index) =>
    leafBlocks.some((other, otherIndex) => otherIndex > index && boxesOverlap(block.bbox, other.bbox)),
  ).length
  const overlapRatio = blockCount > 0 ? overlappingBlocks / blockCount : 0
  const domArtifactHeavy = rawAreaRatio > 1.2 || overlapRatio > 0.45

  const headingSeparationWeak = headingCount < 2 && largestBlock >= 360
  const areaHigh = visibleTextAreaRatio >= 0.42 && !domArtifactHeavy
  const blockLarge = largestBlock >= 480
  const wallOfText = largestBlock >= 620 || (largestBlock >= 520 && headingCount < 2)
  const overcrowded =
    blockCount >= 14 &&
    largestBlock >= 380 &&
    visibleTextAreaRatio >= 0.5 &&
    overlapRatio < 0.35 &&
    !domArtifactHeavy

  const highDensity =
    wallOfText ||
    (areaHigh && blockLarge && headingSeparationWeak) ||
    overcrowded ||
    (tightLineHeightBlocks >= 5 && largestBlock >= 420 && visibleTextAreaRatio >= 0.45 && !domArtifactHeavy)

  let confidence = 0.35
  if (highDensity) {
    confidence = 0.58
    if (wallOfText) confidence += 0.2
    if (blockLarge) confidence += 0.1
    if (areaHigh) confidence += 0.08
    if (headingSeparationWeak) confidence += 0.08
    if (overcrowded) confidence += 0.06
    confidence = Math.min(0.95, confidence)
  } else if (domArtifactHeavy) {
    confidence = 0.4
  } else if (blockCount > 0) {
    confidence = 0.78
  }

  const densityScore = highDensity
    ? Math.max(25, 100 - Math.round(visibleTextAreaRatio * 120) - Math.round(largestBlock / 10))
    : Math.min(94, 72 + Math.round((1 - visibleTextAreaRatio) * 18))

  const issue =
    highDensity && confidence >= MEDIUM_CONFIDENCE
      ? {
          category: 'mobile_text_density',
          severity: confidence >= HIGH_CONFIDENCE ? 'high' : 'medium',
          confidence: round2(confidence),
          message:
            confidence >= HIGH_CONFIDENCE
              ? `Largest above-fold text block is ${largestBlock} characters with only ${headingCount} heading separator(s); visible text covers ${Math.round(visibleTextAreaRatio * 100)}% of the viewport.`
              : `Above-fold text may be dense (${largestBlock} characters in the largest block, confidence ${round2(confidence)}).`,
          evidence: {
            visible_text_area_ratio: round2(visibleTextAreaRatio),
            raw_area_ratio: round2(rawAreaRatio),
            above_fold_character_count: characterCount,
            largest_block_characters: largestBlock,
            block_count: blockCount,
            heading_count_above_fold: headingCount,
            overlapping_blocks: overlappingBlocks,
            overlap_ratio: round2(overlapRatio),
            dom_artifact_heavy: domArtifactHeavy,
            tight_line_height_blocks: tightLineHeightBlocks,
          },
        }
      : null

  return {
    mobile_text_density_score: densityScore,
    density_confidence: round2(confidence),
    high_density: highDensity && confidence >= MEDIUM_CONFIDENCE,
    density_value: viewportArea > 0 ? round2(characterCount / viewportArea) : 0,
    evidence: {
      visible_text_area_ratio: round2(visibleTextAreaRatio),
      raw_area_ratio: round2(rawAreaRatio),
      above_fold_character_count: characterCount,
      largest_block_characters: largestBlock,
      block_count: blockCount,
      heading_count_above_fold: headingCount,
      overlapping_blocks: overlappingBlocks,
      overlap_ratio: round2(overlapRatio),
      dom_artifact_heavy: domArtifactHeavy,
      tight_line_height_blocks: tightLineHeightBlocks,
    },
    issue,
  }
}

async function collectVisualEvidence(page) {
  const viewport = page.viewportSize() || { width: 1280, height: 800 }
  const payload = await page.evaluate(() => {
    const isVisible = (el) => {
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false
      }
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }

    const toBox = (rect) => ({
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
    })

    const styleSnapshot = (el) => {
      const style = window.getComputedStyle(el)
      return {
        font_size_px: Number.parseFloat(style.fontSize) || null,
        font_weight: style.fontWeight || null,
        line_height_px: Number.parseFloat(style.lineHeight) || null,
        color: style.color || null,
        background_color: style.backgroundColor || null,
        display: style.display || null,
        position: style.position || null,
        margin_top: style.marginTop || null,
        margin_bottom: style.marginBottom || null,
        gap: style.gap || null,
      }
    }

    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    const sections = []
    let sectionIndex = 0
    document
      .querySelectorAll('main section, main article, [role="main"] section, [role="main"] article, section, article')
      .forEach((el) => {
        if (!isVisible(el)) return
        const rect = el.getBoundingClientRect()
        if (rect.height < 40 || rect.width < 80) return
        sectionIndex += 1
        sections.push({
          id: `section-${sectionIndex}`,
          tag: el.tagName.toLowerCase(),
          bbox: toBox(rect),
          text_length: (el.innerText || '').replace(/\s+/g, ' ').trim().length,
        })
      })

    const textBlocks = []
    document.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6').forEach((el) => {
      if (!isVisible(el)) return
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim()
      if (text.length < 20) return
      const rect = el.getBoundingClientRect()
      const style = window.getComputedStyle(el)
      const fontSize = Number.parseFloat(style.fontSize) || 0
      const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2
      const lineHeightTight = fontSize > 0 && lineHeight / fontSize < 1.25
      textBlocks.push({
        tag: el.tagName.toLowerCase(),
        characters: text.length,
        bbox: toBox(rect),
        above_fold: rect.top < viewportHeight && rect.bottom > 0,
        visible: true,
        line_height_tight: lineHeightTight,
        styles: styleSnapshot(el),
      })
    })

    const headings = []
    document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el) => {
      if (!isVisible(el)) return
      const text = (el.innerText || '').replace(/\s+/g, ' ').trim()
      if (!text) return
      const rect = el.getBoundingClientRect()
      headings.push({
        tag: el.tagName.toLowerCase(),
        text: text.slice(0, 120),
        bbox: toBox(rect),
        above_fold: rect.top < viewportHeight && rect.bottom > 0,
        styles: styleSnapshot(el),
      })
    })

    const images = []
    document.querySelectorAll('img').forEach((el, index) => {
      if (!isVisible(el)) return
      const rect = el.getBoundingClientRect()
      const inNav = Boolean(el.closest('nav, header, [role="navigation"]'))
      const inGrid = Boolean(
        el.closest(
          '[class*="grid" i], [class*="product" i], [class*="card" i], [class*="gallery" i], ul, ol, [role="list"]',
        ),
      )
      const inProductGrid = Boolean(
        el.closest(
          '[class*="product" i], [data-product-id], [data-product], .product-card, .grid__item, [class*="collection-grid" i], [class*="product-grid" i], [class*="product-item" i], .card__media, .product-media',
        ),
      )
      images.push({
        id: `img-${index + 1}`,
        alt: (el.getAttribute('alt') || '').trim(),
        bbox: toBox(rect),
        natural_width: el.naturalWidth || 0,
        natural_height: el.naturalHeight || 0,
        rendered_width: Math.round(rect.width),
        rendered_height: Math.round(rect.height),
        above_fold: rect.top < viewportHeight && rect.bottom > 0,
        visible: true,
        decorative: inNav && rect.width < 56 && rect.height < 56,
        in_grid: inGrid,
        in_product_grid: inProductGrid,
        styles: styleSnapshot(el),
      })
    })

    const navElements = []
    document.querySelectorAll('nav a, header nav a, [role="navigation"] a').forEach((el) => {
      if (!isVisible(el)) return
      const text = (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()
      if (!text) return
      navElements.push({
        text: text.slice(0, 80),
        bbox: toBox(el.getBoundingClientRect()),
        above_fold: el.getBoundingClientRect().top < viewportHeight,
      })
    })

    const headerEl = document.querySelector('header, [role="banner"]')
    const header = headerEl && isVisible(headerEl)
      ? { bbox: toBox(headerEl.getBoundingClientRect()), link_count: navElements.length }
      : null

    const ctas = []
    document.querySelectorAll('a, button, [role="button"]').forEach((el) => {
      if (!isVisible(el)) return
      const text = (el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim()
      if (text.length < 2 || text.length > 80) return
      const rect = el.getBoundingClientRect()
      ctas.push({
        text: text.slice(0, 80),
        tag: el.tagName.toLowerCase(),
        bbox: toBox(rect),
        above_fold: rect.top < viewportHeight && rect.bottom > 0,
        styles: styleSnapshot(el),
      })
    })

    return {
      viewport: { width: viewportWidth, height: viewportHeight },
      sections: sections.slice(0, 40),
      text_blocks: textBlocks.slice(0, 120),
      headings: headings.slice(0, 40),
      images: images.slice(0, 120),
      nav_elements: navElements.slice(0, 40),
      header,
      ctas: ctas.slice(0, 60),
    }
  })

  const headingsAboveFold = payload.headings.filter((heading) => heading.above_fold)
  const alignment = detectImageAlignmentIssues(payload.images, payload.sections)
  const density = calculateAboveFoldTextDensity(payload.viewport, payload.text_blocks, headingsAboveFold)

  return {
    ...payload,
    image_alignment: alignment,
    text_density: density,
    issues: [...alignment.issues, ...(density.issue ? [density.issue] : [])],
  }
}

function summarizeVisualEvidence(desktopEvidence = {}, mobileEvidence = {}) {
  const desktopAlignment = desktopEvidence.image_alignment || {}
  const mobileAlignment = mobileEvidence.image_alignment || {}
  const desktopDensity = desktopEvidence.text_density || {}
  const mobileDensity = mobileEvidence.text_density || {}

  const alignmentConfidence = Math.max(
    desktopAlignment.misalignment_confidence || 0,
    mobileAlignment.misalignment_confidence || 0,
  )
  const misalignedImageCount =
    alignmentConfidence >= HIGH_CONFIDENCE
      ? Math.max(desktopAlignment.misaligned_image_count || 0, mobileAlignment.misaligned_image_count || 0)
      : 0

  const densityConfidence = mobileDensity.density_confidence || desktopDensity.density_confidence || 0
  const mobileLargestBlock = mobileDensity.evidence?.largest_block_characters || 0
  const mobileHighDensityReliable =
    Boolean(mobileDensity.high_density) &&
    densityConfidence >= MEDIUM_CONFIDENCE &&
    mobileLargestBlock >= 360 &&
    !mobileDensity.evidence?.dom_artifact_heavy

  const mobileTextDensity = mobileDensity.density_value || 0
  const desktopTextDensity = desktopDensity.density_value || 0
  const highMobileDensity = mobileHighDensityReliable

  const issues = [
    ...(desktopEvidence.issues || []),
    ...(mobileEvidence.issues || []),
  ].filter((issue) => {
    if (issue.confidence < MEDIUM_CONFIDENCE) return false
    if (issue.category === 'mobile_text_density' && !mobileHighDensityReliable) return false
    return true
  })

  return {
    misaligned_image_count: misalignedImageCount,
    misalignment_confidence: alignmentConfidence,
    mobile_text_density: mobileTextDensity,
    desktop_text_density: desktopTextDensity,
    mobile_text_density_score: mobileDensity.mobile_text_density_score,
    desktop_text_density_score: desktopDensity.mobile_text_density_score,
    density_confidence: densityConfidence,
    high_mobile_text_density: highMobileDensity,
    issues,
    high_confidence_issues: issues.filter((issue) => issue.confidence >= HIGH_CONFIDENCE),
    medium_confidence_issues: issues.filter(
      (issue) => issue.confidence >= MEDIUM_CONFIDENCE && issue.confidence < HIGH_CONFIDENCE,
    ),
    evidence_confidence: round2(
      Math.max(alignmentConfidence, densityConfidence, issues.length ? MEDIUM_CONFIDENCE : 0.4),
    ),
  }
}

async function saveDebugVisualAuditArtifacts({
  hostname,
  desktopScreenshot,
  mobileScreenshot,
  desktopEvidence,
  mobileEvidence,
  summary,
}) {
  if (!isDebugVisualAuditEnabled()) return null

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const safeHost = String(hostname || 'site').replace(/[^a-z0-9.-]/gi, '_')
  const dir = path.join(process.cwd(), 'debug', 'visual-audits', `${stamp}-${safeHost}`)
  fs.mkdirSync(dir, { recursive: true })

  const manifest = {
    captured_at: new Date().toISOString(),
    hostname: safeHost,
    summary,
    desktop: {
      viewport: desktopEvidence?.viewport || null,
      issue_count: desktopEvidence?.issues?.length || 0,
      alignment: desktopEvidence?.image_alignment || null,
      text_density: desktopEvidence?.text_density || null,
    },
    mobile: {
      viewport: mobileEvidence?.viewport || null,
      issue_count: mobileEvidence?.issues?.length || 0,
      alignment: mobileEvidence?.image_alignment || null,
      text_density: mobileEvidence?.text_density || null,
    },
  }

  fs.writeFileSync(path.join(dir, 'evidence.json'), JSON.stringify(manifest, null, 2))

  if (desktopScreenshot?.base64) {
    fs.writeFileSync(path.join(dir, 'desktop.jpg'), Buffer.from(desktopScreenshot.base64, 'base64'))
  }
  if (mobileScreenshot?.base64) {
    fs.writeFileSync(path.join(dir, 'mobile.jpg'), Buffer.from(mobileScreenshot.base64, 'base64'))
  }

  return dir
}

module.exports = {
  ALIGN_TOP_DELTA_PX,
  ALIGN_SIZE_DELTA_RATIO,
  MIN_COMPARABLE_IMAGES,
  HIGH_CONFIDENCE,
  MEDIUM_CONFIDENCE,
  isDebugVisualAuditEnabled,
  detectImageAlignmentIssues,
  calculateAboveFoldTextDensity,
  collectVisualEvidence,
  summarizeVisualEvidence,
  saveDebugVisualAuditArtifacts,
}
