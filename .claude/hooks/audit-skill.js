const fs = require('node:fs')
const path = require('node:path')

function main() {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))
  writeAuditEntry(input)
  process.stdout.write(JSON.stringify({ continue: true }))
}

function writeAuditEntry(input) {
  const cwd = input.cwd || process.cwd()
  const skill = (input.tool_input && input.tool_input.skill) || 'unknown'
  const entry = {
    timestamp: new Date().toISOString(),
    skill,
    tool: input.tool_name || 'Skill',
    session_id: input.session_id || null,
    user: process.env.USER || process.env.USERNAME || null,
    repo: path.basename(cwd),
  }
  const auditDir = path.join(cwd, '.ai-artifacts')
  fs.mkdirSync(auditDir, { recursive: true })
  const line = `${JSON.stringify(entry)}\n`
  fs.appendFileSync(path.join(auditDir, 'audit.jsonl'), line)
  fs.appendFileSync(path.join(auditDir, 'audit.local.jsonl'), line)
}

if (require.main === module) main()

module.exports = { writeAuditEntry }
