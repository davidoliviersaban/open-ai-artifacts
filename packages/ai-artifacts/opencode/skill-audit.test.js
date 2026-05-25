const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

const skillAuditPlugin = require('./skill-audit')
const exportedSkillAuditPlugin = skillAuditPlugin.SkillAuditPlugin

test('opencode skill audit plugin appends audit entry for direct skill tool execution', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-opencode-audit-'))

  try {
    const plugin = await exportedSkillAuditPlugin({ project: { root } })

    await plugin['tool.execute.after']({
      tool: 'skill',
      session_id: 'session-123',
      args: { skill: 'multi-feature' },
    })

    const auditFile = path.join(root, '.ai-artifacts', 'audit.jsonl')
    const lines = fs.readFileSync(auditFile, 'utf8').trim().split('\n')
    assert.equal(lines.length, 1)

    const entry = JSON.parse(lines[0])
    assert.equal(entry.skill, 'multi-feature')
    assert.equal(entry.tool, 'skill')
    assert.equal(entry.session_id, 'session-123')
    assert.equal(entry.repo, path.basename(root))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('opencode skill audit plugin appends tool audit entry for script execution', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-opencode-audit-'))

  try {
    const plugin = await exportedSkillAuditPlugin({ project: { root } })

    await plugin['tool.execute.after']({
      tool: 'bash',
      session_id: 'session-script',
      args: { command: 'node .github/skills/ship/scripts/stats.js --format markdown' },
    })

    const toolAuditFile = path.join(root, '.ai-artifacts', 'tools.audit.jsonl')
    const localAuditFile = path.join(root, '.ai-artifacts', 'audit.local.jsonl')
    const toolEntry = JSON.parse(fs.readFileSync(toolAuditFile, 'utf8').trim())
    const localEntry = JSON.parse(fs.readFileSync(localAuditFile, 'utf8').trim())

    assert.equal(toolEntry.script, 'stats.js')
    assert.equal(toolEntry.script_path, '.github/skills/ship/scripts/stats.js')
    assert.equal(toolEntry.tool, 'bash')
    assert.equal(toolEntry.session_id, 'session-script')
    assert.equal(localEntry.script, 'stats.js')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('opencode skill audit plugin appends command audit entry for non-script bash execution', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-opencode-audit-'))

  try {
    const plugin = await exportedSkillAuditPlugin({ project: { root } })

    await plugin['tool.execute.after']({
      tool: 'bash',
      session_id: 'session-command',
      args: { command: 'git status --short --branch' },
    })

    const toolAuditFile = path.join(root, '.ai-artifacts', 'tools.audit.jsonl')
    const localAuditFile = path.join(root, '.ai-artifacts', 'audit.local.jsonl')
    const toolEntry = JSON.parse(fs.readFileSync(toolAuditFile, 'utf8').trim())
    const localEntry = JSON.parse(fs.readFileSync(localAuditFile, 'utf8').trim())

    assert.equal(toolEntry.command, 'git status --short --branch')
    assert.equal(toolEntry.tool, 'bash')
    assert.equal(toolEntry.session_id, 'session-command')
    assert.equal('script' in toolEntry, false)
    assert.equal(localEntry.command, 'git status --short --branch')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('opencode skill audit plugin supports two-argument OpenCode hook payloads', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-opencode-audit-'))

  try {
    const plugin = await exportedSkillAuditPlugin({ project: { root } })

    await plugin['tool.execute.after'](
      {
        tool: 'skill',
        sessionID: 'session-789',
      },
      {
        args: { skill: 'multi-feature' },
      },
    )

    const auditFile = path.join(root, '.ai-artifacts', 'audit.jsonl')
    const lines = fs.readFileSync(auditFile, 'utf8').trim().split('\n')
    assert.equal(lines.length, 1)

    const entry = JSON.parse(lines[0])
    assert.equal(entry.skill, 'multi-feature')
    assert.equal(entry.tool, 'skill')
    assert.equal(entry.session_id, 'session-789')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('opencode skill audit plugin resolves skill names from SKILL.md reads through symlinks', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-opencode-audit-'))

  try {
    fs.mkdirSync(path.join(root, '.github/skills/multi-feature'), { recursive: true })
    fs.mkdirSync(path.join(root, '.opencode'), { recursive: true })
    fs.writeFileSync(path.join(root, '.github/skills/multi-feature/SKILL.md'), '# Multi Feature\n', 'utf8')
    fs.symlinkSync('../.github/skills', path.join(root, '.opencode/skills'))

    const plugin = await exportedSkillAuditPlugin({ project: { root } })

    await plugin['tool.execute.after']({
      tool: 'read',
      sessionID: 'session-456',
      args: { filePath: path.join(root, '.opencode/skills/multi-feature/SKILL.md') },
    })

    const auditFile = path.join(root, '.ai-artifacts', 'audit.jsonl')
    const lines = fs.readFileSync(auditFile, 'utf8').trim().split('\n')
    assert.equal(lines.length, 1)

    const entry = JSON.parse(lines[0])
    assert.equal(entry.skill, 'multi-feature')
    assert.equal(entry.tool, 'read')
    assert.equal(entry.session_id, 'session-456')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('opencode skill audit plugin writes debug lifecycle entries when enabled', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-opencode-audit-'))
  const previousDebug = process.env.AI_ARTIFACTS_OPENCODE_AUDIT_DEBUG

  try {
    process.env.AI_ARTIFACTS_OPENCODE_AUDIT_DEBUG = '1'
    const plugin = await exportedSkillAuditPlugin({ project: { root } })

    await plugin['tool.execute.after']({ tool: 'noop' }, { args: {} })

    const debugFile = path.join(root, '.ai-artifacts', 'opencode-plugin-debug.jsonl')
    const entries = fs.readFileSync(debugFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.equal(entries[0].event, 'plugin.initialized')
    assert.equal(entries[1].event, 'tool.execute.after')
    assert.equal(entries[1].tool, 'noop')
    assert.deepEqual(entries[1].arg_keys, [])
    assert.equal('args' in entries[1], false)
  } finally {
    if (previousDebug === undefined) delete process.env.AI_ARTIFACTS_OPENCODE_AUDIT_DEBUG
    else process.env.AI_ARTIFACTS_OPENCODE_AUDIT_DEBUG = previousDebug
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('opencode skill audit plugin writes debug lifecycle entries from plugin options', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-opencode-audit-'))

  try {
    const plugin = await exportedSkillAuditPlugin({ project: { root } }, { debug: true })

    await plugin['tool.execute.after']({ tool: 'noop' }, { args: {} })

    const debugFile = path.join(root, '.ai-artifacts', 'opencode-plugin-debug.jsonl')
    const entries = fs.readFileSync(debugFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.equal(entries[0].event, 'plugin.initialized')
    assert.equal(entries[1].event, 'tool.execute.after')
    assert.deepEqual(entries[1].arg_keys, [])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('opencode skill audit plugin exposes a named OpenCode plugin export', async () => {
  const pluginModule = await import(pathToFileURL(path.join(__dirname, 'skill-audit.js')).href)

  assert.equal(typeof pluginModule.SkillAuditPlugin, 'function')
})

test('opencode skill audit plugin ignores duplicate registrations for the same root', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-opencode-audit-'))

  try {
    const first = await exportedSkillAuditPlugin({ project: { root } }, { debug: true })
    const second = await exportedSkillAuditPlugin({ project: { root } }, { debug: true })

    assert.equal(typeof first['tool.execute.after'], 'function')
    assert.deepEqual(second, {})
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
