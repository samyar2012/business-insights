require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { pool } = require('../db')

async function main() {
  const sqlPath = path.join(__dirname, '..', 'sql', 'migrate-v6.sql')
  const sql = fs.readFileSync(sqlPath, 'utf8')
  try {
    await pool.query(sql)
    console.log('Migration v6 complete (research engine tables).')
  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
