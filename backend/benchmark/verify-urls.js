const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })
process.chdir(path.resolve(__dirname, '..'))
const { crawlWebsiteLite } = require('./lib/crawl-lite')

const candidates = process.argv.slice(2)
if (!candidates.length) {
  console.error('Usage: node verify-urls.js <url> [url...]')
  process.exit(1)
}

async function main() {
  for (const url of candidates) {
    try {
      const result = await crawlWebsiteLite(url, { maxPages: 3, maxDepth: 1 })
      const ok = result.pages.length > 0 && result.homepage_fetch_ok
      console.log(`${ok ? 'OK' : 'FAIL'}\t${url}\tpages=${result.pages.length}`)
    } catch (err) {
      console.log(`FAIL\t${url}\t${err.message}`)
    }
  }
}

main()
