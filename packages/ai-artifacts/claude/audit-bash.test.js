const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { extractScript, processInput, writeScriptAuditEntry, writeCommandAuditEntry } = require('./audit-bash')

test('extractScript returns script path for known skill scripts', () => {
  const result = extractScript('node .github/skills/ship/scripts/stats.js --format markdown')
  assert.equal(result, '.github/skills/ship/scripts/stats.js')
})

test('extractScript returns script path for package scripts', () => {
  const result = extractScript('node packages/ai-artifacts/cli.js validate')
  assert.equal(result, 'packages/ai-artifacts/cli.js')
})

test('extractScript returns null for non-script commands', () => {
  assert.equal(extractScript('git status --short'), null)
  assert.equal(extractScript('npm test'), null)
  assert.equal(extractScript(''), null)
})

test('extractScript returns null for scripts outside known dirs', () => {
  assert.equal(extractScript('node some/random/script.js'), null)
})

test('writeScriptAuditEntry writes to tools.audit.jsonl and audit.local.jsonl', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-'))
  try {
    const input = { cwd: root, session_id: 'sess-1', tool_name: 'Bash', tool_input: { command: 'node .github/skills/ship/scripts/stats.js' } }
    writeScriptAuditEntry(input, '.github/skills/ship/scripts/stats.js', 'node .github/skills/ship/scripts/stats.js')

    const toolsFile = path.join(root, '.ai-artifacts', 'tools.audit.jsonl')
    const localFile = path.join(root, '.ai-artifacts', 'audit.local.jsonl')
    const toolEntry = JSON.parse(fs.readFileSync(toolsFile, 'utf8').trim())
    const localEntry = JSON.parse(fs.readFileSync(localFile, 'utf8').trim())

    assert.equal(toolEntry.script, 'stats.js')
    assert.equal(toolEntry.script_path, '.github/skills/ship/scripts/stats.js')
    assert.equal(toolEntry.tool, 'Bash')
    assert.equal(toolEntry.session_id, 'sess-1')
    assert.equal(localEntry.script, 'stats.js')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('writeCommandAuditEntry writes non-script commands to audit files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-'))
  try {
    const input = { cwd: root, session_id: 'sess-2', tool_name: 'Bash', tool_input: { command: 'git status --short --branch' } }
    writeCommandAuditEntry(input, 'git status --short --branch')

    const toolsFile = path.join(root, '.ai-artifacts', 'tools.audit.jsonl')
    const localFile = path.join(root, '.ai-artifacts', 'audit.local.jsonl')
    const toolEntry = JSON.parse(fs.readFileSync(toolsFile, 'utf8').trim())
    const localEntry = JSON.parse(fs.readFileSync(localFile, 'utf8').trim())

    assert.equal(toolEntry.command, 'git status --short --branch')
    assert.equal(toolEntry.tool, 'Bash')
    assert.equal(toolEntry.session_id, 'sess-2')
    assert.equal('script' in toolEntry, false)
    assert.equal(localEntry.command, 'git status --short --branch')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('writeCommandAuditEntry truncates long commands to 200 chars', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-'))
  try {
    const longCommand = 'x'.repeat(300)
    const input = { cwd: root, session_id: 'sess-3', tool_name: 'Bash', tool_input: { command: longCommand } }
    writeCommandAuditEntry(input, longCommand)

    const toolsFile = path.join(root, '.ai-artifacts', 'tools.audit.jsonl')
    const entry = JSON.parse(fs.readFileSync(toolsFile, 'utf8').trim())
    assert.equal(entry.command.length, 200)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('processInput records script entry for node skill scripts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-'))
  try {
    const input = { cwd: root, session_id: 'sess-4', tool_name: 'Bash', tool_input: { command: 'node .github/skills/ship/scripts/stats.js --format json' } }
    processInput(input)

    const toolsFile = path.join(root, '.ai-artifacts', 'tools.audit.jsonl')
    const entry = JSON.parse(fs.readFileSync(toolsFile, 'utf8').trim())
    assert.equal(entry.script, 'stats.js')
    assert.equal(entry.script_path, '.github/skills/ship/scripts/stats.js')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('processInput records command entry for non-script bash commands', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-'))
  try {
    const input = { cwd: root, session_id: 'sess-5', tool_name: 'Bash', tool_input: { command: 'git diff --cached' } }
    processInput(input)

    const toolsFile = path.join(root, '.ai-artifacts', 'tools.audit.jsonl')
    const entry = JSON.parse(fs.readFileSync(toolsFile, 'utf8').trim())
    assert.equal(entry.command, 'git diff --cached')
    assert.equal('script' in entry, false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('processInput does nothing for empty commands', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-'))
  try {
    const input = { cwd: root, session_id: 'sess-6', tool_name: 'Bash', tool_input: { command: '' } }
    processInput(input)

    const toolsFile = path.join(root, '.ai-artifacts', 'tools.audit.jsonl')
    assert.equal(fs.existsSync(toolsFile), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('processInput does nothing when tool_input is missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-audit-'))
  try {
    const input = { cwd: root, session_id: 'sess-7', tool_name: 'Bash' }
    processInput(input)

    const toolsFile = path.join(root, '.ai-artifacts', 'tools.audit.jsonl')
    assert.equal(fs.existsSync(toolsFile), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
