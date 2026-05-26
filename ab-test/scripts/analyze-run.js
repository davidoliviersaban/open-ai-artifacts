#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

function analyzeDebugLog(debugLogPath) {
  if (!fs.existsSync(debugLogPath)) return null

  const content = fs.readFileSync(debugLogPath, 'utf8')
  const lines = content.split('\n').filter(Boolean)

  const toolCalls = []
  const skillInvocations = []
  const filesRead = new Set()
  const filesWritten = new Set()
  const bashCommands = []
  const errors = []
  let skillsLoaded = 0

  // Debug log is plain text: "2026-05-25T23:27:56.089Z [INFO] [Stall] tool_dispatch_start tool=Read toolUseId=..."
  const toolDispatchRe = /tool_dispatch_start\s+tool=(\S+)/
  const skillsLoadedRe = /Loaded (\d+) unique skills/
  const errorRe = /\[ERROR\]/

  for (const line of lines) {
    const toolMatch = line.match(toolDispatchRe)
    if (toolMatch) {
      const tool = toolMatch[1]
      toolCalls.push(tool)

      if (tool === 'Skill') {
        skillInvocations.push('unknown')
      }
    }

    const skillsMatch = line.match(skillsLoadedRe)
    if (skillsMatch) {
      skillsLoaded = Number(skillsMatch[1])
    }

    if (errorRe.test(line)) {
      errors.push(line.slice(0, 200))
    }
  }

  // Extract file/bash details from stdout.json if available (JSON output mode)
  const stdoutPath = path.join(path.dirname(debugLogPath), 'stdout.json')
  if (fs.existsSync(stdoutPath)) {
    try {
      const stdout = JSON.parse(fs.readFileSync(stdoutPath, 'utf8'))
      if (stdout.messages) {
        for (const msg of stdout.messages) {
          if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue
          for (const block of msg.content) {
            if (block.type !== 'tool_use') continue
            if (block.name === 'Read' && block.input?.file_path) {
              filesRead.add(block.input.file_path)
            }
            if ((block.name === 'Edit' || block.name === 'Write') && block.input?.file_path) {
              filesWritten.add(block.input.file_path)
            }
            if (block.name === 'Bash' && block.input?.command) {
              bashCommands.push(block.input.command)
            }
            if (block.name === 'Skill') {
              const idx = skillInvocations.indexOf('unknown')
              if (idx >= 0) skillInvocations[idx] = block.input?.skill || 'unknown'
              else skillInvocations.push(block.input?.skill || 'unknown')
            }
          }
        }
      }
    } catch { /* stdout may not be valid JSON */ }
  }

  // Count tool usage
  const toolCounts = {}
  for (const tool of toolCalls) {
    toolCounts[tool] = (toolCounts[tool] || 0) + 1
  }

  return {
    total_tool_calls: toolCalls.length,
    tool_counts: toolCounts,
    skill_invocations: skillInvocations,
    skills_loaded: skillsLoaded,
    files_read: [...filesRead],
    files_written: [...filesWritten],
    bash_commands: bashCommands,
    errors,
  }
}

function analyzeDiff(diffPath) {
  if (!fs.existsSync(diffPath)) return null
  const diff = fs.readFileSync(diffPath, 'utf8')
  if (!diff.trim()) return { files_changed: 0, insertions: 0, deletions: 0, files: [] }

  const files = []
  let insertions = 0
  let deletions = 0

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      files.push(line.slice(6))
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      insertions++
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++
    }
  }

  return { files_changed: files.length, insertions, deletions, files }
}

function analyzeRun(runDir) {
  const metadata = JSON.parse(fs.readFileSync(path.join(runDir, 'metadata.json'), 'utf8'))
  const usage = fs.existsSync(path.join(runDir, 'usage.json'))
    ? JSON.parse(fs.readFileSync(path.join(runDir, 'usage.json'), 'utf8'))
    : {}
  const score = fs.existsSync(path.join(runDir, 'score.json'))
    ? JSON.parse(fs.readFileSync(path.join(runDir, 'score.json'), 'utf8'))
    : null

  const debugAnalysis = analyzeDebugLog(path.join(runDir, 'debug.log'))
  const diffAnalysis = analyzeDiff(path.join(runDir, 'changes.diff'))

  return {
    run_id: metadata.run_id,
    variant: metadata.variant,
    challenge: metadata.challenge,
    model: usage.model || metadata.model,
    elapsed_seconds: usage.elapsed_seconds || metadata.elapsed_seconds,
    tokens: usage.total_tokens || 0,
    cost_usd: usage.cost_usd || 0,
    num_turns: usage.num_turns || 0,
    score: score?.final_score || null,
    criteria_passed: score ? `${score.criteria_passed}/${score.criteria_total}` : 'not scored',
    diff: diffAnalysis,
    tools: debugAnalysis,
  }
}

function printAnalysis(analysis) {
  console.log(`\n━━━ ${analysis.run_id} ━━━`)
  console.log(`  Variant:  ${analysis.variant}`)
  console.log(`  Challenge: ${analysis.challenge}`)
  console.log(`  Model:    ${analysis.model}`)
  console.log(`  Time:     ${analysis.elapsed_seconds}s`)
  console.log(`  Tokens:   ${analysis.tokens}`)
  console.log(`  Cost:     $${analysis.cost_usd.toFixed(2)}`)
  console.log(`  Turns:    ${analysis.num_turns}`)
  console.log(`  Score:    ${analysis.score} (${analysis.criteria_passed})`)

  if (analysis.diff) {
    console.log(`  Diff:     ${analysis.diff.files_changed} files (+${analysis.diff.insertions}/-${analysis.diff.deletions})`)
    for (const f of analysis.diff.files) {
      console.log(`            ${f}`)
    }
  }

  if (analysis.tools) {
    console.log(`  Tools:    ${analysis.tools.total_tool_calls} calls`)
    const sorted = Object.entries(analysis.tools.tool_counts).sort((a, b) => b[1] - a[1])
    for (const [tool, count] of sorted) {
      console.log(`            ${tool}: ${count}`)
    }
    console.log(`  Skills:   ${analysis.tools.skills_loaded} loaded, ${analysis.tools.skill_invocations.length} invoked`)
    if (analysis.tools.skill_invocations.length > 0) {
      console.log(`            ${analysis.tools.skill_invocations.join(', ')}`)
    }
    if (analysis.tools.errors.length > 0) {
      console.log(`  Errors:   ${analysis.tools.errors.length}`)
      for (const err of analysis.tools.errors.slice(0, 3)) {
        console.log(`            ${err.slice(0, 100)}`)
      }
    }
  } else {
    console.log('  Tools:    (no debug log available)')
  }
}

if (require.main === module) {
  const target = process.argv[2]
  const abDir = path.resolve(__dirname, '..')
  const runsDir = path.join(abDir, 'runs')

  if (target && fs.existsSync(target)) {
    // Analyze single run
    const analysis = analyzeRun(target)
    printAnalysis(analysis)
  } else {
    // Analyze all runs
    if (!fs.existsSync(runsDir)) {
      console.log('No runs found.')
      process.exit(0)
    }
    const entries = fs.readdirSync(runsDir).filter(e => {
      return fs.existsSync(path.join(runsDir, e, 'metadata.json'))
    })
    for (const entry of entries.sort()) {
      const analysis = analyzeRun(path.join(runsDir, entry))
      printAnalysis(analysis)
    }
  }
}

module.exports = { analyzeRun, analyzeDebugLog, analyzeDiff }
