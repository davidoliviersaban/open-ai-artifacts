#!/usr/bin/env node
'use strict'

const { execSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const abDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(abDir, '..')
const challengeFile = path.join(abDir, 'challenges', 'story-ac', 'challenge.json')
const challenge = JSON.parse(fs.readFileSync(challengeFile, 'utf8'))
const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

const runs = [
  { id: 'oc-full', model: 'amazon-bedrock/us.anthropic.claude-opus-4-6-v1', name: 'Opus + full' },
  { id: 'oc-agents-no-skills', model: 'amazon-bedrock/us.anthropic.claude-opus-4-6-v1', name: 'Opus + agents-no-skills' },
  { id: 'oc-full', model: 'github-copilot/gpt-5.5', name: 'GPT-5.5 + full' },
  { id: 'oc-agents-no-skills', model: 'github-copilot/gpt-5.5', name: 'GPT-5.5 + agents-no-skills' },
]

function createWorktree(name) {
  const worktree = path.join('/tmp', `ab-oc-${name}`)
  if (fs.existsSync(worktree)) {
    try { execSync(`git worktree remove "${worktree}" --force`, { cwd: repoRoot, stdio: 'pipe' }) } catch {}
  }
  execSync(`git worktree add "${worktree}" HEAD --detach`, { cwd: repoRoot, stdio: 'pipe' })
  return worktree
}

function cleanWorktree(worktree) {
  const abTestDir = path.join(worktree, 'ab-test')
  if (fs.existsSync(abTestDir)) fs.rmSync(abTestDir, { recursive: true })
  const claudeDir = path.join(worktree, '.claude')
  if (fs.existsSync(claudeDir)) fs.rmSync(claudeDir, { recursive: true })
  const adrFile = path.join(worktree, 'docs', 'adr', '010-ab-test-framework.md')
  if (fs.existsSync(adrFile)) fs.unlinkSync(adrFile)
  const claudeMd = path.join(worktree, 'CLAUDE.md')
  if (fs.existsSync(claudeMd)) fs.unlinkSync(claudeMd)

  // Strip blocking rules from AGENTS.md
  const agentsMd = path.join(worktree, 'AGENTS.md')
  if (fs.existsSync(agentsMd)) {
    let content = fs.readFileSync(agentsMd, 'utf8')
    content = content.replace(/### Worktree Requirement[\s\S]*?(?=###|## )/m, '')
    content = content.replace(/### Git Safety[\s\S]*?(?=###|## )/m, '')
    content = content.replace(/### Skill Invocation[\s\S]*?(?=###|## )/m, '')
    content = content.replace(/### Pipeline \(every change\)[\s\S]*?(?=## )/m, '')
    fs.writeFileSync(agentsMd, content)
  }
}

function prepareVariant(worktree, variantId) {
  if (variantId === 'oc-full') {
    // Keep AGENTS.md (already cleaned) + skills, simplify permissions
    const ocConfig = path.join(worktree, '.opencode', 'opencode.json')
    if (fs.existsSync(ocConfig)) {
      const config = JSON.parse(fs.readFileSync(ocConfig, 'utf8'))
      config.permission = { edit: 'allow', bash: { '*': 'allow' } }
      fs.writeFileSync(ocConfig, JSON.stringify(config, null, 2))
    }
  } else if (variantId === 'oc-agents-no-skills') {
    // Remove skills directory
    const skillsDir = path.join(worktree, '.opencode', 'skills')
    if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true })
    // Strip skill-related sections from AGENTS.md
    const agentsMd = path.join(worktree, 'AGENTS.md')
    if (fs.existsSync(agentsMd)) {
      let content = fs.readFileSync(agentsMd, 'utf8')
      content = content.replace(/## Skills And Workflows[\s\S]*?(?=## )/m, '')
      content = content.replace(/`\/[a-z-]+`/g, '(removed)')
      fs.writeFileSync(agentsMd, content)
    }
    // Remove skills from opencode.json
    const ocConfig = path.join(worktree, '.opencode', 'opencode.json')
    if (fs.existsSync(ocConfig)) {
      const config = JSON.parse(fs.readFileSync(ocConfig, 'utf8'))
      delete config.skills
      config.permission = { edit: 'allow', bash: { '*': 'allow' } }
      fs.writeFileSync(ocConfig, JSON.stringify(config, null, 2))
    }
  }
}

function runOne(run) {
  const modelShort = run.model.includes('gpt') ? 'gpt55' : 'opus'
  const runId = `${run.id}_${modelShort}_story-ac_${ts}`
  const runDir = path.join(abDir, 'runs', runId)
  fs.mkdirSync(runDir, { recursive: true })

  const worktree = createWorktree(runId)
  cleanWorktree(worktree)
  prepareVariant(worktree, run.id)

  execSync('git add -A && git commit -m "baseline" --allow-empty', { cwd: worktree, stdio: 'pipe' })

  console.log(`\n[${run.name}] Starting...`)
  console.log(`  Worktree: ${worktree}`)
  console.log(`  Model: ${run.model}`)

  const start = Date.now()
  const result = spawnSync('opencode', [
    'run',
    '--dir', worktree,
    '--model', run.model,
    '--dangerously-skip-permissions',
    '--format', 'json',
    '--print-logs',
    '--log-level', 'DEBUG',
    challenge.prompt,
  ], {
    encoding: 'utf8',
    timeout: 300000,
    maxBuffer: 50 * 1024 * 1024,
  })
  const elapsed = Math.round((Date.now() - start) / 1000)

  const stdout = result.stdout || ''
  const stderr = result.stderr || ''

  fs.writeFileSync(path.join(runDir, 'stdout.json'), stdout)
  fs.writeFileSync(path.join(runDir, 'stderr.log'), stderr)

  // Capture diff
  try {
    execSync('git add -A', { cwd: worktree, stdio: 'pipe' })
    const diff = execSync('git diff --cached', { cwd: worktree, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
    fs.writeFileSync(path.join(runDir, 'changes.diff'), diff)
    const stat = execSync('git diff --cached --stat', { cwd: worktree, encoding: 'utf8' })
    fs.writeFileSync(path.join(runDir, 'changes_stat.txt'), stat)
  } catch {}

  // Parse events
  const events = []
  for (const line of stdout.split('\n').filter(Boolean)) {
    try { events.push(JSON.parse(line)) } catch {}
  }

  const toolUseEvents = events.filter(e => e.type === 'tool_use')
  const skillCalls = toolUseEvents.filter(e => e.part?.tool === 'skill')
  const stepFinishes = events.filter(e => e.type === 'step_finish')

  let totalTokens = 0, totalCost = 0
  for (const sf of stepFinishes) {
    if (sf.part?.tokens) totalTokens += sf.part.tokens.total || 0
    if (sf.part?.cost) totalCost += sf.part.cost
  }

  const toolCounts = {}
  for (const e of toolUseEvents) {
    const tool = e.part?.tool || 'unknown'
    toolCounts[tool] = (toolCounts[tool] || 0) + 1
  }

  // Save metadata
  const metadata = {
    run_id: runId,
    tool: 'opencode',
    variant: run.id,
    variant_name: run.name,
    challenge: 'story-ac',
    model: run.model,
    elapsed_seconds: elapsed,
    exit_code: result.status,
    total_tokens: totalTokens,
    cost_usd: totalCost,
    tool_calls: toolUseEvents.length,
    tool_counts: toolCounts,
    skill_invocations: skillCalls.map(s => s.part?.state?.input?.skill || 'unknown'),
    steps: stepFinishes.length,
    completed_at: new Date().toISOString(),
  }
  fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify(metadata, null, 2))

  // Cleanup
  try { execSync(`git worktree remove "${worktree}" --force`, { cwd: repoRoot, stdio: 'pipe' }) } catch {}

  console.log(`[${run.name}] Done in ${elapsed}s`)
  console.log(`  Tokens: ${totalTokens}, Cost: $${totalCost.toFixed(2)}, Tools: ${toolUseEvents.length}, Skills: ${skillCalls.length}`)
  const sorted = Object.entries(toolCounts).sort((a, b) => b[1] - a[1])
  if (sorted.length) console.log(`  Breakdown: ${sorted.map(([t, c]) => `${t}:${c}`).join(' ')}`)

  return metadata
}

console.log('=== OpenCode Remaining Runs (sequential) ===')
console.log(`Runs: ${runs.map(r => r.name).join(', ')}`)
console.log(`Timestamp: ${ts}`)

const results = []
for (const run of runs) {
  results.push(runOne(run))
}

console.log('\n\n=== SUMMARY ===\n')
console.log('Name                     | Time | Tokens | Cost   | Tools | Skills')
console.log('-------------------------|------|--------|--------|-------|-------')
for (const r of results) {
  const skills = r.skill_invocations.length > 0 ? r.skill_invocations.join(',') : 'none'
  console.log(
    `${r.variant_name.padEnd(25)}| ${String(r.elapsed_seconds).padStart(3)}s | ${String(r.total_tokens).padStart(6)} | $${r.cost_usd.toFixed(2).padStart(5)} | ${String(r.tool_calls).padStart(5)} | ${skills}`
  )
}
