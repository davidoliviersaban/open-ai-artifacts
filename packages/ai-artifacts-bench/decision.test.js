'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  meanQuality,
  confidenceInterval,
  intervalsOverlap,
  paretoFrontier,
  recommend,
  normalizeModel,
  variantSensitivity,
  bestVariantPerModel,
  synthesizeDecision,
} = require('./decision.js')

test('bestVariantPerModel collapses each model to one candidate (quality profile picks highest quality)', () => {
  const candidates = [
    { id: 'opus-4-8 / time-aware', model: 'opus-4-8', variant: 'time-aware', ci: { mean: 0.9, low: 0.85, high: 0.95, insufficient_data: false }, cost_usd: 0.5, time_seconds: 180 },
    { id: 'opus-4-8 / baseline', model: 'opus-4-8', variant: 'baseline', ci: { mean: 0.4, low: 0.3, high: 0.5, insufficient_data: false }, cost_usd: 0.2, time_seconds: 300 },
    { id: 'opus-4-6 / minimal', model: 'opus-4-6', variant: 'minimal', ci: { mean: 0.8, low: 0.75, high: 0.85, insufficient_data: false }, cost_usd: 0.3, time_seconds: 150 },
  ]
  const best = bestVariantPerModel(candidates, 'quality')
  assert.equal(best.length, 2)
  assert.equal(best.find(c => c.model === 'opus-4-8').variant, 'time-aware')
  assert.equal(best.find(c => c.model === 'opus-4-6').variant, 'minimal')
})

test('bestVariantPerModel is profile-aware: cost profile prefers cheaper variant when quality is tied', () => {
  const candidates = [
    // same model, two variants statistically tied on quality (overlapping CI) but different cost
    { id: 'opus-4-6 / time-aware', model: 'opus-4-6', variant: 'time-aware', ci: { mean: 0.96, low: 0.90, high: 1.0, insufficient_data: false }, cost_usd: 0.72, time_seconds: 200 },
    { id: 'opus-4-6 / minimal', model: 'opus-4-6', variant: 'minimal', ci: { mean: 0.94, low: 0.89, high: 0.99, insufficient_data: false }, cost_usd: 0.54, time_seconds: 150 },
  ]
  // quality profile → highest quality (time-aware)
  assert.equal(bestVariantPerModel(candidates, 'quality')[0].variant, 'time-aware')
  // cost profile → tied on quality, so cheaper variant (minimal)
  assert.equal(bestVariantPerModel(candidates, 'cost')[0].variant, 'minimal')
})

test('variantSensitivity ranks variants within each model and reports best/worst + spread', () => {
  const runs = [
    { category: 'c', model: 'opus-4-8', variant: 'time-aware', criteria_score: 0.95, cost_usd: 0.5, time_seconds: 180 },
    { category: 'c', model: 'opus-4-8', variant: 'baseline', criteria_score: 0.30, cost_usd: 0.0, time_seconds: 900 },
    { category: 'c', model: 'opus-4-6', variant: 'time-aware', criteria_score: 0.88, cost_usd: 0.5, time_seconds: 160 },
    { category: 'c', model: 'opus-4-6', variant: 'baseline', criteria_score: 0.85, cost_usd: 0.6, time_seconds: 200 },
  ]
  const sens = variantSensitivity(runs)

  // opus-4-8: best time-aware (0.95), worst baseline (0.30), big spread
  const m48 = sens.find(m => m.model === 'opus-4-8')
  assert.equal(m48.best.variant, 'time-aware')
  assert.equal(m48.worst.variant, 'baseline')
  assert.ok(Math.abs(m48.spread - 0.65) < 1e-9)
  assert.equal(m48.config_sensitive, true) // spread is large → config matters a lot

  // opus-4-6: both variants close → low spread → not very config-sensitive
  const m46 = sens.find(m => m.model === 'opus-4-6')
  assert.ok(m46.spread < 0.1)
  assert.equal(m46.config_sensitive, false)
})

test('variantSensitivity handles a model with a single variant (spread 0)', () => {
  const runs = [
    { category: 'c', model: 'opus-4-8', variant: 'only', criteria_score: 0.9, cost_usd: 0.5, time_seconds: 180 },
  ]
  const sens = variantSensitivity(runs)
  assert.equal(sens[0].spread, 0)
  assert.equal(sens[0].best.variant, 'only')
  assert.equal(sens[0].best.variant, sens[0].worst.variant)
})

test('normalizeModel collapses provider prefixes and version suffixes to a stable label', () => {
  assert.equal(normalizeModel('us.anthropic.claude-opus-4-6-v1'), 'opus-4-6')
  assert.equal(normalizeModel('claude-opus-4-6'), 'opus-4-6')
  assert.equal(normalizeModel('us.anthropic.claude-opus-4-8'), 'opus-4-8')
  assert.equal(normalizeModel('claude-sonnet-4-5-20250929-v1:0'), 'sonnet-4-5')
  assert.equal(normalizeModel('github-copilot/gpt-5.4'), 'gpt-5.4')
  assert.equal(normalizeModel(undefined), 'unknown')
})

test('synthesizeDecision merges candidates that differ only by model label format', () => {
  const runs = [
    { category: 'x', model: 'us.anthropic.claude-opus-4-6-v1', variant: 'v', criteria_score: 0.9, cost_usd: 0.5, time_seconds: 100 },
    { category: 'x', model: 'claude-opus-4-6', variant: 'v', criteria_score: 0.8, cost_usd: 0.5, time_seconds: 100 },
  ]
  const decision = synthesizeDecision(runs)
  // both runs should collapse into a single opus-4-6 / v candidate
  assert.equal(decision.categories['x'].candidates.length, 1)
  assert.equal(decision.categories['x'].candidates[0].n, 2)
})

test('meanQuality averages criteria_score across runs', () => {
  const runs = [{ criteria_score: 1.0 }, { criteria_score: 0.5 }, { criteria_score: 0.0 }]
  assert.equal(meanQuality(runs), 0.5)
  assert.equal(meanQuality([]), 0)
})

test('confidenceInterval returns deterministic parametric 95% CI', () => {
  const runs = [{ criteria_score: 0.8 }, { criteria_score: 0.9 }, { criteria_score: 1.0 }]
  const ci = confidenceInterval(runs)
  // mean = 0.9, sample std = 0.1, margin = 1.96 * 0.1 / sqrt(3)
  assert.equal(ci.mean, 0.9)
  assert.ok(Math.abs(ci.margin - (1.96 * 0.1 / Math.sqrt(3))) < 1e-9)
  assert.ok(Math.abs(ci.low - (0.9 - ci.margin)) < 1e-9)
  assert.ok(Math.abs(ci.high - (0.9 + ci.margin)) < 1e-9)
  assert.equal(ci.n, 3)
  assert.equal(ci.insufficient_data, false)
})

test('confidenceInterval flags single-run candidates as insufficient_data', () => {
  const ci = confidenceInterval([{ criteria_score: 0.85 }])
  assert.equal(ci.mean, 0.85)
  assert.equal(ci.margin, 0)
  assert.equal(ci.n, 1)
  assert.equal(ci.insufficient_data, true)
})

test('confidenceInterval is repeatable: same input → same output', () => {
  const runs = [{ criteria_score: 0.7 }, { criteria_score: 0.6 }, { criteria_score: 0.95 }]
  assert.deepEqual(confidenceInterval(runs), confidenceInterval(runs))
})

test('intervalsOverlap detects statistically tied quality', () => {
  assert.equal(intervalsOverlap({ low: 0.8, high: 1.0 }, { low: 0.9, high: 1.1 }), true)
  assert.equal(intervalsOverlap({ low: 0.8, high: 0.85 }, { low: 0.9, high: 1.0 }), false)
  // touching edges count as overlap
  assert.equal(intervalsOverlap({ low: 0.8, high: 0.9 }, { low: 0.9, high: 1.0 }), true)
})

test('paretoFrontier removes dominated candidates (higher quality is better, lower cost is better)', () => {
  const candidates = [
    { id: 'A', quality: 0.9, cost: 100 },
    { id: 'B', quality: 0.8, cost: 50 },
    { id: 'C', quality: 0.7, cost: 120 }, // dominated by A (worse quality, higher cost)
    { id: 'D', quality: 0.9, cost: 200 }, // dominated by A (equal quality, higher cost)
  ]
  const frontier = paretoFrontier(candidates, c => c.quality, c => c.cost)
  const ids = frontier.map(c => c.id).sort()
  assert.deepEqual(ids, ['A', 'B'])
})

test('paretoFrontier keeps a candidate that wins on exactly one axis', () => {
  const candidates = [
    { id: 'fast', quality: 0.7, cost: 10 },
    { id: 'good', quality: 0.95, cost: 100 },
  ]
  const frontier = paretoFrontier(candidates, c => c.quality, c => c.cost)
  assert.equal(frontier.length, 2)
})

test('recommend with quality profile picks highest mean quality on the frontier', () => {
  const candidates = [
    { id: 'A', ci: { mean: 0.95, low: 0.90, high: 1.0, insufficient_data: false }, cost_usd: 1.0, time_seconds: 200 },
    { id: 'B', ci: { mean: 0.80, low: 0.75, high: 0.85, insufficient_data: false }, cost_usd: 0.3, time_seconds: 100 },
  ]
  const rec = recommend(candidates, 'quality')
  assert.equal(rec.pick.id, 'A')
  assert.equal(rec.profile, 'quality')
})

test('recommend with cost profile prefers cheaper when quality is statistically tied', () => {
  const candidates = [
    { id: 'expensive', ci: { mean: 0.92, low: 0.85, high: 0.99, insufficient_data: false }, cost_usd: 1.5, time_seconds: 250 },
    { id: 'cheap', ci: { mean: 0.88, low: 0.82, high: 0.94, insufficient_data: false }, cost_usd: 0.4, time_seconds: 120 },
  ]
  // CIs overlap (0.85-0.99 vs 0.82-0.94) → tied on quality → pick cheaper
  const rec = recommend(candidates, 'cost')
  assert.equal(rec.pick.id, 'cheap')
})

test('recommend with cost profile keeps quality when difference is significant', () => {
  const candidates = [
    { id: 'good', ci: { mean: 0.95, low: 0.92, high: 0.98, insufficient_data: false }, cost_usd: 1.5, time_seconds: 250 },
    { id: 'cheap-bad', ci: { mean: 0.60, low: 0.55, high: 0.65, insufficient_data: false }, cost_usd: 0.4, time_seconds: 120 },
  ]
  // CIs do not overlap → not tied → cost profile must not sacrifice quality
  const rec = recommend(candidates, 'cost')
  assert.equal(rec.pick.id, 'good')
})

test('recommend with latency profile breaks quality ties by wall-clock time', () => {
  const candidates = [
    { id: 'slow', ci: { mean: 0.92, low: 0.85, high: 0.99, insufficient_data: false }, cost_usd: 0.4, time_seconds: 280 },
    { id: 'fast', ci: { mean: 0.88, low: 0.82, high: 0.94, insufficient_data: false }, cost_usd: 0.5, time_seconds: 90 },
  ]
  const rec = recommend(candidates, 'latency')
  assert.equal(rec.pick.id, 'fast')
})

test('recommend flags low confidence when the pick has insufficient data', () => {
  const candidates = [
    { id: 'A', ci: { mean: 0.9, low: 0.9, high: 0.9, insufficient_data: true }, cost_usd: 1.0, time_seconds: 200 },
  ]
  const rec = recommend(candidates, 'quality')
  assert.equal(rec.pick.id, 'A')
  assert.equal(rec.low_confidence, true)
})

test('recommend quality profile does not reward a high-mean candidate with a huge uncertainty band', () => {
  const candidates = [
    // noisy: high mean but enormous CI (one perfect run, one timeout)
    { id: 'noisy', ci: { mean: 0.60, low: -0.18, high: 1.38, insufficient_data: false }, cost_usd: 0.0, time_seconds: 300 },
    // steady: slightly lower mean but tight, trustworthy band
    { id: 'steady', ci: { mean: 0.55, low: 0.50, high: 0.60, insufficient_data: false }, cost_usd: 0.5, time_seconds: 150 },
  ]
  // ranking on lower confidence bound: steady (0.50) beats noisy (-0.18)
  const rec = recommend(candidates, 'quality')
  assert.equal(rec.pick.id, 'steady')
})

test('recommend quality profile does not let a single unreplicated run beat a replicated steady candidate', () => {
  const candidates = [
    { id: 'single', ci: { mean: 1.0, low: 1.0, high: 1.0, insufficient_data: true }, cost_usd: 1.0, time_seconds: 250 },
    { id: 'replicated', ci: { mean: 0.95, low: 0.90, high: 1.0, insufficient_data: false }, cost_usd: 0.5, time_seconds: 180 },
  ]
  const rec = recommend(candidates, 'quality')
  assert.equal(rec.pick.id, 'replicated')
})

test('synthesizeDecision groups runs by category and candidate, recommends per category', () => {
  const runs = [
    // spec-feature category, two candidates
    { category: 'spec-feature', model: 'opus-4-8', variant: 'time-aware', criteria_score: 1.0, cost_usd: 0.5, time_seconds: 180 },
    { category: 'spec-feature', model: 'opus-4-8', variant: 'time-aware', criteria_score: 0.9, cost_usd: 0.5, time_seconds: 190 },
    { category: 'spec-feature', model: 'opus-4-6', variant: 'minimal', criteria_score: 0.9, cost_usd: 0.2, time_seconds: 140 },
    { category: 'spec-feature', model: 'opus-4-6', variant: 'minimal', criteria_score: 0.95, cost_usd: 0.2, time_seconds: 130 },
    // refactor category, one candidate
    { category: 'refactor', model: 'opus-4-8', variant: 'time-aware', criteria_score: 0.6, cost_usd: 0.8, time_seconds: 260 },
  ]
  const decision = synthesizeDecision(runs, { profiles: ['quality', 'cost'] })

  assert.deepEqual(Object.keys(decision.categories).sort(), ['refactor', 'spec-feature'])

  const spec = decision.categories['spec-feature']
  assert.equal(spec.candidates.length, 2)
  // model_choice (View A) recommends per profile
  assert.ok(spec.model_choice.quality.pick)
  assert.ok(spec.model_choice.cost.pick)

  // refactor has a single-run candidate → low confidence
  const refactor = decision.categories['refactor']
  assert.equal(refactor.model_choice.quality.low_confidence, true)
})

test('synthesizeDecision defaults uncategorized runs to "uncategorized"', () => {
  const runs = [
    { model: 'opus-4-8', variant: 'time-aware', criteria_score: 1.0, cost_usd: 0.5, time_seconds: 180 },
  ]
  const decision = synthesizeDecision(runs)
  assert.ok(decision.categories['uncategorized'])
})
