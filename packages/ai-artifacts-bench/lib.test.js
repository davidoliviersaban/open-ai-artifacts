const assert = require('node:assert/strict')
const test = require('node:test')

const { avg, median, computeScore, summarizeVariant, determineWinner, groupBy, parseUsageFromJson, criterionPassRates } = require('./lib.js')

test('avg computes arithmetic mean', () => {
  assert.equal(avg([1, 2, 3]), 2)
  assert.equal(avg([]), 0)
  assert.equal(avg([10]), 10)
})

test('median returns middle value', () => {
  assert.equal(median([1, 2, 3]), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(median([]), 0)
})

test('groupBy groups array items by key', () => {
  const items = [{ type: 'a', v: 1 }, { type: 'b', v: 2 }, { type: 'a', v: 3 }]
  const result = groupBy(items, 'type')
  assert.equal(result.a.length, 2)
  assert.equal(result.b.length, 1)
})

test('computeScore produces weighted final score', () => {
  const usage = { total_tokens: 10000, elapsed_seconds: 60 }
  const criteria = [
    { id: 'test1', pass: true },
    { id: 'existing_tests_pass', pass: true },
  ]
  const scoring = { criteria_weight: 0.5, efficiency_weight: 0.3, code_quality_weight: 0.2, max_tokens_budget: 50000, max_time_seconds: 300 }

  const result = computeScore(usage, criteria, scoring)
  assert.equal(result.criteria_passed, 2)
  assert.equal(result.criteria_total, 2)
  assert.equal(result.criteria_score, 1.0)
  assert.equal(result.code_quality_score, 1.0)
  assert.ok(result.final_score > 0.8)
  assert.ok(result.final_score <= 1.0)
})

test('computeScore handles all criteria failing', () => {
  const usage = { total_tokens: 50000, elapsed_seconds: 300 }
  const criteria = [{ id: 'test1', pass: false }, { id: 'existing_tests_pass', pass: false }]
  const scoring = { criteria_weight: 0.5, efficiency_weight: 0.3, code_quality_weight: 0.2, max_tokens_budget: 50000, max_time_seconds: 300 }

  const result = computeScore(usage, criteria, scoring)
  assert.equal(result.criteria_passed, 0)
  assert.equal(result.final_score, 0)
})

test('summarizeVariant aggregates run data', () => {
  const runs = [
    { final_score: 0.8, criteria_score: 1.0, tokens_used: 10000, time_seconds: 60, cost_usd: 0.5, criteria_passed: 3, criteria_total: 3 },
    { final_score: 0.6, criteria_score: 0.67, tokens_used: 20000, time_seconds: 120, cost_usd: 1.0, criteria_passed: 2, criteria_total: 3 },
  ]
  const result = summarizeVariant('test-variant', runs)
  assert.equal(result.variant, 'test-variant')
  assert.equal(result.runs, 2)
  assert.equal(result.avg_score, 0.7)
  assert.equal(result.perfect_runs, 1)
  assert.equal(result.criteria_passed, 5)
  assert.equal(result.criteria_total, 6)
})

test('determineWinner picks highest avg_score', () => {
  const summaries = [
    { variant: 'a', avg_score: 0.7 },
    { variant: 'b', avg_score: 0.9 },
    { variant: 'c', avg_score: 0.5 },
  ]
  const result = determineWinner(summaries)
  assert.equal(result.winner, 'b')
  assert.equal(result.runner_up, 'a')
  assert.equal(result.confident, true)
})

test('determineWinner marks thin margins as not confident', () => {
  const summaries = [
    { variant: 'a', avg_score: 0.81 },
    { variant: 'b', avg_score: 0.80 },
  ]
  const result = determineWinner(summaries)
  assert.equal(result.confident, false)
})

test('determineWinner returns null for single variant', () => {
  assert.equal(determineWinner([{ variant: 'solo', avg_score: 0.9 }]), null)
})

test('parseUsageFromJson extracts model usage', () => {
  const raw = JSON.stringify({
    modelUsage: { 'claude-opus': { inputTokens: 5000, outputTokens: 3000, costUSD: 0.45 } },
    num_turns: 5,
    subtype: 'end_turn',
  })
  const result = parseUsageFromJson(raw)
  assert.equal(result.input_tokens, 5000)
  assert.equal(result.output_tokens, 3000)
  assert.equal(result.total_tokens, 8000)
  assert.equal(result.cost_usd, 0.45)
  assert.equal(result.model, 'claude-opus')
  assert.equal(result.num_turns, 5)
})

test('parseUsageFromJson returns null for invalid JSON', () => {
  assert.equal(parseUsageFromJson('not json'), null)
})

test('criterionPassRates computes per-criterion per-variant rates', () => {
  const runs = [
    { variant: 'a', criteria_results: [{ id: 'test1', pass: true }, { id: 'test2', pass: false }] },
    { variant: 'a', criteria_results: [{ id: 'test1', pass: true }, { id: 'test2', pass: true }] },
    { variant: 'b', criteria_results: [{ id: 'test1', pass: false }, { id: 'test2', pass: true }] },
  ]
  const byVariant = groupBy(runs, 'variant')
  const rates = criterionPassRates(runs, byVariant)
  assert.deepEqual(rates.test1.a, { passed: 2, total: 2 })
  assert.deepEqual(rates.test1.b, { passed: 0, total: 1 })
  assert.deepEqual(rates.test2.a, { passed: 1, total: 2 })
  assert.deepEqual(rates.test2.b, { passed: 1, total: 1 })
})
