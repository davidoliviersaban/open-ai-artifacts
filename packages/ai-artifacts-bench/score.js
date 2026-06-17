'use strict'

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { computeScore } = require('./lib.js')

function scoreRun(runDir, { config }) {
  const metadata = JSON.parse(fs.readFileSync(path.join(runDir, 'metadata.json'), 'utf8'))
  const usage = JSON.parse(fs.readFileSync(path.join(runDir, 'usage.json'), 'utf8'))
  const challengeFile = path.join(config.challengesDir, metadata.challenge, 'challenge.json')
  const challenge = JSON.parse(fs.readFileSync(challengeFile, 'utf8'))
  const diffFile = path.join(runDir, 'changes.diff')
  const diffEmpty = !fs.existsSync(diffFile) || fs.statSync(diffFile).size === 0

  const variantFile = path.join(config.variantsDir, metadata.variant, 'variant.json')
  const variant = fs.existsSync(variantFile) ? JSON.parse(fs.readFileSync(variantFile, 'utf8')) : null

  if (diffEmpty) {
    const result = {
      run_id: path.basename(runDir),
      variant: metadata.variant,
      criteria_passed: 0,
      criteria_total: challenge.acceptance_criteria.length,
      criteria_score: 0,
      efficiency_score: 0,
      code_quality_score: 0,
      final_score: 0,
      tokens_used: usage.total_tokens || 0,
      cost_usd: usage.cost_usd || 0,
      time_seconds: usage.elapsed_seconds || 0,
      model: usage.model || 'unknown',
      criteria_results: challenge.acceptance_criteria.map(c => ({ id: c.id, pass: false })),
      empty_diff: true,
    }
    fs.writeFileSync(path.join(runDir, 'score.json'), JSON.stringify(result, null, 2))
    return result
  }

  const worktree = createScoringWorktree(config.repoRoot, runDir)

  try {
    applyDiff(worktree, diffFile, { config, variant, challenge })
    const criteriaResults = runCriteria(challenge.acceptance_criteria, worktree, { runDir })
    const score = computeScore(usage, criteriaResults, challenge.scoring)

    const result = {
      run_id: path.basename(runDir),
      variant: metadata.variant,
      ...score,
      tokens_used: usage.total_tokens,
      cost_usd: usage.cost_usd || 0,
      time_seconds: usage.elapsed_seconds,
      model: usage.model || 'unknown',
      criteria_results: criteriaResults,
    }

    fs.writeFileSync(path.join(runDir, 'score.json'), JSON.stringify(result, null, 2))
    return result
  } finally {
    removeScoringWorktree(config.repoRoot, worktree)
  }
}

function createScoringWorktree(repoRoot, runDir) {
  const name = `ab-score-${path.basename(runDir)}`
  const worktree = path.join('/tmp', name)
  execSync(`git worktree add "${worktree}" HEAD --detach`, { cwd: repoRoot, stdio: 'pipe' })
  const nodeModulesSrc = path.join(repoRoot, 'node_modules')
  const nodeModulesDst = path.join(worktree, 'node_modules')
  if (fs.existsSync(nodeModulesSrc) && !fs.existsSync(nodeModulesDst)) {
    fs.symlinkSync(nodeModulesSrc, nodeModulesDst)
  }
  return worktree
}

function removeScoringWorktree(repoRoot, worktree) {
  try {
    execSync(`git worktree remove "${worktree}" --force`, { cwd: repoRoot, stdio: 'pipe' })
  } catch { /* best effort */ }
}

function applyDiff(worktree, diffFile, { config, variant, challenge } = {}) {
  if (!fs.existsSync(diffFile) || fs.statSync(diffFile).size === 0) return

  if (config && config.prepareScoringWorktree) {
    config.prepareScoringWorktree(worktree, variant, { challenge })
  }

  execSync('git add -A && git commit -m "score-baseline" --allow-empty', { cwd: worktree, stdio: 'pipe' })

  let targetDiff = diffFile
  if (config && config.filterDiff) {
    const filtered = config.filterDiff(fs.readFileSync(diffFile, 'utf8'))
    if (!filtered || filtered.trim() === '') return
    targetDiff = path.join(path.dirname(diffFile), 'changes.scorable.diff')
    fs.writeFileSync(targetDiff, filtered.endsWith('\n') ? filtered : `${filtered}\n`)
  }

  try {
    execSync(`git apply "${targetDiff}"`, { cwd: worktree, stdio: 'pipe' })
  } catch {
    try {
      execSync(`git apply --3way "${targetDiff}"`, { cwd: worktree, stdio: 'pipe' })
    } catch (err) {
      throw new Error(`diff could not be applied cleanly: ${err.message}`)
    }
  }
}

function runCriteria(criteria, cwd, { runDir } = {}) {
  const results = []
  const env = { ...process.env }
  if (runDir) env.RUN_DIR = runDir
  for (const criterion of criteria) {
    let pass = false
    try {
      execSync(criterion.command, { cwd, env, stdio: 'pipe', timeout: 30000 })
      pass = true
    } catch {
      pass = false
    }
    results.push({ id: criterion.id, pass })
  }
  return results
}

module.exports = { scoreRun, runCriteria, applyDiff, createScoringWorktree, removeScoringWorktree }
