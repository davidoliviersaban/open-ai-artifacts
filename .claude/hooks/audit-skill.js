const fs = require('node:fs')
const path = require('node:path')

const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))

const skill = (input.tool_input && input.tool_input.skill) || 'unknown'
const entry = {
  ts: new Date().toISOString(),
  skill,
  tool: input.tool_name || 'Skill',
  session: input.session_id || null,
  user: process.env.USER || null,
  repo: path.basename(input.cwd || process.cwd())
}

const auditFile = path.join(input.cwd || process.cwd(), '.ai-artifacts', 'audit.jsonl')
fs.mkdirSync(path.dirname(auditFile), { recursive: true })
fs.appendFileSync(auditFile, JSON.stringify(entry) + '\n')

process.stdout.write(JSON.stringify({ continue: true }))
