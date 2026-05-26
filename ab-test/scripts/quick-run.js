#!/usr/bin/env node
'use strict'

const path = require('node:path')
const { executeRun } = require('./runner.js')
const { scoreRun } = require('./score.js')

function main() {
  const args = process.argv.slice(2)
  const variant = args[0]
  if (!variant || variant.startsWith('--')) {
    console.error('Usage: quick-run.js <variant-id> [--model <model>] [--budget <$>]')
    process.exit(1)
  }

  let model = null
  let budget = 2.0
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--model') model = args[++i]
    if (args[i] === '--budget') budget = Number(args[++i])
  }

  const abDir = path.resolve(__dirname, '..')
  const repoRoot = path.resolve(abDir, '..')

  console.log(`Quick run: variant=${variant}, model=${model || 'default'}, budget=$${budget}`)
  console.log('')

  const { runId, runDir, elapsed, usage } = executeRun({
    abDir,
    repoRoot,
    variantId: variant,
    challengeId: 'default',
    iteration: 1,
    modelOverride: model,
    budget,
  })

  console.log(`Run: ${runId}`)
  console.log(`Time: ${elapsed}s | Tokens: ${usage.total_tokens} | Cost: $${(usage.cost_usd || 0).toFixed(2)}`)
  console.log('')
  console.log('Scoring...')

  const score = scoreRun(runDir, { abDir, repoRoot })

  console.log('')
  console.log('━━━ Results ━━━')
  console.log(`  Criteria: ${score.criteria_passed}/${score.criteria_total}`)
  console.log(`  Score:    ${score.final_score}`)
  console.log(`  Output:   ${runDir}`)

  const failed = score.criteria_results.filter(c => !c.pass)
  if (failed.length > 0) {
    console.log(`  Failed:   ${failed.map(c => c.id).join(', ')}`)
  }
}

main()
