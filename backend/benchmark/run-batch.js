#!/usr/bin/env node
/**
 * Isolated analyzer benchmark — does not touch DB or main app routes.
 *
 * Usage (from backend/benchmark):
 *   npm install
 *   npm run batch
 *   npm run batch:fast          # skip visual audit
 *   npm run batch -- --limit=3    # smoke test
 */
const fs = require('fs')
const path = require('path')

require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

// Debug visual audits save under backend/debug — run from backend root.
process.chdir(path.resolve(__dirname, '..'))

const { analyzeFixtureSite } = require('./lib/analyze-site')
const { writeWorkbook } = require('./lib/export-xlsx')

const FIXTURE_PATH = path.join(__dirname, 'sites.fixture.json')
const OUTPUT_DIR = path.join(__dirname, 'output')

function parseArgs(argv) {
  const args = {
    limit: 0,
    category: null,
    noVisual: false,
    maxPages: 8,
    delayMs: 1500,
  }

  for (const arg of argv) {
    if (arg === '--no-visual') args.noVisual = true
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.split('=')[1]) || 0
    else if (arg.startsWith('--category=')) args.category = arg.split('=')[1]
    else if (arg.startsWith('--max-pages=')) args.maxPages = Number(arg.split('=')[1]) || 8
    else if (arg.startsWith('--delay-ms=')) args.delayMs = Number(arg.split('=')[1]) || 0
  }

  return args
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'))

  let selected = fixtures
  if (args.category) {
    selected = selected.filter(
      (item) => item.category === args.category || item.business_model === args.category,
    )
  }
  if (args.limit > 0) {
    selected = selected.slice(0, args.limit)
  }

  if (selected.length === 0) {
    console.error('No sites matched your filters.')
    process.exit(1)
  }

  console.log(`Benchmark: ${selected.length} site(s)`)
  console.log(`Visual audit: ${args.noVisual ? 'OFF' : process.env.VISUAL_AUDIT_ENABLED || 'false'}`)
  console.log(`Max pages per site: ${args.maxPages}`)
  console.log('---')

  const results = []
  const batchStarted = Date.now()

  for (let i = 0; i < selected.length; i += 1) {
    const fixture = selected[i]
    const label = `[${i + 1}/${selected.length}] ${fixture.id} — ${fixture.url}`
    process.stdout.write(`${label} ... `)

    try {
      const result = await analyzeFixtureSite(fixture, {
        maxPages: args.maxPages,
        visualAudit: !args.noVisual,
      })
      results.push(result)

      if (result.status === 'ok') {
        const visual = result.visualAudit?.ok ? 'visual=OK' : `visual=${result.visualAudit?.error || result.visualAudit?.reason || 'skip'}`
        console.log(
          `OK overall=${result.scores.overall_score} ux=${result.scores.ux_ui_score} fit=${result.scores.business_fit_score} ${visual} (${Math.round(result.total_ms / 1000)}s)`,
        )
      } else {
        console.log(`FAIL — ${result.error}`)
      }
    } catch (err) {
      results.push({
        fixture,
        status: 'error',
        error: err.message || String(err),
        total_ms: 0,
      })
      console.log(`ERROR — ${err.message || err}`)
    }

    if (args.delayMs > 0 && i < selected.length - 1) {
      await sleep(args.delayMs)
    }
  }

  const stamp = timestampSlug()
  const jsonPath = path.join(OUTPUT_DIR, `benchmark-${stamp}.json`)
  const xlsxPath = path.join(OUTPUT_DIR, `benchmark-${stamp}.xlsx`)

  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf8')

  const exportPaths = writeWorkbook(results, xlsxPath)
  const elapsedMin = Math.round(((Date.now() - batchStarted) / 1000 / 60) * 10) / 10

  console.log('---')
  console.log(`Done in ${elapsedMin} min`)
  console.log(`JSON:  ${jsonPath}`)
  console.log(`Excel: ${exportPaths.xlsxPath}`)
  console.log(`CSV:   ${exportPaths.csvPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
