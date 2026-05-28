#!/usr/bin/env node
'use strict'

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const DOC_PATTERNS = [
  /^docs\/.*\.md$/,
  /^README\.md$/,
  /^packages\/[^/]+\/README\.md$/,
]

const PUBLIC_API_PATTERNS = [
  /^packages\/ai-artifacts\/lib\.js$/,
  /^packages\/ai-artifacts\/app\.js$/,
  /^packages\/ai-artifacts\/cli\.js$/,
]

const BYPASS_FILE = '.docs-not-needed'

function getChangedFiles(cwd) {
  try {
    const output = execSync('git diff --name-only HEAD', { cwd, encoding: 'utf8', stdio: 'pipe' })
    return output.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

function hasNewExport(cwd) {
  try {
    const diff = execSync('git diff HEAD -- packages/ai-artifacts/lib.js', { cwd, encoding: 'utf8', stdio: 'pipe' })
    return /^\+.*module\.exports|^\+.*exports\./m.test(diff)
  } catch {
    return false
  }
}

function isDocFile(file) {
  return DOC_PATTERNS.some(p => p.test(file))
}

function isPublicAPIFile(file) {
  return PUBLIC_API_PATTERNS.some(p => p.test(file))
}

function isTestOnly(files) {
  return files.every(f => /\.test\.(js|ts|mjs)$/.test(f) || /^test\//.test(f))
}

function checkDocTouch(cwd) {
  const changed = getChangedFiles(cwd)

  if (changed.length === 0) {
    return { pass: true, reason: 'No changes detected' }
  }

  if (fs.existsSync(path.join(cwd, BYPASS_FILE))) {
    return { pass: true, reason: 'Bypass file present (.docs-not-needed)' }
  }

  if (isTestOnly(changed)) {
    return { pass: true, reason: 'Test-only change — no documentation needed' }
  }

  const publicAPIChanged = changed.some(f => isPublicAPIFile(f))
  const exportsAdded = hasNewExport(cwd)
  const docsTouched = changed.some(f => isDocFile(f))

  if (publicAPIChanged && exportsAdded && !docsTouched) {
    return {
      pass: false,
      reason: `Public API changed with new exports but no documentation updated.\n` +
        `  Changed: ${changed.filter(isPublicAPIFile).join(', ')}\n` +
        `  Expected: update one of docs/**/*.md, README.md, or packages/*/README.md`,
    }
  }

  return { pass: true, reason: 'Documentation check passed' }
}

if (require.main === module) {
  const cwd = process.argv[2] || process.cwd()
  const result = checkDocTouch(cwd)
  if (result.pass) {
    console.log(`✓ ${result.reason}`)
  } else {
    console.error(`✗ ${result.reason}`)
    process.exit(1)
  }
}

module.exports = { checkDocTouch, isDocFile, isPublicAPIFile, isTestOnly, getChangedFiles, hasNewExport }
