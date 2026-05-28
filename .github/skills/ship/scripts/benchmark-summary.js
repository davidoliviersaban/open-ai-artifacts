#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

function loadReport(repoRoot) {
  const reportPath = path.join(repoRoot, 'ab-test', 'runs', 'report.json')
  if (!fs.existsSync(reportPath)) return null
  return JSON.parse(fs.readFileSync(reportPath, 'utf8'))
}

function generateMarkdownSummary(report) {
  if (!report || !report.summaries || report.summaries.length === 0) return null

  const lines = []

  lines.push('| Variant | Runs | Score | Criteria | Tests | Cost | Time |')
  lines.push('|---------|------|-------|----------|-------|------|------|')

  const sorted = [...report.summaries].sort((a, b) => b.avg_score - a.avg_score)
  for (const s of sorted) {
    const testsStr = isNaN(s.full_pass_rate) ? 'n/a' : `${Math.round(s.full_pass_rate * 100)}%`
    lines.push(`| ${s.variant} | ${s.runs} | ${s.avg_score.toFixed(3)} | ${(s.avg_criteria * 100).toFixed(0)}% | ${testsStr} | $${s.avg_cost.toFixed(2)} | ${s.avg_time}s |`)
  }

  lines.push('')

  if (report.winner) {
    const w = report.winner
    const confidence = w.confident ? '' : ' *(thin margin, needs more iterations)*'
    lines.push(`**Winner: ${w.winner}** — score ${w.winner_score.toFixed(3)} vs ${w.runner_up} ${w.runner_up_score.toFixed(3)} (Δ=${w.delta.toFixed(3)})${confidence}`)
  }

  return lines.join('\n')
}

function generateTerminalSummary(report) {
  if (!report || !report.summaries || report.summaries.length === 0) return null

  const lines = []
  lines.push('')
  lines.push('\x1b[1m━━━ Benchmark Results ━━━\x1b[0m')
  lines.push('')

  const sorted = [...report.summaries].sort((a, b) => b.avg_score - a.avg_score)
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i]
    const rank = i === 0 ? '\x1b[32m▶\x1b[0m' : ' '
    const scoreColor = i === 0 ? '\x1b[32m' : '\x1b[0m'
    const testsStr = isNaN(s.full_pass_rate) ? 'n/a' : `${Math.round(s.full_pass_rate * 100)}%`
    lines.push(`  ${rank} ${scoreColor}${s.avg_score.toFixed(3)}\x1b[0m  ${s.variant}  (${s.runs} runs, ${(s.avg_criteria * 100).toFixed(0)}% criteria, ${testsStr} tests, $${s.avg_cost.toFixed(2)}, ${s.avg_time}s)`)
  }

  if (report.winner) {
    const w = report.winner
    lines.push('')
    const conf = w.confident ? '\x1b[32m✓ confident\x1b[0m' : '\x1b[33m⚠ thin margin\x1b[0m'
    lines.push(`  Winner: \x1b[1m${w.winner}\x1b[0m  Δ=${w.delta.toFixed(3)}  ${conf}`)
  }

  lines.push('')
  return lines.join('\n')
}

if (require.main === module) {
  const args = process.argv.slice(2)
  const format = args.includes('--terminal') ? 'terminal' : 'markdown'
  const repoRoot = args.find(a => !a.startsWith('--')) || process.cwd()

  const report = loadReport(repoRoot)
  if (!report) {
    process.exit(0)
  }

  if (format === 'terminal') {
    const output = generateTerminalSummary(report)
    if (output) process.stdout.write(output)
  } else {
    const output = generateMarkdownSummary(report)
    if (output) process.stdout.write(output + '\n')
  }
}

module.exports = { loadReport, generateMarkdownSummary, generateTerminalSummary }
