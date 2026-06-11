const { query } = require('../db')

const MEMORY_TYPES = new Set([
  'preference',
  'business_context',
  'tone',
  'goal',
  'audience',
  'product',
  'strategy',
])

function formatMemory(row) {
  return {
    id: row.id,
    memory_type: row.memory_type,
    key: row.key,
    value: row.value_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function listMemories(userId) {
  const result = await query(
    `SELECT * FROM user_memory WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId],
  )
  return result.rows.map(formatMemory)
}

async function upsertMemory(userId, { memory_type, key, value }) {
  if (!MEMORY_TYPES.has(memory_type)) {
    throw new Error('Invalid memory_type')
  }
  const memKey = String(key || '').trim()
  if (!memKey) throw new Error('key is required')

  const result = await query(
    `INSERT INTO user_memory (user_id, memory_type, key, value_json, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (user_id, memory_type, key)
     DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
     RETURNING *`,
    [userId, memory_type, memKey, JSON.stringify(value ?? {})],
  )
  return formatMemory(result.rows[0])
}

async function deleteMemory(userId, memoryId) {
  const result = await query(`DELETE FROM user_memory WHERE id = $1 AND user_id = $2 RETURNING id`, [
    memoryId,
    userId,
  ])
  return Boolean(result.rows[0])
}

async function saveChatMessage(userId, { role, content, business_id, metadata }) {
  const result = await query(
    `INSERT INTO ai_chat_messages (user_id, business_id, role, content, metadata_json)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, business_id || null, role, content, JSON.stringify(metadata || {})],
  )
  return result.rows[0]
}

async function getRecentChat(userId, limit = 12) {
  const result = await query(
    `SELECT role, content, created_at FROM ai_chat_messages
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  )
  return result.rows.reverse()
}

function extractMemoriesFromText(text) {
  const memories = []
  const lower = text.toLowerCase()

  const toneMatch = text.match(/tone[:\s]+([a-zA-Z ]{3,40})/i)
  if (toneMatch) {
    memories.push({ memory_type: 'tone', key: 'preferred_tone', value: { tone: toneMatch[1].trim() } })
  }

  const goalMatch = text.match(/goal[:\s]+(.{5,120})/i)
  if (goalMatch) {
    memories.push({ memory_type: 'goal', key: 'primary_goal', value: { goal: goalMatch[1].trim() } })
  }

  if (lower.includes('tiktok') || lower.includes('instagram')) {
    const platforms = []
    if (lower.includes('tiktok')) platforms.push('TikTok')
    if (lower.includes('instagram')) platforms.push('Instagram')
    if (lower.includes('facebook')) platforms.push('Facebook')
    memories.push({ memory_type: 'preference', key: 'platforms', value: { platforms } })
  }

  const audienceMatch = text.match(/customers? (are|include)[:\s]+(.{5,120})/i)
  if (audienceMatch) {
    memories.push({
      memory_type: 'audience',
      key: 'target_audience',
      value: { audience: audienceMatch[2].trim() },
    })
  }

  return memories
}

async function learnFromUserMessage(userId, message) {
  const extracted = extractMemoriesFromText(message)
  const saved = []
  for (const mem of extracted) {
    saved.push(await upsertMemory(userId, mem))
  }
  return saved
}

module.exports = {
  MEMORY_TYPES,
  listMemories,
  upsertMemory,
  deleteMemory,
  saveChatMessage,
  getRecentChat,
  learnFromUserMessage,
}
