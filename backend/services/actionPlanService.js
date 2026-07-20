const { query } = require('../db')
const {
  buildFixMetadata,
  normalizeFixesFromScores,
  mapFixPriority,
  isWebsiteFixAction,
  CATEGORY_LABELS,
} = require('./actionPlanFixBuilder')
const { getBusinessWebProfile } = require('./businessProfileService')
const { getCrawlPages, listCrawlRuns } = require('./crawler/crawlerService')

async function loadScoresFromWebProfile(userId, businessId) {
  const businessResult = await query(`SELECT * FROM businesses WHERE id = $1 AND user_id = $2`, [
    businessId,
    userId,
  ])
  const business = businessResult.rows[0]
  if (!business) return null

  const crawls = await listCrawlRuns(userId, businessId)
  const latestCrawl = crawls[0] || null
  let pages = []
  if (latestCrawl) {
    pages = await getCrawlPages(userId, latestCrawl.id)
  }

  const profile = await getBusinessWebProfile(userId, businessId, {
    rehydrateScores: true,
    business,
    pages,
    crawlRun: latestCrawl,
    startUrl: latestCrawl?.start_url || business.store_url,
  })

  return profile?.scores || null
}

function parseMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value
}

function formatAction(row) {
  const metadata = parseMetadata(row.metadata_json)
  return {
    id: row.id,
    user_id: row.user_id,
    business_id: row.business_id,
    business_name: row.business_name || null,
    scan_id: row.scan_id,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    source: row.source,
    metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
  }
}

const ACTION_SELECT = `
  SELECT a.*, b.business_name
  FROM action_items a
  LEFT JOIN businesses b ON b.id = a.business_id
`

async function listActions(userId, { status, business_id } = {}) {
  const clauses = ['a.user_id = $1']
  const params = [userId]
  let idx = 2

  if (status) {
    clauses.push(`a.status = $${idx++}`)
    params.push(status)
  }
  if (business_id) {
    clauses.push(`a.business_id = $${idx++}`)
    params.push(business_id)
  }

  const result = await query(
    `${ACTION_SELECT}
     WHERE ${clauses.join(' AND ')}
     ORDER BY
       CASE a.status WHEN 'todo' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
       CASE a.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       a.created_at DESC`,
    params,
  )
  return result.rows.map(formatAction)
}

async function createAction(userId, body) {
  const title = String(body.title || '').trim()
  if (!title) throw new Error('title is required')

  const status = body.status || 'todo'
  const priority = body.priority || 'medium'
  if (!['todo', 'in_progress', 'done'].includes(status)) throw new Error('Invalid status')
  if (!['low', 'medium', 'high'].includes(priority)) throw new Error('Invalid priority')

  const metadata = parseMetadata(body.metadata)

  const result = await query(
    `INSERT INTO action_items (
       user_id, business_id, scan_id, title, description, status, priority, source, completed_at, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      userId,
      body.business_id || null,
      body.scan_id || null,
      title,
      body.description || null,
      status,
      priority,
      body.source || 'manual',
      status === 'done' ? new Date().toISOString() : null,
      JSON.stringify(metadata),
    ],
  )

  const joined = await query(`${ACTION_SELECT} WHERE a.id = $1`, [result.rows[0].id])
  return formatAction(joined.rows[0])
}

async function updateAction(userId, actionId, body) {
  const existing = await query(`SELECT * FROM action_items WHERE id = $1 AND user_id = $2`, [
    actionId,
    userId,
  ])
  if (!existing.rows[0]) return null

  const row = existing.rows[0]
  const status = body.status ?? row.status
  const priority = body.priority ?? row.priority
  const title = body.title !== undefined ? String(body.title).trim() : row.title
  const description = body.description !== undefined ? body.description : row.description

  let completedAt = row.completed_at
  if (status === 'done' && row.status !== 'done') completedAt = new Date().toISOString()
  if (status !== 'done') completedAt = null

  await query(
    `UPDATE action_items SET
       title = $1, description = $2, status = $3, priority = $4,
       completed_at = $5, updated_at = now()
     WHERE id = $6 AND user_id = $7`,
    [title, description, status, priority, completedAt, actionId, userId],
  )

  const joined = await query(`${ACTION_SELECT} WHERE a.id = $1`, [actionId])
  return formatAction(joined.rows[0])
}

async function createFixPlanFromReport(userId, body) {
  const businessId = body.business_id || null
  if (!businessId) throw new Error('business_id is required')

  // Load from stored web profile — avoids posting the full scores blob from the client.
  const scores = (await loadScoresFromWebProfile(userId, businessId)) || body.scores || {}
  const fixes = normalizeFixesFromScores(scores)
  if (!fixes.length) {
    return {
      error: 'no_fixes',
      message: scores && Object.keys(scores).length
        ? 'No priority fixes found in this report.'
        : 'No website report found yet. Run the Website Analyzer first.',
    }
  }

  const existing = await listActions(userId, { business_id: businessId })
  const existingTitles = new Set(existing.map((item) => item.title.trim().toLowerCase()))

  const created = []
  const skipped = []
  for (const fix of fixes) {
    const title = String(fix.action || fix).trim()
    if (!title) continue
    if (existingTitles.has(title.toLowerCase())) {
      skipped.push(title)
      continue
    }

    const metadata = buildFixMetadata(fix, {
      business_id: businessId,
      scan_id: body.scan_id || null,
      scores,
    })

    const item = await createAction(userId, {
      business_id: businessId,
      scan_id: body.scan_id || null,
      title,
      description: metadata.reason || metadata.expected_impact || null,
      priority: mapFixPriority(fix.priority),
      source: 'website-report',
      metadata,
    })
    created.push(item)
    existingTitles.add(title.toLowerCase())
  }

  const actions = await listActions(userId, { business_id: businessId })
  return {
    created,
    skipped,
    actions,
    already_exists: created.length === 0 && skipped.length > 0,
  }
}

async function createActionPlanFromScan(userId, scanId) {
  const scanResult = await query(
    `SELECT s.*, b.business_name
     FROM business_scans s
     LEFT JOIN businesses b ON b.id = s.business_id
     WHERE s.id = $1 AND s.user_id = $2`,
    [scanId, userId],
  )
  const scan = scanResult.rows[0]
  if (!scan) return { error: 'not_found' }

  const existing = await query(
    `SELECT id FROM action_items WHERE user_id = $1 AND scan_id = $2 AND source = 'scan' LIMIT 1`,
    [userId, scanId],
  )
  if (existing.rows.length) {
    const actions = await listActions(userId, {})
    return {
      already_exists: true,
      actions: actions.filter((a) => a.scan_id === scanId),
    }
  }

  const resultJson = scan.result_json || {}
  const nextActions = resultJson.next_actions || []
  if (!nextActions.length) {
    return { error: 'no_actions', message: 'This scan has no next_actions to convert.' }
  }

  const created = []
  for (let i = 0; i < nextActions.length; i++) {
    const title = String(nextActions[i]).trim()
    if (!title) continue
    const priority = i === 0 ? 'high' : i < 3 ? 'medium' : 'low'
    const item = await createAction(userId, {
      business_id: scan.business_id,
      scan_id: scanId,
      title,
      description: `From scan on ${scan.business_name || 'business'} (score ${scan.overall_score}).`,
      priority,
      source: 'scan',
    })
    created.push(item)
  }

  return { already_exists: false, actions: created }
}

module.exports = {
  listActions,
  createAction,
  updateAction,
  createActionPlanFromScan,
  createFixPlanFromReport,
  loadScoresFromWebProfile,
  formatAction,
  isWebsiteFixAction,
  CATEGORY_LABELS,
}
