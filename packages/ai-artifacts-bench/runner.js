'use strict'

const { execSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { parseUsageFromJson } = require('./lib.js')

function createRunId(variant, challenge, iteration) {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  return `${variant}_${challenge}_${ts}_iter${iteration}`
}

function createRunBranchName(name) {
  return `feat/ab-test-${name.replace(/[^A-Za-z0-9._/-]/g, '-')}`
}

function loadChallenge(challengesDir, challengeId) {
  const file = path.join(challengesDir, challengeId, 'challenge.json')
  if (!fs.existsSync(file)) throw new Error(`Challenge not found: ${file}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function loadVariant(variantsDir, variantId) {
  const file = path.join(variantsDir, variantId, 'variant.json')
  if (!fs.existsSync(file)) throw new Error(`Variant not found: ${file}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function loadBaseline(baselineFile) {
  if (!fs.existsSync(baselineFile)) {
    return { id: 'legacy-unversioned', description: 'No baseline.json present for this run.' }
  }
  return JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
}

function createWorktree(repoRoot, name) {
  const worktree = path.join('/tmp', `ab-test-${name}`)
  const branch = createRunBranchName(name)
  execSync(`git worktree add -b "${branch}" "${worktree}" HEAD`, { cwd: repoRoot, stdio: 'pipe' })
  return { worktree, branch }
}

function removeWorktree(repoRoot, worktree, branch) {
  try {
    execSync(`git worktree remove "${worktree}" --force`, { cwd: repoRoot, stdio: 'pipe' })
  } catch { /* best effort */ }
  if (branch) {
    try {
      execSync(`git branch -D "${branch}"`, { cwd: repoRoot, stdio: 'pipe' })
    } catch { /* best effort */ }
  }
}

function baselineTag(branch) {
  return `baseline-${branch.replace(/[^A-Za-z0-9._-]/g, '-')}`
}

function captureDiff(worktree, tag) {
  try {
    execSync('git add -A', { cwd: worktree, stdio: 'pipe' })
    return execSync(`git diff ${tag} --cached`, { cwd: worktree, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  } catch {
    return ''
  }
}

function captureDiffStat(worktree, tag) {
  try {
    return execSync(`git diff ${tag} --cached --stat`, { cwd: worktree, encoding: 'utf8' })
  } catch {
    return ''
  }
}

function executeRun({ config, variantId, challengeId, iteration, modelOverride, budget, adapter }) {
  const { challengesDir, variantsDir, baselineFile, runsDir, repoRoot } = config
  const challenge = loadChallenge(challengesDir, challengeId)
  const variant = loadVariant(variantsDir, variantId)
  const baseline = loadBaseline(baselineFile)
  const runId = createRunId(variantId, challengeId, iteration)
  const runDir = path.join(runsDir, runId)
  fs.mkdirSync(runDir, { recursive: true })

  const { worktree, branch } = createWorktree(repoRoot, runId)

  try {
    if (config.prepare) {
      config.prepare(worktree, variant, challenge, { repoRoot, runDir })
    }

    const tag = baselineTag(branch)
    execSync('git add -A && git commit -m "baseline" --allow-empty', { cwd: worktree, stdio: 'pipe' })
    execSync(`git tag -f "${tag}"`, { cwd: worktree, stdio: 'pipe' })

    const metadata = {
      run_id: runId,
      variant: variantId,
      challenge: challengeId,
      iteration,
      model: modelOverride || variant.model || 'default',
      baseline,
      started_at: new Date().toISOString(),
      worktree,
      branch,
    }
    fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify(metadata, null, 2))

    const timeoutSeconds = challenge.scoring?.max_time_seconds || 300
    const result = adapter.run(worktree, challenge.prompt, {
      variant,
      model: modelOverride,
      budget,
      timeout: timeoutSeconds,
      debugFile: path.join(runDir, 'debug.log'),
    })

    fs.writeFileSync(path.join(runDir, 'stdout.json'), result.stdout || '')
    fs.writeFileSync(path.join(runDir, 'stderr.log'), result.stderr || '')

    const usage = adapter.parseUsage(result.stdout || result.stderr || '')
      || { total_tokens: 0, cost_usd: 0, elapsed_seconds: result.elapsed, exit_type: 'parse_error', model: 'unknown' }
    usage.elapsed_seconds = result.elapsed
    fs.writeFileSync(path.join(runDir, 'usage.json'), JSON.stringify(usage, null, 2))

    fs.writeFileSync(path.join(runDir, 'changes.diff'), captureDiff(worktree, tag))
    fs.writeFileSync(path.join(runDir, 'changes_stat.txt'), captureDiffStat(worktree, tag))

    if (config.postRun) {
      config.postRun(worktree, { runDir, variant, challenge, metadata, tag })
    }

    metadata.completed_at = new Date().toISOString()
    metadata.elapsed_seconds = result.elapsed
    metadata.exit_code = result.exitCode
    fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify(metadata, null, 2))

    return { runId, runDir, elapsed: result.elapsed, usage }
  } finally {
    removeWorktree(repoRoot, worktree, branch)
  }
}

module.exports = {
  createRunBranchName,
  createRunId,
  createWorktree,
  executeRun,
  loadBaseline,
  loadChallenge,
  loadVariant,
  removeWorktree,
}
