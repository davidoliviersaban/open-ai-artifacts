#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { groupBy, summarizeVariant, determineWinner, criterionPassRates } = require('./lib.js')
const { synthesizeDecision } = require('../../packages/ai-artifacts-bench/decision.js')

const AB_DIR = path.resolve(__dirname, '..')
const RUNS_DIR = path.join(AB_DIR, 'runs')
const CHALLENGES_DIR = path.join(AB_DIR, 'challenges')
const LEGACY_BASELINE = { id: 'legacy-unversioned', description: 'Run metadata did not include an explicit benchmark baseline.' }

const categoryCache = {}
function challengeCategory(challengeId) {
  if (!challengeId) return 'uncategorized'
  if (challengeId in categoryCache) return categoryCache[challengeId]
  const file = path.join(CHALLENGES_DIR, challengeId, 'challenge.json')
  let category = 'uncategorized'
  try {
    category = JSON.parse(fs.readFileSync(file, 'utf8')).category || 'uncategorized'
  } catch { /* unknown challenge dir → uncategorized */ }
  categoryCache[challengeId] = category
  return category
}

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

    runs.push({
      ...score,
      ...meta,
      baseline: meta.baseline || LEGACY_BASELINE,
      usage,
      category: challengeCategory(meta.challenge),
    })
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

function selectActiveReport(baselineReports) {
  const current = baselineReports.filter(report => report.baseline.id !== 'legacy-unversioned')
  return current.sort((a, b) => String(b.baseline.created_at || '').localeCompare(String(a.baseline.created_at || '')))[0] || baselineReports[0]
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

function analyzeReport(activeRuns, summaries, winner) {
  const summaryByVariant = Object.fromEntries(summaries.map(summary => [summary.variant, summary]))
  const baseline = summaryByVariant['baseline-guidance']
  const unguided = summaryByVariant['unguided-agent']
  const minimal = summaryByVariant['minimal-guidance']
  const challengeComparisons = []

  if (baseline && unguided) {
    const byChallenge = groupBy(activeRuns, 'challenge')
    for (const [challenge, challengeRuns] of Object.entries(byChallenge).sort()) {
      const byVariant = Object.fromEntries(challengeRuns.map(run => [run.variant, run]))
      const baselineRun = byVariant['baseline-guidance']
      const unguidedRun = byVariant['unguided-agent']
      if (!baselineRun || !unguidedRun) continue
      challengeComparisons.push({
        challenge,
        baseline_score: baselineRun.final_score,
        unguided_score: unguidedRun.final_score,
        delta: baselineRun.final_score - unguidedRun.final_score,
      })
    }
  }

  const wins = challengeComparisons.filter(row => row.delta > 0.001)
  const losses = challengeComparisons.filter(row => row.delta < -0.001)
  const ties = challengeComparisons.length - wins.length - losses.length
  const biggestGains = [...wins].sort((a, b) => b.delta - a.delta).slice(0, 3)
  const biggestLosses = [...losses].sort((a, b) => a.delta - b.delta).slice(0, 3)
  const findings = []
  const recommendations = []

  if (winner) {
    findings.push(`${winner.winner} leads the active baseline by average score (${winner.winner_score.toFixed(3)} vs ${winner.runner_up} at ${winner.runner_up_score.toFixed(3)}).`)
    if (!winner.confident) findings.push(`The lead is thin (${winner.delta.toFixed(3)}), so this is a directional signal rather than a statistically strong conclusion.`)
  }

  if (baseline && unguided) {
    const avgDelta = baseline.avg_score - unguided.avg_score
    if (avgDelta >= 0) {
      findings.push(`baseline-guidance beats unguided-agent on average by ${avgDelta.toFixed(3)}.`)
    } else {
      findings.push(`baseline-guidance trails unguided-agent on average by ${Math.abs(avgDelta).toFixed(3)}.`)
    }
    findings.push(`baseline-guidance beats unguided-agent on ${wins.length}/${challengeComparisons.length} challenges, loses on ${losses.length}/${challengeComparisons.length}, and ties on ${ties}/${challengeComparisons.length}.`)
  }

  if (minimal && baseline) {
    const avgDelta = minimal.avg_score - baseline.avg_score
    if (avgDelta >= 0) {
      findings.push(`minimal-guidance is ahead of baseline-guidance by ${avgDelta.toFixed(3)}, suggesting the full guidance may contain runtime noise for short tasks.`)
    } else {
      findings.push(`baseline-guidance is ahead of minimal-guidance by ${Math.abs(avgDelta).toFixed(3)}, suggesting the full guidance still helps on this matrix.`)
    }
  }

  if (biggestLosses.length > 0) {
    recommendations.push(`Inspect the largest baseline-guidance losses first: ${biggestLosses.map(row => `${row.challenge} (${row.delta.toFixed(3)})`).join(', ')}.`)
  }
  if (minimal && baseline && minimal.avg_score >= baseline.avg_score) {
    recommendations.push('Simplify runtime guidance by moving process-heavy or human-review instructions out of the default agent prompt, keeping only rules that directly improve task execution.')
  }
  if (biggestGains.length > 0) {
    recommendations.push(`Preserve guidance patterns that helped in the strongest wins: ${biggestGains.map(row => `${row.challenge} (+${row.delta.toFixed(3)})`).join(', ')}.`)
  }
  recommendations.push('Rerun the same baseline with more iterations before treating the ranking as statistically stable.')

  return {
    findings,
    recommendations,
    baseline_vs_unguided: baseline && unguided ? {
      avg_delta: baseline.avg_score - unguided.avg_score,
      wins: wins.length,
      losses: losses.length,
      ties,
      total: challengeComparisons.length,
      biggest_gains: biggestGains,
      biggest_losses: biggestLosses,
    } : null,
  }
}

function format(template, ...args) {
  let result = template
  for (const arg of args) {
    result = result.replace(/%[-\d]*s/, arg)
  }
  return result
}

function printDecision(decision) {
  console.log('══ Decision: best model + config per use case ══')
  console.log('')
  console.log('  Quality = mean criteria pass rate (the rendered copy).')
  console.log('  Recommendations are drawn from the Pareto frontier; ties within the')
  console.log('  95% confidence band are broken by the profile (cost or latency).')
  console.log('')

  for (const [category, data] of Object.entries(decision.categories).sort()) {
    console.log(`▸ ${category}  (${data.run_count} runs, ${data.candidates.length} candidates)`)
    for (const candidate of [...data.candidates].sort((a, b) => b.ci.mean - a.ci.mean)) {
      const ci = candidate.ci
      const band = ci.insufficient_data
        ? '(n=1, no CI)'
        : `±${ci.margin.toFixed(3)} [${ci.low.toFixed(2)}–${ci.high.toFixed(2)}]`
      console.log(`    ${candidate.id.padEnd(34)} q=${ci.mean.toFixed(3)} ${band.padEnd(22)} ${candidate.time_seconds.toFixed(0)}s  $${candidate.cost_usd.toFixed(2)}`)
    }
    for (const [profile, rec] of Object.entries(data.recommendations)) {
      if (!rec.pick) continue
      const flag = rec.low_confidence ? '  ⚠ low confidence (single run)' : ''
      console.log(`    → ${profile.padEnd(8)}: ${rec.pick.id}${flag}`)
    }
    console.log('')
  }
}

function generateReport(runs, outputDir) {
  if (runs.length === 0) {
    console.log('No scored runs found.')
    console.log('Run batch.sh first, then score.sh on each run.')
    return { summaries: [], winner: null }
  }

  const byBaseline = groupRunsByBaseline(runs)
  const baselineReports = Object.entries(byBaseline).map(([baselineId, baselineRuns]) => summarizeBaseline(baselineId, baselineRuns))
  const activeReport = selectActiveReport(baselineReports)
  const { baseline, summaries, winner } = activeReport
  const activeRuns = byBaseline[baseline.id]
  const byVariant = groupBy(activeRuns, 'variant')

  console.log('')
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║                         A/B TEST COMPARISON REPORT                          ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`Baseline:   ${baseline.id}`)
  console.log(`Total runs: ${activeRuns.length}`)
  if (baselineReports.length > 1) {
    console.log(`Other baselines not aggregated: ${baselineReports.filter(report => report.baseline.id !== baseline.id).map(report => `${report.baseline.id} (${report.run_count})`).join(', ')}`)
  }
  console.log(`Variants:   ${Object.keys(byVariant).join(', ')}`)
  console.log('')

  const header = '│ %-25s │ %5s │ %7s │ %8s │ %8s │ %8s │ %7s │ %7s │ %7s │'
  const sep = '├' + '─'.repeat(27) + '┼' + '─'.repeat(7) + '┼' + '─'.repeat(9) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(9) + '┼' + '─'.repeat(9) + '┼' + '─'.repeat(9) + '┤'

  console.log('┌' + '─'.repeat(27) + '┬' + '─'.repeat(7) + '┬' + '─'.repeat(9) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(9) + '┬' + '─'.repeat(9) + '┬' + '─'.repeat(9) + '┐')
  console.log(format(header, 'Variant', 'Runs', 'Score', 'Criteria', 'Perfect', 'Tests', 'Tokens', 'Time(s)', 'Cost$'))
  console.log(sep)

  for (const [variant, variantRuns] of Object.entries(byVariant)) {
    const summary = summarizeVariant(variant, variantRuns)
    console.log(format(header,
      variant.slice(0, 25),
      String(summary.runs),
      summary.avg_score.toFixed(3),
      summary.avg_criteria.toFixed(2),
      `${summary.perfect_runs}/${summary.runs}`,
      `${summary.tests_passed}/${summary.runs}`,
      String(summary.avg_tokens),
      String(summary.avg_time),
      '$' + summary.avg_cost.toFixed(2)
    ))
  }

  console.log('└' + '─'.repeat(27) + '┴' + '─'.repeat(7) + '┴' + '─'.repeat(9) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(9) + '┴' + '─'.repeat(9) + '┴' + '─'.repeat(9) + '┘')
  console.log('')

  const analysis = analyzeReport(activeRuns, summaries, winner)

  console.log('── Analysis ──')
  console.log('')
  for (const finding of analysis.findings) console.log(`  - ${finding}`)
  console.log('')

  if (analysis.baseline_vs_unguided) {
    console.log('── Baseline Guidance vs Unguided Agent ──')
    console.log('')
    for (const row of analysis.baseline_vs_unguided.biggest_gains) {
      console.log(`  + ${row.challenge}: baseline-guidance ${row.baseline_score.toFixed(3)} vs unguided-agent ${row.unguided_score.toFixed(3)} (Δ=${row.delta.toFixed(3)})`)
    }
    for (const row of analysis.baseline_vs_unguided.biggest_losses) {
      console.log(`  - ${row.challenge}: baseline-guidance ${row.baseline_score.toFixed(3)} vs unguided-agent ${row.unguided_score.toFixed(3)} (Δ=${row.delta.toFixed(3)})`)
    }
    console.log('')
  }

  console.log('── Recommendations ──')
  console.log('')
  for (const recommendation of analysis.recommendations) console.log(`  - ${recommendation}`)
  console.log('')

  console.log('── Per-criterion pass rates ──')
  console.log('')
  const rates = criterionPassRates(activeRuns, byVariant)
  for (const [criterionId, variantRates] of Object.entries(rates)) {
    const rateStr = Object.entries(variantRates).map(([v, r]) => `${v}=${r.passed}/${r.total}`).join('  ')
    console.log(`  ${criterionId.padEnd(30)} ${rateStr}`)
  }
  console.log('')

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

  const decision = synthesizeDecision(activeRuns)
  printDecision(decision)

  if (outputDir) {
    const reportPath = path.join(outputDir, 'report.json')
    fs.writeFileSync(reportPath, JSON.stringify({
      generated_at: new Date().toISOString(),
      baseline,
      summaries,
      winner,
      analysis,
      decision,
      baselines: baselineReports,
      runs,
    }, null, 2))
    console.log(`Report saved to: ${reportPath}`)
  }

  return { baseline, summaries, winner, analysis, decision, baselines: baselineReports }
}

if (require.main === module) {
  const runs = loadRuns(RUNS_DIR)
  generateReport(runs, RUNS_DIR)
}

module.exports = { analyzeReport, getBaselineId, groupRunsByBaseline, loadRuns, generateReport, format, selectActiveReport, summarizeBaseline }
