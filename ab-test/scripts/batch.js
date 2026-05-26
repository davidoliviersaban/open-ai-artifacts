#!/usr/bin/env node
'use strict'

const { fork } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const { executeRun } = require('./runner.js')
const { scoreRun } = require('./score.js')
const { generateReport, loadRuns } = require('./report.js')

function parseArgs(argv) {
  const args = { challenges: null, iterations: 1, variants: null, model: null, budget: 2.0, parallel: false }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--challenge': args.challenges = [argv[++i]]; break
      case '--challenges': args.challenges = argv[++i].split(','); break
      case '--iterations': args.iterations = Number(argv[++i]); break
      case '--variants': args.variants = argv[++i].split(','); break
      case '--model': args.model = argv[++i]; break
      case '--budget': args.budget = Number(argv[++i]); break
      case '--parallel': args.parallel = true; break
    }
  }
  return args
}

function discoverVariants(abDir) {
  const variantsDir = path.join(abDir, 'variants')
  if (!fs.existsSync(variantsDir)) return []
  return fs.readdirSync(variantsDir).filter(entry => {
    return fs.existsSync(path.join(variantsDir, entry, 'variant.json'))
  })
}

function discoverChallenges(abDir) {
  const challengesDir = path.join(abDir, 'challenges')
  if (!fs.existsSync(challengesDir)) return []
  return fs.readdirSync(challengesDir).filter(entry => {
    const full = path.join(challengesDir, entry)
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'challenge.json'))
  })
}

function buildRunMatrix(challenges, variants, iterations) {
  const matrix = []
  for (const challenge of challenges) {
    for (const variant of variants) {
      for (let i = 1; i <= iterations; i++) {
        matrix.push({ challenge, variant, iteration: i })
      }
    }
  }
  return matrix
}

function runSingle({ abDir, repoRoot, variant, challenge, iteration, model, budget }) {
  return executeRun({
    abDir,
    repoRoot,
    variantId: variant,
    challengeId: challenge,
    iteration,
    modelOverride: model,
    budget,
  })
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
        // Find the run directory by listing the most recent one matching this variant+challenge
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
  const matrix = buildRunMatrix(challenges, variants, args.iterations)

  console.log('╔══════════════════════════════════════════╗')
  console.log('║       A/B Test Batch Runner              ║')
  console.log('╠══════════════════════════════════════════╣')
  console.log(`║ Challenges: ${challenges.join(', ')}`)
  console.log(`║ Variants:   ${variants.join(', ')}`)
  console.log(`║ Iterations: ${args.iterations}`)
  console.log(`║ Total runs: ${matrix.length}`)
  console.log(`║ Model:      ${args.model || 'default'}`)
  console.log(`║ Parallel:   ${args.parallel}`)
  console.log(`║ Budget:     $${args.budget}/run (max total: $${(matrix.length * args.budget).toFixed(0)})`)
  console.log('╚══════════════════════════════════════════╝')
  console.log('')

  const runDirs = []

  if (args.parallel) {
    console.log(`Launching ${matrix.length} runs in parallel...`)
    console.log('')

    const promises = matrix.map(({ challenge, variant, iteration }) => {
      console.log(`  Starting: ${variant} × ${challenge} (iter ${iteration})`)
      return runInChildProcess({
        abDir, variant, challenge, iteration,
        model: args.model, budget: args.budget,
      }).then(({ runDir }) => {
        if (runDir) runDirs.push(runDir)
        console.log(`  ✓ ${variant} × ${challenge} (iter ${iteration}) done`)
      }).catch(err => {
        console.error(`  ✗ ${variant} × ${challenge} (iter ${iteration}): ${err.message}`)
      })
    })

    await Promise.all(promises)
  } else {
    let runCount = 0
    for (const { challenge, variant, iteration } of matrix) {
      runCount++
      console.log(`━━━ [${runCount}/${matrix.length}] ${variant} × ${challenge} (iter ${iteration}) ━━━`)

      try {
        const { runDir, elapsed, usage } = runSingle({
          abDir, repoRoot, variant, challenge, iteration,
          model: args.model, budget: args.budget,
        })
        console.log(`  Done (${elapsed}s, ${usage.total_tokens} tokens, $${(usage.cost_usd || 0).toFixed(2)})`)
        runDirs.push(runDir)
      } catch (err) {
        console.error(`  ERROR: ${err.message}`)
      }
    }
  }

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

main().catch(err => {
  console.error(err)
  process.exit(1)
})
