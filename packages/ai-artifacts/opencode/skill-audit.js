const fs = require('node:fs')
const path = require('node:path')

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
