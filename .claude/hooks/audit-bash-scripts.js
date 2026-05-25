const fs = require('node:fs')
const path = require('node:path')

const SCRIPT_DIRS = ['.github/skills/', 'packages/ai-artifacts/']

function main() {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))
  const command = (input.tool_input && input.tool_input.command) || ''
  const script = extractScript(command)
  if (script) writeAuditEntry(input, script, command)
  process.stdout.write(JSON.stringify({ continue: true }))
}

function extractScript(command) {
  const match = command.match(/node\s+([^\s;|&]+\.js)/)
  if (!match) return null
  const scriptPath = match[1]
  for (const dir of SCRIPT_DIRS) {
    if (scriptPath.includes(dir)) return scriptPath
  }
  return null
}

function writeAuditEntry(input, script, command) {
  const cwd = input.cwd || process.cwd()
  const entry = {
    timestamp: new Date().toISOString(),
    script: path.basename(script),
    script_path: script,
    command: command.slice(0, 200),
    tool: 'Bash',
    session_id: input.session_id || null,
    user: process.env.USER || process.env.USERNAME || null,
    repo: path.basename(cwd),
  }
  const auditFile = path.join(cwd, '.ai-artifacts', 'tools.audit.jsonl')
  fs.mkdirSync(path.dirname(auditFile), { recursive: true })
  fs.appendFileSync(auditFile, `${JSON.stringify(entry)}\n`)
}

if (require.main === module) main()

module.exports = { extractScript, writeAuditEntry }
