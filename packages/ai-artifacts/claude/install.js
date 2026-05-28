const fs = require('node:fs')
const path = require('node:path')

const TOOL_KEY = 'claudecode'

function check(root, config) {
  const issues = []
  for (const artifact of getClaudeArtifacts(config)) {
    for (const step of artifact.steps) {
      if (step.link) {
        checkLinkStep(root, artifact, step.link, issues)
      } else if (step.copy) {
        checkCopyStep(root, config, artifact, step.copy, issues)
      }
    }
  }
  return { ok: issues.length === 0, issues }
}

function checkLinkStep(root, artifact, link, issues) {
  const linkPath = path.join(root, link.to)
  const targetFullPath = path.join(root, link.target)
  const expectedTarget = path.relative(path.dirname(linkPath), targetFullPath)
  if (!fs.existsSync(targetFullPath)) {
    issues.push({ artifact: artifact.id, path: link.target, issue: 'symlink target does not exist' })
    return
  }
  const stat = fs.lstatSync(linkPath, { throwIfNoEntry: false })
  if (!stat) {
    issues.push({ artifact: artifact.id, path: link.to, issue: 'missing' })
  } else if (!stat.isSymbolicLink()) {
    issues.push({ artifact: artifact.id, path: link.to, issue: 'exists but is not a symlink' })
  } else {
    const actual = fs.readlinkSync(linkPath)
    if (path.normalize(actual) !== path.normalize(expectedTarget)) {
      issues.push({ artifact: artifact.id, path: link.to, issue: `points to ${actual}, expected ${expectedTarget}` })
    }
  }
}

function checkCopyStep(root, config, artifact, copy, issues) {
  const targetBase = artifact.targetDir || path.dirname(artifact.target)
  const targetPath = path.join(root, targetBase, copy.to)
  const sourcePath = resolveCopySource(root, config, copy.from)

  if (!fs.existsSync(targetPath)) {
    issues.push({ artifact: artifact.id, path: path.join(targetBase, copy.to), issue: 'missing' })
    return
  }
  if (!fs.existsSync(sourcePath)) {
    issues.push({ artifact: artifact.id, path: copy.from, issue: 'source not found' })
    return
  }
  const sourceContent = fs.readFileSync(sourcePath, 'utf8')
  const targetContent = fs.readFileSync(targetPath, 'utf8')
  if (sourceContent !== targetContent) {
    issues.push({ artifact: artifact.id, path: path.join(targetBase, copy.to), issue: 'content mismatch' })
  }
}

function install(root, config) {
  const installed = []
  for (const artifact of getClaudeArtifacts(config)) {
    for (const step of artifact.steps) {
      if (step.link) {
        installLinkStep(root, artifact, step.link, installed)
      } else if (step.copy) {
        installCopyStep(root, config, artifact, step.copy, installed)
      }
    }
  }
  return installed
}

function installLinkStep(root, artifact, link, installed) {
  const linkPath = path.join(root, link.to)
  const targetPath = path.join(root, link.target)
  const relativeTarget = path.relative(path.dirname(linkPath), targetPath)

  const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false })
  if (existing && existing.isSymbolicLink() && path.normalize(fs.readlinkSync(linkPath)) === path.normalize(relativeTarget)) return
  if (existing) fs.unlinkSync(linkPath)

  fs.mkdirSync(path.dirname(linkPath), { recursive: true })
  fs.symlinkSync(relativeTarget, linkPath)
  installed.push({ artifact: artifact.id, path: link.to, target: link.target })
}

function installCopyStep(root, config, artifact, copy, installed) {
  const targetBase = artifact.targetDir || path.dirname(artifact.target)
  const targetPath = path.join(root, targetBase, copy.to)
  const sourcePath = resolveCopySource(root, config, copy.from)

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`artifact ${artifact.id}: copy source not found: ${copy.from}`)
  }

  const sourceContent = fs.readFileSync(sourcePath, 'utf8')
  if (fs.existsSync(targetPath) && fs.readFileSync(targetPath, 'utf8') === sourceContent) return

  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, sourceContent)
  installed.push({ artifact: artifact.id, path: path.join(targetBase, copy.to), source: copy.from })
}

function resolveCopySource(root, config, reference) {
  const colonIndex = reference.indexOf(':')
  if (colonIndex === -1) return path.join(root, reference)
  const prefix = reference.slice(0, colonIndex)
  const refPath = reference.slice(colonIndex + 1)
  if (prefix === 'root') return path.join(root, refPath)
  const vendorDir = config.vendorDir || '.ai-artifacts/vendor'
  return path.join(root, vendorDir, prefix, refPath)
}

function getClaudeArtifacts(config) {
  return (config.artifacts || []).filter((a) => a.id.startsWith('claude-'))
}

module.exports = { TOOL_KEY, check, install, getClaudeArtifacts }
