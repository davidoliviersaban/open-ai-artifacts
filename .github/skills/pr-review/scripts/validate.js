#!/usr/bin/env node
const { execSync } = require('child_process')
const path = require('path')

const args = process.argv.slice(2)
const skipTest = args.includes('--skip-test')
const skipValidate = args.includes('--skip-validate')

function findProjectRoot() {
  let dir = process.cwd()
  while (dir !== path.dirname(dir)) {
    try {
      const pkg = require(path.join(dir, 'package.json'))
      if (pkg.devDependencies?.nx || pkg.dependencies?.nx) return dir
    } catch {}
    dir = path.dirname(dir)
  }
  return process.cwd()
}

const root = findProjectRoot()

const steps = [
  { name: 'test', cmd: 'npm run test:ai-artifacts', skip: skipTest },
  { name: 'validate', cmd: 'npm run validate:ai-artifacts', skip: skipValidate },
]

let failed = false

for (const step of steps) {
  if (step.skip) {
    console.log(`  [SKIP] ${step.name}`)
    continue
  }

  console.log(`  [RUN]  ${step.name}: ${step.cmd}`)
  try {
    execSync(step.cmd, { cwd: root, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
    console.log(`  [PASS] ${step.name}`)
  } catch (e) {
    console.error(`  [FAIL] ${step.name}`)
    const output = (e.stdout || '') + (e.stderr || '')
    const lines = output.split('\n')
    const tail = lines.slice(-30).join('\n')
    if (tail.trim()) console.error(tail)
    failed = true
    break
  }
}

if (failed) {
  console.error('\nValidation FAILED. Fix the errors above before committing.')
  process.exit(1)
} else {
  console.log('\nValidation PASSED. Safe to commit.')
  process.exit(0)
}
