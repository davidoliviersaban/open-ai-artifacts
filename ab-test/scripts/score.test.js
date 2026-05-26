'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { runCriteria } = require('./score.js')

describe('runCriteria', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-score-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('marks passing criterion as pass=true', () => {
    const criteria = [{ id: 'always_pass', command: 'true' }]
    const results = runCriteria(criteria, tmpDir)
    assert.deepEqual(results, [{ id: 'always_pass', pass: true }])
  })

  it('marks failing criterion as pass=false', () => {
    const criteria = [{ id: 'always_fail', command: 'false' }]
    const results = runCriteria(criteria, tmpDir)
    assert.deepEqual(results, [{ id: 'always_fail', pass: false }])
  })

  it('runs multiple criteria independently', () => {
    const criteria = [
      { id: 'pass1', command: 'true' },
      { id: 'fail1', command: 'false' },
      { id: 'pass2', command: 'echo ok' },
    ]
    const results = runCriteria(criteria, tmpDir)
    assert.equal(results[0].pass, true)
    assert.equal(results[1].pass, false)
    assert.equal(results[2].pass, true)
  })

  it('executes commands in the given cwd', () => {
    fs.writeFileSync(path.join(tmpDir, 'marker.txt'), 'found')
    const criteria = [{ id: 'check_file', command: 'test -f marker.txt' }]
    const results = runCriteria(criteria, tmpDir)
    assert.equal(results[0].pass, true)
  })

  it('fails when file does not exist in cwd', () => {
    const criteria = [{ id: 'no_file', command: 'test -f does_not_exist.txt' }]
    const results = runCriteria(criteria, tmpDir)
    assert.equal(results[0].pass, false)
  })

  it('handles node -e assertions', () => {
    const criteria = [{
      id: 'node_assert',
      command: 'node -e "if(1+1!==2) process.exit(1)"',
    }]
    const results = runCriteria(criteria, tmpDir)
    assert.equal(results[0].pass, true)
  })

  it('handles node -e failures', () => {
    const criteria = [{
      id: 'node_fail',
      command: 'node -e "process.exit(1)"',
    }]
    const results = runCriteria(criteria, tmpDir)
    assert.equal(results[0].pass, false)
  })
})
