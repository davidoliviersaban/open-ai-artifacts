'use strict'

function groupBy(arr, key) {
  const groups = {}
  for (const item of arr) {
    const k = item[key]
    if (!groups[k]) groups[k] = []
    groups[k].push(item)
  }
  return groups
}

function avg(arr) {
  if (arr.length === 0) return 0
  return arr.reduce((a, b) => a + b, 0) / arr.length
}

function median(arr) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function computeScore(usage, criteriaResults, scoring) {
  const total = criteriaResults.length
  const passed = criteriaResults.filter(r => r.pass).length
  const criteriaScore = total > 0 ? passed / total : 0

  const tokenRatio = Math.min(usage.total_tokens / scoring.max_tokens_budget, 1.0)
  const efficiencyScore = 1.0 - tokenRatio

  const timeRatio = Math.min(usage.elapsed_seconds / scoring.max_time_seconds, 1.0)
  const timeScore = 1.0 - timeRatio

  const combinedEfficiency = (efficiencyScore + timeScore) / 2

  const existingTestsPass = criteriaResults.find(r => r.id === 'existing_tests_pass')?.pass ? 1.0 : 0.0

  const finalScore = (
    criteriaScore * scoring.criteria_weight +
    combinedEfficiency * scoring.efficiency_weight +
    existingTestsPass * scoring.code_quality_weight
  )

  return {
    criteria_passed: passed,
    criteria_total: total,
    criteria_score: criteriaScore,
    efficiency_score: combinedEfficiency,
    code_quality_score: existingTestsPass,
    final_score: Math.round(finalScore * 1000) / 1000
  }
}

function summarizeVariant(variant, runs) {
  const scores = runs.map(r => r.final_score)
  const criteria = runs.map(r => r.criteria_score)
  const tokens = runs.map(r => r.tokens_used || 0)
  const times = runs.map(r => r.time_seconds || 0)
  const costs = runs.map(r => r.cost_usd || 0)
  const fullPass = runs.filter(r => r.criteria_passed === r.criteria_total).length

  return {
    variant,
    runs: runs.length,
    avg_score: avg(scores),
    median_score: median(scores),
    avg_criteria: avg(criteria),
    avg_tokens: Math.round(avg(tokens)),
    median_tokens: Math.round(median(tokens)),
    avg_time: Math.round(avg(times)),
    avg_cost: avg(costs),
    full_pass_rate: fullPass / runs.length
  }
}

function determineWinner(summaries) {
  if (summaries.length < 2) return null
  const sorted = [...summaries].sort((a, b) => b.avg_score - a.avg_score)
  const winner = sorted[0]
  const runnerUp = sorted[1]
  return {
    winner: winner.variant,
    winner_score: winner.avg_score,
    runner_up: runnerUp.variant,
    runner_up_score: runnerUp.avg_score,
    delta: winner.avg_score - runnerUp.avg_score,
    confident: (winner.avg_score - runnerUp.avg_score) >= 0.05
  }
}

function criterionPassRates(runs, byVariant) {
  const allIds = [...new Set(runs.flatMap(r => (r.criteria_results || []).map(c => c.id)))]
  const rates = {}
  for (const id of allIds) {
    rates[id] = {}
    for (const [variant, variantRuns] of Object.entries(byVariant)) {
      const relevant = variantRuns.filter(r => r.criteria_results?.find(c => c.id === id))
      const passed = relevant.filter(r => r.criteria_results.find(c => c.id === id)?.pass)
      rates[id][variant] = { passed: passed.length, total: relevant.length }
    }
  }
  return rates
}

function parseUsageFromJson(raw) {
  let data
  try { data = JSON.parse(raw) } catch { return null }

  const modelUsage = data.modelUsage || {}
  const firstModel = Object.values(modelUsage)[0] || {}

  return {
    input_tokens: firstModel.inputTokens || 0,
    output_tokens: firstModel.outputTokens || 0,
    cache_read_tokens: firstModel.cacheReadInputTokens || 0,
    cache_write_tokens: firstModel.cacheCreationInputTokens || 0,
    total_tokens: (firstModel.inputTokens || 0) + (firstModel.outputTokens || 0),
    cost_usd: firstModel.costUSD || data.total_cost_usd || 0,
    num_turns: data.num_turns || 0,
    exit_type: data.subtype || 'unknown',
    model: Object.keys(modelUsage)[0] || 'unknown'
  }
}

module.exports = {
  avg,
  computeScore,
  criterionPassRates,
  determineWinner,
  groupBy,
  median,
  parseUsageFromJson,
  summarizeVariant,
}
