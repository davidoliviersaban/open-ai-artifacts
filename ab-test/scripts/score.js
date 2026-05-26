#!/usr/bin/env node
'use strict'

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { computeScore } = require('./lib.js')

function scoreRun(runDir, { abDir, repoRoot }) {
  const metadata = JSON.parse(fs.readFileSync(path.join(runDir, 'metadata.json'), 'utf8'))
  const usage = JSON.parse(fs.readFileSync(path.join(runDir, 'usage.json'), 'utf8'))
  const challengeFile = path.join(abDir, 'challenges', metadata.challenge, 'challenge.json')
  const challenge = JSON.parse(fs.readFileSync(challengeFile, 'utf8'))
  const diffFile = path.join(runDir, 'changes.diff')

  const worktree = createScoringWorktree(repoRoot, runDir)

  try {
    applyDiff(worktree, diffFile)
    const criteriaResults = runCriteria(challenge.acceptance_criteria, worktree)
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
    removeScoringWorktree(repoRoot, worktree)
  }
}

function createScoringWorktree(repoRoot, runDir) {
  const name = `ab-score-${path.basename(runDir)}`
  const worktree = path.join('/tmp', name)
  execSync(`git worktree add "${worktree}" HEAD --detach`, { cwd: repoRoot, stdio: 'pipe' })
  // Symlink node_modules so npm scripts work
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
  } catch {
    // best effort
  }
}

function applyDiff(worktree, diffFile) {
  if (!fs.existsSync(diffFile) || fs.statSync(diffFile).size === 0) return
  // First, replicate the same cleanup prepareWorktree does so the diff applies cleanly
  const abTestDir = path.join(worktree, 'ab-test')
  if (fs.existsSync(abTestDir)) fs.rmSync(abTestDir, { recursive: true })
  const claudeDir = path.join(worktree, '.claude')
  if (fs.existsSync(claudeDir)) fs.rmSync(claudeDir, { recursive: true })
  const adrFile = path.join(worktree, 'docs', 'adr', '010-ab-test-framework.md')
  if (fs.existsSync(adrFile)) fs.unlinkSync(adrFile)

  // Stage removals so the worktree matches the baseline
  execSync('git add -A && git commit -m "score-baseline" --allow-empty', { cwd: worktree, stdio: 'pipe' })

  try {
    execSync(`git apply "${diffFile}"`, { cwd: worktree, stdio: 'pipe' })
  } catch (err) {
    throw new Error(`diff could not be applied cleanly: ${err.message}`)
  }
}

function runCriteria(criteria, cwd) {
  const results = []
  for (const criterion of criteria) {
    let pass = false
    try {
      execSync(criterion.command, { cwd, stdio: 'pipe', timeout: 30000 })
      pass = true
    } catch {
      pass = false
    }
    results.push({ id: criterion.id, pass })
  }
  return results
}

if (require.main === module) {
  const runDir = process.argv[2]
  if (!runDir) {
    console.error('Usage: score.js <run_dir>')
    process.exit(1)
  }

  const abDir = path.resolve(__dirname, '..')
  const repoRoot = path.resolve(abDir, '..')

  try {
    const result = scoreRun(path.resolve(runDir), { abDir, repoRoot })
    console.log(`Score: ${result.final_score} (${result.criteria_passed}/${result.criteria_total} criteria)`)
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(`Scoring failed: ${err.message}`)
    process.exit(1)
  }
}

module.exports = { scoreRun, runCriteria, applyDiff }
