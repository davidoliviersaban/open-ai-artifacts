'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { discoverVariants, parseArgs, runWithConcurrency } = require('./batch.js')

describe('parseArgs', () => {
  it('parses bounded parallel concurrency', () => {
    assert.equal(parseArgs(['--parallel', '3']).parallel, 3)
  })

  it('keeps unbounded parallel mode for --parallel without a value', () => {
    assert.equal(parseArgs(['--parallel']).parallel, Infinity)
  })
})

describe('discoverVariants', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-batch-'))
    fs.mkdirSync(path.join(tmpDir, 'variants', 'old-a'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'variants', 'old-b'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'variants', 'old-a', 'variant.json'), '{}')
    fs.writeFileSync(path.join(tmpDir, 'variants', 'old-b', 'variant.json'), '{}')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('uses the focused baseline variant list when present', () => {
    fs.writeFileSync(path.join(tmpDir, 'baseline.json'), JSON.stringify({ variants: ['baseline-guidance', 'baseline-no-docs'] }))

    assert.deepEqual(discoverVariants(tmpDir), ['baseline-guidance', 'baseline-no-docs'])
  })

  it('falls back to discovered variants without a baseline list', () => {
    assert.deepEqual(discoverVariants(tmpDir).sort(), ['old-a', 'old-b'])
  })
})

describe('runWithConcurrency', () => {
  it('does not run more than the requested number of workers', async () => {
    let active = 0
    let maxActive = 0

    await runWithConcurrency([1, 2, 3, 4, 5], 2, async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active--
    })

    assert.equal(maxActive, 2)
  })
})
