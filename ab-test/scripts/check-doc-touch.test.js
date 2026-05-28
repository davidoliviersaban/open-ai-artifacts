const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { isDocFile, isPublicAPIFile, isTestOnly } = require('./check-doc-touch.js')

describe('isDocFile', () => {
  it('matches docs/**/*.md', () => {
    assert.ok(isDocFile('docs/installation-guide.md'))
    assert.ok(isDocFile('docs/adr/001-something.md'))
  })

  it('matches root README.md', () => {
    assert.ok(isDocFile('README.md'))
  })

  it('matches package README.md', () => {
    assert.ok(isDocFile('packages/ai-artifacts/README.md'))
  })

  it('does not match source files', () => {
    assert.ok(!isDocFile('packages/ai-artifacts/lib.js'))
    assert.ok(!isDocFile('ab-test/scripts/report.js'))
  })

  it('does not match test files', () => {
    assert.ok(!isDocFile('packages/ai-artifacts/lib.test.js'))
  })
})

describe('isPublicAPIFile', () => {
  it('matches lib.js, app.js, cli.js', () => {
    assert.ok(isPublicAPIFile('packages/ai-artifacts/lib.js'))
    assert.ok(isPublicAPIFile('packages/ai-artifacts/app.js'))
    assert.ok(isPublicAPIFile('packages/ai-artifacts/cli.js'))
  })

  it('does not match test files', () => {
    assert.ok(!isPublicAPIFile('packages/ai-artifacts/lib.test.js'))
  })

  it('does not match other packages', () => {
    assert.ok(!isPublicAPIFile('packages/other/lib.js'))
  })
})

describe('isTestOnly', () => {
  it('returns true for test-only changes', () => {
    assert.ok(isTestOnly(['packages/ai-artifacts/lib.test.js', 'packages/ai-artifacts/app.test.js']))
  })

  it('returns true for test/ directory changes', () => {
    assert.ok(isTestOnly(['test/fixtures/sample.js']))
  })

  it('returns false when source files change', () => {
    assert.ok(!isTestOnly(['packages/ai-artifacts/lib.js', 'packages/ai-artifacts/lib.test.js']))
  })

  it('returns true for empty list', () => {
    assert.ok(isTestOnly([]))
  })
})
