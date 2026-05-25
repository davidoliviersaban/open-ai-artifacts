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

  for (const line of lines) {
    let entry
    try { entry = JSON.parse(line) } catch { continue }

    // Tool use detection
    if (entry.type === 'tool_use' || entry.tool_name) {
      const tool = entry.tool_name || entry.name || 'unknown'
      toolCalls.push(tool)

      if (tool === 'Read' && entry.input?.file_path) {
        filesRead.add(entry.input.file_path)
      }
      if ((tool === 'Edit' || tool === 'Write') && entry.input?.file_path) {
        filesWritten.add(entry.input.file_path)
      }
      if (tool === 'Bash' && entry.input?.command) {
        bashCommands.push(entry.input.command)
      }
      if (tool === 'Skill') {
        skillInvocations.push(entry.input?.skill || 'unknown')
      }
    }

    // Error detection
    if (entry.is_error || entry.type === 'error') {
      errors.push(entry.message || entry.error || JSON.stringify(entry).slice(0, 200))
    }
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
    if (analysis.tools.skill_invocations.length > 0) {
      console.log(`  Skills invoked: ${analysis.tools.skill_invocations.join(', ')}`)
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
