require('dotenv').config()
const { pool } = require('../db')

async function main() {
  try {
    const ping = await pool.query('SELECT 1 AS ok')
    console.log('DB connection:', ping.rows[0].ok === 1 ? 'ok' : 'failed')

    const tables = await pool.query(`
      SELECT
        to_regclass('public.users') AS users,
        to_regclass('public.profiles') AS profiles
    `)
    console.log('Tables:', tables.rows[0])

    if (!tables.rows[0].users || !tables.rows[0].profiles) {
      console.log('\nRun sql/init.sql in Supabase SQL Editor, then retry.')
      process.exit(1)
    }
  } catch (err) {
    console.error('DB error:', err.code || '', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
