const fs = require('node:fs')
const path = require('node:path')

const INVOCATION_TOOL = 'claude-code'
const SCRIPT_DIRS = ['.github/skills/', 'packages/ai-artifacts/']

function main() {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))
  processInput(input)
  process.stdout.write(JSON.stringify({ continue: true }))
}

function processInput(input) {
  const command = (input.tool_input && input.tool_input.command) || ''
  if (!command.trim()) return
  const script = extractScript(command)
  if (script) writeScriptAuditEntry(input, script, command)
  else writeCommandAuditEntry(input, command)
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

function writeScriptAuditEntry(input, script, command) {
  const cwd = input.cwd || process.cwd()
  const invocation = detectInvocationContext(input)
  const entry = {
    timestamp: new Date().toISOString(),
    script: path.basename(script),
    script_path: script,
    command: command.slice(0, 200),
    tool: 'Bash',
    ...invocation,
    session_id: input.session_id || null,
    user: process.env.USER || process.env.USERNAME || null,
    repo: path.basename(cwd),
  }
  const auditDir = path.join(cwd, '.ai-artifacts')
  fs.mkdirSync(auditDir, { recursive: true })
  const line = `${JSON.stringify(entry)}\n`
  fs.appendFileSync(path.join(auditDir, 'tools.audit.jsonl'), line)
  fs.appendFileSync(path.join(auditDir, 'audit.local.jsonl'), line)
}

function writeCommandAuditEntry(input, command) {
  const cwd = input.cwd || process.cwd()
  const invocation = detectInvocationContext(input)
  const entry = {
    timestamp: new Date().toISOString(),
    command: command.slice(0, 200),
    tool: 'Bash',
    ...invocation,
    session_id: input.session_id || null,
    user: process.env.USER || process.env.USERNAME || null,
    repo: path.basename(cwd),
  }
  const auditDir = path.join(cwd, '.ai-artifacts')
  fs.mkdirSync(auditDir, { recursive: true })
  const line = `${JSON.stringify(entry)}\n`
  fs.appendFileSync(path.join(auditDir, 'tools.audit.jsonl'), line)
  fs.appendFileSync(path.join(auditDir, 'audit.local.jsonl'), line)
}

function detectInvocationContext(input) {
  const explicitOrigin = findFirstString(input, ['invocation_origin', 'origin', 'source', 'initiator', 'requested_by'])
  const agentName = findAgentName(input)
  if (agentName) return { invocation_origin: 'agent', invocation_tool: INVOCATION_TOOL, invocation_agent: agentName }
  if (isAgentOrigin(explicitOrigin)) return { invocation_origin: 'agent', invocation_tool: INVOCATION_TOOL, invocation_agent: null }
  if (isUserOrigin(explicitOrigin)) return { invocation_origin: 'user', invocation_tool: INVOCATION_TOOL, invocation_agent: null }
  return { invocation_origin: 'user', invocation_tool: INVOCATION_TOOL, invocation_agent: null }
}

function findAgentName(input) {
  const candidates = [
    input.agent_name,
    input.agentName,
    input.subagent_name,
    input.subagentName,
    input.agent,
    input.subagent,
    input.actor && input.actor.agent,
    input.session && input.session.agent,
    input.message && input.message.agent,
    input.context && input.context.agent,
    input.tool_input && input.tool_input.agent,
  ]
  for (const candidate of candidates) {
    const name = normalizeAgentName(candidate)
    if (name) return name
  }
  return null
}

function normalizeAgentName(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (!value || typeof value !== 'object') return null
  for (const key of ['name', 'display_name', 'displayName', 'id', 'type']) {
    if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim()
  }
  return null
}

function findFirstString(input, keys) {
  for (const key of keys) {
    if (typeof input[key] === 'string' && input[key].trim()) return input[key].trim()
  }
  return null
}

function isAgentOrigin(value) {
  return /^(agent|assistant|model|subagent)$/i.test(value || '')
}

function isUserOrigin(value) {
  return /^(user|human|manual|direct|direct_user)$/i.test(value || '')
}

if (require.main === module) main()

module.exports = { detectInvocationContext, extractScript, processInput, writeScriptAuditEntry, writeCommandAuditEntry }
