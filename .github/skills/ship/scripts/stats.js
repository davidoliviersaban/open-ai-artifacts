#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const args = process.argv.slice(2)
const format = readArg('--format') || 'markdown'
const root = readArg('--root') || process.cwd()
const session = readArg('--session')
const branch = readArg('--branch') || gitOutput(['branch', '--show-current'])
const since = readArg('--since')

const entries = readAuditEntries(root).filter((entry) => matchesScope(entry))
const skillCounts = countBy(entries.filter((entry) => isSkillEntry(entry)), (entry) => `/${entry.skill}`)
const scriptCounts = countBy(entries.filter((entry) => isScriptEntry(entry)), (entry) => scriptName(entry))
const commandCounts = countBy(entries.filter((entry) => commandName(entry)), (entry) => commandName(entry))

if (format === 'json') {
  process.stdout.write(`${JSON.stringify({ branch, session: session || null, skills: toObject(skillCounts), scripts: toObject(scriptCounts), commands: toObject(commandCounts), totals: totals() }, null, 2)}\n`)
} else if (format === 'commit') {
  process.stdout.write(`Skills: ${commitList(skillCounts)}\n`)
  process.stdout.write(`Tools: ${commitList(scriptCounts)}\n`)
  process.stdout.write(`Commands: ${totalCount(commandCounts)} total, ${commandCounts.size} unique\n`)
} else {
  process.stdout.write(summaryTable())
  process.stdout.write('\n')
  process.stdout.write(markdownTable('Skill usage', 'Skill', skillCounts))
  process.stdout.write('\n')
  process.stdout.write(markdownTable('Script usage', 'Script', scriptCounts))
  process.stdout.write('\n')
  process.stdout.write(markdownTable('Command usage', 'Command', commandCounts))
}

function readArg(name) {
  const index = args.indexOf(name)
  if (index === -1) return null
  const value = args[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}

function gitOutput(gitArgs) {
  const result = spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  return result.status === 0 ? result.stdout.trim() : null
}

function readAuditEntries(repoRoot) {
  const files = [path.join(repoRoot, '.ai-artifacts/audit.local.jsonl'), path.join(repoRoot, '.ai-artifacts/audit.jsonl'), path.join(repoRoot, '.ai-artifacts/tools.audit.jsonl')]
  const seen = new Set()
  const result = []
  for (const file of files) {
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue
      if (seen.has(line)) continue
      seen.add(line)
      try {
        result.push(JSON.parse(line))
      } catch {
        // Ignore malformed local audit lines; shipping should not fail on old logs.
      }
    }
  }
  return result
}

function matchesScope(entry) {
  if (session && entry.session_id !== session) return false
  if (branch && entry.branch && entry.branch !== branch) return false
  if (since && entry.timestamp && entry.timestamp < since) return false
  return true
}

function isSkillEntry(entry) {
  if (!entry.skill) return false
  return !isScriptEntry(entry)
}

function isScriptEntry(entry) {
  return Boolean(entry.script || entry.script_path || (typeof entry.tool === 'string' && entry.tool.startsWith('script:')))
}

function scriptName(entry) {
  if (entry.script) return entry.script
  if (entry.script_path) return path.basename(entry.script_path)
  return entry.tool.replace(/^script:/, '')
}

function commandName(entry) {
  if (typeof entry.command === 'string' && entry.command.trim()) return entry.command.trim()
  return null
}

function countBy(items, keyFn) {
  const counts = new Map()
  for (const item of items) {
    const key = keyFn(item)
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return new Map([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function markdownTable(title, label, counts) {
  const separator = `| ${'-'.repeat(label.length)} | ----- |`
  const lines = [`### ${title}`, `| ${label} | Count |`, separator]
  if (counts.size === 0) lines.push(`| none | 0 |`)
  for (const [name, count] of counts) lines.push(`| ${name} | ${count} |`)
  return `${lines.join('\n')}\n`
}

function summaryTable() {
  const values = totals()
  return [
    '### Summary',
    '| Metric | Count |',
    '| ------ | ----- |',
    `| Skill calls | ${values.skills} |`,
    `| Script calls | ${values.scripts} |`,
    `| Command calls | ${values.commands} |`,
    `| Unique commands | ${values.uniqueCommands} |`,
  ].join('\n') + '\n'
}

function totals() {
  return {
    skills: totalCount(skillCounts),
    scripts: totalCount(scriptCounts),
    commands: totalCount(commandCounts),
    uniqueCommands: commandCounts.size,
  }
}

function totalCount(counts) {
  return [...counts.values()].reduce((sum, count) => sum + count, 0)
}

function commitList(counts) {
  if (counts.size === 0) return 'none'
  return [...counts.entries()].map(([name, count]) => `${name} x${count}`).join(', ')
}

function toObject(counts) {
  return Object.fromEntries(counts)
}
