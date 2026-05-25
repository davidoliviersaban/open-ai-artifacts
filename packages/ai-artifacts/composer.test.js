const assert = require('node:assert/strict')
const test = require('node:test')

const {
  applySubstitutions,
  composeContent,
  normalizeNewline,
  parseArtifactConfig,
  sha256,
} = require('./lib')

test('composeContent appends overlays after a markdown separator', () => {
  const result = composeContent('# Upstream\n', [
    { path: 'overlay-a.md', content: '# Overlay A\n' },
    { path: 'overlay-b.md', content: '# Overlay B\n' },
  ])

  assert.equal(result, '# Upstream\n\n---\n\n# Overlay A\n\n# Overlay B\n')
})

test('applySubstitutions replaces all literal occurrences in order', () => {
  const result = applySubstitutions('Use .copilot-tracking/ with GitHub Copilot.', [
    { from: '.copilot-tracking/', to: '.ai-tracking/' },
    { from: 'GitHub Copilot', to: 'AI coding agents' },
  ])

  assert.equal(result, 'Use .ai-tracking/ with AI coding agents.')
})

test('sha256 normalizes CRLF and LF to same hash', () => {
  assert.equal(sha256('a\r\nb\r\n'), sha256('a\nb\n'))
})

test('normalizeNewline converts CRLF to LF', () => {
  assert.equal(normalizeNewline('a\r\nb'), 'a\nb')
})

test('parseArtifactConfig rejects YAML flow sequences', () => {
  assert.throws(() => parseArtifactConfig('failOn: [High, Medium]'), /unsupported YAML flow syntax/)
})

test('parseArtifactConfig rejects YAML flow mappings', () => {
  assert.throws(() => parseArtifactConfig('pkg: {type: git, repo: x}'), /unsupported YAML flow syntax/)
})

test('parseArtifactConfig supports escaped newlines in double-quoted strings', () => {
  const config = parseArtifactConfig('substitution:\n  to: "name: skill\\ndisable-model-invocation: true"')

  assert.equal(config.substitution.to, 'name: skill\ndisable-model-invocation: true')
})
