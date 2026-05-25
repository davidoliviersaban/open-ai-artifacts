const fs = require('node:fs')
const path = require('node:path')

const TOOL_KEY = 'opencode'

function check(root, config) {
  const issues = []
  for (const artifact of getOpencodeArtifacts(config)) {
    const targetPath = artifact.target ? path.join(root, artifact.target) : path.join(root, artifact.targetDir)
    if (!fs.existsSync(targetPath)) {
      issues.push({ artifact: artifact.id, path: artifact.target || artifact.targetDir, issue: 'missing' })
    }
  }
  return { ok: issues.length === 0, issues }
}

function install(root, config) {
  const issues = check(root, config)
  if (issues.ok) return []
  return issues.issues
}

function getOpencodeArtifacts(config) {
  return (config.artifacts || []).filter((a) => {
    const target = a.target || a.targetDir || ''
    return target.startsWith('.opencode/')
  })
}

module.exports = { TOOL_KEY, check, install, getOpencodeArtifacts }
