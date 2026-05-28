#!/usr/bin/env node
'use strict'

const path = require('node:path')
const pkg = require('../../packages/ai-artifacts-bench/score.js')
const { prepareScoringWorktree } = require('./prepare.js')

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

function scoreRun(runDir, { abDir, repoRoot }) {
  const config = {
    challengesDir: path.join(abDir, 'challenges'),
    variantsDir: path.join(abDir, 'variants'),
    repoRoot,
    prepareScoringWorktree,
    filterDiff: filterScorableDiff,
  }
  return pkg.scoreRun(runDir, { config })
}

function runCriteria(criteria, cwd, opts) {
  return pkg.runCriteria(criteria, cwd, opts)
}

function applyDiff(worktree, diffFile, opts) {
  return pkg.applyDiff(worktree, diffFile, opts)
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
