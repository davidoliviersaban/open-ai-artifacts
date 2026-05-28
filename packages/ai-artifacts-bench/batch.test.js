const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { buildRunMatrix, discoverChallenges, discoverVariants, runWithConcurrency } = require('./batch.js')

test('buildRunMatrix generates cartesian product', () => {
  const matrix = buildRunMatrix(['c1', 'c2'], ['v1', 'v2'], 2)
  assert.equal(matrix.length, 8)
  assert.deepEqual(matrix[0], { challenge: 'c1', variant: 'v1', iteration: 1 })
  assert.deepEqual(matrix[1], { challenge: 'c1', variant: 'v1', iteration: 2 })
  assert.deepEqual(matrix[7], { challenge: 'c2', variant: 'v2', iteration: 2 })
})

test('buildRunMatrix handles single challenge/variant/iteration', () => {
  const matrix = buildRunMatrix(['c1'], ['v1'], 1)
  assert.equal(matrix.length, 1)
  assert.deepEqual(matrix[0], { challenge: 'c1', variant: 'v1', iteration: 1 })
})

test('discoverChallenges finds directories with challenge.json', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-discover-'))
  try {
    fs.mkdirSync(path.join(root, 'valid-challenge'), { recursive: true })
    fs.writeFileSync(path.join(root, 'valid-challenge', 'challenge.json'), '{}')
    fs.mkdirSync(path.join(root, 'no-json'), { recursive: true })
    fs.writeFileSync(path.join(root, 'stray-file.txt'), 'ignored')

    const result = discoverChallenges(root)
    assert.deepEqual(result, ['valid-challenge'])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('discoverChallenges returns empty for nonexistent dir', () => {
  assert.deepEqual(discoverChallenges('/nonexistent'), [])
})

test('discoverVariants uses baseline.variants when available', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-variants-'))
  try {
    const variantsDir = path.join(root, 'variants')
    const baselineFile = path.join(root, 'baseline.json')
    fs.mkdirSync(path.join(variantsDir, 'a'), { recursive: true })
    fs.writeFileSync(path.join(variantsDir, 'a', 'variant.json'), '{}')
    fs.mkdirSync(path.join(variantsDir, 'b'), { recursive: true })
    fs.writeFileSync(path.join(variantsDir, 'b', 'variant.json'), '{}')
    fs.writeFileSync(baselineFile, JSON.stringify({ variants: ['b'] }))

    const result = discoverVariants(variantsDir, baselineFile)
    assert.deepEqual(result, ['b'])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('discoverVariants falls back to filesystem when no baseline', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-variants-fs-'))
  try {
    fs.mkdirSync(path.join(root, 'x'), { recursive: true })
    fs.writeFileSync(path.join(root, 'x', 'variant.json'), '{}')
    fs.mkdirSync(path.join(root, 'y'), { recursive: true })
    fs.writeFileSync(path.join(root, 'y', 'variant.json'), '{}')

    const result = discoverVariants(root, '/nonexistent')
    assert.ok(result.includes('x'))
    assert.ok(result.includes('y'))
    assert.equal(result.length, 2)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('runWithConcurrency executes all items with bounded parallelism', async () => {
  const executed = []
  const items = [1, 2, 3, 4, 5]
  await runWithConcurrency(items, 2, async (item) => {
    await new Promise(resolve => setTimeout(resolve, 10))
    executed.push(item)
  })
  assert.deepEqual(executed.sort(), [1, 2, 3, 4, 5])
})

test('runWithConcurrency handles concurrency=1 (sequential)', async () => {
  const order = []
  await runWithConcurrency(['a', 'b', 'c'], 1, async (item) => {
    order.push(item)
  })
  assert.deepEqual(order, ['a', 'b', 'c'])
})
