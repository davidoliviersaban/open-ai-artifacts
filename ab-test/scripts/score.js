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

  const variantFile = path.join(abDir, 'variants', metadata.variant, 'variant.json')
  const variant = fs.existsSync(variantFile) ? JSON.parse(fs.readFileSync(variantFile, 'utf8')) : null

  const worktree = createScoringWorktree(repoRoot, runDir)

  try {
    applyDiff(worktree, diffFile, { abDir, variant })
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

function applyDiff(worktree, diffFile, { abDir, variant } = {}) {
  if (!fs.existsSync(diffFile) || fs.statSync(diffFile).size === 0) return
  // Replicate the same cleanup prepareWorktree does so the diff applies cleanly
  const abTestDir = path.join(worktree, 'ab-test')
  if (fs.existsSync(abTestDir)) fs.rmSync(abTestDir, { recursive: true })
  const claudeDir = path.join(worktree, '.claude')
  if (fs.existsSync(claudeDir)) fs.rmSync(claudeDir, { recursive: true })
  const adrFile = path.join(worktree, 'docs', 'adr', '010-ab-test-framework.md')
  if (fs.existsSync(adrFile)) fs.unlinkSync(adrFile)

  // Replicate CLAUDE.md handling from prepareWorktree
  if (variant) {
    const claudeMdPath = path.join(worktree, 'CLAUDE.md')
    if (variant.claude_md === 'none') {
      if (fs.existsSync(claudeMdPath)) fs.unlinkSync(claudeMdPath)
      const skillsDir = path.join(worktree, '.github', 'skills')
      if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true })
      const agentsDir = path.join(worktree, '.github', 'agent')
      if (fs.existsSync(agentsDir)) fs.rmSync(agentsDir, { recursive: true })
    } else if (variant.claude_md === 'custom') {
      fs.writeFileSync(claudeMdPath, variant.claude_md_content || '')
      if (variant.disable_skills !== false) {
        const skillsDir = path.join(worktree, '.github', 'skills')
        if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true })
      }
    }
  }

  // Stage removals so the worktree matches the baseline
  execSync('git add -A && git commit -m "score-baseline" --allow-empty', { cwd: worktree, stdio: 'pipe' })

  const filteredDiffFile = writeScorableDiff(diffFile)
  if (!filteredDiffFile) return

  try {
    execSync(`git apply "${filteredDiffFile}"`, { cwd: worktree, stdio: 'pipe' })
  } catch {
    // Fall back to 3-way merge if exact apply fails (handles context drift)
    try {
      execSync(`git apply --3way "${filteredDiffFile}"`, { cwd: worktree, stdio: 'pipe' })
    } catch (err) {
      throw new Error(`diff could not be applied cleanly: ${err.message}`)
    }
  }
}

function isIsolatedAgentArtifact(filePath) {
  return filePath === 'AGENTS.md'
    || filePath === 'CLAUDE.md'
    || filePath.startsWith('.claude/')
    || filePath.startsWith('.github/agent/')
    || filePath.startsWith('.github/skills/')
    || filePath.startsWith('.opencode/')
}

function isScorablePath(filePath) {
  return filePath === 'README.md'
    || filePath === 'packages/ai-artifacts/README.md'
    || /^packages\/ai-artifacts\/[^/]+\.(js|mjs|cjs|ts)$/.test(filePath)
}

function diffHeaderPath(line) {
  const match = /^diff --git a\/(.*) b\/(.*)$/.exec(line)
  if (!match) return null
  return match[2] === '/dev/null' ? match[1] : match[2]
}

function filterScorableDiff(diffText) {
  const lines = diffText.split('\n')
  const kept = []
  let current = []
  let currentPath = null

  function flush() {
    if (current.length > 0 && currentPath && !isIsolatedAgentArtifact(currentPath) && isScorablePath(currentPath)) {
      kept.push(...current)
    }
    current = []
    currentPath = null
  }

  for (const line of lines) {
    const pathFromHeader = diffHeaderPath(line)
    if (pathFromHeader) {
      flush()
      currentPath = pathFromHeader
    }
    current.push(line)
  }
  flush()

  return kept.join('\n')
}

function writeScorableDiff(diffFile) {
  const filtered = filterScorableDiff(fs.readFileSync(diffFile, 'utf8'))
  if (filtered.trim() === '') return null
  const filteredFile = path.join(path.dirname(diffFile), 'changes.scorable.diff')
  fs.writeFileSync(filteredFile, filtered.endsWith('\n') ? filtered : `${filtered}\n`)
  return filteredFile
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

module.exports = { scoreRun, runCriteria, applyDiff, filterScorableDiff, isIsolatedAgentArtifact, isScorablePath }
