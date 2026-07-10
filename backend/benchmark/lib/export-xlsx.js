const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

function pickFirst(list, fallback = '') {
  if (!Array.isArray(list) || list.length === 0) return fallback
  return String(list[0] || fallback)
}

function rowFromResult(result) {
  const { fixture, status, error, crawl, scores, aggregated, visualAudit, rubric } = result
  const siteClass = aggregated?.site_classification?.classification || ''
  const fit = scores?.category_details?.offer_business_fit || {}

  return {
    id: fixture.id,
    url: fixture.url,
    category: fixture.category,
    business_model: fixture.business_model,
    ui_tier: fixture.ui_tier,
    notes: fixture.notes || '',
    status,
    error: error || '',
    overall_score: scores?.overall_score ?? '',
    human_score_20: scores?.overall_score != null ? Math.round((scores.overall_score / 5) * 10) / 10 : '',
    safety_score: scores?.safety_score ?? '',
    functionality_score: scores?.functionality_score ?? '',
    ux_ui_score: scores?.ux_ui_score ?? '',
    business_fit_score: scores?.business_fit_score ?? '',
    customer_attraction_score: scores?.customer_attraction_score ?? '',
    confidence_score: scores?.confidence_score ?? '',
    scoring_rubric: scores?.scoring_rubric || rubric || '',
    site_classification: siteClass,
    pages_crawled: crawl?.pages_crawled ?? '',
    pages_failed: crawl?.pages_failed ?? '',
    products_found: aggregated?.high_confidence_products?.length ?? aggregated?.products?.length ?? 0,
    platform: aggregated?.platform || '',
    visual_audit_ok: visualAudit?.ok ? 'yes' : 'no',
    visual_audit_error: visualAudit?.error || visualAudit?.reason || '',
    top_strength: pickFirst(scores?.strengths || fit.strengths),
    top_problem: pickFirst(scores?.risks || fit.problems),
    top_business_fit_strength: pickFirst(fit.strengths),
    top_business_fit_problem: pickFirst(fit.problems),
    crawl_ms: result.crawl_ms ?? '',
    analyze_ms: result.analyze_ms ?? '',
    total_ms: result.total_ms ?? '',
  }
}

function categorySummaryRows(results) {
  const byCategory = new Map()

  for (const result of results) {
    const key = result.fixture.category
    if (!byCategory.has(key)) {
      byCategory.set(key, {
        category: key,
        sites: 0,
        ok: 0,
        failed: 0,
        overall_sum: 0,
        ux_sum: 0,
        fit_sum: 0,
        overall_count: 0,
      })
    }
    const bucket = byCategory.get(key)
    bucket.sites += 1
    if (result.status === 'ok' && result.scores) {
      bucket.ok += 1
      bucket.overall_sum += result.scores.overall_score || 0
      bucket.ux_sum += result.scores.ux_ui_score || 0
      bucket.fit_sum += result.scores.business_fit_score || 0
      bucket.overall_count += 1
    } else {
      bucket.failed += 1
    }
  }

  return [...byCategory.values()].map((bucket) => ({
    category: bucket.category,
    sites: bucket.sites,
    completed: bucket.ok,
    failed: bucket.failed,
    avg_overall: bucket.overall_count ? Math.round((bucket.overall_sum / bucket.overall_count) * 10) / 10 : '',
    avg_ux_ui: bucket.overall_count ? Math.round((bucket.ux_sum / bucket.overall_count) * 10) / 10 : '',
    avg_business_fit: bucket.overall_count ? Math.round((bucket.fit_sum / bucket.overall_count) * 10) / 10 : '',
  }))
}

function uiTierSummaryRows(results) {
  const byTier = new Map()

  for (const result of results) {
    const key = result.fixture.ui_tier || 'unknown'
    if (!byTier.has(key)) {
      byTier.set(key, { ui_tier: key, sites: 0, overall_sum: 0, ux_sum: 0, count: 0 })
    }
    const bucket = byTier.get(key)
    bucket.sites += 1
    if (result.status === 'ok' && result.scores) {
      bucket.overall_sum += result.scores.overall_score || 0
      bucket.ux_sum += result.scores.ux_ui_score || 0
      bucket.count += 1
    }
  }

  return [...byTier.values()].map((bucket) => ({
    ui_tier: bucket.ui_tier,
    sites: bucket.sites,
    avg_overall: bucket.count ? Math.round((bucket.overall_sum / bucket.count) * 10) / 10 : '',
    avg_ux_ui: bucket.count ? Math.round((bucket.ux_sum / bucket.count) * 10) / 10 : '',
  }))
}

function writeWorkbook(results, outputPath) {
  const rows = results.map(rowFromResult)
  const summary = categorySummaryRows(results)
  const tierSummary = uiTierSummaryRows(results)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'All Sites')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'By Category')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(tierSummary), 'By UI Tier')

  const dir = path.dirname(outputPath)
  fs.mkdirSync(dir, { recursive: true })
  XLSX.writeFile(wb, outputPath)

  const csvPath = outputPath.replace(/\.xlsx$/i, '.csv')
  const csvOnly = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows))
  fs.writeFileSync(csvPath, csvOnly, 'utf8')

  return { xlsxPath: outputPath, csvPath }
}

module.exports = {
  rowFromResult,
  writeWorkbook,
}
