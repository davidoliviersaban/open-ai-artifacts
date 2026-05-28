const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { check, install, getClaudeArtifacts } = require('./install')

test('getClaudeArtifacts filters artifacts by claude- prefix', () => {
  const config = {
    artifacts: [
      { id: 'claude-hooks', kind: 'hooks', targetDir: '.claude', steps: [] },
      { id: 'opencode-skills', kind: 'config', target: '.opencode/skills', steps: [] },
      { id: 'claude-commands', kind: 'config', target: '.claude/commands', steps: [] },
    ],
  }
  const result = getClaudeArtifacts(config)
  assert.equal(result.length, 2)
  assert.equal(result[0].id, 'claude-hooks')
  assert.equal(result[1].id, 'claude-commands')
})

test('install handles link steps', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-link-'))
  try {
    fs.mkdirSync(path.join(root, '.github/skills'), { recursive: true })
    fs.writeFileSync(path.join(root, '.github/skills/test.md'), 'skill content\n')

    const config = {
      artifacts: [
        {
          id: 'claude-commands',
          kind: 'config',
          target: '.claude/commands',
          steps: [{ link: { target: '.github/skills', to: '.claude/commands' } }],
        },
      ],
    }

    const result = install(root, config)
    assert.equal(result.length, 1)
    assert.equal(result[0].artifact, 'claude-commands')
    assert.equal(fs.lstatSync(path.join(root, '.claude/commands')).isSymbolicLink(), true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('install handles copy steps with root: references', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-copy-'))
  try {
    fs.mkdirSync(path.join(root, '.github/hooks/claude'), { recursive: true })
    fs.writeFileSync(path.join(root, '.github/hooks/claude/audit-skill.js'), 'audit hook content\n')
    fs.writeFileSync(path.join(root, '.github/hooks/claude/settings.json'), '{"hooks":{}}\n')

    const config = {
      artifacts: [
        {
          id: 'claude-hooks',
          kind: 'hooks',
          targetDir: '.claude',
          steps: [
            { copy: { from: 'root:.github/hooks/claude/audit-skill.js', to: 'hooks/audit-skill.js' } },
            { copy: { from: 'root:.github/hooks/claude/settings.json', to: 'settings.json' } },
          ],
        },
      ],
    }

    const result = install(root, config)
    assert.equal(result.length, 2)
    assert.equal(fs.readFileSync(path.join(root, '.claude/hooks/audit-skill.js'), 'utf8'), 'audit hook content\n')
    assert.equal(fs.readFileSync(path.join(root, '.claude/settings.json'), 'utf8'), '{"hooks":{}}\n')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('install copy steps are idempotent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-copy-idem-'))
  try {
    fs.mkdirSync(path.join(root, '.github/hooks/claude'), { recursive: true })
    fs.writeFileSync(path.join(root, '.github/hooks/claude/hook.js'), 'content\n')

    const config = {
      artifacts: [
        {
          id: 'claude-hooks',
          kind: 'hooks',
          targetDir: '.claude',
          steps: [{ copy: { from: 'root:.github/hooks/claude/hook.js', to: 'hooks/hook.js' } }],
        },
      ],
    }

    const first = install(root, config)
    const second = install(root, config)
    assert.equal(first.length, 1)
    assert.equal(second.length, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('install copy steps update stale targets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-copy-stale-'))
  try {
    fs.mkdirSync(path.join(root, '.github/hooks/claude'), { recursive: true })
    fs.mkdirSync(path.join(root, '.claude/hooks'), { recursive: true })
    fs.writeFileSync(path.join(root, '.github/hooks/claude/hook.js'), 'new content\n')
    fs.writeFileSync(path.join(root, '.claude/hooks/hook.js'), 'old content\n')

    const config = {
      artifacts: [
        {
          id: 'claude-hooks',
          kind: 'hooks',
          targetDir: '.claude',
          steps: [{ copy: { from: 'root:.github/hooks/claude/hook.js', to: 'hooks/hook.js' } }],
        },
      ],
    }

    const result = install(root, config)
    assert.equal(result.length, 1)
    assert.equal(fs.readFileSync(path.join(root, '.claude/hooks/hook.js'), 'utf8'), 'new content\n')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('check reports issues for missing copy targets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-check-copy-'))
  try {
    fs.mkdirSync(path.join(root, '.github/hooks/claude'), { recursive: true })
    fs.writeFileSync(path.join(root, '.github/hooks/claude/hook.js'), 'content\n')

    const config = {
      artifacts: [
        {
          id: 'claude-hooks',
          kind: 'hooks',
          targetDir: '.claude',
          steps: [{ copy: { from: 'root:.github/hooks/claude/hook.js', to: 'hooks/hook.js' } }],
        },
      ],
    }

    const result = check(root, config)
    assert.equal(result.ok, false)
    assert.equal(result.issues.length, 1)
    assert.equal(result.issues[0].issue, 'missing')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('check reports issues for stale copy targets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-check-stale-'))
  try {
    fs.mkdirSync(path.join(root, '.github/hooks/claude'), { recursive: true })
    fs.mkdirSync(path.join(root, '.claude/hooks'), { recursive: true })
    fs.writeFileSync(path.join(root, '.github/hooks/claude/hook.js'), 'new content\n')
    fs.writeFileSync(path.join(root, '.claude/hooks/hook.js'), 'old content\n')

    const config = {
      artifacts: [
        {
          id: 'claude-hooks',
          kind: 'hooks',
          targetDir: '.claude',
          steps: [{ copy: { from: 'root:.github/hooks/claude/hook.js', to: 'hooks/hook.js' } }],
        },
      ],
    }

    const result = check(root, config)
    assert.equal(result.ok, false)
    assert.equal(result.issues[0].issue, 'content mismatch')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('check passes when copy targets match source', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-check-ok-'))
  try {
    fs.mkdirSync(path.join(root, '.github/hooks/claude'), { recursive: true })
    fs.mkdirSync(path.join(root, '.claude/hooks'), { recursive: true })
    fs.writeFileSync(path.join(root, '.github/hooks/claude/hook.js'), 'content\n')
    fs.writeFileSync(path.join(root, '.claude/hooks/hook.js'), 'content\n')

    const config = {
      artifacts: [
        {
          id: 'claude-hooks',
          kind: 'hooks',
          targetDir: '.claude',
          steps: [{ copy: { from: 'root:.github/hooks/claude/hook.js', to: 'hooks/hook.js' } }],
        },
      ],
    }

    const result = check(root, config)
    assert.equal(result.ok, true)
    assert.equal(result.issues.length, 0)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('check validates both link and copy steps together', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-check-mixed-'))
  try {
    fs.mkdirSync(path.join(root, '.github/skills'), { recursive: true })
    fs.mkdirSync(path.join(root, '.github/hooks/claude'), { recursive: true })
    fs.writeFileSync(path.join(root, '.github/skills/test.md'), 'skill\n')
    fs.writeFileSync(path.join(root, '.github/hooks/claude/hook.js'), 'hook\n')

    const config = {
      artifacts: [
        {
          id: 'claude-commands',
          kind: 'config',
          target: '.claude/commands',
          steps: [{ link: { target: '.github/skills', to: '.claude/commands' } }],
        },
        {
          id: 'claude-hooks',
          kind: 'hooks',
          targetDir: '.claude',
          steps: [{ copy: { from: 'root:.github/hooks/claude/hook.js', to: 'hooks/hook.js' } }],
        },
      ],
    }

    const result = check(root, config)
    assert.equal(result.ok, false)
    assert.equal(result.issues.length, 2)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('install skips copy when source does not exist', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-install-copy-nosrc-'))
  try {
    const config = {
      artifacts: [
        {
          id: 'claude-hooks',
          kind: 'hooks',
          targetDir: '.claude',
          steps: [{ copy: { from: 'root:.github/hooks/claude/missing.js', to: 'hooks/missing.js' } }],
        },
      ],
    }

    assert.throws(() => install(root, config), /source not found/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
