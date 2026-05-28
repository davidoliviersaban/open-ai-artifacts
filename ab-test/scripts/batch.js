#!/usr/bin/env node
'use strict'

const { fork } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const pkg = require('../../packages/ai-artifacts-bench/batch.js')
const { scoreRun } = require('./score.js')
const { generateReport, loadRuns } = require('./report.js')
const { makeConfig } = require('./runner.js')
const adapter = require('../../packages/ai-artifacts-bench/adapters/claude-code.js')

function parseArgs(argv) {
  const args = { challenges: null, iterations: 1, variants: null, model: null, budget: 2.0, parallel: 0 }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--challenge': args.challenges = [argv[++i]]; break
      case '--challenges': args.challenges = argv[++i].split(','); break
      case '--iterations': args.iterations = Number(argv[++i]); break
      case '--variants': args.variants = argv[++i].split(','); break
      case '--model': args.model = argv[++i]; break
      case '--budget': args.budget = Number(argv[++i]); break
      case '--parallel': {
        const next = argv[i + 1]
        args.parallel = next && !next.startsWith('--') ? Number(argv[++i]) : Infinity
        break
      }
    }
  }
  return args
}

function discoverVariants(abDir) {
  return pkg.discoverVariants(
    path.join(abDir, 'variants'),
    path.join(abDir, 'baseline.json')
  )
}

function discoverChallenges(abDir) {
  return pkg.discoverChallenges(path.join(abDir, 'challenges'))
}

function loadBaseline(abDir) {
  const file = path.join(abDir, 'baseline.json')
  if (!fs.existsSync(file)) return {}
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function runInChildProcess({ abDir, variant, challenge, iteration, model, budget }) {
  return new Promise((resolve, reject) => {
    const runnerPath = path.join(__dirname, 'runner.js')
    const args = ['--variant', variant, '--challenge', challenge, '--iteration', String(iteration), '--budget', String(budget)]
    if (model) args.push('--model', model)

    const child = fork(runnerPath, args, {
      cwd: abDir,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env },
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', d => { stdout += d; process.stdout.write(`  [${variant}] ${d}`) })
    child.stderr.on('data', d => { stderr += d })

    child.on('exit', (code) => {
      if (code === 0) {
        const runsDir = path.join(abDir, 'runs')
        const entries = fs.readdirSync(runsDir)
          .filter(e => e.startsWith(`${variant}_${challenge}_`))
          .sort()
          .reverse()
        const runDir = entries.length > 0 ? path.join(runsDir, entries[0]) : null
        resolve({ runDir, stdout })
      } else {
        reject(new Error(`runner.js exited with code ${code}: ${stderr}`))
      }
    })

    child.on('error', reject)
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const abDir = path.resolve(__dirname, '..')
  const repoRoot = path.resolve(abDir, '..')

  const variants = args.variants || discoverVariants(abDir)
  const challenges = args.challenges || discoverChallenges(abDir)
  const matrix = pkg.buildRunMatrix(challenges, variants, args.iterations)

  console.log('╔══════════════════════════════════════════╗')
  console.log('║       A/B Test Batch Runner              ║')
  console.log('╠══════════════════════════════════════════╣')
  console.log(`║ Challenges: ${challenges.join(', ')}`)
  console.log(`║ Variants:   ${variants.join(', ')}`)
  console.log(`║ Iterations: ${args.iterations}`)
  console.log(`║ Total runs: ${matrix.length}`)
  console.log(`║ Model:      ${args.model || 'default'}`)
  console.log(`║ Parallel:   ${args.parallel ? args.parallel : false}`)
  console.log(`║ Budget:     $${args.budget}/run (max total: $${(matrix.length * args.budget).toFixed(0)})`)
  console.log('╚══════════════════════════════════════════╝')
  console.log('')

  const runDirs = []
  const config = makeConfig(abDir, repoRoot)
  const batchStart = Date.now()
  let completedRuns = 0
  const runElapsedTimes = []

  function formatDuration(seconds) {
    if (seconds < 60) return `${seconds}s`
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return s > 0 ? `${m}m${s}s` : `${m}m`
  }

  function progressLine(runCount, total) {
    const elapsed = Math.round((Date.now() - batchStart) / 1000)
    let eta = ''
    if (runElapsedTimes.length > 0) {
      const avgPerRun = runElapsedTimes.reduce((a, b) => a + b, 0) / runElapsedTimes.length
      const remaining = (total - runCount) * avgPerRun
      eta = ` | ETA ${formatDuration(Math.round(remaining))}`
    }
    return `[${runCount}/${total}] elapsed ${formatDuration(elapsed)}${eta}`
  }

  if (args.parallel) {
    const concurrency = args.parallel === Infinity ? matrix.length : args.parallel
    console.log(`Launching ${matrix.length} runs with concurrency ${concurrency}...`)
    console.log('')

    await pkg.runWithConcurrency(matrix, concurrency, ({ challenge, variant, iteration }) => {
      const runStart = Date.now()
      console.log(`  Starting: ${variant} × ${challenge} (iter ${iteration})`)
      return runInChildProcess({
        abDir, variant, challenge, iteration,
        model: args.model, budget: args.budget,
      }).then(({ runDir }) => {
        if (runDir) runDirs.push(runDir)
        const runElapsed = Math.round((Date.now() - runStart) / 1000)
        runElapsedTimes.push(runElapsed)
        completedRuns++
        console.log(`  ✓ ${variant} × ${challenge} (iter ${iteration}) done (${formatDuration(runElapsed)}) | ${progressLine(completedRuns, matrix.length)}`)
      }).catch(err => {
        completedRuns++
        console.error(`  ✗ ${variant} × ${challenge} (iter ${iteration}): ${err.message}`)
      })
    })
  } else {
    let runCount = 0
    for (const { challenge, variant, iteration } of matrix) {
      runCount++
      console.log(`━━━ ${progressLine(runCount - 1, matrix.length)} ━━━`)
      console.log(`  Running: ${variant} × ${challenge} (iter ${iteration})`)

      try {
        const result = require('../../packages/ai-artifacts-bench/runner.js').executeRun({
          config, variantId: variant, challengeId: challenge, iteration,
          modelOverride: args.model, budget: args.budget, adapter,
        })
        runElapsedTimes.push(result.elapsed)
        console.log(`  Done (${formatDuration(result.elapsed)}, ${result.usage.total_tokens} tokens, $${(result.usage.cost_usd || 0).toFixed(2)})`)
        runDirs.push(result.runDir)
      } catch (err) {
        console.error(`  ERROR: ${err.message}`)
      }
    }
  }

  const totalElapsed = Math.round((Date.now() - batchStart) / 1000)
  console.log('')
  console.log(`━━━ Batch complete: ${runDirs.length}/${matrix.length} runs in ${formatDuration(totalElapsed)} ━━━`)

  console.log('')
  console.log('━━━ Scoring all runs ━━━')
  console.log('')

  for (const runDir of runDirs) {
    try {
      const result = scoreRun(runDir, { abDir, repoRoot })
      console.log(`  ${path.basename(runDir)}: ${result.final_score} (${result.criteria_passed}/${result.criteria_total})`)
    } catch (err) {
      console.error(`  ${path.basename(runDir)}: SCORING FAILED - ${err.message}`)
    }
  }

  console.log('')
  console.log('━━━ Report ━━━')
  console.log('')

  const runsDir = path.join(abDir, 'runs')
  const runs = loadRuns(runsDir)
  generateReport(runs, runsDir)
}

if (require.main === module) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = { buildRunMatrix: pkg.buildRunMatrix, discoverChallenges, discoverVariants, loadBaseline, parseArgs, runWithConcurrency: pkg.runWithConcurrency }
