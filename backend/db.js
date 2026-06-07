const { Pool } = require('pg')

function buildPoolConfig() {
  const host = process.env.DB_HOST
  const password = process.env.DB_PASSWORD
  if (host && password) {
    return {
      host,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password,
      database: process.env.DB_NAME || 'postgres',
    }
  }

  const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
  if (connectionString) {
    return { connectionString }
  }

  throw new Error(
    'Missing database config. Set DB_HOST + DB_PASSWORD (recommended) or SUPABASE_DB_URL in backend/.env',
  )
}

const pool = new Pool({
  ...buildPoolConfig(),
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
