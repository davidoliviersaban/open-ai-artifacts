#!/usr/bin/env node

if (!process.env.SKILL_INVOCATION) {
  console.warn('\x1b[1;33m[pr-review]\x1b[0m WARNING: This script should be invoked via /pr-review, not called directly.')
  console.warn('\x1b[1;33m[pr-review]\x1b[0m Direct calls bypass the skill pipeline and audit trail.')
}

const { execSync } = require('child_process')

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch (e) {
    console.error(`Command failed: ${cmd}`)
    console.error(e.stderr || e.message)
    process.exit(1)
  }
}

function getPrNumber(arg) {
  if (arg && /^\d+$/.test(arg)) return arg
  const json = run("gh pr view --json number 2>/dev/null || echo '{}'")
  const parsed = JSON.parse(json)
  if (parsed.number) return String(parsed.number)
  console.error('Could not determine PR number. Pass it as argument: node fetch-comments.js 123')
  process.exit(1)
}

function getRepoSlug() {
  const remote = run('git remote get-url origin')
  const match = remote.match(/(?:github\.com[:/])([^/]+\/[^/.]+)/)
  if (!match) {
    console.error('Could not parse GitHub repo from remote URL:', remote)
    process.exit(1)
  }
  return match[1].replace(/\.git$/, '')
}

const prNumber = getPrNumber(process.argv[2])
const repo = getRepoSlug()

const inlineRaw = run(`gh api repos/${repo}/pulls/${prNumber}/comments --paginate`)
const inlineComments = JSON.parse(inlineRaw).map((c) => ({
  id: c.id,
  type: 'inline',
  path: c.path,
  line: c.line || c.original_line,
  body: c.body,
  user: c.user.login,
  created_at: c.created_at,
  in_reply_to_id: c.in_reply_to_id || null,
}))

const topLevelRaw = run(`gh api repos/${repo}/issues/${prNumber}/comments --paginate`)
const topLevelComments = JSON.parse(topLevelRaw).map((c) => ({
  id: c.id,
  type: 'top-level',
  path: null,
  line: null,
  body: c.body,
  user: c.user.login,
  created_at: c.created_at,
  in_reply_to_id: null,
}))

const prMeta = JSON.parse(run(`gh pr view ${prNumber} --json number,title,body,headRefName,baseRefName,author`))

const allComments = [...inlineComments, ...topLevelComments]
const repliedToIds = new Set(inlineComments.filter((c) => c.in_reply_to_id).map((c) => c.in_reply_to_id))

const pendingComments = allComments.filter((c) => !repliedToIds.has(c.id) && !c.in_reply_to_id)

const output = {
  pr: prMeta,
  total_comments: allComments.length,
  pending_comments: pendingComments.length,
  comments: pendingComments,
}

console.log(JSON.stringify(output, null, 2))
