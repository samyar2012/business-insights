const { query } = require('../db')
const { listMemories, getRecentChat } = require('./memoryService')

async function loadUserProfile(userId) {
  const result = await query(
    `SELECT u.id, u.email, p.display_name, p.onboarding_completed, p.is_premium
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  )
  return result.rows[0] || null
}

async function loadBusinesses(userId) {
  const result = await query(
    `SELECT * FROM businesses WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId],
  )
  return result.rows
}

async function loadRecentScans(userId, limit = 5) {
  const result = await query(
    `SELECT s.*, b.business_name, b.business_type
     FROM business_scans s
     LEFT JOIN businesses b ON b.id = s.business_id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC
     LIMIT $2`,
    [userId, limit],
  )
  return result.rows
}

async function loadActionItems(userId, limit = 20) {
  const result = await query(
    `SELECT a.*, b.business_name
     FROM action_items a
     LEFT JOIN businesses b ON b.id = a.business_id
     WHERE a.user_id = $1
     ORDER BY
       CASE a.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
       a.created_at DESC
     LIMIT $2`,
    [userId, limit],
  )
  return result.rows
}

async function loadFullContext(userId) {
  const [user, businesses, scans, actions, memories, chat] = await Promise.all([
    loadUserProfile(userId),
    loadBusinesses(userId),
    loadRecentScans(userId),
    loadActionItems(userId),
    listMemories(userId),
    getRecentChat(userId, 8),
  ])

  return { user, businesses, scans, actions, memories, chat }
}

module.exports = {
  loadUserProfile,
  loadBusinesses,
  loadRecentScans,
  loadActionItems,
  loadFullContext,
}
