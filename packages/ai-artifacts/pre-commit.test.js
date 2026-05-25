const assert = require('node:assert/strict')
const test = require('node:test')

const { AI_ARTIFACT_PATTERNS, matchesAIArtifactPath } = require('./lib')

test('matchesAIArtifactPath detects artifact playbook changes', () => {
  assert.equal(matchesAIArtifactPath('.ai-artifacts/artifacts.yml'), true)
  assert.equal(matchesAIArtifactPath('.ai-artifacts/overlays/common.md'), true)
  assert.equal(matchesAIArtifactPath('.ai-artifacts/files/claude-instructions/AGENTS.md'), true)
  assert.equal(matchesAIArtifactPath('scripts/ai-artifacts/app.js'), true)
})

test('matchesAIArtifactPath ignores non-artifact files', () => {
  assert.equal(matchesAIArtifactPath('README.md'), false)
  assert.equal(matchesAIArtifactPath('src/index.ts'), false)
  assert.equal(matchesAIArtifactPath('.ai-artifacts/lock.yml'), false)
  assert.equal(matchesAIArtifactPath('.ai-artifacts/reports/drift.md'), false)
})

test('AI_ARTIFACT_PATTERNS covers all expected trigger paths', () => {
  assert.equal(AI_ARTIFACT_PATTERNS.length, 4)

  const expected = [
    ['.ai-artifacts/artifacts.yml', true],
    ['.ai-artifacts/files/demo/SKILL.md', true],
    ['.ai-artifacts/overlays/rpi/task-research.md', true],
    ['scripts/ai-artifacts/lib.js', true],
    ['.ai-artifacts/lock.yml', false],
    ['.ai-artifacts/vendor/hve-core/README.md', false],
    ['package.json', false],
  ]

  for (const [filePath, shouldMatch] of expected) {
    assert.equal(matchesAIArtifactPath(filePath), shouldMatch, `${filePath} should ${shouldMatch ? '' : 'not '}match`)
  }
})
