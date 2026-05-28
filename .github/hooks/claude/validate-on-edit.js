const { execSync } = require('node:child_process')
const fs = require('node:fs')

const STAMP_FILE = '/tmp/.claude-hook-test-stamp'
const DEBOUNCE_SECONDS = 10

function main() {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))
  const filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.file)) || ''
  const cwd = input.cwd || process.cwd()

  if (!filePath || !isPackageSource(filePath)) {
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

function isDebounced() {
  if (!fs.existsSync(STAMP_FILE)) return false
  const last = Number(fs.readFileSync(STAMP_FILE, 'utf8').trim())
  return (Math.floor(Date.now() / 1000) - last) < DEBOUNCE_SECONDS
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

module.exports = { isPackageSource, isDebounced, runTests }
