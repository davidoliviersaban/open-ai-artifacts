const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const STAMP_FILE = '/tmp/.claude-hook-test-stamp'
const DEBOUNCE_SECONDS = 10

function main() {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))
  const filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.file)) || ''
  const cwd = input.cwd || process.cwd()

  if (isPackageJson(filePath)) {
    const lockResult = checkLockfile(cwd)
    if (lockResult.outOfSync) {
      process.stdout.write(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: `LOCKFILE OUT OF SYNC: package-lock.json does not match package.json. Run \`npm install --package-lock-only\` to fix.\n\n${lockResult.output}`,
        },
      }))
      return
    }
    process.stdout.write(JSON.stringify({ continue: true }))
    return
  }

  if (!isPackageSource(filePath)) {
    process.stdout.write(JSON.stringify({ continue: true }))
    return
  }

  if (isDebounced()) {
    process.stdout.write(JSON.stringify({ continue: true }))
    return
  }

  fs.writeFileSync(STAMP_FILE, String(Math.floor(Date.now() / 1000)))

  const result = runTests(cwd)
  if (result.failed) {
    const trimmed = result.output.slice(-2000)
    process.stdout.write(JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `TESTS FAILED after your edit. Fix before continuing:\n\n${trimmed}`,
      },
    }))
  } else {
    process.stdout.write(JSON.stringify({ continue: true }))
  }
}

function isPackageSource(filePath) {
  return /packages\/ai-artifacts\/.*\.(js|ts|mjs)$/.test(filePath)
}

function isPackageJson(filePath) {
  return /\/package\.json$/.test(filePath) || filePath === 'package.json'
}

function isDebounced() {
  if (!fs.existsSync(STAMP_FILE)) return false
  const last = Number(fs.readFileSync(STAMP_FILE, 'utf8').trim())
  return (Math.floor(Date.now() / 1000) - last) < DEBOUNCE_SECONDS
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

module.exports = { isPackageSource, isPackageJson, isDebounced, checkLockfile, runTests }
