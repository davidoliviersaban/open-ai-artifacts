#!/usr/bin/env node
'use strict'

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function cleanup({ repoRoot, abDir, clearRuns }) {
  const removed = []

  // Remove all ab-test worktrees from /tmp
  const tmpEntries = fs.readdirSync('/tmp').filter(e => e.startsWith('ab-test-') || e.startsWith('ab-score-'))
  for (const entry of tmpEntries) {
    const full = path.join('/tmp', entry)
    try {
      execSync(`git worktree remove "${full}" --force`, { cwd: repoRoot, stdio: 'pipe' })
      removed.push(full)
    } catch {
      try { fs.rmSync(full, { recursive: true }); removed.push(full) } catch { /* skip */ }
    }
  }

  // Prune stale worktree references
  try {
    execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' })
  } catch { /* skip */ }

  if (clearRuns) {
    const runsDir = path.join(abDir, 'runs')
    if (fs.existsSync(runsDir)) {
      for (const entry of fs.readdirSync(runsDir)) {
        if (entry === '.gitignore') continue
        fs.rmSync(path.join(runsDir, entry), { recursive: true })
      }
    }
  }

  return removed
}

if (require.main === module) {
  const clearRuns = process.argv.includes('--all')
  const abDir = path.resolve(__dirname, '..')
  const repoRoot = path.resolve(abDir, '..')

  const removed = cleanup({ repoRoot, abDir, clearRuns })
  console.log(`Cleaned ${removed.length} worktrees.`)
  if (clearRuns) console.log('Run data cleared.')
}

module.exports = { cleanup }
