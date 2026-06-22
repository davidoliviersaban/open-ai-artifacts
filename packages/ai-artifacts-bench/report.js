'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { groupBy, summarizeVariant, determineWinner, criterionPassRates } = require('./lib.js')

const LEGACY_BASELINE = { id: 'legacy-unversioned', description: 'Run metadata did not include an explicit benchmark baseline.' }

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

    runs.push({ ...score, ...meta, baseline: meta.baseline || LEGACY_BASELINE, usage })
  }
  return runs
}

function getBaselineId(run) {
  return run.baseline?.id || 'legacy-unversioned'
}

function groupRunsByBaseline(runs) {
  const groups = {}
  for (const run of runs) {
    const baselineId = getBaselineId(run)
    if (!groups[baselineId]) groups[baselineId] = []
    groups[baselineId].push(run)
  }
  return groups
}

function summarizeBaseline(baselineId, baselineRuns) {
  const baseline = baselineRuns.find(run => run.baseline?.id === baselineId)?.baseline || { id: baselineId }
  const byVariant = groupBy(baselineRuns, 'variant')
  const summaries = Object.entries(byVariant).map(([variant, variantRuns]) => summarizeVariant(variant, variantRuns))
  return {
    baseline,
    run_count: baselineRuns.length,
    variants: Object.keys(byVariant),
    summaries,
    winner: determineWinner(summaries),
  }
}

function generateReport(runs, outputDir) {
  if (runs.length === 0) return { summaries: [], winner: null }

  const byBaseline = groupRunsByBaseline(runs)
  const baselineReports = Object.entries(byBaseline).map(([baselineId, baselineRuns]) => summarizeBaseline(baselineId, baselineRuns))
  const activeReport = selectActiveReport(baselineReports)
  const { baseline, summaries, winner } = activeReport

  if (outputDir) {
    const reportPath = path.join(outputDir, 'report.json')
    fs.writeFileSync(reportPath, JSON.stringify({
      generated_at: new Date().toISOString(),
      baseline,
      summaries,
      winner,
      baselines: baselineReports,
      runs,
    }, null, 2))
  }

  return { baseline, summaries, winner, baselines: baselineReports }
}

function selectActiveReport(baselineReports) {
  const current = baselineReports.filter(report => report.baseline.id !== 'legacy-unversioned')
  return current.sort((a, b) => String(b.baseline.created_at || '').localeCompare(String(a.baseline.created_at || '')))[0] || baselineReports[0]
}

function printDecision(decision) {
  const def = decision.default_profile || 'cost'

  console.log('══ View A — Which model for each use case ══')
  console.log('')
  console.log(`  Each model competes under its best variant. Default lens: ${def}`)
  console.log('  (among models tied on quality within the 95% CI, the cheapest wins).')
  console.log('')
  for (const [category, data] of Object.entries(decision.categories).sort()) {
    const rec = data.model_choice[def]
    if (!rec || !rec.pick) { console.log(`▸ ${category}: no data`); continue }
    const flag = rec.low_confidence ? '  ⚠ low confidence (single run)' : ''
    console.log(`▸ ${category.padEnd(22)} → ${rec.pick.id}  (q=${rec.pick.ci.mean.toFixed(2)}, ${rec.pick.time_seconds.toFixed(0)}s, $${rec.pick.cost_usd.toFixed(2)})${flag}`)
    for (const [profile, r] of Object.entries(data.model_choice)) {
      if (profile === def || !r.pick || r.pick.id === rec.pick.id) continue
      console.log(`    (${profile}: ${r.pick.id})`)
    }
  }
  console.log('')

  console.log('══ View B — How to configure each model ══')
  console.log('')
  console.log('  Quality spread between a model\'s best and worst variant.')
  console.log('  Large spread = config-sensitive: the AI context makes or breaks it.')
  console.log('')
  for (const [category, data] of Object.entries(decision.categories).sort()) {
    const sensitive = (data.variant_sensitivity || []).filter(m => m.variants.length > 1)
    if (sensitive.length === 0) continue
    console.log(`▸ ${category}`)
    for (const m of sensitive.sort((a, b) => b.spread - a.spread)) {
      const tag = m.config_sensitive ? 'config-sensitive' : 'config-robust'
      console.log(`    ${m.model.padEnd(12)} best=${m.best.variant} (${m.best.quality.toFixed(2)})  worst=${m.worst.variant} (${m.worst.quality.toFixed(2)})  Δ${m.spread.toFixed(2)}  ${tag}`)
    }
  }
  console.log('')
}

module.exports = { getBaselineId, groupRunsByBaseline, loadRuns, generateReport, printDecision, selectActiveReport, summarizeBaseline }
