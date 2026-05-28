'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { executeRun } = require('./runner.js')

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

function discoverChallenges(challengesDir) {
  if (!fs.existsSync(challengesDir)) return []
  return fs.readdirSync(challengesDir).filter(entry => {
    const full = path.join(challengesDir, entry)
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'challenge.json'))
  })
}

function discoverVariants(variantsDir, baselineFile) {
  if (baselineFile && fs.existsSync(baselineFile)) {
    const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
    if (Array.isArray(baseline.variants) && baseline.variants.length > 0) return baseline.variants
  }
  if (!fs.existsSync(variantsDir)) return []
  return fs.readdirSync(variantsDir).filter(entry => {
    return fs.existsSync(path.join(variantsDir, entry, 'variant.json'))
  })
}

async function runWithConcurrency(items, limit, worker) {
  let index = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++]
      await worker(item)
    }
  })
  await Promise.all(workers)
}

async function executeBatch({ config, adapter, variants, challenges, iterations, model, budget, parallel }) {
  const matrix = buildRunMatrix(challenges, variants, iterations)
  const results = []

  if (parallel && parallel > 0) {
    const concurrency = parallel === Infinity ? matrix.length : parallel
    await runWithConcurrency(matrix, concurrency, async ({ challenge, variant, iteration }) => {
      try {
        const result = executeRun({ config, variantId: variant, challengeId: challenge, iteration, modelOverride: model, budget, adapter })
        results.push(result)
      } catch (err) {
        results.push({ error: err.message, variant, challenge, iteration })
      }
    })
  } else {
    for (const { challenge, variant, iteration } of matrix) {
      try {
        const result = executeRun({ config, variantId: variant, challengeId: challenge, iteration, modelOverride: model, budget, adapter })
        results.push(result)
      } catch (err) {
        results.push({ error: err.message, variant, challenge, iteration })
      }
    }
  }

  return { matrix, results }
}

module.exports = { buildRunMatrix, discoverChallenges, discoverVariants, executeBatch, runWithConcurrency }
