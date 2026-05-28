'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { filterScorableDiff, isIsolatedAgentArtifact, isScorablePath, runCriteria } = require('./score.js')

describe('isIsolatedAgentArtifact', () => {
  it('matches agent artifacts removed or rewritten by benchmark isolation', () => {
    assert.equal(isIsolatedAgentArtifact('AGENTS.md'), true)
    assert.equal(isIsolatedAgentArtifact('CLAUDE.md'), true)
    assert.equal(isIsolatedAgentArtifact('.github/skills/ship/SKILL.md'), true)
    assert.equal(isIsolatedAgentArtifact('.github/agent/task-planner.md'), true)
    assert.equal(isIsolatedAgentArtifact('.claude/settings.json'), true)
  })

  it('does not match source or docs files scored by criteria', () => {
    assert.equal(isIsolatedAgentArtifact('packages/ai-artifacts/lib.js'), false)
    assert.equal(isIsolatedAgentArtifact('docs/usage.md'), false)
  })
})

describe('filterScorableDiff', () => {
  it('removes isolated agent artifact file diffs and keeps source changes', () => {
    const diff = [
      'diff --git a/.github/skills/ship/SKILL.md b/.github/skills/ship/SKILL.md',
      'deleted file mode 100644',
      '--- a/.github/skills/ship/SKILL.md',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-# Ship',
      'diff --git a/packages/ai-artifacts/lib.js b/packages/ai-artifacts/lib.js',
      '--- a/packages/ai-artifacts/lib.js',
      '+++ b/packages/ai-artifacts/lib.js',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      '',
    ].join('\n')

    const filtered = filterScorableDiff(diff)

    assert.equal(filtered.includes('.github/skills/ship/SKILL.md'), false)
    assert.equal(filtered.includes('packages/ai-artifacts/lib.js'), true)
    assert.equal(filtered.includes('+new'), true)
  })

  it('removes broad non-scorable documentation churn that can conflict during replay', () => {
    const diff = [
      'diff --git a/docs/adr/SEMANTIC-MERGE-DESIGN.md b/docs/adr/SEMANTIC-MERGE-DESIGN.md',
      '--- a/docs/adr/SEMANTIC-MERGE-DESIGN.md',
      '+++ b/docs/adr/SEMANTIC-MERGE-DESIGN.md',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/README.md b/README.md',
      '--- a/README.md',
      '+++ b/README.md',
      '@@ -1 +1 @@',
      '-old',
      '+mergeConfigs documents the merge behavior',
      '',
    ].join('\n')

    const filtered = filterScorableDiff(diff)

    assert.equal(filtered.includes('docs/adr/SEMANTIC-MERGE-DESIGN.md'), false)
    assert.equal(filtered.includes('README.md'), true)
    assert.equal(filtered.includes('mergeConfigs'), true)
  })
})

describe('isScorablePath', () => {
  it('keeps source, tests, and closest public docs used by criteria', () => {
    assert.equal(isScorablePath('packages/ai-artifacts/lib.js'), true)
    assert.equal(isScorablePath('packages/ai-artifacts/lib.merge-configs.test.js'), true)
    assert.equal(isScorablePath('packages/ai-artifacts/README.md'), true)
    assert.equal(isScorablePath('README.md'), true)
  })

  it('filters broad repository docs and workflow files outside scoring scope', () => {
    assert.equal(isScorablePath('docs/adr/SEMANTIC-MERGE-DESIGN.md'), false)
    assert.equal(isScorablePath('.github/WORKFLOW.md'), false)
    assert.equal(isScorablePath('packages/ai-artifacts/claude/README.md'), false)
  })
})

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
