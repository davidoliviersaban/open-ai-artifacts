#!/usr/bin/env node
'use strict'

const path = require('node:path')
const fs = require('node:fs')
const pkg = require('../../packages/ai-artifacts-bench/runner.js')
const adapter = require('../../packages/ai-artifacts-bench/adapters/claude-code.js')
const { prepareWorktree, capturePostRunState } = require('./prepare.js')

function makeConfig(abDir, repoRoot) {
  return {
    challengesDir: path.join(abDir, 'challenges'),
    variantsDir: path.join(abDir, 'variants'),
    baselineFile: path.join(abDir, 'baseline.json'),
    runsDir: path.join(abDir, 'runs'),
    repoRoot,
    prepare(worktree, variant, challenge, opts) {
      prepareWorktree(worktree, variant, opts.repoRoot, challenge)
      const claudeMd = path.join(worktree, 'CLAUDE.md')
      if (fs.existsSync(claudeMd)) {
        fs.copyFileSync(claudeMd, path.join(opts.runDir, 'claude_md_used.md'))
      } else {
        fs.writeFileSync(path.join(opts.runDir, 'claude_md_used.md'), '(no CLAUDE.md)')
      }
    },
    postRun(worktree, { runDir }) {
      capturePostRunState(worktree, { runDir })
    },
  }
}

function executeRun({ abDir, repoRoot, variantId, challengeId, iteration, modelOverride, budget }) {
  const config = makeConfig(abDir, repoRoot)
  return pkg.executeRun({ config, variantId, challengeId, iteration, modelOverride, budget, adapter })
}

function buildClaudeFlags(variant, modelOverride, budget) {
  return adapter.buildFlags(variant, { model: modelOverride, budget })
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

function loadChallenge(abDir, challengeId) {
  return pkg.loadChallenge(path.join(abDir, 'challenges'), challengeId)
}

function loadVariant(abDir, variantId) {
  return pkg.loadVariant(path.join(abDir, 'variants'), variantId)
}

function loadBaseline(abDir) {
  return pkg.loadBaseline(path.join(abDir, 'baseline.json'))
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
  createRunBranchName: pkg.createRunBranchName,
  createRunId: pkg.createRunId,
  executeRun,
  applyChallengeIsolation: require('./prepare.js').applyChallengeIsolation,
  loadChallenge,
  loadBaseline,
  loadVariant,
  makeConfig,
  parseArgs,
  prepareWorktree: require('./prepare.js').prepareWorktree,
}
