const { createHash } = require('node:crypto')

function parseArtifactConfig(content) {
  return parseYamlSubset(content)
}

function validateArtifactConfig(config) {
  assertKnownFields('config', config, ['version', 'vendorDir', 'reportsDir', 'riskPolicy', 'overlaysDir', 'packages', 'artifacts'])
  if (config.version !== 1) throw new Error('config.version must be 1')
  if (!config.packages || typeof config.packages !== 'object') throw new Error('config.packages is required')
  if (!Array.isArray(config.artifacts)) throw new Error('config.artifacts must be an array')
  if (config.vendorDir) validateSafeRelativePath(config.vendorDir, 'config: unsafe vendorDir')
  if (config.reportsDir) validateSafeRelativePath(config.reportsDir, 'config: unsafe reportsDir')
  if (config.overlaysDir) validateSafeRelativePath(config.overlaysDir, 'config: unsafe overlaysDir')
  if (config.riskPolicy) validateRiskPolicy(config.riskPolicy)

  for (const [name, pkg] of Object.entries(config.packages)) {
    assertKnownFields(`package ${name}`, pkg, ['type', 'repo', 'version'])
    if (pkg.type !== 'git') throw new Error(`package ${name}: only type "git" is supported`)
    if (!pkg.repo) throw new Error(`package ${name}: repo is required`)
    if (!pkg.version) throw new Error(`package ${name}: version is required`)
  }

  const ids = new Set()
  for (const artifact of config.artifacts) {
    assertKnownFields(`artifact ${artifact.id || '<unknown>'}`, artifact, ['id', 'kind', 'target', 'targetDir', 'steps', 'driftPolicy'])
    if (!artifact.id) throw new Error('artifact id is required')
    if (!artifact.kind) throw new Error(`artifact ${artifact.id}: kind is required`)
    if (!artifact.target && !artifact.targetDir) throw new Error(`artifact ${artifact.id}: target or targetDir is required`)
    if (artifact.target && artifact.targetDir) throw new Error(`artifact ${artifact.id}: use target or targetDir, not both`)
    if (!Array.isArray(artifact.steps) || artifact.steps.length === 0) throw new Error(`artifact ${artifact.id}: steps must be a non-empty array`)
    if (ids.has(artifact.id)) throw new Error(`duplicate artifact id: ${artifact.id}`)
    ids.add(artifact.id)
    if (artifact.target) validateSafeRelativePath(artifact.target, `artifact ${artifact.id}: unsafe target`)
    if (artifact.targetDir) validateSafeRelativePath(artifact.targetDir, `artifact ${artifact.id}: unsafe targetDir`)
    for (const step of artifact.steps) validateStep(config, artifact, step)
  }
}

function validateStep(config, artifact, step) {
  const stepTypes = ['render', 'copy', 'link'].filter((type) => step[type])
  if (stepTypes.length !== 1) throw new Error(`artifact ${artifact.id}: each step must have exactly one type`)
  const type = stepTypes[0]
  const value = step[type]
  if (type === 'render') {
    assertKnownFields(`artifact ${artifact.id}.render`, value, ['from', 'to', 'overlays', 'substitutions'])
    validateReference(config, artifact, value.from)
    if (value.to) validateSafeRelativePath(value.to, `artifact ${artifact.id}: unsafe render.to`)
    for (const overlay of value.overlays || []) validateSafeRelativePath(overlay, `artifact ${artifact.id}: unsafe overlay path`)
    for (const substitution of value.substitutions || []) {
      assertKnownFields(`artifact ${artifact.id}.render.substitution`, substitution, ['from', 'to'])
      if (typeof substitution.from !== 'string' || typeof substitution.to !== 'string') {
        throw new Error(`artifact ${artifact.id}: render substitutions require string from/to values`)
      }
    }
  }
  if (type === 'copy') {
    assertKnownFields(`artifact ${artifact.id}.copy`, value, ['from', 'to'])
    validateReference(config, artifact, value.from)
    if (!value.to) throw new Error(`artifact ${artifact.id}: copy.to is required`)
    validateSafeRelativePath(value.to, `artifact ${artifact.id}: unsafe copy.to`)
  }
  if (type === 'link') {
    assertKnownFields(`artifact ${artifact.id}.link`, value, ['target', 'to'])
    if (!value.target) throw new Error(`artifact ${artifact.id}: link.target is required`)
    if (!value.to) throw new Error(`artifact ${artifact.id}: link.to is required`)
    validateSafeRelativePath(value.target, `artifact ${artifact.id}: unsafe link.target`)
    validateSafeRelativePath(value.to, `artifact ${artifact.id}: unsafe link.to`)
  }
}

function validateReference(config, artifact, reference) {
  if (typeof reference !== 'string' || !reference.includes(':')) throw new Error(`artifact ${artifact.id}: invalid reference ${reference}`)
  const [name, refPath] = splitReference(reference)
  if (name !== 'root' && !config.packages[name]) throw new Error(`artifact ${artifact.id}: unknown package ${name}`)
  validateSafeRelativePath(refPath, `artifact ${artifact.id}: unsafe reference path`)
}

function splitReference(reference) {
  const index = reference.indexOf(':')
  return [reference.slice(0, index), reference.slice(index + 1)]
}

function parseYamlSubset(content) {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .map((line) => ({ indent: line.match(/^ */)[0].length, text: line.trim() }))
  let index = 0

  function parseBlock(indent) {
    if (index >= lines.length || lines[index].indent < indent) return null
    return lines[index].text.startsWith('- ') ? parseArray(indent) : parseObject(indent)
  }

  function parseArray(indent) {
    const result = []
    while (index < lines.length && lines[index].indent === indent && lines[index].text.startsWith('- ')) {
      const after = lines[index].text.slice(2)
      index += 1
      let item
      if (!after) {
        item = parseBlock(indent + 2)
      } else {
        const pair = parsePair(after)
        if (pair) {
          item = {}
          item[pair.key] = pair.value === undefined ? parseBlock(lines[index]?.indent ?? indent + 2) : pair.value
          if (index < lines.length && lines[index].indent > indent && lines[index].indent <= indent + 2 && !lines[index].text.startsWith('- ')) {
            Object.assign(item, parseObject(indent + 2))
          }
        } else {
          item = parseScalar(after)
        }
      }
      result.push(item)
    }
    return result
  }

  function parseObject(indent) {
    const result = {}
    while (index < lines.length && lines[index].indent === indent && !lines[index].text.startsWith('- ')) {
      const pair = parsePair(lines[index].text)
      if (!pair) throw new Error(`unsupported YAML line: ${lines[index].text}`)
      index += 1
      result[pair.key] = pair.value === undefined ? parseBlock(indent + 2) : pair.value
    }
    return result
  }

  return parseBlock(0) || {}
}

function parsePair(text) {
  const match = text.match(/^([^:]+):(.*)$/)
  if (!match) return null
  const key = match[1].trim()
  const rawValue = match[2].trim()
  return { key, value: rawValue ? parseScalar(rawValue) : undefined }
}

function parseScalar(value) {
  if (value.startsWith('[') || value.startsWith('{')) throw new Error(`unsupported YAML flow syntax: ${value}`)
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d+$/.test(value)) return Number(value)
  if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1).replace(/\\n/g, '\n')
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  return value
}

function validateIncludePattern(artifact, include) {
  if (typeof include !== 'string') throw new Error(`artifact ${artifact.id}: include entries must be strings`)
  validateSafeRelativePath(include, `artifact ${artifact.id}: unsafe include path`)
}

function validateRiskPolicy(riskPolicy) {
  assertKnownFields('manifest.riskPolicy', riskPolicy, ['failOn'])
  if (riskPolicy.failOn && !Array.isArray(riskPolicy.failOn)) throw new Error('manifest.riskPolicy.failOn must be an array')
  for (const level of riskPolicy.failOn || []) {
    if (!['Low', 'Medium', 'High'].includes(level)) throw new Error(`manifest.riskPolicy.failOn has unsupported level: ${level}`)
  }
}

function assertKnownFields(name, value, allowedFields) {
  const allowed = new Set(allowedFields)
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) throw new Error(`${name}: unknown ${name === 'manifest' ? 'manifest ' : ''}field: ${field}`)
  }
}

function validateSafeRelativePath(value, message) {
  if (typeof value !== 'string') throw new Error(`${message}: must be a string`)
  if (value.startsWith('/') || value.includes('..') || value.includes('\\')) {
    throw new Error(`${message}: ${value}`)
  }
}

function validateCompose(artifact) {
  if (!artifact.compose) return
  assertKnownFields(`artifact ${artifact.id}.compose`, artifact.compose, ['strategy', 'substitutions'])
  const strategy = artifact.compose.strategy || 'append'
  if (strategy !== 'append') throw new Error(`artifact ${artifact.id}: unsupported compose strategy: ${strategy}`)
  if (artifact.compose.substitutions && !Array.isArray(artifact.compose.substitutions)) {
    throw new Error(`artifact ${artifact.id}: compose.substitutions must be an array`)
  }
  for (const substitution of artifact.compose.substitutions || []) {
    assertKnownFields(`artifact ${artifact.id}.compose.substitution`, substitution, ['from', 'to'])
    if (typeof substitution.from !== 'string' || typeof substitution.to !== 'string') {
      throw new Error(`artifact ${artifact.id}: compose substitutions require string from/to values`)
    }
  }
}

function applySubstitutions(content, substitutions) {
  let next = content
  for (const substitution of substitutions) {
    if (typeof substitution.from !== 'string' || typeof substitution.to !== 'string') {
      throw new Error('substitutions require string from/to values')
    }
    next = next.split(substitution.from).join(substitution.to)
  }
  return next
}

function composeContent(sourceContent, overlays) {
  if (overlays.length === 0) return sourceContent
  const overlayText = overlays.map((overlay) => overlay.content.trim()).join('\n\n')
  return `${sourceContent.trimEnd()}\n\n---\n\n${overlayText}\n`
}

function sha256(content) {
  const normalized = Buffer.isBuffer(content) ? content : normalizeNewline(content)
  return `sha256:${createHash('sha256').update(normalized).digest('hex')}`
}

function normalizeNewline(content) {
  return content.replace(/\r\n/g, '\n')
}

function serializeYaml(data, indent = 0) {
  const spaces = ' '.repeat(indent)
  if (data === null || data === undefined) return 'null'
  if (typeof data === 'string') return data.includes('\n') ? `|\n${data.split('\n').map((line) => `  ${spaces}${line}`).join('\n')}` : data
  if (typeof data === 'number' || typeof data === 'boolean') return String(data)
  if (Array.isArray(data)) {
    if (data.length === 0) return '[]'
    return data.map((item) => `${spaces}- ${serializeYaml(item, indent + 2).trimStart()}`).join('\n')
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data)
    if (entries.length === 0) return ''
    return entries.map(([key, value]) => {
      const serializedValue = serializeYaml(value, indent + 2)
      if (!serializedValue) return `${spaces}${key}:`
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        return `${spaces}${key}:\n${serializedValue}`
      }
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        return `${spaces}${key}:\n${serializedValue}`
      }
      return `${spaces}${key}: ${serializedValue.trimStart()}`
    }).join('\n')
  }
  return String(data)
}

const AI_ARTIFACT_PATTERNS = [
  /^\.ai-artifacts\/artifacts\.yml$/,
  /^\.ai-artifacts\/files\//,
  /^\.github\/overlays\//,
  /^\.github\/skills\//,
  /^\.github\/agent\//,
  /^packages\/ai-artifacts\//,
]

function matchesAIArtifactPath(filePath) {
  return AI_ARTIFACT_PATTERNS.some((pattern) => pattern.test(filePath))
}

module.exports = {
  AI_ARTIFACT_PATTERNS,
  applySubstitutions,
  composeContent,
  matchesAIArtifactPath,
  normalizeNewline,
  parseArtifactConfig,
  serializeYaml,
  sha256,
  splitReference,
  validateArtifactConfig,
}
