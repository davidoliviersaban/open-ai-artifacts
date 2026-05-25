#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const WORKTREE_PREFIX = 'ai-artifacts--'

function findRepoRoot() {
  let current = __dirname
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, '.git'))) return current
    current = path.dirname(current)
  }
  throw new Error('Could not find repository root (no .git directory found)')
}

function mainRepoRoot(repoRoot) {
  const gitPath = path.join(repoRoot, '.git')
  if (fs.existsSync(gitPath) && fs.statSync(gitPath).isFile()) {
    const content = fs.readFileSync(gitPath, 'utf8').trim()
    if (content.startsWith('gitdir:')) {
      let gitdir = content.split(':', 2)[1].trim()
      if (!path.isAbsolute(gitdir)) gitdir = path.resolve(path.dirname(gitPath), gitdir)
      return path.dirname(path.dirname(path.dirname(gitdir)))
    }
  }
  return repoRoot
}

function registryPath(mainRoot) {
  return path.join(mainRoot, '.git', 'worktree-registry.json')
}

function loadRegistry(mainRoot) {
  const filePath = registryPath(mainRoot)
  if (fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      return { worktrees: {} }
    }
  }
  return { worktrees: {} }
}

function saveRegistry(mainRoot, registry) {
  fs.writeFileSync(registryPath(mainRoot), `${JSON.stringify(registry, null, 2)}\n`)
}

function branchToDirname(branch) {
  return `${WORKTREE_PREFIX}${branch.replaceAll('/', '-')}`
}

function log(message) {
  console.log(`\x1b[0;36m[worktree]\x1b[0m ${message}`)
}

function warn(message) {
  console.warn(`\x1b[1;33m[worktree]\x1b[0m ${message}`)
}

function err(message) {
  console.error(`\x1b[0;31m[worktree]\x1b[0m ${message}`)
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { stdio: options.stdio || 'inherit', encoding: 'utf8', ...options })
}

function cleanupFailedCreate(mainRoot, worktreePath, branch, registry) {
  warn('Cleaning up after failed worktree creation...')
  if (registry.worktrees?.[branch]) {
    delete registry.worktrees[branch]
    saveRegistry(mainRoot, registry)
  }
  if (fs.existsSync(worktreePath)) {
    run('git', ['worktree', 'remove', '--force', worktreePath], { cwd: mainRoot, stdio: 'pipe' })
  }
  run('git', ['worktree', 'prune'], { cwd: mainRoot, stdio: 'pipe' })
}

function installDeps(worktreePath) {
  log('Installing dependencies...')
  if (!fs.existsSync(path.join(worktreePath, 'node_modules'))) {
    const result = run('npm', ['install'], { cwd: worktreePath })
    if (result.status !== 0) throw new Error('Dependency installation failed')
  }
  log('Dependencies installed.')
}

function linkAuditFile(mainRoot, worktreePath) {
  const auditSource = path.join(mainRoot, '.ai-artifacts', 'audit.jsonl')
  const auditTarget = path.join(worktreePath, '.ai-artifacts', 'audit.jsonl')
  fs.mkdirSync(path.dirname(auditTarget), { recursive: true })
  const existing = fs.lstatSync(auditTarget, { throwIfNoEntry: false })
  if (existing) {
    if (existing.isSymbolicLink()) return
    fs.unlinkSync(auditTarget)
  }
  if (!fs.existsSync(auditSource)) {
    fs.writeFileSync(auditSource, '')
  }
  fs.symlinkSync(auditSource, auditTarget)
  log('Audit file symlinked to main repo.')
}

function cmdCreate(args) {
  const branch = args[0]
  if (!branch) usage(1)
  const fromIndex = args.indexOf('--from')
  if (fromIndex !== -1 && (!args[fromIndex + 1] || args[fromIndex + 1].startsWith('--'))) {
    err('Missing value for --from.')
    usage(1)
  }
  const fromRef = fromIndex !== -1 ? args[fromIndex + 1] : 'origin/main'
  const skipInstall = args.includes('--skip-install')
  const repoRoot = findRepoRoot()
  const mainRoot = mainRepoRoot(repoRoot)
  const registry = loadRegistry(mainRoot)

  if (registry.worktrees?.[branch]) {
    err(`Worktree for branch '${branch}' already exists.`)
    err(`  Path: ${registry.worktrees[branch].path}`)
    err(`  Remove it first: worktree.js remove ${branch}`)
    process.exit(1)
  }

  const dirname = branchToDirname(branch)
  const worktreePath = path.join(path.dirname(mainRoot), dirname)
  if (fs.existsSync(worktreePath)) {
    err(`Directory already exists: ${worktreePath}`)
    err('Remove it manually or choose a different branch name.')
    process.exit(1)
  }

  log('Fetching latest from origin...')
  run('git', ['fetch', 'origin'], { cwd: mainRoot, stdio: 'pipe' })
  const remoteExists = run('git', ['rev-parse', '--verify', `origin/${branch}`], { cwd: mainRoot, stdio: 'pipe' }).status === 0
  const localExists = run('git', ['rev-parse', '--verify', branch], { cwd: mainRoot, stdio: 'pipe' }).status === 0

  let result
  if (remoteExists || localExists) {
    if (localExists) {
      log(`Branch '${branch}' exists locally. Checking out into worktree...`)
      result = run('git', ['worktree', 'add', worktreePath, branch], { cwd: mainRoot })
    } else {
      log(`Branch '${branch}' exists on remote only. Creating tracking worktree...`)
      result = run('git', ['worktree', 'add', '--track', '-b', branch, worktreePath, `origin/${branch}`], { cwd: mainRoot })
    }
  } else {
    log(`Creating new branch '${branch}' from '${fromRef}'...`)
    result = run('git', ['worktree', 'add', '-b', branch, worktreePath, fromRef], { cwd: mainRoot })
  }
  if (result.status !== 0) {
    err('Failed to create worktree.')
    process.exit(1)
  }

  registry.worktrees ||= {}
  registry.worktrees[branch] = { path: worktreePath, dirname }
  saveRegistry(mainRoot, registry)

  linkAuditFile(mainRoot, worktreePath)

  if (!skipInstall) {
    try {
      installDeps(worktreePath)
    } catch (error) {
      err(error.message)
      cleanupFailedCreate(mainRoot, worktreePath, branch, registry)
      process.exit(1)
    }
  }

  log('=======================================================')
  log('  Worktree created successfully')
  log('=======================================================')
  console.log()
  log(`  Branch:    ${branch}`)
  log(`  Directory: ${worktreePath}`)
  console.log()
  log('  Run tests:')
  log(`    cd ${worktreePath} && npm run test:ai-artifacts`)
  console.log()
  console.log(`WORKTREE_PATH=${worktreePath}`)
}

function cmdList() {
  const mainRoot = mainRepoRoot(findRepoRoot())
  const registry = loadRegistry(mainRoot)
  const worktrees = registry.worktrees || {}
  if (Object.keys(worktrees).length === 0) {
    log('No worktrees registered.')
    log('Create one with: worktree.js create feat/<name>')
    return
  }
  console.log()
  log(`${'Branch'.padEnd(40)}   Path`)
  log('-'.repeat(80))
  for (const [branch, entry] of Object.entries(worktrees).sort(([a], [b]) => a.localeCompare(b))) {
    const status = fs.existsSync(entry.path) ? '' : ' [MISSING]'
    log(`  ${branch.padEnd(38)}   ${entry.path}${status}`)
  }
  console.log()
  log(`Total: ${Object.keys(worktrees).length} worktree(s)`)
  console.log()
}

function cmdInfo(args) {
  const branch = args[0]
  if (!branch) usage(1)
  const registry = loadRegistry(mainRepoRoot(findRepoRoot()))
  const entry = registry.worktrees?.[branch]
  if (!entry) {
    err(`No worktree registered for branch '${branch}'.`)
    err("Run 'worktree.js list' to see available worktrees.")
    process.exit(1)
  }
  console.log()
  log(`  Branch:    ${branch}`)
  log(`  Directory: ${entry.path}`)
  log(`  Exists:    ${fs.existsSync(entry.path) ? 'yes' : 'NO - directory missing!'}`)
  console.log()
  console.log(`WORKTREE_PATH=${entry.path}`)
}

function cmdRemove(args) {
  const branch = args[0]
  if (!branch) usage(1)
  const mainRoot = mainRepoRoot(findRepoRoot())
  const registry = loadRegistry(mainRoot)
  const worktrees = registry.worktrees || {}
  const entry = worktrees[branch]
  if (!entry) {
    err(`No worktree registered for branch '${branch}'.`)
    const wtPath = path.join(path.dirname(mainRoot), branchToDirname(branch))
    if (fs.existsSync(wtPath)) {
      warn(`Found unregistered worktree at ${wtPath}. Attempting removal...`)
      run('git', ['worktree', 'remove', '--force', wtPath], { cwd: mainRoot })
      return
    }
    process.exit(1)
  }
  log(`Removing worktree for '${branch}'...`)
  if (fs.existsSync(entry.path)) {
    const result = run('git', ['worktree', 'remove', '--force', entry.path], { cwd: mainRoot })
    if (result.status !== 0) {
      warn('git worktree remove failed. Trying manual cleanup...')
      fs.rmSync(entry.path, { recursive: true, force: true })
      run('git', ['worktree', 'prune'], { cwd: mainRoot, stdio: 'pipe' })
    }
  } else {
    log('Directory already removed. Cleaning up registry only.')
    run('git', ['worktree', 'prune'], { cwd: mainRoot, stdio: 'pipe' })
  }
  delete worktrees[branch]
  registry.worktrees = worktrees
  saveRegistry(mainRoot, registry)
  log(`Worktree for '${branch}' removed.`)
}

function usage(exitCode = 0) {
  console.log('Usage: worktree.js <create|list|info|remove> [branch] [--from <ref>] [--skip-install]')
  process.exit(exitCode)
}

const [command, ...restArgs] = process.argv.slice(2)
if (command === 'create') cmdCreate(restArgs)
else if (command === 'list') cmdList()
else if (command === 'info') cmdInfo(restArgs)
else if (command === 'remove') cmdRemove(restArgs)
else usage(command ? 1 : 0)
