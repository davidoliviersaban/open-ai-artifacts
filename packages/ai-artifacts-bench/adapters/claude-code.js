'use strict'

const { spawnSync } = require('node:child_process')
const { parseUsageFromJson } = require('../lib.js')

function buildFlags(variant, options = {}) {
  const flags = [
    '-p',
    '--output-format', 'json',
    '--dangerously-skip-permissions',
    '--no-session-persistence',
    '--max-budget-usd', String(options.budget || 2.0),
  ]

  if (variant.bare) flags.push('--bare')
  if (variant.disable_skills) flags.push('--disable-slash-commands')
  if (variant.system_prompt) flags.push('--system-prompt', variant.system_prompt)

  const model = options.model || variant.model
  if (model) flags.push('--model', model)

  if (options.debugFile) flags.push('--debug-file', options.debugFile)

  if (variant.extra_flags && Array.isArray(variant.extra_flags)) {
    flags.push(...variant.extra_flags)
  }

  return flags
}

function run(worktree, prompt, options = {}) {
  const flags = buildFlags(options.variant || {}, options)
  const start = Date.now()
  const result = spawnSync('claude', [...flags, prompt], {
    cwd: worktree,
    encoding: 'utf8',
    timeout: (options.timeout || 300) * 1000,
    maxBuffer: 50 * 1024 * 1024,
  })
  const elapsed = Math.round((Date.now() - start) / 1000)

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    elapsed,
    exitCode: result.status,
  }
}

function parseUsage(raw) {
  return parseUsageFromJson(raw)
}

module.exports = { buildFlags, run, parseUsage }
