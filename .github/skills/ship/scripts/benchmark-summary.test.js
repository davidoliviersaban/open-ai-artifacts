'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { generateMarkdownSummary, generateTerminalSummary } = require('./benchmark-summary.js')

const MOCK_REPORT = {
  summaries: [
    { variant: 'baseline-guidance', runs: 3, avg_score: 0.826, avg_criteria: 1.0, avg_tokens: 15953, avg_time: 252, avg_cost: 0.66, full_pass_rate: 1.0 },
    { variant: 'minimal-guidance', runs: 3, avg_score: 0.809, avg_criteria: 0.9, avg_tokens: 12793, avg_time: 205, avg_cost: 0.55, full_pass_rate: 0.67 },
    { variant: 'unguided-agent', runs: 3, avg_score: 0.800, avg_criteria: 0.9, avg_tokens: 9472, avg_time: 300, avg_cost: 0.46, full_pass_rate: 0.33 },
  ],
  winner: { winner: 'baseline-guidance', winner_score: 0.826, runner_up: 'minimal-guidance', runner_up_score: 0.809, delta: 0.017, confident: false },
}

describe('generateMarkdownSummary', () => {
  it('returns null for empty report', () => {
    assert.equal(generateMarkdownSummary(null), null)
    assert.equal(generateMarkdownSummary({ summaries: [] }), null)
  })

  it('generates a markdown table sorted by score', () => {
    const md = generateMarkdownSummary(MOCK_REPORT)
    assert.ok(md.includes('| baseline-guidance |'))
    assert.ok(md.includes('| minimal-guidance |'))
    assert.ok(md.includes('| unguided-agent |'))
    const lines = md.split('\n')
    const dataLines = lines.filter(l => l.startsWith('| ') && !l.startsWith('| Variant') && !l.startsWith('|--'))
    assert.ok(dataLines[0].includes('baseline-guidance'))
    assert.ok(dataLines[2].includes('unguided-agent'))
  })

  it('includes winner verdict', () => {
    const md = generateMarkdownSummary(MOCK_REPORT)
    assert.ok(md.includes('**Winner: baseline-guidance**'))
    assert.ok(md.includes('Δ=0.017'))
  })

  it('marks thin margin', () => {
    const md = generateMarkdownSummary(MOCK_REPORT)
    assert.ok(md.includes('thin margin'))
  })

  it('does not mark thin margin when confident', () => {
    const confident = { ...MOCK_REPORT, winner: { ...MOCK_REPORT.winner, confident: true } }
    const md = generateMarkdownSummary(confident)
    assert.ok(!md.includes('thin margin'))
  })
})

describe('generateTerminalSummary', () => {
  it('returns null for empty report', () => {
    assert.equal(generateTerminalSummary(null), null)
  })

  it('includes all variants', () => {
    const out = generateTerminalSummary(MOCK_REPORT)
    assert.ok(out.includes('baseline-guidance'))
    assert.ok(out.includes('minimal-guidance'))
    assert.ok(out.includes('unguided-agent'))
  })

  it('includes winner line', () => {
    const out = generateTerminalSummary(MOCK_REPORT)
    assert.ok(out.includes('Winner:'))
    assert.ok(out.includes('baseline-guidance'))
  })
})
