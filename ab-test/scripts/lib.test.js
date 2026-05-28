'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  avg,
  computeScore,
  criterionPassRates,
  determineWinner,
  groupBy,
  median,
  parseUsageFromJson,
  summarizeVariant,
} = require('./lib.js')

describe('avg', () => {
  it('returns 0 for empty array', () => {
    assert.equal(avg([]), 0)
  })
  it('computes arithmetic mean', () => {
    assert.equal(avg([2, 4, 6]), 4)
  })
  it('handles single element', () => {
    assert.equal(avg([7]), 7)
  })
})

describe('median', () => {
  it('returns 0 for empty array', () => {
    assert.equal(median([]), 0)
  })
  it('returns middle for odd-length array', () => {
    assert.equal(median([1, 3, 5]), 3)
  })
  it('returns average of two middles for even-length', () => {
    assert.equal(median([1, 2, 3, 4]), 2.5)
  })
  it('handles unsorted input', () => {
    assert.equal(median([5, 1, 3]), 3)
  })
})

describe('groupBy', () => {
  it('groups items by key', () => {
    const items = [
      { variant: 'a', score: 1 },
      { variant: 'b', score: 2 },
      { variant: 'a', score: 3 },
    ]
    const result = groupBy(items, 'variant')
    assert.equal(result.a.length, 2)
    assert.equal(result.b.length, 1)
  })
  it('returns empty object for empty array', () => {
    assert.deepEqual(groupBy([], 'x'), {})
  })
})

describe('computeScore', () => {
  const defaultScoring = {
    criteria_weight: 0.5,
    efficiency_weight: 0.3,
    code_quality_weight: 0.2,
    max_tokens_budget: 50000,
    max_time_seconds: 300,
  }

  it('scores perfect run (all pass, zero tokens, zero time)', () => {
    const usage = { total_tokens: 0, elapsed_seconds: 0 }
    const criteria = [
      { id: 'existing_tests_pass', pass: true },
      { id: 'other', pass: true },
    ]
    const result = computeScore(usage, criteria, defaultScoring)
    assert.equal(result.criteria_passed, 2)
    assert.equal(result.criteria_total, 2)
    assert.equal(result.criteria_score, 1.0)
    assert.equal(result.efficiency_score, 1.0)
    assert.equal(result.code_quality_score, 1.0)
    assert.equal(result.final_score, 1.0)
  })

  it('scores zero when nothing passes and budget is blown', () => {
    const usage = { total_tokens: 100000, elapsed_seconds: 600 }
    const criteria = [
      { id: 'existing_tests_pass', pass: false },
      { id: 'other', pass: false },
    ]
    const result = computeScore(usage, criteria, defaultScoring)
    assert.equal(result.criteria_passed, 0)
    assert.equal(result.criteria_score, 0)
    assert.equal(result.efficiency_score, 0)
    assert.equal(result.code_quality_score, 0)
    assert.equal(result.final_score, 0)
  })

  it('half criteria + half budget = predictable score', () => {
    const usage = { total_tokens: 25000, elapsed_seconds: 150 }
    const criteria = [
      { id: 'existing_tests_pass', pass: true },
      { id: 'a', pass: true },
      { id: 'b', pass: false },
      { id: 'c', pass: false },
    ]
    const result = computeScore(usage, criteria, defaultScoring)
    assert.equal(result.criteria_passed, 2)
    assert.equal(result.criteria_score, 0.5)
    assert.equal(result.efficiency_score, 0.5)
    assert.equal(result.code_quality_score, 1.0)
    // 0.5*0.5 + 0.5*0.3 + 1.0*0.2 = 0.25 + 0.15 + 0.2 = 0.6
    assert.equal(result.final_score, 0.6)
  })

  it('code_quality is 0 when existing_tests_pass fails', () => {
    const usage = { total_tokens: 0, elapsed_seconds: 0 }
    const criteria = [
      { id: 'existing_tests_pass', pass: false },
      { id: 'other', pass: true },
    ]
    const result = computeScore(usage, criteria, defaultScoring)
    assert.equal(result.code_quality_score, 0)
  })

  it('handles empty criteria list', () => {
    const usage = { total_tokens: 10000, elapsed_seconds: 60 }
    const result = computeScore(usage, [], defaultScoring)
    assert.equal(result.criteria_passed, 0)
    assert.equal(result.criteria_score, 0)
  })

  it('caps token ratio at 1.0 when over budget', () => {
    const usage = { total_tokens: 200000, elapsed_seconds: 0 }
    const criteria = [{ id: 'existing_tests_pass', pass: true }]
    const result = computeScore(usage, criteria, defaultScoring)
    assert.equal(result.efficiency_score, 0.5) // token=0, time=1.0, avg=0.5
  })
})

describe('summarizeVariant', () => {
  it('aggregates runs correctly', () => {
    const runs = [
      { final_score: 0.8, criteria_score: 0.9, tokens_used: 10000, time_seconds: 60, cost_usd: 0.5, criteria_passed: 9, criteria_total: 10 },
      { final_score: 0.6, criteria_score: 0.7, tokens_used: 20000, time_seconds: 120, cost_usd: 1.0, criteria_passed: 7, criteria_total: 10 },
    ]
    const s = summarizeVariant('test-variant', runs)
    assert.equal(s.variant, 'test-variant')
    assert.equal(s.runs, 2)
    assert.equal(s.avg_score, 0.7)
    assert.equal(s.avg_tokens, 15000)
    assert.equal(s.avg_time, 90)
    assert.equal(s.avg_cost, 0.75)
    assert.equal(s.criteria_passed, 16)
    assert.equal(s.criteria_total, 20)
    assert.equal(s.perfect_runs, 0)
    assert.equal(s.tests_passed, 0)
  })

  it('computes all criteria pass counts across runs', () => {
    const runs = [
      { final_score: 1.0, criteria_score: 1.0, tokens_used: 5000, time_seconds: 30, cost_usd: 0.2, criteria_passed: 10, criteria_total: 10 },
      { final_score: 0.5, criteria_score: 0.5, tokens_used: 30000, time_seconds: 200, cost_usd: 1.0, criteria_passed: 5, criteria_total: 10 },
    ]
    const s = summarizeVariant('x', runs)
    assert.equal(s.criteria_passed, 15)
    assert.equal(s.criteria_total, 20)
    assert.equal(s.perfect_runs, 1)
  })

  it('counts existing test pass criteria independently from perfect runs', () => {
    const runs = [
      { final_score: 0.9, criteria_score: 0.9, tokens_used: 5000, time_seconds: 30, cost_usd: 0.2, criteria_passed: 9, criteria_total: 10, criteria_results: [{ id: 'existing_tests_pass', pass: true }] },
      { final_score: 0.7, criteria_score: 0.8, tokens_used: 7000, time_seconds: 40, cost_usd: 0.3, criteria_passed: 8, criteria_total: 10, criteria_results: [{ id: 'existing_tests_pass', pass: false }] },
    ]

    const s = summarizeVariant('x', runs)

    assert.equal(s.tests_passed, 1)
    assert.equal(s.perfect_runs, 0)
  })
})

describe('determineWinner', () => {
  it('returns null with fewer than 2 summaries', () => {
    assert.equal(determineWinner([{ variant: 'a', avg_score: 0.9 }]), null)
  })

  it('picks highest avg_score as winner', () => {
    const summaries = [
      { variant: 'a', avg_score: 0.6 },
      { variant: 'b', avg_score: 0.9 },
    ]
    const result = determineWinner(summaries)
    assert.equal(result.winner, 'b')
    assert.equal(result.runner_up, 'a')
    assert.equal(result.confident, true)
  })

  it('marks not confident when delta < 0.05', () => {
    const summaries = [
      { variant: 'a', avg_score: 0.80 },
      { variant: 'b', avg_score: 0.82 },
    ]
    const result = determineWinner(summaries)
    assert.equal(result.confident, false)
  })

  it('does not mutate input array', () => {
    const summaries = [
      { variant: 'a', avg_score: 0.9 },
      { variant: 'b', avg_score: 0.5 },
    ]
    const copy = [...summaries]
    determineWinner(summaries)
    assert.deepEqual(summaries, copy)
  })
})

describe('criterionPassRates', () => {
  it('computes per-criterion pass rates across variants', () => {
    const runs = [
      { variant: 'a', criteria_results: [{ id: 'x', pass: true }, { id: 'y', pass: false }] },
      { variant: 'a', criteria_results: [{ id: 'x', pass: true }, { id: 'y', pass: true }] },
      { variant: 'b', criteria_results: [{ id: 'x', pass: false }, { id: 'y', pass: true }] },
    ]
    const byVariant = groupBy(runs, 'variant')
    const rates = criterionPassRates(runs, byVariant)
    assert.deepEqual(rates.x.a, { passed: 2, total: 2 })
    assert.deepEqual(rates.x.b, { passed: 0, total: 1 })
    assert.deepEqual(rates.y.a, { passed: 1, total: 2 })
    assert.deepEqual(rates.y.b, { passed: 1, total: 1 })
  })
})

describe('parseUsageFromJson', () => {
  it('parses claude CLI json output', () => {
    const raw = JSON.stringify({
      type: 'result',
      subtype: 'end_turn',
      num_turns: 5,
      total_cost_usd: 0.85,
      modelUsage: {
        'claude-sonnet-4-6': {
          inputTokens: 15000,
          outputTokens: 3000,
          cacheReadInputTokens: 5000,
          cacheCreationInputTokens: 10000,
          costUSD: 0.85,
        }
      }
    })
    const result = parseUsageFromJson(raw)
    assert.equal(result.input_tokens, 15000)
    assert.equal(result.output_tokens, 3000)
    assert.equal(result.total_tokens, 18000)
    assert.equal(result.cache_read_tokens, 5000)
    assert.equal(result.cost_usd, 0.85)
    assert.equal(result.num_turns, 5)
    assert.equal(result.model, 'claude-sonnet-4-6')
    assert.equal(result.exit_type, 'end_turn')
  })

  it('returns null for invalid JSON', () => {
    assert.equal(parseUsageFromJson('not json'), null)
  })

  it('handles missing modelUsage gracefully', () => {
    const raw = JSON.stringify({ type: 'result', total_cost_usd: 0.1 })
    const result = parseUsageFromJson(raw)
    assert.equal(result.total_tokens, 0)
    assert.equal(result.cost_usd, 0.1)
    assert.equal(result.model, 'unknown')
  })

  it('falls back to total_cost_usd when model costUSD is missing', () => {
    const raw = JSON.stringify({
      total_cost_usd: 1.23,
      modelUsage: { 'opus': { inputTokens: 100, outputTokens: 50 } }
    })
    const result = parseUsageFromJson(raw)
    assert.equal(result.cost_usd, 1.23)
    assert.equal(result.total_tokens, 150)
  })
})
