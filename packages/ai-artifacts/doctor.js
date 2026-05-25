const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const { parseArtifactConfig } = require('./lib')

function doctorAIArtifacts(root, options = {}) {
  const checks = []
  const detectedTools = detectAgentTools(options.env || process.env)
  const packageRoot = options.packageRoot || __dirname

  checks.push(checkNodeVersion())
  checks.push(checkCommand('git', ['--version'], 'git available'))
  checks.push(checkFile(path.join(root, 'package.json'), 'root package.json exists'))
  checks.push(checkFile(path.join(root, '.ai-artifacts/artifacts.yml'), 'artifact playbook exists'))
  checks.push(checkFile(path.join(root, '.ai-artifacts/lock.yml'), 'artifact lock exists'))
  checks.push(checkFile(path.join(root, 'AGENTS.md'), 'AGENTS.md exists'))
  checks.push(checkOptionalFile(path.join(root, 'CLAUDE.md'), 'CLAUDE.md exists'))
  checks.push(checkOptionalFile(path.join(root, '.opencode/opencode.json'), 'opencode project config exists'))
  checks.push(checkOptionalDir(path.join(root, '.opencode/agent'), 'opencode project agents exist'))
  checks.push(checkOptionalDir(path.join(root, '.opencode/skills'), 'opencode project skills exist'))
  checks.push(checkInstalledFiles(root, packageRoot))
  checks.push(checkSourceDir(root))
  checks.push(...checkClaudeSetup(root))
  checks.push(...checkOpencodeSetup(root))

  return {
    ok: checks.every((check) => check.status !== 'fail'),
    detectedTools,
    checks,
  }
}

function detectAgentTools(env = process.env) {
  const tools = []
  const termProgram = env.TERM_PROGRAM || ''
  const processMarkers = [env.npm_lifecycle_script, env._, env.SHELL].filter(Boolean).join(' ')
  const markerText = Object.entries(env)
    .filter(([key]) => /^(OPENCODE|CLAUDE|KIRO|CURSOR|VSCODE|TERM_PROGRAM|GITHUB_COPILOT)/.test(key))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  if (env.OPENCODE || /opencode/i.test(`${markerText}\n${processMarkers}`)) tools.push({ name: 'opencode', confidence: 'medium' })
  if (env.CLAUDECODE || env.CLAUDE_CODE || /claude/i.test(`${markerText}\n${processMarkers}`)) tools.push({ name: 'claude-code', confidence: 'medium' })
  if (env.KIRO || /kiro/i.test(`${markerText}\n${processMarkers}`)) tools.push({ name: 'kiro', confidence: 'low' })
  if (env.CURSOR_TRACE_ID || termProgram === 'Cursor' || /cursor/i.test(markerText)) tools.push({ name: 'cursor', confidence: 'medium' })
  if (env.VSCODE_PID || env.TERM_PROGRAM === 'vscode' || env.TERM_PROGRAM === 'Visual Studio Code') tools.push({ name: 'vscode', confidence: 'medium' })
  if (env.GITHUB_COPILOT_AGENT || /GITHUB_COPILOT/i.test(markerText)) tools.push({ name: 'github-copilot', confidence: 'low' })

  return dedupeTools(tools)
}

function checkSourceDir(root) {
  const configPath = path.join(root, '.ai-artifacts/artifacts.yml')
  if (!fs.existsSync(configPath)) return pass('sourceDir: no config')

  const config = parseArtifactConfig(fs.readFileSync(configPath, 'utf8'))
  const sourceDir = config.sourceDir || '.ai-artifacts/files'
  if (sourceDir.startsWith('.ai-artifacts')) {
    const resolvedDir = path.join(root, sourceDir)
    const hasFiles = fs.existsSync(resolvedDir) && fs.readdirSync(resolvedDir).length > 0
    const detail = hasFiles ? ` (${sourceDir}/ contains files)` : ''
    return warn(`sourceDir is inside .ai-artifacts${detail} — consider moving sources to a visible directory (e.g. .github/prompts) and setting sourceDir in artifacts.yml`)
  }
  return pass(`sourceDir: ${sourceDir}`)
}

function checkOpencodeSetup(root) {
  const configPath = path.join(root, '.ai-artifacts/artifacts.yml')
  if (!fs.existsSync(configPath)) return []

  const config = parseArtifactConfig(fs.readFileSync(configPath, 'utf8'))
  const { check } = require('./install.opencode')
  const result = check(root, config)
  if (result.ok) return [pass('opencode: artifacts configured')]
  return result.issues.map((issue) => fail(`opencode [${issue.artifact}] ${issue.path}: ${issue.issue}`))
}

function checkClaudeSetup(root) {
  const configPath = path.join(root, '.ai-artifacts/artifacts.yml')
  if (!fs.existsSync(configPath)) return []

  const config = parseArtifactConfig(fs.readFileSync(configPath, 'utf8'))
  const { check } = require('./install.claude')
  const result = check(root, config)
  if (result.ok) return [pass('claude-code: artifacts configured')]
  return result.issues.map((issue) => fail(`claude-code [${issue.artifact}] ${issue.path}: ${issue.issue}`))
}

function printDoctor(result) {
  console.log('ai-artifacts doctor')
  const tools = result.detectedTools.length > 0 ? result.detectedTools.map((tool) => `${tool.name} (${tool.confidence})`).join(', ') : 'none detected'
  console.log(`Detected tool context: ${tools}`)
  for (const check of result.checks) {
    const marker = check.status === 'pass' ? 'ok' : check.status
    console.log(`[${marker}] ${check.message}`)
  }
}

function dedupeTools(tools) {
  const byName = new Map()
  for (const tool of tools) {
    if (!byName.has(tool.name)) byName.set(tool.name, tool)
  }
  return [...byName.values()]
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0])
  return major >= 20 ? pass(`node ${process.versions.node}`) : fail(`node >=20 required, found ${process.versions.node}`)
}

function checkCommand(command, args, label) {
  try {
    const output = execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    return pass(`${label}: ${output}`)
  } catch {
    return fail(`${label}: command not available`)
  }
}

function checkFile(filePath, label) {
  const exists = fs.existsSync(filePath)
  if (!exists) return fail(label)
  const stat = fs.lstatSync(filePath)
  return stat.isFile() || stat.isSymbolicLink() ? pass(label) : fail(label)
}

function checkOptionalFile(filePath, label) {
  const exists = fs.existsSync(filePath)
  if (!exists) return warn(`${label}: not found`)
  const stat = fs.lstatSync(filePath)
  return stat.isFile() || stat.isSymbolicLink() ? pass(label) : warn(`${label}: not found`)
}

function checkOptionalDir(dirPath, label) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory() ? pass(label) : warn(`${label}: not found`)
}

function checkInstalledFiles(root, packageRoot) {
  try {
    const { installAIArtifacts } = require('./install')
    installAIArtifacts(root, { check: true, packageRoot })
    return pass('packaged workflow and schema are installed')
  } catch (error) {
    return fail(`packaged workflow/schema check failed: ${error.message}`)
  }
}

function pass(message) {
  return { status: 'pass', message }
}

function warn(message) {
  return { status: 'warn', message }
}

function fail(message) {
  return { status: 'fail', message }
}

module.exports = { detectAgentTools, doctorAIArtifacts, printDoctor }
