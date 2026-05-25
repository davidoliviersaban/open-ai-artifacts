const fs = require('node:fs')
const path = require('node:path')

const INVOCATION_TOOL = 'opencode'

module.exports = async function skillAuditPlugin(input) {
  const root = input.project?.root || input.directory || process.cwd()

  return {
    'tool.execute.after': async (event) => {
      try {
        const match = detectSkillUsage(event, root)
        if (!match) return
        const entry = {
          timestamp: new Date().toISOString(),
          skill: match.skill,
          tool: event.tool || event.name || event.tool_name || null,
          ...detectInvocationContext(event),
          session_id: event.sessionID || event.session_id || event.session?.id || null,
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

function detectSkillUsage(event, root) {
  const args = event.args || event.input || event.tool_input || {}
  const explicitSkill = args.skill || args.name
  if (typeof explicitSkill === 'string' && explicitSkill) return { skill: explicitSkill }

  const candidate = args.filePath || args.path || args.filename
  if (typeof candidate !== 'string') return null

  const absolutePath = path.isAbsolute(candidate) ? candidate : path.join(root, candidate)
  const normalized = normalizePath(realpathOrOriginal(absolutePath))
  const normalizedRoot = normalizePath(root)
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

module.exports.detectSkillUsage = detectSkillUsage
module.exports.detectInvocationContext = detectInvocationContext
