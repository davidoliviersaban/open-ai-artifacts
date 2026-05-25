const fs = require('node:fs')
const path = require('node:path')

const INVOCATION_TOOL = 'opencode'
const REGISTRATION_KEY = Symbol.for('ai-artifacts.opencode.skill-audit.registeredRoots')
const SCRIPT_DIRS = ['.github/skills/', 'packages/ai-artifacts/']

async function SkillAuditPlugin(input, options = {}) {
  const root = input.project?.root || input.directory || process.cwd()
  const registeredRoots = getRegisteredRoots()
  if (registeredRoots.has(root)) {
    writeDebug(root, options, { event: 'plugin.skipped', reason: 'already_registered' })
    return {}
  }

  registeredRoots.add(root)
  writeDebug(root, options, { event: 'plugin.initialized' })

  return {
    'tool.execute.after': async (event, output) => {
      try {
        const payload = mergeEventPayload(event, output)
        writeDebug(root, options, {
          event: 'tool.execute.after',
          tool: payload.tool || payload.name || payload.tool_name || null,
          arg_keys: Object.keys(payload.args || {}).sort(),
        })
        const command = detectCommandUsage(payload)
        const script = detectScriptUsage(payload)
        if (script) writeScriptAuditEntry(root, payload, script)
        else if (command) writeCommandAuditEntry(root, payload, command)
        const match = detectSkillUsage(payload, root)
        if (!match) return
        const entry = {
          timestamp: new Date().toISOString(),
          skill: match.skill,
          tool: payload.tool || payload.name || payload.tool_name || null,
          ...detectInvocationContext(payload),
          session_id: payload.sessionID || payload.session_id || payload.session?.id || null,
          user: process.env.USER || process.env.USERNAME || null,
          repo: path.basename(root),
        }
        const auditFile = path.join(root, '.ai-artifacts', 'audit.jsonl')
        fs.mkdirSync(path.dirname(auditFile), { recursive: true })
        fs.appendFileSync(auditFile, `${JSON.stringify(entry)}\n`)
      } catch {
        // Audit logging must never block tool execution.
      }
    },
  }
}

function detectScriptUsage(event) {
  const command = detectCommandUsage(event)
  if (!command) return null
  const match = command.match(/node\s+([^\s;|&]+\.js)/)
  if (!match) return null
  const scriptPath = match[1]
  for (const dir of SCRIPT_DIRS) {
    if (scriptPath.includes(dir)) return scriptPath
  }
  return null
}

function detectCommandUsage(event) {
  const args = event.args || event.input || event.tool_input || {}
  const command = args.command || args.cmd || args.script || event.command || ''
  return typeof command === 'string' && command.trim() ? command.trim() : null
}

function writeScriptAuditEntry(root, event, script) {
  const command = detectCommandUsage(event) || ''
  const entry = {
    timestamp: new Date().toISOString(),
    script: path.basename(script),
    script_path: script,
    command: command.slice(0, 200),
    tool: event.tool || event.name || event.tool_name || null,
    ...detectInvocationContext(event),
    session_id: event.sessionID || event.session_id || event.session?.id || null,
    user: process.env.USER || process.env.USERNAME || null,
    repo: path.basename(root),
  }
  const auditDir = path.join(root, '.ai-artifacts')
  fs.mkdirSync(auditDir, { recursive: true })
  const line = `${JSON.stringify(entry)}\n`
  fs.appendFileSync(path.join(auditDir, 'tools.audit.jsonl'), line)
  fs.appendFileSync(path.join(auditDir, 'audit.local.jsonl'), line)
}

function writeCommandAuditEntry(root, event, command) {
  const entry = {
    timestamp: new Date().toISOString(),
    command: command.slice(0, 200),
    tool: event.tool || event.name || event.tool_name || null,
    ...detectInvocationContext(event),
    session_id: event.sessionID || event.session_id || event.session?.id || null,
    user: process.env.USER || process.env.USERNAME || null,
    repo: path.basename(root),
  }
  const auditDir = path.join(root, '.ai-artifacts')
  fs.mkdirSync(auditDir, { recursive: true })
  const line = `${JSON.stringify(entry)}\n`
  fs.appendFileSync(path.join(auditDir, 'tools.audit.jsonl'), line)
  fs.appendFileSync(path.join(auditDir, 'audit.local.jsonl'), line)
}

function getRegisteredRoots() {
  if (!globalThis[REGISTRATION_KEY]) globalThis[REGISTRATION_KEY] = new Set()
  return globalThis[REGISTRATION_KEY]
}

function writeDebug(root, options, entry) {
  if (process.env.AI_ARTIFACTS_OPENCODE_AUDIT_DEBUG !== '1' && options?.debug !== true) return
  try {
    const debugFile = path.join(root, '.ai-artifacts', 'opencode-plugin-debug.jsonl')
    fs.mkdirSync(path.dirname(debugFile), { recursive: true })
    fs.appendFileSync(debugFile, `${JSON.stringify({ timestamp: new Date().toISOString(), ...entry })}\n`)
  } catch {
    // Debug logging must also remain best-effort.
  }
}

function mergeEventPayload(event, output) {
  const payload = { ...(event || {}) }
  const outputArgs = output && typeof output === 'object' ? output.args || output.input || output.tool_input || {} : {}
  const eventArgs = payload.args || payload.input || payload.tool_input || {}
  payload.args = { ...outputArgs, ...eventArgs }
  return payload
}

function detectSkillUsage(event, root) {
  const args = event.args || event.input || event.tool_input || {}
  const explicitSkill = args.skill || args.name
  if (typeof explicitSkill === 'string' && explicitSkill) return { skill: explicitSkill }

  const candidate = args.filePath || args.path || args.filename
  if (typeof candidate !== 'string') return null

  const absolutePath = path.isAbsolute(candidate) ? candidate : path.join(root, candidate)
  const normalized = normalizePath(realpathOrOriginal(absolutePath))
  const normalizedRoot = normalizePath(realpathOrOriginal(root))
  if (!normalized.startsWith(`${normalizedRoot}/`)) return null

  const relativePath = normalized.slice(normalizedRoot.length + 1)
  const match = relativePath.match(/^(?:\.opencode\/skills|\.github\/skills|\.claude\/commands)\/([^/]+)\/SKILL\.md$/)
  return match ? { skill: match[1] } : null
}

function detectInvocationContext(event) {
  const explicitOrigin = findFirstString(event, ['invocation_origin', 'origin', 'source', 'initiator', 'requested_by'])
  const agentName = findAgentName(event)
  if (agentName) return { invocation_origin: 'agent', invocation_tool: INVOCATION_TOOL, invocation_agent: agentName }
  if (isAgentOrigin(explicitOrigin)) return { invocation_origin: 'agent', invocation_tool: INVOCATION_TOOL, invocation_agent: null }
  if (isUserOrigin(explicitOrigin)) return { invocation_origin: 'user', invocation_tool: INVOCATION_TOOL, invocation_agent: null }
  return { invocation_origin: 'user', invocation_tool: INVOCATION_TOOL, invocation_agent: null }
}

function findAgentName(event) {
  const args = event.args || event.input || event.tool_input || {}
  const candidates = [
    event.agent_name,
    event.agentName,
    event.subagent_name,
    event.subagentName,
    event.agent,
    event.subagent,
    event.actor && event.actor.agent,
    event.session && event.session.agent,
    event.message && event.message.agent,
    event.context && event.context.agent,
    args.agent,
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

function findFirstString(event, keys) {
  for (const key of keys) {
    if (typeof event[key] === 'string' && event[key].trim()) return event[key].trim()
  }
  return null
}

function isAgentOrigin(value) {
  return /^(agent|assistant|model|subagent)$/i.test(value || '')
}

function isUserOrigin(value) {
  return /^(user|human|manual|direct|direct_user)$/i.test(value || '')
}

function normalizePath(value) {
  return value.replace(/\\/g, '/')
}

function realpathOrOriginal(value) {
  try {
    return fs.realpathSync.native(value)
  } catch {
    return value
  }
}

module.exports = SkillAuditPlugin
module.exports.SkillAuditPlugin = SkillAuditPlugin
module.exports.default = SkillAuditPlugin
module.exports.detectCommandUsage = detectCommandUsage
module.exports.detectSkillUsage = detectSkillUsage
module.exports.detectScriptUsage = detectScriptUsage
module.exports.detectInvocationContext = detectInvocationContext
module.exports.mergeEventPayload = mergeEventPayload
module.exports.writeDebug = writeDebug
module.exports.writeCommandAuditEntry = writeCommandAuditEntry
module.exports.writeScriptAuditEntry = writeScriptAuditEntry
