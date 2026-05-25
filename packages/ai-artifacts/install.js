#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const PACKAGE_ROOT = __dirname
const DEFAULT_ROOT = path.resolve(PACKAGE_ROOT, '..', '..')

function installAIArtifacts(root = DEFAULT_ROOT, options = {}) {
  const packageRoot = options.packageRoot || PACKAGE_ROOT
  const files = [
    {
      label: 'AI artifacts workflow',
      source: path.join(packageRoot, 'workflows/ai-artifacts.yml'),
      target: path.join(root, '.github/workflows/ai-artifacts.yml'),
    },
    {
      label: 'AI artifacts schema',
      source: path.join(packageRoot, 'schemas/artifacts.schema.json'),
      target: path.join(root, '.ai-artifacts/schemas/artifacts.schema.json'),
    },
  ]
  const results = files.map((file) => installFile(file, options))
  const installed = results.some((result) => result.installed)
  const checked = results.every((result) => result.checked)

  return { installed, checked, files: results }
}

function installFile(file, options) {
  const { label, source, target } = file

  if (!fs.existsSync(source)) throw new Error(`${label} source not found: ${source}`)

  const sourceContent = fs.readFileSync(source, 'utf8')
  const targetExists = fs.existsSync(target)
  const targetContent = targetExists ? fs.readFileSync(target, 'utf8') : null

  if (options.check) {
    if (targetContent !== sourceContent) throw new Error(`installed ${label} is stale`)
    return { installed: false, checked: true, source, target, label }
  }

  fs.mkdirSync(path.dirname(target), { recursive: true })
  if (targetContent !== sourceContent) {
    fs.writeFileSync(target, sourceContent, 'utf8')
    return { installed: true, checked: false, source, target, label }
  }

  return { installed: false, checked: false, source, target, label }
}

if (require.main === module) {
  try {
    const result = installAIArtifacts(DEFAULT_ROOT, { check: process.argv.includes('--check') })
    for (const file of result.files) {
      const relativeTarget = path.relative(DEFAULT_ROOT, file.target)
      if (result.checked) console.log(`${file.label} is installed: ${relativeTarget}`)
      else if (file.installed) console.log(`Installed ${file.label}: ${relativeTarget}`)
      else console.log(`${file.label} already installed: ${relativeTarget}`)
    }
  } catch (error) {
    console.error(`ai-artifacts install failed: ${error.message}`)
    process.exitCode = 1
  }
}

module.exports = { installAIArtifacts }
