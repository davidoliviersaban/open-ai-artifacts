const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function main() {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))
  const cwd = input.cwd || process.cwd()

  const changed = getChangedFiles(cwd)

  if (changed.some(f => /\/package\.json$/.test(f) || f === 'package.json')) {
    const lockResult = checkLockfile(cwd)
    if (lockResult.outOfSync) {
      process.stderr.write(`LOCKFILE OUT OF SYNC: package-lock.json does not match package.json. Run \`npm install --package-lock-only\` to fix.\n\n${lockResult.output}`)
      process.exit(2)
    }
  }

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

function checkLockfile(cwd) {
  try {
    const pkgPath = path.join(cwd, 'package.json')
    const lockPath = path.join(cwd, 'package-lock.json')
    if (!fs.existsSync(lockPath)) return { outOfSync: true, output: 'package-lock.json not found' }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    const workspaces = pkg.workspaces || []
    const lockPackages = lock.packages || {}

    const missing = []
    for (const ws of workspaces) {
      const wsPath = ws.replace(/\/$/, '')
      if (!lockPackages[wsPath]) {
        missing.push(wsPath)
      }
    }

    if (missing.length > 0) {
      return { outOfSync: true, output: `Missing from package-lock.json: ${missing.join(', ')}. Run \`npm install --package-lock-only\`.` }
    }

    return { outOfSync: false, output: '' }
  } catch (err) {
    return { outOfSync: true, output: err.message }
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

module.exports = { getChangedFiles, checkLockfile, runTests }
