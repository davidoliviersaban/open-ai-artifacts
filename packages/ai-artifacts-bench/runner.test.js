const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createRunId, createRunBranchName, loadChallenge, loadVariant, loadBaseline, executeRun } = require('./runner.js')

test('createRunId produces variant_challenge_timestamp_iter format', () => {
  const id = createRunId('my-variant', 'my-challenge', 3)
  assert.match(id, /^my-variant_my-challenge_\d{14}_iter3$/)
})

test('createRunBranchName sanitizes special characters', () => {
  assert.equal(createRunBranchName('foo_bar_2026'), 'feat/ab-test-foo_bar_2026')
  assert.equal(createRunBranchName('has spaces!'), 'feat/ab-test-has-spaces-')
})

test('loadChallenge reads and parses challenge.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-challenge-'))
  try {
    fs.mkdirSync(path.join(root, 'test-challenge'), { recursive: true })
    fs.writeFileSync(path.join(root, 'test-challenge', 'challenge.json'), JSON.stringify({
      id: 'test',
      prompt: 'do something',
      acceptance_criteria: [{ id: 'c1', command: 'true' }],
      scoring: { criteria_weight: 0.5, efficiency_weight: 0.3, code_quality_weight: 0.2, max_tokens_budget: 50000, max_time_seconds: 300 },
    }))

    const challenge = loadChallenge(root, 'test-challenge')
    assert.equal(challenge.id, 'test')
    assert.equal(challenge.prompt, 'do something')
    assert.equal(challenge.acceptance_criteria.length, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('loadChallenge throws for missing challenge', () => {
  assert.throws(() => loadChallenge('/nonexistent', 'missing'), /Challenge not found/)
})

test('loadVariant reads and parses variant.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-variant-'))
  try {
    fs.mkdirSync(path.join(root, 'test-variant'), { recursive: true })
    fs.writeFileSync(path.join(root, 'test-variant', 'variant.json'), JSON.stringify({
      id: 'test-variant',
      claude_md: 'inherit',
      hooks: true,
    }))

    const variant = loadVariant(root, 'test-variant')
    assert.equal(variant.id, 'test-variant')
    assert.equal(variant.hooks, true)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('loadBaseline returns legacy object when file missing', () => {
  const result = loadBaseline('/nonexistent/baseline.json')
  assert.equal(result.id, 'legacy-unversioned')
})

test('loadBaseline reads baseline.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-baseline-'))
  try {
    const file = path.join(root, 'baseline.json')
    fs.writeFileSync(file, JSON.stringify({ id: 'v1', created_at: '2026-05-28' }))
    const result = loadBaseline(file)
    assert.equal(result.id, 'v1')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('executeRun calls prepare plugin and adapter, produces run artifacts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-run-'))
  try {
    // Set up a minimal git repo so worktree creation works
    const { execSync } = require('node:child_process')
    execSync('git init && git commit --allow-empty -m "init"', { cwd: root, stdio: 'pipe' })

    // Create challenge and variant dirs
    const challengesDir = path.join(root, 'challenges')
    const variantsDir = path.join(root, 'variants')
    const runsDir = path.join(root, 'runs')
    fs.mkdirSync(path.join(challengesDir, 'test-challenge'), { recursive: true })
    fs.mkdirSync(path.join(variantsDir, 'test-variant'), { recursive: true })

    fs.writeFileSync(path.join(challengesDir, 'test-challenge', 'challenge.json'), JSON.stringify({
      id: 'test',
      prompt: 'write hello',
      acceptance_criteria: [{ id: 'c1', command: 'true' }],
      scoring: { criteria_weight: 0.5, efficiency_weight: 0.3, code_quality_weight: 0.2, max_tokens_budget: 50000, max_time_seconds: 300 },
    }))
    fs.writeFileSync(path.join(variantsDir, 'test-variant', 'variant.json'), JSON.stringify({
      id: 'test-variant',
      claude_md: 'none',
      bare: true,
    }))

    // Track prepare plugin calls
    let prepareCalled = false
    let prepareArgs = null
    const prepare = (worktree, variant, challenge, opts) => {
      prepareCalled = true
      prepareArgs = { worktree, variant, challenge, repoRoot: opts.repoRoot }
    }

    // Mock adapter that simulates a successful agent run
    const adapter = {
      run(worktree, prompt, options) {
        fs.writeFileSync(path.join(worktree, 'output.txt'), 'agent output\n')
        return { stdout: '{"modelUsage":{"opus":{"inputTokens":1000,"outputTokens":500,"costUSD":0.1}},"num_turns":3,"subtype":"end_turn"}', stderr: '', elapsed: 5, exitCode: 0 }
      },
      parseUsage(raw) {
        const { parseUsageFromJson } = require('./lib.js')
        return parseUsageFromJson(raw)
      },
    }

    const config = {
      challengesDir,
      variantsDir,
      baselineFile: path.join(root, 'baseline.json'),
      runsDir,
      repoRoot: root,
      prepare,
    }

    const result = executeRun({ config, variantId: 'test-variant', challengeId: 'test-challenge', iteration: 1, budget: 1.0, adapter })

    // Verify prepare plugin was called
    assert.equal(prepareCalled, true)
    assert.equal(prepareArgs.variant.id, 'test-variant')
    assert.equal(prepareArgs.challenge.id, 'test')
    assert.equal(prepareArgs.repoRoot, root)

    // Verify run output files
    assert.ok(result.runId.startsWith('test-variant_test-challenge_'))
    assert.ok(fs.existsSync(path.join(result.runDir, 'metadata.json')))
    assert.ok(fs.existsSync(path.join(result.runDir, 'usage.json')))
    assert.ok(fs.existsSync(path.join(result.runDir, 'stdout.json')))
    assert.ok(fs.existsSync(path.join(result.runDir, 'changes.diff')))

    // Verify usage was parsed from adapter output
    const usage = JSON.parse(fs.readFileSync(path.join(result.runDir, 'usage.json'), 'utf8'))
    assert.equal(usage.total_tokens, 1500)
    assert.equal(usage.cost_usd, 0.1)
    assert.equal(usage.elapsed_seconds, 5)

    // Verify metadata
    const meta = JSON.parse(fs.readFileSync(path.join(result.runDir, 'metadata.json'), 'utf8'))
    assert.equal(meta.variant, 'test-variant')
    assert.equal(meta.challenge, 'test-challenge')
    assert.equal(meta.iteration, 1)
    assert.ok(meta.completed_at)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('executeRun works without prepare plugin', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-run-noprep-'))
  try {
    const { execSync } = require('node:child_process')
    execSync('git init && git commit --allow-empty -m "init"', { cwd: root, stdio: 'pipe' })

    const challengesDir = path.join(root, 'challenges')
    const variantsDir = path.join(root, 'variants')
    const runsDir = path.join(root, 'runs')
    fs.mkdirSync(path.join(challengesDir, 'minimal'), { recursive: true })
    fs.mkdirSync(path.join(variantsDir, 'bare'), { recursive: true })

    fs.writeFileSync(path.join(challengesDir, 'minimal', 'challenge.json'), JSON.stringify({
      id: 'minimal',
      prompt: 'hello',
      acceptance_criteria: [],
      scoring: { criteria_weight: 0.5, efficiency_weight: 0.3, code_quality_weight: 0.2, max_tokens_budget: 50000, max_time_seconds: 300 },
    }))
    fs.writeFileSync(path.join(variantsDir, 'bare', 'variant.json'), JSON.stringify({ id: 'bare', bare: true }))

    const adapter = {
      run() { return { stdout: '{}', stderr: '', elapsed: 1, exitCode: 0 } },
      parseUsage() { return null },
    }

    const config = { challengesDir, variantsDir, baselineFile: '/nonexistent', runsDir, repoRoot: root }
    const result = executeRun({ config, variantId: 'bare', challengeId: 'minimal', iteration: 1, budget: 1.0, adapter })

    assert.ok(result.runDir)
    assert.ok(fs.existsSync(path.join(result.runDir, 'metadata.json')))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
