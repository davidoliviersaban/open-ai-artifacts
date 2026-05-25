#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { groupBy, summarizeVariant, determineWinner, criterionPassRates } = require('./lib.js')

const AB_DIR = path.resolve(__dirname, '..')
const RUNS_DIR = path.join(AB_DIR, 'runs')

function loadRuns(runsDir) {
  if (!fs.existsSync(runsDir)) return []

  const runs = []
  for (const entry of fs.readdirSync(runsDir)) {
    const runDir = path.join(runsDir, entry)
    const scoreFile = path.join(runDir, 'score.json')
    const metaFile = path.join(runDir, 'metadata.json')
    const usageFile = path.join(runDir, 'usage.json')

    if (!fs.existsSync(scoreFile) || !fs.existsSync(metaFile)) continue

    const score = JSON.parse(fs.readFileSync(scoreFile, 'utf8'))
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
    const usage = fs.existsSync(usageFile) ? JSON.parse(fs.readFileSync(usageFile, 'utf8')) : {}

    runs.push({ ...score, ...meta, usage })
  }
  return runs
}

function format(template, ...args) {
  let result = template
  for (const arg of args) {
    result = result.replace(/%[-\d]*s/, arg)
  }
  return result
}

function generateReport(runs, outputDir) {
  if (runs.length === 0) {
    console.log('No scored runs found.')
    console.log('Run batch.sh first, then score.sh on each run.')
    return { summaries: [], winner: null }
  }

  const byVariant = groupBy(runs, 'variant')

  console.log('')
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║                         A/B TEST COMPARISON REPORT                          ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`Total runs: ${runs.length}`)
  console.log(`Variants:   ${Object.keys(byVariant).join(', ')}`)
  console.log('')

  const header = '│ %-25s │ %5s │ %7s │ %8s │ %8s │ %7s │ %7s │ %6s │'
  const sep = '├' + '─'.repeat(27) + '┼' + '─'.repeat(7) + '┼' + '─'.repeat(9) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(9) + '┼' + '─'.repeat(9) + '┼' + '─'.repeat(8) + '┤'

  console.log('┌' + '─'.repeat(27) + '┬' + '─'.repeat(7) + '┬' + '─'.repeat(9) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(9) + '┬' + '─'.repeat(9) + '┬' + '─'.repeat(8) + '┐')
  console.log(format(header, 'Variant', 'Runs', 'Score', 'Criteria', 'Tokens', 'Time(s)', 'Cost$', 'Pass%'))
  console.log(sep)

  const summaries = []

  for (const [variant, variantRuns] of Object.entries(byVariant)) {
    const summary = summarizeVariant(variant, variantRuns)
    summaries.push(summary)

    console.log(format(header,
      variant.slice(0, 25),
      String(summary.runs),
      summary.avg_score.toFixed(3),
      summary.avg_criteria.toFixed(2),
      String(summary.avg_tokens),
      String(summary.avg_time),
      '$' + summary.avg_cost.toFixed(2),
      (summary.full_pass_rate * 100).toFixed(0) + '%'
    ))
  }

  console.log('└' + '─'.repeat(27) + '┴' + '─'.repeat(7) + '┴' + '─'.repeat(9) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(9) + '┴' + '─'.repeat(9) + '┴' + '─'.repeat(8) + '┘')
  console.log('')

  console.log('── Per-criterion pass rates ──')
  console.log('')
  const rates = criterionPassRates(runs, byVariant)
  for (const [criterionId, variantRates] of Object.entries(rates)) {
    const rateStr = Object.entries(variantRates).map(([v, r]) => `${v}=${r.passed}/${r.total}`).join('  ')
    console.log(`  ${criterionId.padEnd(30)} ${rateStr}`)
  }
  console.log('')

  const winner = determineWinner(summaries)
  if (winner) {
    console.log('── Verdict ──')
    console.log('')
    console.log(`  Winner: ${winner.winner}`)
    console.log(`  Score:  ${winner.winner_score.toFixed(3)} (vs ${winner.runner_up}: ${winner.runner_up_score.toFixed(3)}, Δ=${winner.delta.toFixed(3)})`)
    if (!winner.confident) {
      console.log('')
      console.log('  ⚠ Margin is thin (<0.05). Consider more iterations for statistical confidence.')
    }
  }

  console.log('')

  if (outputDir) {
    const reportPath = path.join(outputDir, 'report.json')
    fs.writeFileSync(reportPath, JSON.stringify({ generated_at: new Date().toISOString(), summaries, winner, runs }, null, 2))
    console.log(`Report saved to: ${reportPath}`)
  }

  return { summaries, winner }
}

if (require.main === module) {
  const runs = loadRuns(RUNS_DIR)
  generateReport(runs, RUNS_DIR)
}

module.exports = { loadRuns, generateReport, format }
