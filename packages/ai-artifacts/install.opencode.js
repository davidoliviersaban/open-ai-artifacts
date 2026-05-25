const fs = require('node:fs')
const path = require('node:path')

const TOOL_KEY = 'opencode'

function check(root, config) {
  const issues = []
  for (const artifact of getOpencodeArtifacts(config)) {
    const targetPath = artifact.target ? path.join(root, artifact.target) : path.join(root, artifact.targetDir)
    const linkStep = (artifact.steps || []).find((s) => s.link)

    if (linkStep) {
      const linkPath = path.join(root, linkStep.link.to)
      const expectedTarget = path.relative(path.dirname(linkPath), path.join(root, linkStep.link.target))
      const stat = fs.lstatSync(linkPath, { throwIfNoEntry: false })
      if (!stat) {
        issues.push({ artifact: artifact.id, path: linkStep.link.to, issue: 'missing' })
      } else if (!stat.isSymbolicLink()) {
        issues.push({ artifact: artifact.id, path: linkStep.link.to, issue: 'expected symlink, found regular file/directory — remove it and run sync' })
      } else {
        const actual = fs.readlinkSync(linkPath)
        if (path.normalize(actual) !== path.normalize(expectedTarget)) {
          issues.push({ artifact: artifact.id, path: linkStep.link.to, issue: `symlink points to ${actual}, expected ${expectedTarget}` })
        }
      }
    } else {
      if (!fs.existsSync(targetPath)) {
        issues.push({ artifact: artifact.id, path: artifact.target || artifact.targetDir, issue: 'missing' })
      }
    }
  }
  return { ok: issues.length === 0, issues }
}

function install(root, config) {
  const installed = []
  for (const artifact of getOpencodeArtifacts(config)) {
    const linkStep = (artifact.steps || []).find((s) => s.link)
    if (!linkStep) continue

    const linkPath = path.join(root, linkStep.link.to)
    const targetPath = path.join(root, linkStep.link.target)
    const relativeTarget = path.relative(path.dirname(linkPath), targetPath)

    const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false })
    if (existing) {
      if (existing.isSymbolicLink() && path.normalize(fs.readlinkSync(linkPath)) === path.normalize(relativeTarget)) continue
      throw new Error(`${linkStep.link.to} already exists; remove it manually before installing opencode artifacts`)
    }

    fs.mkdirSync(path.dirname(linkPath), { recursive: true })
    fs.symlinkSync(relativeTarget, linkPath)
    installed.push({ artifact: artifact.id, path: linkStep.link.to, target: linkStep.link.target })
  }
  return installed
}

function getOpencodeArtifacts(config) {
  return (config.artifacts || []).filter((a) => {
    const target = a.target || a.targetDir || ''
    return target.startsWith('.opencode/')
  })
}

module.exports = { TOOL_KEY, check, install, getOpencodeArtifacts }
