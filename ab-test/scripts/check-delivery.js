#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const CONVENTIONAL_RE = /^(feat|fix|refactor|chore|docs|test)\(.+\): .+/

function checkDelivery(runDir) {
  const deliveryFile = path.join(runDir, 'delivery.json')
  if (!fs.existsSync(deliveryFile)) {
    return { error: 'No delivery.json found' }
  }

  const delivery = JSON.parse(fs.readFileSync(deliveryFile, 'utf8'))
  const results = {}

  // Check: committed on a feature branch
  results.committed_on_branch = !!(
    delivery.current_branch &&
    delivery.current_branch !== 'main' &&
    delivery.current_branch !== '' &&
    delivery.commits.length > 0
  )

  // Check: conventional commit message
  const firstCommit = delivery.commits[0]
  results.commit_message_conventional = !!(firstCommit && CONVENTIONAL_RE.test(firstCommit.subject))

  // Check: commit message is not trivial (subject + body > 40 chars)
  results.commit_message_not_trivial = !!(firstCommit && (firstCommit.subject + ' ' + firstCommit.body).length > 40)

  // Check: no untracked source files
  results.no_untracked_source_files = delivery.untracked_source.length === 0

  // Check: agent made at least one commit
  results.has_commits = delivery.commits.length > 0

  return results
}

if (require.main === module) {
  const runDir = process.argv[2]
  if (!runDir) {
    console.error('Usage: check-delivery.js <run_dir>')
    process.exit(1)
  }

  const results = checkDelivery(path.resolve(runDir))
  if (results.error) {
    console.error(results.error)
    process.exit(1)
  }

  let allPass = true
  for (const [check, pass] of Object.entries(results)) {
    console.log(`${pass ? '✓' : '✗'} ${check}`)
    if (!pass) allPass = false
  }
  process.exit(allPass ? 0 : 1)
}

module.exports = { checkDelivery, CONVENTIONAL_RE }
