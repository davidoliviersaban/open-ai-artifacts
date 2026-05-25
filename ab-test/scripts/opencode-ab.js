#!/usr/bin/env node
'use strict'

const { execSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const model = process.argv[2] || 'amazon-bedrock/us.anthropic.claude-opus-4-6-v1'
const abDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(abDir, '..')
const challengeFile = path.join(abDir, 'challenges', 'story-ac', 'challenge.json')
const challenge = JSON.parse(fs.readFileSync(challengeFile, 'utf8'))

const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)

const variants = [
  {
    id: 'oc-full',
    name: 'OpenCode full (AGENTS.md + skills)',
    prepare: (worktree) => {
      // Keep AGENTS.md (already cleaned of blocking rules) and skills
      // Simplify opencode.json permissions to not block anything
      const ocConfig = path.join(worktree, '.opencode', 'opencode.json')
      if (fs.existsSync(ocConfig)) {
        const config = JSON.parse(fs.readFileSync(ocConfig, 'utf8'))
        config.permission = { edit: 'allow', bash: { '*': 'allow' } }
        fs.writeFileSync(ocConfig, JSON.stringify(config, null, 2))
      }
    },
  },
  {
    id: 'oc-agents-no-skills',
    name: 'OpenCode AGENTS.md only (no skill mentions)',
    prepare: (worktree) => {
      // Remove skills directory
      const skillsDir = path.join(worktree, '.opencode', 'skills')
      if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true })

      // Strip skill-related sections from AGENTS.md
      const agentsMd = path.join(worktree, 'AGENTS.md')
      if (fs.existsSync(agentsMd)) {
        let content = fs.readFileSync(agentsMd, 'utf8')
        // Remove "Skill Invocation" section
        content = content.replace(/### Skill Invocation[\s\S]*?(?=###|## )/m, '')
        // Remove pipeline table
        content = content.replace(/### Pipeline \(every change\)[\s\S]*?(?=## )/m, '')
        // Remove "Skills And Workflows" section
        content = content.replace(/## Skills And Workflows[\s\S]*?(?=## )/m, '')
        // Remove any remaining /skill-name references
        content = content.replace(/`\/[a-z-]+`/g, '(removed)')
        // Remove lines mentioning skills that are now orphaned
        content = content.replace(/- Write tests for package code changes\. Use \(removed\) for TDD\.\n/g, '- Write tests for package code changes.\n')
        fs.writeFileSync(agentsMd, content)
      }

      // Remove skills from opencode.json and simplify permissions
      const ocConfig = path.join(worktree, '.opencode', 'opencode.json')
      if (fs.existsSync(ocConfig)) {
        const config = JSON.parse(fs.readFileSync(ocConfig, 'utf8'))
        delete config.skills
        config.permission = { edit: 'allow', bash: { '*': 'allow' } }
        fs.writeFileSync(ocConfig, JSON.stringify(config, null, 2))
      }
    },
  },
  {
    id: 'oc-bare',
    name: 'OpenCode bare (no AGENTS.md, no skills)',
    prepare: (worktree) => {
      // Remove AGENTS.md
      const agentsMd = path.join(worktree, 'AGENTS.md')
      if (fs.existsSync(agentsMd)) fs.unlinkSync(agentsMd)

      // Remove .opencode entirely
      const ocDir = path.join(worktree, '.opencode')
      if (fs.existsSync(ocDir)) fs.rmSync(ocDir, { recursive: true })
    },
  },
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
  // Common cleanup: remove ab-test, .claude, ADR
  const abTestDir = path.join(worktree, 'ab-test')
  if (fs.existsSync(abTestDir)) fs.rmSync(abTestDir, { recursive: true })
  const claudeDir = path.join(worktree, '.claude')
  if (fs.existsSync(claudeDir)) fs.rmSync(claudeDir, { recursive: true })
  const adrFile = path.join(worktree, 'docs', 'adr', '010-ab-test-framework.md')
  if (fs.existsSync(adrFile)) fs.unlinkSync(adrFile)
  // Remove CLAUDE.md too (we're testing opencode, not claude)
  const claudeMd = path.join(worktree, 'CLAUDE.md')
  if (fs.existsSync(claudeMd)) fs.unlinkSync(claudeMd)

  // Strip blocking rules from AGENTS.md (worktree requirement, skill invocation mandate)
  // These rules prevent the agent from coding directly in the worktree
  const agentsMd = path.join(worktree, 'AGENTS.md')
  if (fs.existsSync(agentsMd)) {
    let content = fs.readFileSync(agentsMd, 'utf8')
    // Remove Worktree Requirement section
    content = content.replace(/### Worktree Requirement[\s\S]*?(?=###|## )/m, '')
    // Remove Git Safety (no push to main etc — irrelevant in test)
    content = content.replace(/### Git Safety[\s\S]*?(?=###|## )/m, '')
    // Remove Skill Invocation mandate
    content = content.replace(/### Skill Invocation[\s\S]*?(?=###|## )/m, '')
    // Remove pipeline table (references mandatory skills)
    content = content.replace(/### Pipeline \(every change\)[\s\S]*?(?=## )/m, '')
    fs.writeFileSync(agentsMd, content)
  }
}

function runVariant(variant) {
  return new Promise((resolve) => {
    const runId = `${variant.id}_story-ac_${ts}`
    const runDir = path.join(abDir, 'runs', runId)
    fs.mkdirSync(runDir, { recursive: true })

    const worktree = createWorktree(runId)
    cleanWorktree(worktree)
    variant.prepare(worktree)

    // Commit baseline
    execSync('git add -A && git commit -m "baseline" --allow-empty', { cwd: worktree, stdio: 'pipe' })

    console.log(`[${variant.id}] Starting — ${variant.name}`)
    console.log(`[${variant.id}] Worktree: ${worktree}`)

    const start = Date.now()
    let stdout = ''
    let stderr = ''

    const proc = spawn('opencode', [
      'run',
      '--dir', worktree,
      '--model', model,
      '--dangerously-skip-permissions',
      '--format', 'json',
      '--print-logs',
      '--log-level', 'DEBUG',
      challenge.prompt,
    ])

    // Manual timeout since spawn doesn't support it
    const timer = setTimeout(() => {
      console.log(`[${variant.id}] Timeout after 300s — killing`)
      proc.kill('SIGTERM')
    }, 300000)

    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })

    proc.on('close', (code) => {
      clearTimeout(timer)
      const elapsed = Math.round((Date.now() - start) / 1000)
      console.log(`[${variant.id}] Done in ${elapsed}s (exit ${code})`)

      // Save raw outputs
      fs.writeFileSync(path.join(runDir, 'stdout.json'), stdout)
      fs.writeFileSync(path.join(runDir, 'stderr.log'), stderr)

      // Capture diff
      let diffStat = ''
      try {
        execSync('git add -A', { cwd: worktree, stdio: 'pipe' })
        const diff = execSync('git diff --cached', { cwd: worktree, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
        fs.writeFileSync(path.join(runDir, 'changes.diff'), diff)
        diffStat = execSync('git diff --cached --stat', { cwd: worktree, encoding: 'utf8' })
        fs.writeFileSync(path.join(runDir, 'changes_stat.txt'), diffStat)
      } catch { /* no changes */ }

      // Parse JSON events
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
        variant: variant.id,
        variant_name: variant.name,
        challenge: 'story-ac',
        model,
        elapsed_seconds: elapsed,
        exit_code: code,
        total_tokens: totalTokens,
        cost_usd: totalCost,
        tool_calls: toolUseEvents.length,
        tool_counts: toolCounts,
        skill_invocations: skillCalls.map(s => s.part?.state?.input?.skill || 'unknown'),
        steps: stepFinishes.length,
        completed_at: new Date().toISOString(),
      }
      fs.writeFileSync(path.join(runDir, 'metadata.json'), JSON.stringify(metadata, null, 2))

      // Cleanup worktree
      try { execSync(`git worktree remove "${worktree}" --force`, { cwd: repoRoot, stdio: 'pipe' }) } catch {}

      resolve(metadata)
    })

    proc.on('error', (err) => {
      console.error(`[${variant.id}] Error: ${err.message}`)
      try { execSync(`git worktree remove "${worktree}" --force`, { cwd: repoRoot, stdio: 'pipe' }) } catch {}
      resolve({ variant: variant.id, error: err.message })
    })
  })
}

async function main() {
  console.log(`\n=== OpenCode A/B Test ===`)
  console.log(`Model:     ${model}`)
  console.log(`Challenge: story-ac`)
  console.log(`Variants:  ${variants.map(v => v.id).join(', ')}`)
  console.log(`Timestamp: ${ts}`)
  console.log('')

  // Run all 3 in parallel
  const results = await Promise.all(variants.map(v => runVariant(v)))

  console.log(`\n\n=== RESULTS ===\n`)
  console.log('Variant                  | Time | Tokens | Cost   | Tools | Skills | Steps')
  console.log('-------------------------|------|--------|--------|-------|--------|------')
  for (const r of results) {
    if (r.error) {
      console.log(`${(r.variant || '?').padEnd(25)}| ERROR: ${r.error}`)
      continue
    }
    const skills = r.skill_invocations.length > 0 ? r.skill_invocations.join(',') : 'none'
    console.log(
      `${r.variant.padEnd(25)}| ${String(r.elapsed_seconds).padStart(3)}s | ${String(r.total_tokens).padStart(6)} | $${r.cost_usd.toFixed(2).padStart(5)} | ${String(r.tool_calls).padStart(5)} | ${skills.padEnd(6)} | ${r.steps}`
    )
  }

  console.log('\n--- Tool breakdown ---')
  for (const r of results) {
    if (r.error) continue
    const sorted = Object.entries(r.tool_counts).sort((a, b) => b[1] - a[1])
    console.log(`  ${r.variant}: ${sorted.map(([t, c]) => `${t}:${c}`).join(' ')}`)
  }
}

main().catch(console.error)
