const fs = require('node:fs')
const path = require('node:path')

const TOOL_KEY = 'claudecode'

function check(root, config) {
  const issues = []
  for (const artifact of getClaudeArtifacts(config)) {
    for (const step of artifact.steps.filter((s) => s.link)) {
      const linkPath = path.join(root, step.link.to)
      const targetFullPath = path.join(root, step.link.target)
      const expectedTarget = path.relative(path.dirname(linkPath), targetFullPath)
      if (!fs.existsSync(targetFullPath)) {
        issues.push({ artifact: artifact.id, path: step.link.target, issue: 'symlink target does not exist' })
        continue
      }
      const stat = fs.lstatSync(linkPath, { throwIfNoEntry: false })
      if (!stat) {
        issues.push({ artifact: artifact.id, path: step.link.to, issue: 'missing' })
      } else if (!stat.isSymbolicLink()) {
        issues.push({ artifact: artifact.id, path: step.link.to, issue: 'exists but is not a symlink' })
      } else {
        const actual = fs.readlinkSync(linkPath)
        if (path.normalize(actual) !== path.normalize(expectedTarget)) {
          issues.push({ artifact: artifact.id, path: step.link.to, issue: `points to ${actual}, expected ${expectedTarget}` })
        }
      }
    }
  }
  return { ok: issues.length === 0, issues }
}

function install(root, config) {
  const installed = []
  for (const artifact of getClaudeArtifacts(config)) {
    for (const step of artifact.steps.filter((s) => s.link)) {
      const linkPath = path.join(root, step.link.to)
      const targetPath = path.join(root, step.link.target)
      const relativeTarget = path.relative(path.dirname(linkPath), targetPath)

      const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false })
      if (existing && existing.isSymbolicLink() && path.normalize(fs.readlinkSync(linkPath)) === path.normalize(relativeTarget)) continue
      if (existing) fs.unlinkSync(linkPath)

      fs.mkdirSync(path.dirname(linkPath), { recursive: true })
      fs.symlinkSync(relativeTarget, linkPath)
      installed.push({ artifact: artifact.id, path: step.link.to, target: step.link.target })
    }
  }
  return installed
}

function getClaudeArtifacts(config) {
  return (config.artifacts || []).filter((a) => a.id.startsWith('claude-'))
}

module.exports = { TOOL_KEY, check, install, getClaudeArtifacts }
