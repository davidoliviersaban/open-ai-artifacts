'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { analyzeReport, getBaselineId, groupRunsByBaseline, selectActiveReport, summarizeBaseline } = require('./report.js')

describe('baseline reporting', () => {
  it('classifies old runs without baseline metadata as legacy', () => {
    assert.equal(getBaselineId({ variant: 'a' }), 'legacy-unversioned')
  })

  it('summarizes runs inside one baseline only', () => {
    const report = summarizeBaseline('baseline-a', [
      { baseline: { id: 'baseline-a' }, variant: 'a', final_score: 0.8, criteria_score: 1, criteria_passed: 1, criteria_total: 1 },
      { baseline: { id: 'baseline-a' }, variant: 'b', final_score: 0.6, criteria_score: 1, criteria_passed: 1, criteria_total: 1 },
    ])

    assert.equal(report.baseline.id, 'baseline-a')
    assert.equal(report.run_count, 2)
    assert.deepEqual(report.variants, ['a', 'b'])
    assert.equal(report.winner.winner, 'a')
  })

  it('groups runs by explicit and legacy baseline ids', () => {
    const groups = groupRunsByBaseline([
      { baseline: { id: 'baseline-a' }, variant: 'a' },
      { baseline: { id: 'baseline-a' }, variant: 'b' },
      { variant: 'legacy' },
    ])

    assert.equal(groups['baseline-a'].length, 2)
    assert.equal(groups['legacy-unversioned'].length, 1)
  })

  it('selects the newest explicit baseline over legacy data', () => {
    const active = selectActiveReport([
      { baseline: { id: 'legacy-unversioned' }, run_count: 10 },
      { baseline: { id: 'baseline-a', created_at: '2026-05-01' }, run_count: 2 },
      { baseline: { id: 'baseline-b', created_at: '2026-05-28' }, run_count: 1 },
    ])

    assert.equal(active.baseline.id, 'baseline-b')
  })

  it('analyzes baseline guidance against unguided runs', () => {
    const runs = [
      { challenge: 'a', variant: 'baseline-guidance', final_score: 0.9 },
      { challenge: 'a', variant: 'unguided-agent', final_score: 0.8 },
      { challenge: 'b', variant: 'baseline-guidance', final_score: 0.7 },
      { challenge: 'b', variant: 'unguided-agent', final_score: 0.9 },
    ]
    const summaries = [
      { variant: 'baseline-guidance', avg_score: 0.8 },
      { variant: 'unguided-agent', avg_score: 0.85 },
      { variant: 'minimal-guidance', avg_score: 0.86 },
    ]
    const winner = { winner: 'minimal-guidance', winner_score: 0.86, runner_up: 'unguided-agent', runner_up_score: 0.85, delta: 0.01, confident: false }

    const analysis = analyzeReport(runs, summaries, winner)

    assert.equal(analysis.baseline_vs_unguided.wins, 1)
    assert.equal(analysis.baseline_vs_unguided.losses, 1)
    assert.equal(analysis.baseline_vs_unguided.total, 2)
    assert.match(analysis.findings.join('\n'), /trails unguided-agent/)
    assert.match(analysis.recommendations.join('\n'), /Simplify runtime guidance/)
  })
})
