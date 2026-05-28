const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { getBaselineId, groupRunsByBaseline, loadRuns, generateReport, selectActiveReport, summarizeBaseline } = require('./report.js')

test('getBaselineId extracts baseline id from run', () => {
  assert.equal(getBaselineId({ baseline: { id: 'v1' } }), 'v1')
  assert.equal(getBaselineId({ baseline: null }), 'legacy-unversioned')
  assert.equal(getBaselineId({}), 'legacy-unversioned')
})

test('groupRunsByBaseline separates runs by baseline id', () => {
  const runs = [
    { baseline: { id: 'v1' }, variant: 'a' },
    { baseline: { id: 'v2' }, variant: 'b' },
    { baseline: { id: 'v1' }, variant: 'c' },
  ]
  const groups = groupRunsByBaseline(runs)
  assert.equal(groups.v1.length, 2)
  assert.equal(groups.v2.length, 1)
})

test('selectActiveReport prefers non-legacy baselines', () => {
  const reports = [
    { baseline: { id: 'legacy-unversioned' }, run_count: 10 },
    { baseline: { id: 'v1', created_at: '2026-05-01' }, run_count: 5 },
    { baseline: { id: 'v2', created_at: '2026-05-28' }, run_count: 3 },
  ]
  const active = selectActiveReport(reports)
  assert.equal(active.baseline.id, 'v2')
})

test('selectActiveReport falls back to legacy when no versioned baseline', () => {
  const reports = [{ baseline: { id: 'legacy-unversioned' }, run_count: 10 }]
  const active = selectActiveReport(reports)
  assert.equal(active.baseline.id, 'legacy-unversioned')
})

test('summarizeBaseline computes variant summaries and winner', () => {
  const runs = [
    { variant: 'a', final_score: 0.9, criteria_score: 1.0, tokens_used: 10000, time_seconds: 60, cost_usd: 0.5, criteria_passed: 3, criteria_total: 3, criteria_results: [], baseline: { id: 'v1' } },
    { variant: 'a', final_score: 0.8, criteria_score: 0.8, tokens_used: 15000, time_seconds: 90, cost_usd: 0.7, criteria_passed: 2, criteria_total: 3, criteria_results: [], baseline: { id: 'v1' } },
    { variant: 'b', final_score: 0.5, criteria_score: 0.5, tokens_used: 20000, time_seconds: 120, cost_usd: 1.0, criteria_passed: 1, criteria_total: 3, criteria_results: [], baseline: { id: 'v1' } },
  ]
  const result = summarizeBaseline('v1', runs)
  assert.equal(result.baseline.id, 'v1')
  assert.equal(result.run_count, 3)
  assert.equal(result.variants.length, 2)
  assert.equal(result.winner.winner, 'a')
})

test('loadRuns reads scored runs from directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-loadruns-'))
  try {
    const runDir = path.join(root, 'run1')
    fs.mkdirSync(runDir, { recursive: true })
    fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify({ variant: 'a', challenge: 'c1', baseline: { id: 'v1' } }))
    fs.writeFileSync(path.join(runDir, 'score.json'), JSON.stringify({ final_score: 0.8, criteria_score: 1.0, criteria_passed: 2, criteria_total: 2, criteria_results: [] }))
    fs.writeFileSync(path.join(runDir, 'usage.json'), JSON.stringify({ total_tokens: 5000, cost_usd: 0.3 }))

    // Non-scored run should be skipped
    const runDir2 = path.join(root, 'run2')
    fs.mkdirSync(runDir2)
    fs.writeFileSync(path.join(runDir2, 'metadata.json'), JSON.stringify({ variant: 'b' }))

    const runs = loadRuns(root)
    assert.equal(runs.length, 1)
    assert.equal(runs[0].variant, 'a')
    assert.equal(runs[0].final_score, 0.8)
    assert.equal(runs[0].baseline.id, 'v1')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('loadRuns returns empty for nonexistent dir', () => {
  assert.deepEqual(loadRuns('/nonexistent'), [])
})

test('generateReport produces summary with winner', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-report-'))
  try {
    const runs = [
      { variant: 'a', final_score: 0.9, criteria_score: 1.0, tokens_used: 10000, time_seconds: 60, cost_usd: 0.5, criteria_passed: 3, criteria_total: 3, criteria_results: [{ id: 'c1', pass: true }], baseline: { id: 'v1', created_at: '2026-05-28' } },
      { variant: 'b', final_score: 0.5, criteria_score: 0.5, tokens_used: 20000, time_seconds: 120, cost_usd: 1.0, criteria_passed: 1, criteria_total: 3, criteria_results: [{ id: 'c1', pass: false }], baseline: { id: 'v1', created_at: '2026-05-28' } },
    ]

    const result = generateReport(runs, root)
    assert.equal(result.winner.winner, 'a')
    assert.equal(result.summaries.length, 2)
    assert.ok(fs.existsSync(path.join(root, 'report.json')))

    const report = JSON.parse(fs.readFileSync(path.join(root, 'report.json'), 'utf8'))
    assert.equal(report.baseline.id, 'v1')
    assert.equal(report.winner.winner, 'a')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('generateReport returns empty result for no runs', () => {
  const result = generateReport([], null)
  assert.deepEqual(result, { summaries: [], winner: null })
})
