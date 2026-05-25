#!/usr/bin/env node

if (!process.env.SKILL_INVOCATION) {
  console.warn('\x1b[1;33m[skill-audit]\x1b[0m WARNING: This script should be invoked via /skill-audit, not called directly.')
  console.warn('\x1b[1;33m[skill-audit]\x1b[0m Direct calls bypass the skill pipeline and audit trail.')
}

const fs = require('fs')
const path = require('path')

const HIGH_RISK_KEYWORDS = [
  'deploy', 'push', 'commit', 'merge', 'release', 'publish',
  'send message', 'send email', 'delete', 'drop database',
  'force-push', 'rm -rf', 'kubectl apply', 'helm install', 'terraform apply',
]

const BACKGROUND_KNOWLEDGE_SIGNALS = [
  'reference only', 'guidelines', 'standards', 'conventions',
  'do not run', 'informational', 'coding style', 'brand guide',
]

const DETERMINISTIC_PATTERNS = [
  {
    pattern: /```(?:bash|sh)\n((?:(?!```).)*(?:curl|wget|gh api|gh pr)\s[^\n]+)/gs,
    label: 'Fixed API/HTTP call',
    reason: 'Static API calls with known endpoints can be wrapped in a script',
  },
  {
    pattern: /```(?:bash|sh)\n((?:(?!```).)*(?:sed|awk|grep|find|jq)\s[^\n]+)/gs,
    label: 'Text transformation',
    reason: 'Regex/jq transformations are deterministic and belong in scripts',
  },
  {
    pattern: /```(?:bash|sh)\n((?:(?!```).)*(?:cp|mv|mkdir|rm|chmod)\s[^\n]+)/gs,
    label: 'File system operation',
    reason: 'Repetitive file operations should be scripted for reliability',
  },
  {
    pattern: /(?:parse|extract|convert|transform|format)\s+(?:the|this|each)\s+\w+/gi,
    label: 'Data transformation step',
    reason: 'Parsing/extraction with a fixed format is deterministic — use a script',
  },
  {
    pattern: /(?:run|execute)\s+(?:the\s+)?(?:following|this)\s+(?:command|script|query)/gi,
    label: 'Explicit command execution',
    reason: 'If the command is always the same, store it as a script',
  },
]

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return { raw: '', fields: {} }
  const raw = match[1]
  const fields = {}
  for (const line of raw.split('\n')) {
    const kv = line.match(/^(\S+):\s*(.*)$/)
    if (kv) fields[kv[1]] = kv[2].trim()
  }
  return { raw, fields }
}

function getBody(content) {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/)
  return match ? match[1] : content
}

function extractCodeBlocks(body) {
  const blocks = []
  const regex = /```(\w*)\n([\s\S]*?)```/g
  let m
  while ((m = regex.exec(body)) !== null) {
    blocks.push({ lang: m[1], code: m[2].trim() })
  }
  return blocks
}

function auditVisibility(skillName, frontmatter, body) {
  const findings = []
  const combined = `${frontmatter.fields.description || ''} ${body}`.toLowerCase()

  const risksFound = HIGH_RISK_KEYWORDS.filter((kw) => combined.includes(kw))
  if (risksFound.length > 0) {
    const hasDisable = frontmatter.raw.includes('disable-model-invocation')
    if (!hasDisable) {
      findings.push({
        rule: 'VISIBILITY-001',
        severity: 'high',
        message: `High-risk skill (contains: ${risksFound.join(', ')}) — missing \`disable-model-invocation: true\``,
        fix: 'Add `disable-model-invocation: true` to YAML frontmatter',
      })
    }
  }

  const bgSignals = BACKGROUND_KNOWLEDGE_SIGNALS.filter((s) => combined.includes(s))
  if (bgSignals.length >= 2) {
    const hasUserInvocable = frontmatter.raw.includes('user-invocable')
    if (!hasUserInvocable) {
      findings.push({
        rule: 'VISIBILITY-002',
        severity: 'medium',
        message: `Background-knowledge skill (signals: ${bgSignals.join(', ')}) — consider adding \`user-invocable: false\``,
        fix: 'Add `user-invocable: false` to YAML frontmatter',
      })
    }
  }

  return findings
}

function auditDeterminism(skillName, body) {
  const findings = []
  const codeBlocks = extractCodeBlocks(body)

  for (const block of codeBlocks) {
    if (block.lang === 'bash' || block.lang === 'sh' || block.lang === '') {
      const lines = block.code.split('\n').filter((l) => l.trim())
      if (lines.length >= 3) {
        findings.push({
          rule: 'DETERMINISM-001',
          severity: 'medium',
          message: `Multi-line bash block (${lines.length} lines) could be a script`,
          snippet: block.code.substring(0, 120) + (block.code.length > 120 ? '...' : ''),
          fix: `Extract to \`scripts/${skillName}-<action>.js\``,
        })
      }
    }
  }

  for (const { pattern, label, reason } of DETERMINISTIC_PATTERNS) {
    pattern.lastIndex = 0
    const matches = body.match(pattern)
    if (matches && matches.length > 0) {
      findings.push({
        rule: 'DETERMINISM-002',
        severity: 'low',
        message: `${label} detected in prose — ${reason}`,
        snippet: matches[0].substring(0, 100),
        fix: 'Consider extracting this logic into a script in `scripts/`',
      })
    }
  }

  return findings
}

function auditComposability(skills) {
  const findings = []
  const codeIndex = new Map()
  const commandIndex = new Map()

  for (const [name, data] of Object.entries(skills)) {
    const blocks = extractCodeBlocks(data.body)
    for (const block of blocks) {
      const normalized = block.code.replace(/\s+/g, ' ').trim()
      if (normalized.length < 20) continue

      for (const [existing, owners] of codeIndex.entries()) {
        if (owners.includes(name)) continue
        const prefix = commonPrefix(normalized, existing)
        if (prefix.length >= 50) {
          findings.push({
            rule: 'COMPOSABILITY-001',
            severity: 'medium',
            message: `Duplicated code between "${name}" and "${owners[0]}"`,
            snippet: prefix.substring(0, 80) + '...',
            fix: 'Extract shared logic into a common script',
          })
        }
      }

      if (!codeIndex.has(normalized)) {
        codeIndex.set(normalized, [name])
      } else {
        codeIndex.get(normalized).push(name)
      }
    }

    const commands = data.body.match(/(?:npx|npm|node|git|docker|gh)\s+\S+(?:\s+\S+){0,3}/g)
    if (commands) {
      for (const cmd of commands) {
        const key = cmd.trim()
        if (!commandIndex.has(key)) {
          commandIndex.set(key, [name])
        } else if (!commandIndex.get(key).includes(name)) {
          commandIndex.get(key).push(name)
        }
      }
    }
  }

  for (const [cmd, owners] of commandIndex.entries()) {
    if (owners.length >= 3) {
      findings.push({
        rule: 'COMPOSABILITY-002',
        severity: 'low',
        message: `Command \`${cmd}\` appears in ${owners.length} skills: ${owners.join(', ')}`,
        fix: 'Consider a shared utility script if the invocation pattern is identical',
      })
    }
  }

  return findings
}

function commonPrefix(a, b) {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return a.substring(0, i)
}

function loadSkills(dir) {
  const skills = {}
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillMd = path.join(dir, entry.name, 'SKILL.md')
    if (!fs.existsSync(skillMd)) continue
    const content = fs.readFileSync(skillMd, 'utf-8')
    const frontmatter = parseFrontmatter(content)
    const body = getBody(content)
    skills[entry.name] = { content, frontmatter, body, path: skillMd }
  }
  return skills
}

function runSkillsAudit(skillsDir) {
  const skills = loadSkills(skillsDir)
  const report = {}

  for (const [name, data] of Object.entries(skills)) {
    const findings = [
      ...auditVisibility(name, data.frontmatter, data.body),
      ...auditDeterminism(name, data.body),
    ]
    if (findings.length > 0) {
      report[name] = findings
    }
  }

  const composabilityFindings = auditComposability(skills)
  if (composabilityFindings.length > 0) {
    report['_cross-skill'] = composabilityFindings
  }

  return { skills: Object.keys(skills), report }
}

// --- CLI ---

const args = process.argv.slice(2)
const jsonMode = args.includes('--json')
const skillsDir = args.find((a) => !a.startsWith('--'))

if (!skillsDir) {
  console.error('Usage: node audit.js <skills-directory> [--json]')
  process.exit(1)
}

if (!fs.existsSync(skillsDir)) {
  console.error(`Directory not found: ${skillsDir}`)
  process.exit(1)
}

const result = runSkillsAudit(skillsDir)

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log('\n=== Skill Audit Report ===')
  console.log(`Skills scanned: ${result.skills.join(', ')}\n`)

  if (Object.keys(result.report).length === 0) {
    console.log('No findings. All skills pass audit checks.')
  } else {
    for (const [skill, findings] of Object.entries(result.report)) {
      console.log(`\n--- ${skill} ---`)
      for (const f of findings) {
        const icon = f.severity === 'high' ? '!!!' : f.severity === 'medium' ? ' ! ' : ' . '
        console.log(`  [${icon}] ${f.rule}: ${f.message}`)
        if (f.snippet) console.log(`        snippet: ${f.snippet}`)
        console.log(`        fix: ${f.fix}`)
      }
    }
  }
  console.log('')
}
