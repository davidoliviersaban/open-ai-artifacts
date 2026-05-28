const { execSync } = require('node:child_process')
const fs = require('node:fs')

function main() {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))
  const cwd = input.cwd || process.cwd()

  const changed = getChangedFiles(cwd)
  if (!changed.some(f => f.startsWith('packages/ai-artifacts/'))) {
    process.stdout.write(JSON.stringify({ continue: true }))
    return
  }

  const result = runTests(cwd)
  if (result.failed) {
    const trimmed = result.output.slice(-2000)
    process.stderr.write(`Tests are still failing. Fix them before finishing:\n\n${trimmed}`)
    process.exit(2)
  }

  process.stdout.write(JSON.stringify({ continue: true }))
}

function getChangedFiles(cwd) {
  try {
    const output = execSync('git diff --name-only HEAD', { cwd, encoding: 'utf8', stdio: 'pipe' })
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function runTests(cwd) {
  try {
    execSync('npm run test:ai-artifacts', { cwd, encoding: 'utf8', timeout: 60000, stdio: 'pipe' })
    return { failed: false, output: '' }
  } catch (err) {
    return { failed: true, output: (err.stdout || '') + (err.stderr || '') }
  }
}

if (require.main === module) main()

module.exports = { getChangedFiles, runTests }
