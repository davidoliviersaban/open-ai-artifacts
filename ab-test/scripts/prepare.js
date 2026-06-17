'use strict'

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function isPreservedAgentMarkdown(relativePath) {
  return relativePath === 'CLAUDE.md'
    || relativePath === 'AGENTS.md'
    || relativePath.startsWith('.github/skills/')
    || relativePath.startsWith('.opencode/')
}

function removeMarkdownFiles(dir, root = dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = path.relative(root, fullPath)
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      removeMarkdownFiles(fullPath, root)
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md') && !isPreservedAgentMarkdown(relativePath)) {
      fs.unlinkSync(fullPath)
    }
  }
}

function applyChallengeIsolation(worktree, challenge = {}) {
  switch (challenge.hide_documentation) {
    case 'all-markdown':
      removeMarkdownFiles(worktree)
      break
    case 'docs-only': {
      const docsDir = path.join(worktree, 'docs')
      if (fs.existsSync(docsDir)) fs.rmSync(docsDir, { recursive: true })
      break
    }
  }
}

function prepareWorktree(worktree, variant, repoRoot, challenge = {}) {
  if (repoRoot) {
    const nodeModulesSrc = path.join(repoRoot, 'node_modules')
    const nodeModulesDst = path.join(worktree, 'node_modules')
    if (fs.existsSync(nodeModulesSrc) && !fs.existsSync(nodeModulesDst)) {
      fs.symlinkSync(nodeModulesSrc, nodeModulesDst)
    }
  }

  const abTestDir = path.join(worktree, 'ab-test')
  if (fs.existsSync(abTestDir)) {
    fs.rmSync(abTestDir, { recursive: true })
  }

  const adrFile = path.join(worktree, 'docs', 'adr', '010-ab-test-framework.md')
  if (fs.existsSync(adrFile)) fs.unlinkSync(adrFile)

  const claudeDir = path.join(worktree, '.claude')
  if (fs.existsSync(claudeDir)) {
    fs.rmSync(claudeDir, { recursive: true })
  }

  try {
    execSync('git reflog expire --expire=now --all', { cwd: worktree, stdio: 'pipe' })
  } catch { /* not critical */ }

  const claudeMdPath = path.join(worktree, 'CLAUDE.md')
  if (variant.claude_md === 'none') {
    if (fs.existsSync(claudeMdPath)) fs.unlinkSync(claudeMdPath)
    const skillsDir = path.join(worktree, '.github', 'skills')
    if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true })
    const agentsDir = path.join(worktree, '.github', 'agent')
    if (fs.existsSync(agentsDir)) fs.rmSync(agentsDir, { recursive: true })
  } else if (variant.claude_md === 'custom') {
    fs.writeFileSync(claudeMdPath, variant.claude_md_content || '')
    if (variant.disable_skills !== false) {
      const skillsDir = path.join(worktree, '.github', 'skills')
      if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true })
    }
  }

  if (variant.claude_md === 'inherit' || variant.claude_md === 'inherit-trimmed') {
    if (fs.existsSync(claudeMdPath)) {
      let content = fs.readFileSync(claudeMdPath, 'utf8')
      if (!variant.keep_full_guidance) {
        content = content.replace(/### Worktree Requirement[\s\S]*?(?=###|## )/m, '')
        content = content.replace(/### Git Safety[\s\S]*?(?=###|## )/m, '')
        content = content.replace(/### Skill Invocation[\s\S]*?(?=###|## )/m, '')
        content = content.replace(/### Pipeline \(every change\)[\s\S]*?(?=## )/m, '')
      }

      if (variant.claude_md === 'inherit-trimmed') {
        content = content.replace(/## Whitepaper Editorial Rules[\s\S]*?(?=## )/m, '')
        content = content.replace(/## Core Content Decisions[\s\S]*?(?=## )/m, '')
        content = content.replace(/## Package Direction[\s\S]*?(?=## )/m, '')
      }
      content += '\n\n## Autonomous Execution\n\n'
      content += '- You are running in autonomous mode. Implement directly without asking for confirmation.\n'
      content += '- Work in the current directory on the current feature branch. Do not create additional worktrees or branches.\n'
      content += '- Before finishing, run the test suite and fix any failures.\n'
      fs.writeFileSync(claudeMdPath, content)
    }
  }

  if (variant.hooks) {
    const hooksDir = path.join(worktree, '.claude', 'hooks')
    fs.mkdirSync(hooksDir, { recursive: true })

    fs.writeFileSync(path.join(hooksDir, 'validate-on-edit.js'), `
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const STAMP_FILE = '/tmp/.claude-hook-test-stamp'
function main() {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))
  const filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.file)) || ''
  const cwd = input.cwd || process.cwd()
  if (!filePath || !/packages\\/ai-artifacts\\/.*\\.(js|ts|mjs)$/.test(filePath)) {
    process.stdout.write(JSON.stringify({ continue: true }))
    return
  }
  const now = Math.floor(Date.now() / 1000)
  if (fs.existsSync(STAMP_FILE)) {
    const last = Number(fs.readFileSync(STAMP_FILE, 'utf8').trim())
    if ((now - last) < 10) { process.stdout.write(JSON.stringify({ continue: true })); return }
  }
  fs.writeFileSync(STAMP_FILE, String(now))
  try {
    execSync('npm run test:ai-artifacts', { cwd, encoding: 'utf8', timeout: 60000, stdio: 'pipe' })
    process.stdout.write(JSON.stringify({ continue: true }))
  } catch (err) {
    const output = ((err.stdout || '') + (err.stderr || '')).slice(-2000)
    process.stdout.write(JSON.stringify({
      continue: true,
      hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'TESTS FAILED after your edit. Fix before continuing:\\n\\n' + output }
    }))
  }
}
main()
`)

    fs.writeFileSync(path.join(hooksDir, 'validate-on-stop.js'), `
const { execSync } = require('node:child_process')
const fs = require('node:fs')
function main() {
  const input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'))
  const cwd = input.cwd || process.cwd()
  let changed = ''
  try { changed = execSync('git diff --name-only HEAD', { cwd, encoding: 'utf8', stdio: 'pipe' }) } catch {}
  if (!changed.includes('packages/ai-artifacts/')) {
    process.stdout.write(JSON.stringify({ continue: true }))
    return
  }
  try {
    execSync('npm run test:ai-artifacts', { cwd, encoding: 'utf8', timeout: 60000, stdio: 'pipe' })
    process.stdout.write(JSON.stringify({ continue: true }))
  } catch (err) {
    const output = ((err.stdout || '') + (err.stderr || '')).slice(-2000)
    process.stderr.write('Tests are still failing. Fix them before finishing:\\n\\n' + output)
    process.exit(2)
  }
}
main()
`)

    const settings = {
      hooks: {
        PostToolUse: [
          { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'node .claude/hooks/validate-on-edit.js' }] },
        ],
        Stop: [
          { hooks: [{ type: 'command', command: 'node .claude/hooks/validate-on-stop.js' }] },
        ],
      },
    }
    fs.writeFileSync(path.join(worktree, '.claude', 'settings.json'), JSON.stringify(settings, null, 2))
  }

  if (variant.disabled_skills && variant.disabled_skills.length > 0) {
    for (const skill of variant.disabled_skills) {
      const skillDir = path.join(worktree, '.github', 'skills', skill)
      if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true })
    }
  }

  applyChallengeIsolation(worktree, { hide_documentation: variant.hide_documentation || challenge.hide_documentation })
}

function prepareScoringWorktree(worktree, variant) {
  const abTestDir = path.join(worktree, 'ab-test')
  if (fs.existsSync(abTestDir)) fs.rmSync(abTestDir, { recursive: true })
  const claudeDir = path.join(worktree, '.claude')
  if (fs.existsSync(claudeDir)) fs.rmSync(claudeDir, { recursive: true })
  const adrFile = path.join(worktree, 'docs', 'adr', '010-ab-test-framework.md')
  if (fs.existsSync(adrFile)) fs.unlinkSync(adrFile)

  if (variant) {
    const claudeMdPath = path.join(worktree, 'CLAUDE.md')
    if (variant.claude_md === 'none') {
      if (fs.existsSync(claudeMdPath)) fs.unlinkSync(claudeMdPath)
      const skillsDir = path.join(worktree, '.github', 'skills')
      if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true })
      const agentsDir = path.join(worktree, '.github', 'agent')
      if (fs.existsSync(agentsDir)) fs.rmSync(agentsDir, { recursive: true })
    } else if (variant.claude_md === 'custom') {
      fs.writeFileSync(claudeMdPath, variant.claude_md_content || '')
      if (variant.disable_skills !== false) {
        const skillsDir = path.join(worktree, '.github', 'skills')
        if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true })
      }
    }
  }
}

function capturePostRunState(worktree, { runDir, tag }) {
  const baseRef = tag || 'baseline'
  const state = { branches: [], commits: [], current_branch: null, untracked_source: [] }
  try {
    state.branches = execSync('git branch --format=%(refname:short)', { cwd: worktree, encoding: 'utf8', stdio: 'pipe' })
      .split('\n').filter(Boolean)
  } catch {}
  try {
    state.current_branch = execSync('git branch --show-current', { cwd: worktree, encoding: 'utf8', stdio: 'pipe' }).trim() || null
  } catch {}
  try {
    const hashes = execSync('git log --format=%H ${baseRef}..HEAD', { cwd: worktree, encoding: 'utf8', stdio: 'pipe' })
      .split('\n').filter(Boolean)
    for (const hash of hashes) {
      const subject = execSync(`git log -1 --format=%s ${hash}`, { cwd: worktree, encoding: 'utf8', stdio: 'pipe' }).trim()
      const body = execSync(`git log -1 --format=%b ${hash}`, { cwd: worktree, encoding: 'utf8', stdio: 'pipe' }).trim()
      state.commits.push({ hash, subject, body })
    }
  } catch {}
  try {
    state.untracked_source = execSync('git ls-files --others --exclude-standard -- packages/ai-artifacts/', { cwd: worktree, encoding: 'utf8', stdio: 'pipe' })
      .split('\n').filter(f => /\.(js|ts|mjs)$/.test(f))
  } catch {}

  try {
    const gitLog = execSync('git log --format="%H%n%s%n%b%n---" ${baseRef}..HEAD', { cwd: worktree, encoding: 'utf8', stdio: 'pipe' })
    fs.writeFileSync(path.join(runDir, 'git_log.txt'), gitLog)
  } catch {
    fs.writeFileSync(path.join(runDir, 'git_log.txt'), '')
  }

  fs.writeFileSync(path.join(runDir, 'delivery.json'), JSON.stringify(state, null, 2))

  const claudeMd = path.join(worktree, 'CLAUDE.md')
  if (fs.existsSync(claudeMd)) {
    fs.copyFileSync(claudeMd, path.join(runDir, 'claude_md_used.md'))
  } else {
    fs.writeFileSync(path.join(runDir, 'claude_md_used.md'), '(no CLAUDE.md)')
  }
}

module.exports = {
  applyChallengeIsolation,
  capturePostRunState,
  isPreservedAgentMarkdown,
  prepareWorktree,
  prepareScoringWorktree,
  removeMarkdownFiles,
}
