#!/usr/bin/env node
'use strict'

const { execSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const model = process.argv[2] || 'amazon-bedrock/us.anthropic.claude-opus-4-6-v1'
const abDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(abDir, '..')
const challengeFile = path.join(abDir, 'challenges', 'story-ac', 'challenge.json')
const challenge = JSON.parse(fs.readFileSync(challengeFile, 'utf8'))

console.log(`Model: ${model}`)

const runId = `opencode_story-ac_${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}`
const runDir = path.join(abDir, 'runs', runId)
fs.mkdirSync(runDir, { recursive: true })

// Create worktree
const worktree = path.join('/tmp', `ab-test-${runId}`)
console.log(`Creating worktree: ${worktree}`)
execSync(`git worktree add "${worktree}" HEAD --detach`, { cwd: repoRoot, stdio: 'pipe' })

try {
  // Prepare: keep CLAUDE.md equivalent (AGENTS.md) and skills — we want to see if opencode uses them
  // Remove ab-test dir and .claude dir only
  const abTestDir = path.join(worktree, 'ab-test')
  if (fs.existsSync(abTestDir)) fs.rmSync(abTestDir, { recursive: true })
  const claudeDir = path.join(worktree, '.claude')
  if (fs.existsSync(claudeDir)) fs.rmSync(claudeDir, { recursive: true })
  const adrFile = path.join(worktree, 'docs', 'adr', '010-ab-test-framework.md')
  if (fs.existsSync(adrFile)) fs.unlinkSync(adrFile)

  // Commit baseline
  execSync('git add -A && git commit -m "baseline" --allow-empty', { cwd: worktree, stdio: 'pipe' })

  console.log(`Running opencode on challenge: ${challenge.id}`)
  console.log(`Prompt: ${challenge.prompt.slice(0, 100)}...`)
  console.log('')

  const start = Date.now()
  const result = spawnSync('opencode', [
    'run',
    '--dir', worktree,
    '--model', model,
    '--dangerously-skip-permissions',
    '--format', 'json',
    '--print-logs',
    '--log-level', 'DEBUG',
    challenge.prompt,
  ], {
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env },
  })
  const elapsed = Math.round((Date.now() - start) / 1000)

  console.log(`\nCompleted in ${elapsed}s (exit code: ${result.status})`)

  // Save outputs
  fs.writeFileSync(path.join(runDir, 'stdout.json'), result.stdout || '')
  fs.writeFileSync(path.join(runDir, 'stderr.log'), result.stderr || '')

  // Capture diff
  try {
    execSync('git add -A', { cwd: worktree, stdio: 'pipe' })
    const diff = execSync('git diff --cached', { cwd: worktree, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    fs.writeFileSync(path.join(runDir, 'changes.diff'), diff)
    const stat = execSync('git diff --cached --stat', { cwd: worktree, encoding: 'utf8' })
    fs.writeFileSync(path.join(runDir, 'changes_stat.txt'), stat)
    console.log(`\nDiff stat:\n${stat}`)
  } catch { /* no changes */ }

  // Parse JSON output for skill/tool usage
  const stdout = result.stdout || ''
  const stderr = result.stderr || ''

  // Look for skill invocations in stderr (debug logs)
  const skillLines = stderr.split('\n').filter(l => /skill/i.test(l))
  console.log(`\n=== Skill-related log lines (${skillLines.length}) ===`)
  for (const line of skillLines.slice(0, 30)) {
    console.log(`  ${line.slice(0, 150)}`)
  }

  // Look for tool calls in stderr
  const toolLines = stderr.split('\n').filter(l => /tool_dispatch|tool_use|tool_call/i.test(l))
  console.log(`\n=== Tool dispatch lines (${toolLines.length}) ===`)
  for (const line of toolLines.slice(0, 30)) {
    console.log(`  ${line.slice(0, 150)}`)
  }

  // Parse JSON events from stdout (opencode outputs JSONL)
  let events = []
  for (const line of stdout.split('\n').filter(Boolean)) {
    try { events.push(JSON.parse(line)) } catch { /* not json */ }
  }

  const toolUseEvents = events.filter(e => e.type === 'tool_use')
  const skillCalls = toolUseEvents.filter(e => e.part?.tool === 'skill')
  const stepFinishes = events.filter(e => e.type === 'step_finish')

  // Aggregate tokens and cost
  let totalTokens = 0, totalCost = 0
  for (const sf of stepFinishes) {
    if (sf.part?.tokens) totalTokens += sf.part.tokens.total || 0
    if (sf.part?.cost) totalCost += sf.part.cost
  }

  // Count tools
  const toolCounts = {}
  for (const e of toolUseEvents) {
    const tool = e.part?.tool || 'unknown'
    toolCounts[tool] = (toolCounts[tool] || 0) + 1
  }

  console.log(`\n=== Results ===`)
  console.log(`  Events:  ${events.length} total`)
  console.log(`  Tools:   ${toolUseEvents.length} calls`)
  for (const [tool, count] of Object.entries(toolCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`           ${tool}: ${count}`)
  }
  console.log(`  Skills:  ${skillCalls.length} invocations`)
  for (const sc of skillCalls) {
    console.log(`           ${sc.part?.state?.input?.skill || JSON.stringify(sc.part?.state?.input).slice(0, 100)}`)
  }
  console.log(`  Tokens:  ${totalTokens}`)
  console.log(`  Cost:    $${totalCost.toFixed(2)}`)
  console.log(`  Steps:   ${stepFinishes.length}`)

  // Save metadata
  fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify({
    run_id: runId,
    tool: 'opencode',
    variant: 'full-pipeline',
    challenge: 'story-ac',
    elapsed_seconds: elapsed,
    exit_code: result.status,
    completed_at: new Date().toISOString(),
  }, null, 2))

  console.log(`\nOutput saved to: ${runDir}`)

} finally {
  try {
    execSync(`git worktree remove "${worktree}" --force`, { cwd: repoRoot, stdio: 'pipe' })
  } catch { /* best effort */ }
}
