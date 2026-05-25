const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
  applySubstitutions,
  composeContent,
  normalizeNewline,
  parseArtifactConfig,
  sha256,
  validateArtifactConfig,
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

test('schema documents overlaysDir and link steps supported by validation', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schemas/artifacts.schema.json'), 'utf8'))
  const config = parseArtifactConfig(`version: 1
overlaysDir: .github/overlays
packages:
  upstream:
    type: git
    repo: https://example.test/upstream.git
    version: v1
artifacts:
  - id: opencode-skills
    kind: config
    target: .opencode/skills
    steps:
      - link:
          target: .github/skills
          to: .opencode/skills
`)

  assert.doesNotThrow(() => validateArtifactConfig(config))
  assert.ok(schema.properties.overlaysDir, 'schema must model overlaysDir')
  assert.ok(schema.$defs.linkStep, 'schema must model link steps')
  assert.ok(
    schema.properties.artifacts.items.properties.steps.items.oneOf.some((entry) => entry.$ref === '#/$defs/linkStep'),
    'artifact step schema must allow link steps',
  )
})
