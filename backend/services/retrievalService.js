const { query } = require('../db')
const { getBusinessWebProfile } = require('./businessProfileService')
const { loadRecentScans, loadActionItems } = require('./contextService')
const { listMemories } = require('./memoryService')

async function searchWebsiteChunks({ userId, businessId, queryText, limit = 5 }) {
  const q = String(queryText || '').trim()
  if (!q) return []

  const result = await query(
    `SELECT wtc.content, wtc.metadata_json, wp.url, wp.title,
            ts_rank(to_tsvector('english', wtc.content), plainto_tsquery('english', $3)) AS rank
     FROM website_text_chunks wtc
     JOIN website_pages wp ON wp.id = wtc.page_id
     WHERE wtc.user_id = $1 AND wtc.business_id = $2
       AND to_tsvector('english', wtc.content) @@ plainto_tsquery('english', $3)
     ORDER BY rank DESC
     LIMIT $4`,
    [userId, businessId, q, limit],
  )

  return result.rows.map((row) => ({
    content: row.content,
    url: row.url,
    title: row.title,
    metadata: row.metadata_json,
    rank: row.rank,
  }))
}

async function getBusinessContext({ userId, businessId, query: queryText, limit = 5 }) {
  const [profile, chunks, scans, actions, memories] = await Promise.all([
    getBusinessWebProfile(userId, businessId),
    searchWebsiteChunks({ userId, businessId, queryText, limit }),
    loadRecentScans(userId, 3),
    loadActionItems(userId, 10),
    listMemories(userId),
  ])

  const businessScans = (scans || []).filter((s) => s.business_id === businessId)
  const businessActions = (actions || []).filter((a) => a.business_id === businessId)
  const businessMemories = (memories || []).filter(
    (m) => !m.business_id || m.business_id === businessId,
  )

  const sources = chunks.map((c) => ({ url: c.url, title: c.title }))

  return {
    profile,
    website_chunks: chunks,
    scans: businessScans,
    actions: businessActions,
    memories: businessMemories.slice(0, 15),
    sources: [...new Map(sources.map((s) => [s.url, s])).values()],
    query: queryText || null,
  }
}

module.exports = {
  getBusinessContext,
  searchWebsiteChunks,
}
