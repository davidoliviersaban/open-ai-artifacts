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

module.exports = { getBaselineId, groupRunsByBaseline, loadRuns, generateReport, selectActiveReport, summarizeBaseline }
