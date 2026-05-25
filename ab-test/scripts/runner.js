#!/usr/bin/env node
'use strict'

const { execSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { parseUsageFromJson } = require('./lib.js')

function createRunId(variant, challenge, iteration) {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  return `${variant}_${challenge}_${ts}_iter${iteration}`
}

function loadChallenge(abDir, challengeId) {
  const file = path.join(abDir, 'challenges', challengeId, 'challenge.json')
  if (!fs.existsSync(file)) throw new Error(`Challenge not found: ${file}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function loadVariant(abDir, variantId) {
  const file = path.join(abDir, 'variants', variantId, 'variant.json')
  if (!fs.existsSync(file)) throw new Error(`Variant not found: ${file}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function createWorktree(repoRoot, name) {
  const worktree = path.join('/tmp', `ab-test-${name}`)
  execSync(`git worktree add "${worktree}" HEAD --detach`, { cwd: repoRoot, stdio: 'pipe' })
  return worktree
}

function prepareWorktree(worktree, variant) {
  // Remove ab-test dir so agent cannot see acceptance criteria or scoring logic
  const abTestDir = path.join(worktree, 'ab-test')
  if (fs.existsSync(abTestDir)) {
    fs.rmSync(abTestDir, { recursive: true })
  }

  // Remove docs/adr that mentions the ab-test framework
  const adrFile = path.join(worktree, 'docs', 'adr', '010-ab-test-framework.md')
  if (fs.existsSync(adrFile)) fs.unlinkSync(adrFile)

  // Remove any .claude session/memory that could leak prior run info
  const claudeDir = path.join(worktree, '.claude')
  if (fs.existsSync(claudeDir)) {
    fs.rmSync(claudeDir, { recursive: true })
  }

  // Remove git reflog so agent can't inspect prior run branches
  try {
    execSync('git reflog expire --expire=now --all', { cwd: worktree, stdio: 'pipe' })
  } catch { /* not critical */ }

  // Handle CLAUDE.md mode
  const claudeMdPath = path.join(worktree, 'CLAUDE.md')
  if (variant.claude_md === 'none') {
    if (fs.existsSync(claudeMdPath)) fs.unlinkSync(claudeMdPath)
  } else if (variant.claude_md === 'custom') {
    fs.writeFileSync(claudeMdPath, variant.claude_md_content || '')
  }
  // 'inherit' = keep as-is
}

function buildClaudeFlags(variant, modelOverride, budget) {
  const flags = [
    '-p',
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--no-session-persistence',
    '--max-budget-usd', String(budget),
  ]

  if (variant.bare) flags.push('--bare')
  if (variant.disable_skills) flags.push('--disable-slash-commands')
  if (variant.system_prompt) flags.push('--system-prompt', variant.system_prompt)

  const model = modelOverride || variant.model
  if (model) flags.push('--model', model)

  return flags
}

function runClaude(worktree, flags, prompt, debugFile) {
  const allFlags = [...flags]
  if (debugFile) {
    allFlags.push('--debug-file', debugFile)
  }

  const start = Date.now()
  const result = spawnSync('claude', [...allFlags, prompt], {
    cwd: worktree,
    encoding: 'utf8',
    timeout: 600000,
    maxBuffer: 50 * 1024 * 1024,
  })
  const elapsed = Math.round((Date.now() - start) / 1000)

  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  const rawJson = stdout || stderr

  return { stdout, stderr, rawJson, elapsed, exitCode: result.status }
}

function captureDiff(worktree) {
  try {
    // Stage everything (including new files) so git diff --cached captures all changes
    execSync('git add -A', { cwd: worktree, stdio: 'pipe' })
    return execSync('git diff --cached', { cwd: worktree, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  } catch {
    return ''
  }
}

function captureDiffStat(worktree) {
  try {
    return execSync('git diff --cached --stat', { cwd: worktree, encoding: 'utf8' })
  } catch {
    return ''
  }
}

function removeWorktree(repoRoot, worktree) {
  try {
    execSync(`git worktree remove "${worktree}" --force`, { cwd: repoRoot, stdio: 'pipe' })
  } catch {
    // best effort
  }
}

function executeRun({ abDir, repoRoot, variantId, challengeId, iteration, modelOverride, budget }) {
  const challenge = loadChallenge(abDir, challengeId)
  const variant = loadVariant(abDir, variantId)
  const runId = createRunId(variantId, challengeId, iteration)
  const runDir = path.join(abDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })

  const worktree = createWorktree(repoRoot, runId)

  try {
    prepareWorktree(worktree, variant)

    // Commit the clean state so we can diff only what the agent changes
    execSync('git add -A && git commit -m "baseline" --allow-empty', { cwd: worktree, stdio: 'pipe' })

    // Save metadata
    const metadata = {
      run_id: runId,
      variant: variantId,
      challenge: challengeId,
      iteration,
      model: modelOverride || variant.model || 'default',
      started_at: new Date().toISOString(),
      worktree,
    }
    fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify(metadata, null, 2))

    // Save the CLAUDE.md used
    const claudeMd = path.join(worktree, 'CLAUDE.md')
    if (fs.existsSync(claudeMd)) {
      fs.copyFileSync(claudeMd, path.join(runDir, 'claude_md_used.md'))
    } else {
      fs.writeFileSync(path.join(runDir, 'claude_md_used.md'), '(no CLAUDE.md)')
    }

    // Run claude
    const flags = buildClaudeFlags(variant, modelOverride, budget)
    const debugFile = path.join(runDir, 'debug.log')
    const { stdout, stderr, rawJson, elapsed, exitCode } = runClaude(worktree, flags, challenge.prompt, debugFile)

    fs.writeFileSync(path.join(runDir, 'stdout.json'), stdout)
    fs.writeFileSync(path.join(runDir, 'stderr.log'), stderr)

    // Parse usage
    const usage = parseUsageFromJson(rawJson)
    const usageResult = usage
      ? { ...usage, elapsed_seconds: elapsed }
      : { total_tokens: 0, cost_usd: 0, elapsed_seconds: elapsed, exit_type: 'parse_error', model: 'unknown' }
    fs.writeFileSync(path.join(runDir, 'usage.json'), JSON.stringify(usageResult, null, 2))

    // Capture diff
    fs.writeFileSync(path.join(runDir, 'changes.diff'), captureDiff(worktree))
    fs.writeFileSync(path.join(runDir, 'changes_stat.txt'), captureDiffStat(worktree))

    // Update metadata
    metadata.completed_at = new Date().toISOString()
    metadata.elapsed_seconds = elapsed
    metadata.exit_code = exitCode
    fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify(metadata, null, 2))

    return { runId, runDir, elapsed, usage: usageResult }
  } finally {
    removeWorktree(repoRoot, worktree)
  }
}

function parseArgs(argv) {
  const args = { variant: null, challenge: 'default', iteration: 1, model: null, budget: 2.0 }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--variant': args.variant = argv[++i]; break
      case '--challenge': args.challenge = argv[++i]; break
      case '--iteration': args.iteration = Number(argv[++i]); break
      case '--model': args.model = argv[++i]; break
      case '--budget': args.budget = Number(argv[++i]); break
    }
  }
  return args
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2))
  if (!args.variant) {
    console.error('Usage: runner.js --variant <id> [--challenge <id>] [--iteration <n>] [--model <m>] [--budget <$>]')
    process.exit(1)
  }

  const abDir = path.resolve(__dirname, '..')
  const repoRoot = path.resolve(abDir, '..')

  console.log(`=== A/B Test Run ===`)
  console.log(`Variant:   ${args.variant}`)
  console.log(`Challenge: ${args.challenge}`)
  console.log(`Iteration: ${args.iteration}`)
  console.log('')

  const { runId, runDir, elapsed, usage } = executeRun({
    abDir,
    repoRoot,
    variantId: args.variant,
    challengeId: args.challenge,
    iteration: args.iteration,
    modelOverride: args.model,
    budget: args.budget,
  })

  console.log(`Run ID:  ${runId}`)
  console.log(`Time:    ${elapsed}s`)
  console.log(`Tokens:  ${usage.total_tokens}`)
  console.log(`Cost:    $${(usage.cost_usd || 0).toFixed(2)}`)
  console.log(`Output:  ${runDir}`)
}

module.exports = {
  buildClaudeFlags,
  createRunId,
  executeRun,
  loadChallenge,
  loadVariant,
  parseArgs,
  prepareWorktree,
}
