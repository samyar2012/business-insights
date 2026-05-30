const { Pool } = require('pg')

const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    'Missing DB connection string. Set SUPABASE_DB_URL (or DATABASE_URL) in backend/.env',
  )
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
})

async function query(text, params) {
  return pool.query(text, params)
}

async function withClient(fn) {
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

module.exports = { query, withClient, pool }
