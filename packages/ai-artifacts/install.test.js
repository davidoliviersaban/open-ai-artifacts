const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { detectAgentTools, doctorAIArtifacts } = require('./doctor')
const { installAIArtifacts } = require('./install')

test('installAIArtifacts installs packaged files to repo paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-install-'))
  const packageRoot = path.join(root, 'package')

  try {
    const sourcePath = path.join(packageRoot, 'workflows/ai-artifacts.yml')
    const schemaSourcePath = path.join(packageRoot, 'schemas/artifacts.schema.json')
    const targetPath = path.join(root, '.github/workflows/ai-artifacts.yml')
    const schemaTargetPath = path.join(root, '.ai-artifacts/schemas/artifacts.schema.json')
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
    fs.mkdirSync(path.dirname(schemaSourcePath), { recursive: true })
    fs.writeFileSync(sourcePath, 'name: AI Artifacts\n', 'utf8')
    fs.writeFileSync(schemaSourcePath, '{"title":"schema"}\n', 'utf8')

    const result = installAIArtifacts(root, { packageRoot })

    assert.equal(result.installed, true)
    assert.equal(fs.readFileSync(targetPath, 'utf8'), 'name: AI Artifacts\n')
    assert.equal(fs.readFileSync(schemaTargetPath, 'utf8'), '{"title":"schema"}\n')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('installAIArtifacts is idempotent when files are already installed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-install-idempotent-'))
  const packageRoot = path.join(root, 'package')

  try {
    const sourcePath = path.join(packageRoot, 'workflows/ai-artifacts.yml')
    const schemaSourcePath = path.join(packageRoot, 'schemas/artifacts.schema.json')
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
    fs.mkdirSync(path.dirname(schemaSourcePath), { recursive: true })
    fs.writeFileSync(sourcePath, 'name: AI Artifacts\n', 'utf8')
    fs.writeFileSync(schemaSourcePath, '{"title":"schema"}\n', 'utf8')

    const first = installAIArtifacts(root, { packageRoot })
    const second = installAIArtifacts(root, { packageRoot })

    assert.equal(first.installed, true)
    assert.equal(second.installed, false)
    assert.equal(second.files.every((file) => file.installed === false && file.checked === false), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('installAIArtifacts check mode fails when installed workflow is stale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-install-check-'))
  const packageRoot = path.join(root, 'package')

  try {
    const sourcePath = path.join(packageRoot, 'workflows/ai-artifacts.yml')
    const schemaSourcePath = path.join(packageRoot, 'schemas/artifacts.schema.json')
    const targetPath = path.join(root, '.github/workflows/ai-artifacts.yml')
    const schemaTargetPath = path.join(root, '.ai-artifacts/schemas/artifacts.schema.json')
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
    fs.mkdirSync(path.dirname(schemaSourcePath), { recursive: true })
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.mkdirSync(path.dirname(schemaTargetPath), { recursive: true })
    fs.writeFileSync(sourcePath, 'name: AI Artifacts\n', 'utf8')
    fs.writeFileSync(schemaSourcePath, '{"title":"schema"}\n', 'utf8')
    fs.writeFileSync(targetPath, 'name: stale\n', 'utf8')
    fs.writeFileSync(schemaTargetPath, '{"title":"schema"}\n', 'utf8')

    assert.throws(() => installAIArtifacts(root, { check: true, packageRoot }), /workflow is stale/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('detectAgentTools detects common tool environment markers', () => {
  const tools = detectAgentTools({
    OPENCODE: '1',
    VSCODE_PID: '123',
    CURSOR_TRACE_ID: 'trace',
    CLAUDE_CODE: '1',
  })

  assert.deepEqual(tools.map((tool) => tool.name), ['opencode', 'claude-code', 'cursor', 'vscode'])
})

test('doctorAIArtifacts reports required setup and optional opencode outputs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-doctor-'))
  const packageRoot = path.join(root, 'package')

  try {
    fs.mkdirSync(path.join(root, '.ai-artifacts'), { recursive: true })
    fs.writeFileSync(path.join(root, 'package.json'), '{}\n', 'utf8')
    fs.writeFileSync(path.join(root, '.ai-artifacts/artifacts.yml'), 'version: 1\n', 'utf8')
    fs.writeFileSync(path.join(root, '.ai-artifacts/lock.yml'), 'version: 1\n', 'utf8')
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Agents\n', 'utf8')
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Agents\n', 'utf8')
    fs.mkdirSync(path.join(root, '.opencode/agent'), { recursive: true })
    fs.mkdirSync(path.join(root, '.opencode/skills'), { recursive: true })
    fs.writeFileSync(path.join(root, '.opencode/opencode.json'), '{}\n', 'utf8')
    fs.mkdirSync(path.join(packageRoot, 'workflows'), { recursive: true })
    fs.mkdirSync(path.join(packageRoot, 'schemas'), { recursive: true })
    fs.writeFileSync(path.join(packageRoot, 'workflows/ai-artifacts.yml'), 'name: AI Artifacts\n', 'utf8')
    fs.writeFileSync(path.join(packageRoot, 'schemas/artifacts.schema.json'), '{"title":"schema"}\n', 'utf8')
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true })
    fs.mkdirSync(path.join(root, '.ai-artifacts/schemas'), { recursive: true })
    fs.writeFileSync(path.join(root, '.github/workflows/ai-artifacts.yml'), 'name: AI Artifacts\n', 'utf8')
    fs.writeFileSync(path.join(root, '.ai-artifacts/schemas/artifacts.schema.json'), '{"title":"schema"}\n', 'utf8')

    const result = doctorAIArtifacts(root, { packageRoot, env: { OPENCODE: '1' } })

    assert.equal(result.ok, true)
    assert.deepEqual(result.detectedTools, [{ name: 'opencode', confidence: 'medium' }])
    assert.equal(result.checks.some((check) => check.message.includes('opencode project config exists')), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
