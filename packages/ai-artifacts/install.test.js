const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { detectInvocationContext: detectClaudeInvocationContext } = require('./claude/audit-skill')
const { detectAgentTools, doctorAIArtifacts } = require('./doctor')
const { installAIArtifacts } = require('./install')
const { detectInvocationContext: detectOpencodeInvocationContext } = require('./opencode/skill-audit')

test('installAIArtifacts installs packaged files to repo paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-install-'))
  const packageRoot = path.join(root, 'package')

  try {
    const targetPath = path.join(root, '.github/workflows/ai-artifacts.yml')
    const schemaTargetPath = path.join(root, '.ai-artifacts/schemas/artifacts.schema.json')
    writePackageInstallFiles(packageRoot)

    const result = installAIArtifacts(root, { packageRoot })

    assert.equal(result.installed, true)
    assert.equal(fs.readFileSync(targetPath, 'utf8'), 'name: AI Artifacts\n')
    assert.equal(fs.readFileSync(schemaTargetPath, 'utf8'), '{"title":"schema"}\n')
    assert.equal(fs.readFileSync(path.join(root, '.claude/hooks/audit-skill.js'), 'utf8'), 'claude audit\n')
    assert.equal(fs.readFileSync(path.join(root, '.opencode/plugin/skill-audit.js'), 'utf8'), 'opencode audit\n')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('installAIArtifacts is idempotent when files are already installed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-install-idempotent-'))
  const packageRoot = path.join(root, 'package')

  try {
    writePackageInstallFiles(packageRoot)

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
    const targetPath = path.join(root, '.github/workflows/ai-artifacts.yml')
    const schemaTargetPath = path.join(root, '.ai-artifacts/schemas/artifacts.schema.json')
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.mkdirSync(path.dirname(schemaTargetPath), { recursive: true })
    writePackageInstallFiles(packageRoot)
    fs.writeFileSync(targetPath, 'name: stale\n', 'utf8')
    fs.writeFileSync(schemaTargetPath, '{"title":"schema"}\n', 'utf8')
    fs.mkdirSync(path.join(root, '.claude/hooks'), { recursive: true })
    fs.mkdirSync(path.join(root, '.opencode/plugin'), { recursive: true })
    fs.writeFileSync(path.join(root, '.claude/hooks/audit-skill.js'), 'claude audit\n', 'utf8')
    fs.writeFileSync(path.join(root, '.opencode/plugin/skill-audit.js'), 'opencode audit\n', 'utf8')

    assert.throws(() => installAIArtifacts(root, { check: true, packageRoot }), /workflow is stale/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('installAIArtifacts does not overwrite existing opencode artifact paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-install-opencode-collision-'))
  const packageRoot = path.join(root, 'package')

  try {
    writePackageInstallFiles(packageRoot)
    fs.mkdirSync(path.join(root, '.ai-artifacts'), { recursive: true })
    fs.writeFileSync(path.join(root, '.ai-artifacts/artifacts.yml'), `version: 1
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
`, 'utf8')
    fs.mkdirSync(path.join(root, '.opencode/skills'), { recursive: true })
    fs.writeFileSync(path.join(root, '.opencode/skills/local.txt'), 'user content\n', 'utf8')

    assert.throws(
      () => installAIArtifacts(root, { packageRoot }),
      /.opencode\/skills already exists; remove it manually before installing opencode artifacts/,
    )
    assert.equal(fs.readFileSync(path.join(root, '.opencode/skills/local.txt'), 'utf8'), 'user content\n')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('packaged workflow watches agentic source paths', () => {
  const workflow = fs.readFileSync(path.join(__dirname, 'workflows/ai-artifacts.yml'), 'utf8')

  assert.match(workflow, /'\.github\/agent\/\*\*'/)
  assert.match(workflow, /'\.github\/overlays\/\*\*'/)
  assert.match(workflow, /'\.github\/skills\/\*\*'/)
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
    writePackageInstallFiles(packageRoot)
    fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true })
    fs.mkdirSync(path.join(root, '.ai-artifacts/schemas'), { recursive: true })
    fs.mkdirSync(path.join(root, '.claude/hooks'), { recursive: true })
    fs.mkdirSync(path.join(root, '.opencode/plugin'), { recursive: true })
    fs.writeFileSync(path.join(root, '.github/workflows/ai-artifacts.yml'), 'name: AI Artifacts\n', 'utf8')
    fs.writeFileSync(path.join(root, '.ai-artifacts/schemas/artifacts.schema.json'), '{"title":"schema"}\n', 'utf8')
    fs.writeFileSync(path.join(root, '.claude/hooks/audit-skill.js'), 'claude audit\n', 'utf8')
    fs.writeFileSync(path.join(root, '.opencode/plugin/skill-audit.js'), 'opencode audit\n', 'utf8')

    const result = doctorAIArtifacts(root, { packageRoot, env: { OPENCODE: '1' } })

    assert.equal(result.ok, true)
    assert.deepEqual(result.detectedTools, [{ name: 'opencode', confidence: 'medium' }])
    assert.equal(result.checks.some((check) => check.message.includes('opencode project config exists')), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('framework provides tool-specific audit files', () => {
  assert.equal(fs.existsSync(path.join(__dirname, 'claude/install.js')), true)
  assert.equal(fs.existsSync(path.join(__dirname, 'claude/audit-skill.js')), true)
  assert.equal(fs.existsSync(path.join(__dirname, 'opencode/install.js')), true)
  assert.equal(fs.existsSync(path.join(__dirname, 'opencode/skill-audit.js')), true)
})

test('audit entries distinguish direct user and named agent invocations', () => {
  assert.deepEqual(detectClaudeInvocationContext({ origin: 'user' }), {
    invocation_origin: 'user',
    invocation_tool: 'claude-code',
    invocation_agent: null,
  })
  assert.deepEqual(detectClaudeInvocationContext({ agent: { name: 'task-reviewer' } }), {
    invocation_origin: 'agent',
    invocation_tool: 'claude-code',
    invocation_agent: 'task-reviewer',
  })
  assert.deepEqual(detectOpencodeInvocationContext({ source: 'agent' }), {
    invocation_origin: 'agent',
    invocation_tool: 'opencode',
    invocation_agent: null,
  })
  assert.deepEqual(detectOpencodeInvocationContext({ session: { agent: 'doc-ops' } }), {
    invocation_origin: 'agent',
    invocation_tool: 'opencode',
    invocation_agent: 'doc-ops',
  })
})

function writePackageInstallFiles(packageRoot) {
  fs.mkdirSync(path.join(packageRoot, 'workflows'), { recursive: true })
  fs.mkdirSync(path.join(packageRoot, 'schemas'), { recursive: true })
  fs.mkdirSync(path.join(packageRoot, 'claude'), { recursive: true })
  fs.mkdirSync(path.join(packageRoot, 'opencode'), { recursive: true })
  fs.writeFileSync(path.join(packageRoot, 'workflows/ai-artifacts.yml'), 'name: AI Artifacts\n', 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'schemas/artifacts.schema.json'), '{"title":"schema"}\n', 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'claude/audit-skill.js'), 'claude audit\n', 'utf8')
  fs.writeFileSync(path.join(packageRoot, 'opencode/skill-audit.js'), 'opencode audit\n', 'utf8')
}
