'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { BatchProgress, formatDuration, renderBar } = require('./progress.js')

describe('formatDuration', () => {
  it('formats seconds', () => {
    assert.equal(formatDuration(0), '0s')
    assert.equal(formatDuration(45), '45s')
    assert.equal(formatDuration(59), '59s')
  })

  it('formats minutes and seconds', () => {
    assert.equal(formatDuration(60), '1m')
    assert.equal(formatDuration(90), '1m30s')
    assert.equal(formatDuration(125), '2m05s')
  })

  it('formats hours', () => {
    assert.equal(formatDuration(3600), '1h00m')
    assert.equal(formatDuration(3720), '1h02m')
  })
})

describe('renderBar', () => {
  it('renders empty bar at 0', () => {
    const bar = renderBar(0)
    assert.ok(bar.includes('░'))
    assert.ok(!bar.includes('█'))
  })

  it('renders full bar at 1', () => {
    const bar = renderBar(1)
    assert.ok(bar.includes('█'))
    assert.ok(!bar.includes('░'))
  })

  it('renders partial bar', () => {
    const bar = renderBar(0.5)
    assert.ok(bar.includes('█'))
    assert.ok(bar.includes('░'))
  })
})

describe('BatchProgress', () => {
  it('tracks completed runs', () => {
    const p = new BatchProgress(5)
    assert.equal(p.completedRuns, 0)
    p.markStarted('a', 'run A')
    p.markCompleted('a')
    assert.equal(p.completedRuns, 1)
  })

  it('calculates average run time', () => {
    const p = new BatchProgress(3)
    p.markStarted('a', 'run A')
    p.completedTimes.push(100)
    p.completedTimes.push(200)
    assert.equal(p.getAvgRunTime(), 150)
  })

  it('uses maxTimePerRun as default when no completions', () => {
    const p = new BatchProgress(3, { maxTimePerRun: 250 })
    assert.equal(p.getAvgRunTime(), 250)
  })

  it('estimates ETA based on remaining runs and parallelism', () => {
    const p = new BatchProgress(6)
    p.completedTimes.push(100, 100)
    p.completedRuns = 2
    p.markStarted('b', 'run B')
    p.markStarted('c', 'run C')
    // 4 remaining, 2 active (parallelism=2), avg=100s → 2 batches × 100s = 200s
    assert.equal(p.getETA(), 200)
  })
})
