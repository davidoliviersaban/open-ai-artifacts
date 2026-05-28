'use strict'

const { describe, it, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { buildClaudeFlags, createRunBranchName, parseArgs, prepareWorktree, loadBaseline, loadChallenge, loadVariant } = require('./runner.js')

describe('parseArgs', () => {
  it('parses all flags', () => {
    const args = parseArgs(['--variant', 'a', '--challenge', 'foo', '--iteration', '3', '--model', 'sonnet', '--budget', '5.0'])
    assert.equal(args.variant, 'a')
    assert.equal(args.challenge, 'foo')
    assert.equal(args.iteration, 3)
    assert.equal(args.model, 'sonnet')
    assert.equal(args.budget, 5.0)
  })

  it('uses defaults for missing flags', () => {
    const args = parseArgs(['--variant', 'b'])
    assert.equal(args.variant, 'b')
    assert.equal(args.challenge, 'default')
    assert.equal(args.iteration, 1)
    assert.equal(args.model, null)
    assert.equal(args.budget, 2.0)
  })

  it('returns null variant when not provided', () => {
    const args = parseArgs([])
    assert.equal(args.variant, null)
  })
})

describe('buildClaudeFlags', () => {
  it('builds minimal flags for bare variant', () => {
    const variant = { bare: true, disable_skills: true, system_prompt: 'hello', model: null }
    const flags = buildClaudeFlags(variant, null, 2.0)
    assert.ok(flags.includes('-p'))
    assert.ok(flags.includes('--bare'))
    assert.ok(flags.includes('--disable-slash-commands'))
    assert.ok(flags.includes('--system-prompt'))
    assert.ok(flags.includes('hello'))
    assert.ok(flags.includes('--max-budget-usd'))
    assert.ok(flags.includes('2'))
  })

  it('uses model override over variant model', () => {
    const variant = { bare: false, disable_skills: false, system_prompt: null, model: 'opus' }
    const flags = buildClaudeFlags(variant, 'sonnet', 1.0)
    assert.ok(flags.includes('sonnet'))
    assert.ok(!flags.includes('opus'))
  })

  it('uses variant model when no override', () => {
    const variant = { bare: false, disable_skills: false, system_prompt: null, model: 'opus' }
    const flags = buildClaudeFlags(variant, null, 1.0)
    assert.ok(flags.includes('opus'))
  })

  it('omits optional flags when not needed', () => {
    const variant = { bare: false, disable_skills: false, system_prompt: null, model: null }
    const flags = buildClaudeFlags(variant, null, 2.0)
    assert.ok(!flags.includes('--bare'))
    assert.ok(!flags.includes('--disable-slash-commands'))
    assert.ok(!flags.includes('--system-prompt'))
    assert.ok(!flags.includes('--model'))
  })
})

describe('createRunBranchName', () => {
  it('creates a feature branch name for a run id', () => {
    assert.equal(createRunBranchName('variant_challenge_20260526120000_iter1'), 'feat/ab-test-variant_challenge_20260526120000_iter1')
  })

  it('sanitizes unsafe branch characters', () => {
    assert.equal(createRunBranchName('variant challenge:1'), 'feat/ab-test-variant-challenge-1')
  })
})

describe('prepareWorktree', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-prep-'))
    fs.mkdirSync(path.join(tmpDir, 'ab-test'))
    fs.writeFileSync(path.join(tmpDir, 'ab-test', 'secret.json'), '{}')
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Original')
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# Main README')
    fs.mkdirSync(path.join(tmpDir, '.claude', 'memory'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.claude', 'memory', 'state.md'), 'prior run info')
    fs.mkdirSync(path.join(tmpDir, 'docs', 'adr'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'docs', 'adr', '010-ab-test-framework.md'), '# ADR')
    fs.writeFileSync(path.join(tmpDir, 'docs', 'guide.md'), '# Guide')
    fs.mkdirSync(path.join(tmpDir, 'packages', 'ai-artifacts'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'packages', 'ai-artifacts', 'README.md'), '# Package README')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('removes ab-test directory from worktree', () => {
    prepareWorktree(tmpDir, { claude_md: 'inherit' })
    assert.ok(!fs.existsSync(path.join(tmpDir, 'ab-test')))
  })

  it('removes .claude directory to prevent leaking session state', () => {
    prepareWorktree(tmpDir, { claude_md: 'inherit' })
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude')))
  })

  it('removes the ab-test ADR from docs', () => {
    prepareWorktree(tmpDir, { claude_md: 'inherit' })
    assert.ok(!fs.existsSync(path.join(tmpDir, 'docs', 'adr', '010-ab-test-framework.md')))
  })

  it('removes CLAUDE.md when claude_md=none', () => {
    prepareWorktree(tmpDir, { claude_md: 'none' })
    assert.ok(!fs.existsSync(path.join(tmpDir, 'CLAUDE.md')))
  })

  it('writes custom CLAUDE.md', () => {
    prepareWorktree(tmpDir, { claude_md: 'custom', claude_md_content: '# Custom' })
    assert.equal(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8'), '# Custom')
  })

  it('preserves CLAUDE.md when claude_md=inherit', () => {
    prepareWorktree(tmpDir, { claude_md: 'inherit' })
    assert.match(fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8'), /^# Original/)
  })

  it('tells inherited guidance to stay on the current feature branch', () => {
    prepareWorktree(tmpDir, { claude_md: 'inherit' })
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8')
    assert.match(content, /current feature branch/)
    assert.match(content, /Do not create additional worktrees or branches/)
  })

  it('can keep full inherited guidance for full-pipeline variants', () => {
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '### Skill Invocation\n\nMust invoke skills.\n\n### Pipeline (every change)\n\nUse pipeline.\n\n## Next\n')
    prepareWorktree(tmpDir, { claude_md: 'inherit', keep_full_guidance: true })
    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8')
    assert.match(content, /### Skill Invocation/)
    assert.match(content, /### Pipeline \(every change\)/)
  })

  it('removes individually disabled skills', () => {
    fs.mkdirSync(path.join(tmpDir, '.github', 'skills', 'ship'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, '.github', 'skills', 'task-plan-guidelines'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, '.github', 'skills', 'ship', 'skill.md'), '# Ship')
    fs.writeFileSync(path.join(tmpDir, '.github', 'skills', 'task-plan-guidelines', 'skill.md'), '# Plan')

    prepareWorktree(tmpDir, { claude_md: 'inherit', disabled_skills: ['ship'] })

    assert.ok(!fs.existsSync(path.join(tmpDir, '.github', 'skills', 'ship')))
    assert.ok(fs.existsSync(path.join(tmpDir, '.github', 'skills', 'task-plan-guidelines')))
  })

  it('can hide all Markdown documentation while preserving agent configuration', () => {
    prepareWorktree(tmpDir, { claude_md: 'inherit' }, tmpDir, { hide_documentation: 'all-markdown' })

    assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')))
    assert.ok(!fs.existsSync(path.join(tmpDir, 'README.md')))
    assert.ok(!fs.existsSync(path.join(tmpDir, 'docs', 'guide.md')))
    assert.ok(!fs.existsSync(path.join(tmpDir, 'packages', 'ai-artifacts', 'README.md')))
  })

  it('can hide documentation from the variant configuration', () => {
    prepareWorktree(tmpDir, { claude_md: 'inherit', hide_documentation: 'all-markdown' }, tmpDir)

    assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md')))
    assert.ok(!fs.existsSync(path.join(tmpDir, 'README.md')))
    assert.ok(!fs.existsSync(path.join(tmpDir, 'docs', 'guide.md')))
    assert.ok(!fs.existsSync(path.join(tmpDir, 'packages', 'ai-artifacts', 'README.md')))
  })

  it('can hide docs while keeping the main README available', () => {
    prepareWorktree(tmpDir, { claude_md: 'inherit' }, tmpDir, { hide_documentation: 'docs-only' })

    assert.ok(fs.existsSync(path.join(tmpDir, 'README.md')))
    assert.ok(!fs.existsSync(path.join(tmpDir, 'docs')))
    assert.ok(fs.existsSync(path.join(tmpDir, 'packages', 'ai-artifacts', 'README.md')))
  })
})

describe('loadChallenge', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-challenge-'))
    fs.mkdirSync(path.join(tmpDir, 'challenges', 'test'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'challenges', 'test', 'challenge.json'), JSON.stringify({ id: 'test', prompt: 'do stuff' }))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('loads a valid challenge', () => {
    const c = loadChallenge(tmpDir, 'test')
    assert.equal(c.id, 'test')
    assert.equal(c.prompt, 'do stuff')
  })

  it('throws for missing challenge', () => {
    assert.throws(() => loadChallenge(tmpDir, 'nonexistent'), /not found/)
  })
})

describe('loadVariant', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-variant-'))
    fs.mkdirSync(path.join(tmpDir, 'variants', 'v1'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'variants', 'v1', 'variant.json'), JSON.stringify({ id: 'v1', bare: true }))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('loads a valid variant', () => {
    const v = loadVariant(tmpDir, 'v1')
    assert.equal(v.id, 'v1')
    assert.equal(v.bare, true)
  })

  it('throws for missing variant', () => {
    assert.throws(() => loadVariant(tmpDir, 'nope'), /not found/)
  })
})

describe('loadBaseline', () => {
  let tmpDir

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ab-baseline-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true })
  })

  it('loads baseline metadata when present', () => {
    fs.writeFileSync(path.join(tmpDir, 'baseline.json'), JSON.stringify({ id: 'baseline-a', created_at: '2026-05-28' }))

    const baseline = loadBaseline(tmpDir)

    assert.equal(baseline.id, 'baseline-a')
    assert.equal(baseline.created_at, '2026-05-28')
  })

  it('marks missing baseline metadata as legacy', () => {
    const baseline = loadBaseline(tmpDir)

    assert.equal(baseline.id, 'legacy-unversioned')
  })
})
