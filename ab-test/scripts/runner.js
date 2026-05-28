#!/usr/bin/env node
'use strict'

const { execSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { parseUsageFromJson } = require('./lib.js')

function createRunId(variant, challenge, iteration) {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  return `${variant}_${challenge}_${ts}_iter${iteration}`
}

function loadChallenge(abDir, challengeId) {
  const file = path.join(abDir, 'challenges', challengeId, 'challenge.json')
  if (!fs.existsSync(file)) throw new Error(`Challenge not found: ${file}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function loadVariant(abDir, variantId) {
  const file = path.join(abDir, 'variants', variantId, 'variant.json')
  if (!fs.existsSync(file)) throw new Error(`Variant not found: ${file}`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function createWorktree(repoRoot, name) {
  const worktree = path.join('/tmp', `ab-test-${name}`)
  execSync(`git worktree add "${worktree}" HEAD --detach`, { cwd: repoRoot, stdio: 'pipe' })
  return worktree
}

function prepareWorktree(worktree, variant, repoRoot) {
  // Symlink node_modules so npm scripts (nx, tests) work in the worktree
  const nodeModulesSrc = path.join(repoRoot, 'node_modules')
  const nodeModulesDst = path.join(worktree, 'node_modules')
  if (fs.existsSync(nodeModulesSrc) && !fs.existsSync(nodeModulesDst)) {
    fs.symlinkSync(nodeModulesSrc, nodeModulesDst)
  }

  // Remove ab-test dir so agent cannot see acceptance criteria or scoring logic
  const abTestDir = path.join(worktree, 'ab-test')
  if (fs.existsSync(abTestDir)) {
    fs.rmSync(abTestDir, { recursive: true })
  }

  // Remove docs/adr that mentions the ab-test framework
  const adrFile = path.join(worktree, 'docs', 'adr', '010-ab-test-framework.md')
  if (fs.existsSync(adrFile)) fs.unlinkSync(adrFile)

  // Remove any .claude session/memory that could leak prior run info
  const claudeDir = path.join(worktree, '.claude')
  if (fs.existsSync(claudeDir)) {
    fs.rmSync(claudeDir, { recursive: true })
  }

  // Remove git reflog so agent can't inspect prior run branches
  try {
    execSync('git reflog expire --expire=now --all', { cwd: worktree, stdio: 'pipe' })
  } catch { /* not critical */ }

  // Handle CLAUDE.md mode
  const claudeMdPath = path.join(worktree, 'CLAUDE.md')
  if (variant.claude_md === 'none') {
    if (fs.existsSync(claudeMdPath)) fs.unlinkSync(claudeMdPath)
    // Also remove skills and agents so the agent has truly zero context
    const skillsDir = path.join(worktree, '.github', 'skills')
    if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true })
    const agentsDir = path.join(worktree, '.github', 'agent')
    if (fs.existsSync(agentsDir)) fs.rmSync(agentsDir, { recursive: true })
  } else if (variant.claude_md === 'custom') {
    fs.writeFileSync(claudeMdPath, variant.claude_md_content || '')
    // Remove skills unless variant explicitly keeps them (disable_skills: false)
    if (variant.disable_skills !== false) {
      const skillsDir = path.join(worktree, '.github', 'skills')
      if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true })
    }
  }
  // 'inherit' or 'inherit-trimmed' = keep CLAUDE.md + skills, strip rules that block headless execution
  if (variant.claude_md === 'inherit' || variant.claude_md === 'inherit-trimmed') {
    if (fs.existsSync(claudeMdPath)) {
      let content = fs.readFileSync(claudeMdPath, 'utf8')
      // Remove Worktree Requirement (prevents coding directly in the worktree)
      content = content.replace(/### Worktree Requirement[\s\S]*?(?=###|## )/m, '')
      // Remove Git Safety (irrelevant in test — no push happens)
      content = content.replace(/### Git Safety[\s\S]*?(?=###|## )/m, '')
      // Remove Skill Invocation mandate (forces /multi-feature + /ship which can't work headless)
      content = content.replace(/### Skill Invocation[\s\S]*?(?=###|## )/m, '')
      // Remove pipeline table (references mandatory skills that block implementation)
      content = content.replace(/### Pipeline \(every change\)[\s\S]*?(?=## )/m, '')

      if (variant.claude_md === 'inherit-trimmed') {
        content = content.replace(/## Whitepaper Editorial Rules[\s\S]*?(?=## )/m, '')
        content = content.replace(/## Core Content Decisions[\s\S]*?(?=## )/m, '')
        content = content.replace(/## Package Direction[\s\S]*?(?=## )/m, '')
      }

      // Add autonomous execution directive
      content += '\n\n## Autonomous Execution\n\n'
      content += '- You are running in autonomous mode. Implement directly without asking for confirmation.\n'
      content += '- Work in the current directory. Do not create worktrees or branches.\n'
      content += '- Before finishing, run the test suite and fix any failures.\n'
      fs.writeFileSync(claudeMdPath, content)
    }
  }

  // Install enforcement hooks if variant requests them
  if (variant.hooks) {
    const hooksDir = path.join(worktree, '.claude', 'hooks')
    fs.mkdirSync(hooksDir, { recursive: true })

    // Write validation hooks inline (self-contained, no external dependency)
    fs.writeFileSync(path.join(hooksDir, 'validate-on-edit.js'), `
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const STAMP_FILE = '/tmp/.claude-hook-test-stamp'
function main() {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))
  const filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.file)) || ''
  const cwd = input.cwd || process.cwd()
  if (!filePath || !/packages\\/ai-artifacts\\/.*\\.(js|ts|mjs)$/.test(filePath)) {
    process.stdout.write(JSON.stringify({ continue: true }))
    return
  }
  const now = Math.floor(Date.now() / 1000)
  if (fs.existsSync(STAMP_FILE)) {
    const last = Number(fs.readFileSync(STAMP_FILE, 'utf8').trim())
    if ((now - last) < 10) { process.stdout.write(JSON.stringify({ continue: true })); return }
  }
  fs.writeFileSync(STAMP_FILE, String(now))
  try {
    execSync('npm run test:ai-artifacts', { cwd, encoding: 'utf8', timeout: 60000, stdio: 'pipe' })
    process.stdout.write(JSON.stringify({ continue: true }))
  } catch (err) {
    const output = ((err.stdout || '') + (err.stderr || '')).slice(-2000)
    process.stdout.write(JSON.stringify({
      continue: true,
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'TESTS FAILED after your edit. Fix before continuing:\\n\\n' + output }
    }))
  }
}
main()
`)

    fs.writeFileSync(path.join(hooksDir, 'validate-on-stop.js'), `
const { execSync } = require('node:child_process')
const fs = require('node:fs')
function main() {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))
  const cwd = input.cwd || process.cwd()
  let changed = ''
  try { changed = execSync('git diff --name-only HEAD', { cwd, encoding: 'utf8', stdio: 'pipe' }) } catch {}
  if (!changed.includes('packages/ai-artifacts/')) {
    process.stdout.write(JSON.stringify({ continue: true }))
    return
  }
  try {
    execSync('npm run test:ai-artifacts', { cwd, encoding: 'utf8', timeout: 60000, stdio: 'pipe' })
    process.stdout.write(JSON.stringify({ continue: true }))
  } catch (err) {
    const output = ((err.stdout || '') + (err.stderr || '')).slice(-2000)
    process.stderr.write('Tests are still failing. Fix them before finishing:\\n\\n' + output)
    process.exit(2)
  }
}
main()
`)

    // Write settings.json with enforcement hooks
    const settings = {
      hooks: {
        PostToolUse: [
          { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'node .claude/hooks/validate-on-edit.js' }] },
        ],
        Stop: [
          { hooks: [{ type: 'command', command: 'node .claude/hooks/validate-on-stop.js' }] },
        ],
      },
    }
    fs.writeFileSync(path.join(worktree, '.claude', 'settings.json'), JSON.stringify(settings, null, 2))
  }

  // Remove individually disabled skills
  if (variant.disabled_skills && variant.disabled_skills.length > 0) {
    for (const skill of variant.disabled_skills) {
      const skillDir = path.join(worktree, '.github', 'skills', skill)
      if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true })
    }
  }
}

function buildClaudeFlags(variant, modelOverride, budget) {
  const flags = [
    '-p',
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--no-session-persistence',
    '--max-budget-usd', String(budget),
  ]

  if (variant.bare) flags.push('--bare')
  if (variant.disable_skills) flags.push('--disable-slash-commands')
  if (variant.system_prompt) flags.push('--system-prompt', variant.system_prompt)

  const model = modelOverride || variant.model
  if (model) flags.push('--model', model)

  return flags
}

function runClaude(worktree, flags, prompt, debugFile) {
  const allFlags = [...flags]
  if (debugFile) {
    allFlags.push('--debug-file', debugFile)
  }

  const start = Date.now()
  const result = spawnSync('claude', [...allFlags, prompt], {
    cwd: worktree,
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 50 * 1024 * 1024,
  })
  const elapsed = Math.round((Date.now() - start) / 1000)

  const stdout = result.stdout || ''
  const stderr = result.stderr || ''
  const rawJson = stdout || stderr

  return { stdout, stderr, rawJson, elapsed, exitCode: result.status }
}

function captureDiff(worktree) {
  try {
    execSync('git add -A', { cwd: worktree, stdio: 'pipe' })
    return execSync('git diff baseline --cached', { cwd: worktree, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  } catch {
    return ''
  }
}

function captureDiffStat(worktree) {
  try {
    return execSync('git diff baseline --cached --stat', { cwd: worktree, encoding: 'utf8' })
  } catch {
    return ''
  }
}

function captureGitLog(worktree) {
  try {
    return execSync('git log --format="%H%n%s%n%b%n---" baseline..HEAD', { cwd: worktree, encoding: 'utf8', stdio: 'pipe' })
  } catch {
    return ''
  }
}

function captureDeliveryState(worktree) {
  const state = { branches: [], commits: [], current_branch: null, untracked_source: [] }
  try {
    state.branches = execSync('git branch --format=%(refname:short)', { cwd: worktree, encoding: 'utf8', stdio: 'pipe' })
      .split('\n').filter(Boolean)
  } catch {}
  try {
    state.current_branch = execSync('git branch --show-current', { cwd: worktree, encoding: 'utf8', stdio: 'pipe' }).trim() || null
  } catch {}
  try {
    // Parse commits individually to avoid shell quoting issues
    const hashes = execSync('git log --format=%H baseline..HEAD', { cwd: worktree, encoding: 'utf8', stdio: 'pipe' })
      .split('\n').filter(Boolean)
    for (const hash of hashes) {
      const subject = execSync(`git log -1 --format=%s ${hash}`, { cwd: worktree, encoding: 'utf8', stdio: 'pipe' }).trim()
      const body = execSync(`git log -1 --format=%b ${hash}`, { cwd: worktree, encoding: 'utf8', stdio: 'pipe' }).trim()
      state.commits.push({ hash, subject, body })
    }
  } catch {}
  try {
    state.untracked_source = execSync('git ls-files --others --exclude-standard -- packages/ai-artifacts/', { cwd: worktree, encoding: 'utf8', stdio: 'pipe' })
      .split('\n').filter(f => /\.(js|ts|mjs)$/.test(f))
  } catch {}
  return state
}

function removeWorktree(repoRoot, worktree) {
  try {
    execSync(`git worktree remove "${worktree}" --force`, { cwd: repoRoot, stdio: 'pipe' })
  } catch {
    // best effort
  }
}

function executeRun({ abDir, repoRoot, variantId, challengeId, iteration, modelOverride, budget }) {
  const challenge = loadChallenge(abDir, challengeId)
  const variant = loadVariant(abDir, variantId)
  const runId = createRunId(variantId, challengeId, iteration)
  const runDir = path.join(abDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })

  const worktree = createWorktree(repoRoot, runId)

  try {
    prepareWorktree(worktree, variant, repoRoot)

    // Commit the clean state so we can diff only what the agent changes
    execSync('git add -A && git commit -m "baseline" --allow-empty', { cwd: worktree, stdio: 'pipe' })
    // Tag it so captureGitLog can reference it (force to overwrite if stale)
    execSync('git tag -f baseline', { cwd: worktree, stdio: 'pipe' })

    // Save metadata
    const metadata = {
      run_id: runId,
      variant: variantId,
      challenge: challengeId,
      iteration,
      model: modelOverride || variant.model || 'default',
      started_at: new Date().toISOString(),
      worktree,
    }
    fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify(metadata, null, 2))

    // Save the CLAUDE.md used
    const claudeMd = path.join(worktree, 'CLAUDE.md')
    if (fs.existsSync(claudeMd)) {
      fs.copyFileSync(claudeMd, path.join(runDir, 'claude_md_used.md'))
    } else {
      fs.writeFileSync(path.join(runDir, 'claude_md_used.md'), '(no CLAUDE.md)')
    }

    // Run claude
    const flags = buildClaudeFlags(variant, modelOverride, budget)
    const debugFile = path.join(runDir, 'debug.log')
    const { stdout, stderr, rawJson, elapsed, exitCode } = runClaude(worktree, flags, challenge.prompt, debugFile)

    fs.writeFileSync(path.join(runDir, 'stdout.json'), stdout)
    fs.writeFileSync(path.join(runDir, 'stderr.log'), stderr)

    // Parse usage
    const usage = parseUsageFromJson(rawJson)
    const usageResult = usage
      ? { ...usage, elapsed_seconds: elapsed }
      : { total_tokens: 0, cost_usd: 0, elapsed_seconds: elapsed, exit_type: 'parse_error', model: 'unknown' }
    fs.writeFileSync(path.join(runDir, 'usage.json'), JSON.stringify(usageResult, null, 2))

    // Capture diff, git log, and delivery state
    fs.writeFileSync(path.join(runDir, 'git_log.txt'), captureGitLog(worktree))
    fs.writeFileSync(path.join(runDir, 'delivery.json'), JSON.stringify(captureDeliveryState(worktree), null, 2))
    fs.writeFileSync(path.join(runDir, 'changes.diff'), captureDiff(worktree))
    fs.writeFileSync(path.join(runDir, 'changes_stat.txt'), captureDiffStat(worktree))

    // Update metadata
    metadata.completed_at = new Date().toISOString()
    metadata.elapsed_seconds = elapsed
    metadata.exit_code = exitCode
    fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify(metadata, null, 2))

    return { runId, runDir, elapsed, usage: usageResult }
  } finally {
    removeWorktree(repoRoot, worktree)
  }
}

function parseArgs(argv) {
  const args = { variant: null, challenge: 'default', iteration: 1, model: null, budget: 2.0 }
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--variant': args.variant = argv[++i]; break
      case '--challenge': args.challenge = argv[++i]; break
      case '--iteration': args.iteration = Number(argv[++i]); break
      case '--model': args.model = argv[++i]; break
      case '--budget': args.budget = Number(argv[++i]); break
    }
  }
  return args
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2))
  if (!args.variant) {
    console.error('Usage: runner.js --variant <id> [--challenge <id>] [--iteration <n>] [--model <m>] [--budget <$>]')
    process.exit(1)
  }

  const abDir = path.resolve(__dirname, '..')
  const repoRoot = path.resolve(abDir, '..')

  console.log(`=== A/B Test Run ===`)
  console.log(`Variant:   ${args.variant}`)
  console.log(`Challenge: ${args.challenge}`)
  console.log(`Iteration: ${args.iteration}`)
  console.log('')

  const { runId, runDir, elapsed, usage } = executeRun({
    abDir,
    repoRoot,
    variantId: args.variant,
    challengeId: args.challenge,
    iteration: args.iteration,
    modelOverride: args.model,
    budget: args.budget,
  })

  console.log(`Run ID:  ${runId}`)
  console.log(`Time:    ${elapsed}s`)
  console.log(`Tokens:  ${usage.total_tokens}`)
  console.log(`Cost:    $${(usage.cost_usd || 0).toFixed(2)}`)
  console.log(`Output:  ${runDir}`)
}

module.exports = {
  buildClaudeFlags,
  createRunId,
  executeRun,
  loadChallenge,
  loadVariant,
  parseArgs,
  prepareWorktree,
}
