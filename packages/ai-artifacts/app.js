const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const {
  applySubstitutions,
  composeContent,
  normalizeNewline,
  parseArtifactConfig,
  serializeYaml,
  sha256,
  splitReference,
  validateArtifactConfig,
} = require('./lib')
const { installAIArtifacts } = require('./install')

function createApp({ root = process.cwd(), log = console.log, quiet = false, packageRoot } = {}) {
  const configPath = path.join(root, '.ai-artifacts/artifacts.yml')
  const lockPath = path.join(root, '.ai-artifacts/lock.yml')

  function readManifest() {
    if (!fs.existsSync(configPath)) throw new Error(`missing artifact config at ${relative(configPath)}`)
    const config = parseArtifactConfig(fs.readFileSync(configPath, 'utf8'))
    validateArtifactConfig(config)
    return config
  }

  function fetchSources() {
    const config = readManifest()
    ensureDir(path.join(root, config.vendorDir || '.ai-artifacts/vendor'))
    const lock = readLock()

    for (const [name, pkg] of Object.entries(config.packages)) {
      const packageDir = getPackageDir(config, name)
      if (!fs.existsSync(packageDir)) {
        runGit(['clone', '--no-checkout', pkg.repo, packageDir])
      } else {
        runGit(['remote', 'set-url', 'origin', pkg.repo], packageDir)
      }
      runGit(['fetch', '--tags', '--prune', 'origin'], packageDir)

      const previous = lock.packages[name]
      const keepLockedCommit = previous?.requested === pkg.version && previous?.resolved
      const checkoutRef = keepLockedCommit ? previous.resolved : pkg.version
      runGit(['checkout', '--force', checkoutRef], packageDir)
      const resolved = gitOutput(['rev-parse', 'HEAD'], packageDir)
      const latest = resolveRemoteRef(pkg.repo, pkg.version) || resolved

      lock.packages[name] = {
        type: pkg.type,
        repo: pkg.repo,
        requested: pkg.version,
        resolved,
        latest,
      }
    }

    writeLock(lock)
    log(`Fetched ${Object.keys(config.packages).length} packages.`)
  }

  function syncArtifacts({ check = false } = {}) {
    const config = readManifest()
    ensurePackagesFetched(config)
    checkoutLockedPackages(config)
    const lock = readLock()
    const nextArtifacts = {}
    const stale = []

    for (const artifact of config.artifacts) {
      const generated = generateArtifact(config, artifact)
      if (check) {
        for (const output of generated.outputs) {
          if (!outputMatches(output)) stale.push(output.relativePath)
        }
        continue
      }

      for (const output of generated.outputs) writeOutput(output)
      nextArtifacts[artifact.id] = generated.lockEntry
    }

    if (check) {
      if (stale.length > 0) throw new Error(`generated artifacts are stale: ${stale.join(', ')}`)
            log('Generated artifacts are up to date.')
      return
    }

    lock.artifacts = nextArtifacts
    writeLock(lock)
        log(`Generated ${config.artifacts.length} artifacts.`)
  }

  function generateArtifact(config, artifact) {
    const outputs = []
    const stepLocks = []
    const targetBase = artifact.targetDir ? path.join(root, artifact.targetDir) : path.dirname(path.join(root, artifact.target))

    for (const [index, step] of artifact.steps.entries()) {
      if (step.render) {
        const rendered = generateRenderStep(config, artifact, step.render, targetBase)
        outputs.push(rendered.output)
        stepLocks.push({ index, type: 'render', ...rendered.lockEntry })
      }
      if (step.copy) {
        const copied = generateCopyStep(config, artifact, step.copy, targetBase)
        outputs.push(copied.output)
        stepLocks.push({ index, type: 'copy', ...copied.lockEntry })
      }
      if (step.link) {
        const linked = generateLinkStep(artifact, step.link)
        outputs.push(linked.output)
        stepLocks.push({ index, type: 'link', ...linked.lockEntry })
      }
    }

    return {
      outputs,
      lockEntry: {
        kind: artifact.kind,
        ...(artifact.target ? { target: artifact.target } : { targetDir: artifact.targetDir }),
        outputs: outputs.map((output) => generatedOutputEntry(output)),
        steps: stepLocks,
      },
    }
  }

  function generateRenderStep(config, artifact, step, targetBase) {
    const source = resolveInput(config, artifact, step.from)
    if (!fs.existsSync(source.path)) throw new Error(`artifact ${artifact.id}: render source not found: ${relative(source.path)}`)

    let sourceContent = fs.readFileSync(source.path, 'utf8')
    sourceContent = applySubstitutions(sourceContent, step.substitutions || [])

    const overlays = []
    for (const overlay of step.overlays || []) {
      const overlayPath = path.join(root, '.ai-artifacts/overlays', overlay)
      if (!fs.existsSync(overlayPath)) throw new Error(`artifact ${artifact.id}: overlay not found: ${overlay}`)
      overlays.push({ path: overlay, content: fs.readFileSync(overlayPath, 'utf8') })
    }

    const sourceHash = sha256(sourceContent)
    const overlayHash = sha256(overlays.map((overlay) => overlay.content).join('\n---overlay---\n'))
    const content = composeContent(sourceContent, overlays)
    const relativePath = artifact.target || path.join(artifact.targetDir, step.to || 'SKILL.md').split(path.sep).join('/')

    return {
      output: {
        type: 'file',
        path: path.join(root, relativePath),
        relativePath,
        content,
      },
      lockEntry: {
        from: step.from,
        to: step.to || path.basename(relativePath),
        sourceHash,
        overlayHash,
        generatedHash: sha256(content),
      },
    }
  }

  function generateCopyStep(config, artifact, step, targetBase) {
    const source = resolveInput(config, artifact, step.from)
    if (!fs.existsSync(source.path)) throw new Error(`artifact ${artifact.id}: copy source not found: ${relative(source.path)}`)
    const targetPath = path.join(targetBase, step.to)
    const relativePath = path.relative(root, targetPath).split(path.sep).join('/')
    const sourceHash = hashGeneratedTarget(source.path)

    return {
      output: {
        type: fs.statSync(source.path).isDirectory() ? 'directory' : 'fileCopy',
        sourcePath: source.path,
        path: targetPath,
        relativePath,
      },
      lockEntry: {
        from: step.from,
        to: step.to,
        sourceHash,
        generatedHash: sourceHash,
      },
    }
  }

  function generateLinkStep(artifact, step) {
    const linkPath = path.join(root, step.to)
    const targetPath = path.join(root, step.target)
    const relativeTarget = path.relative(path.dirname(linkPath), targetPath)
    const relativePath = step.to

    return {
      output: {
        type: 'symlink',
        path: linkPath,
        relativePath,
        symlinkTarget: relativeTarget,
        absoluteTarget: targetPath,
      },
      lockEntry: {
        target: step.target,
        to: step.to,
        generatedHash: sha256(relativeTarget),
      },
    }
  }

  function resolveInput(config, artifact, reference) {
    const [name, referencePath] = splitReference(reference)
    if (name === 'root') {
      return { path: path.join(root, referencePath), referencePath }
    }
    if (name === 'local') {
      const baseDir = config.sourceDir || '.ai-artifacts/files'
      return { path: path.join(root, baseDir, artifact.id, referencePath), referencePath }
    }

    const pkg = config.packages[name]
    const locked = readLock().packages[name]
    return {
      path: path.join(getPackageDir(config, name), referencePath),
      referencePath,
      repo: pkg.repo,
      requested: pkg.version,
      resolved: locked?.resolved || gitOutput(['rev-parse', 'HEAD'], getPackageDir(config, name)),
    }
  }

  function outputMatches(output) {
    if (output.type === 'symlink') {
      const stat = fs.lstatSync(output.path, { throwIfNoEntry: false })
      if (!stat || !stat.isSymbolicLink()) return false
      return path.normalize(fs.readlinkSync(output.path)) === path.normalize(output.symlinkTarget)
    }
    if (!fs.existsSync(output.path)) return false
    if (output.type === 'file') {
      if (!fs.statSync(output.path).isFile()) return false
      return normalizeNewline(fs.readFileSync(output.path, 'utf8')) === normalizeNewline(output.content)
    }
    if (output.type === 'directory') {
      if (!fs.statSync(output.path).isDirectory()) return false
      return directoryContentsMatch(output.sourcePath, output.path)
    }
    return hashGeneratedTarget(output.path) === hashGeneratedTarget(output.sourcePath)
  }

  function writeOutput(output) {
    if (output.type === 'file') {
      ensureDir(path.dirname(output.path))
      fs.writeFileSync(output.path, output.content)
      return
    }
    if (output.type === 'symlink') {
      ensureDir(path.dirname(output.path))
      const existing = fs.lstatSync(output.path, { throwIfNoEntry: false })
      if (existing) {
        if (existing.isSymbolicLink() && path.normalize(fs.readlinkSync(output.path)) === path.normalize(output.symlinkTarget)) return
        fs.unlinkSync(output.path)
      }
      fs.symlinkSync(output.symlinkTarget, output.path)
      return
    }
    if (output.type === 'directory') {
      copyDirectoryContents(output.sourcePath, output.path)
      return
    }
    if (fs.existsSync(output.path)) fs.rmSync(output.path, { recursive: true, force: true })
    ensureDir(path.dirname(output.path))
    fs.cpSync(output.sourcePath, output.path, { recursive: true })
  }

  function generatedOutputEntry(output) {
    return {
      path: output.relativePath,
      type: output.type,
      regenerate: 'npm run ai-artifacts:sync',
    }
  }

  function copyDirectoryContents(sourceDir, targetDir) {
    for (const sourceFile of listFilesRecursive(sourceDir)) {
      const relativePath = path.relative(sourceDir, sourceFile)
      const targetFile = path.join(targetDir, relativePath)
      ensureDir(path.dirname(targetFile))
      fs.copyFileSync(sourceFile, targetFile)
    }
  }

  // NOTE: Only checks source→target direction. Extra files in target from other
  // steps sharing the same directory are expected in multi-step artifacts.
  // Artifact-level orphan detection is a future improvement.
  function directoryContentsMatch(sourceDir, targetDir) {
    for (const sourceFile of listFilesRecursive(sourceDir)) {
      const relativePath = path.relative(sourceDir, sourceFile)
      const targetFile = path.join(targetDir, relativePath)
      if (!fs.existsSync(targetFile)) return false
      if (hashGeneratedTarget(sourceFile) !== hashGeneratedTarget(targetFile)) return false
    }
    return true
  }

  function writeDriftReport() {
    const config = readManifest()
    ensurePackagesFetched(config)
    checkoutLockedPackages(config)
    const lock = readLock()
    const lines = ['# AI Artifact Drift Report', '', reportFingerprint(lock), '']

    lines.push('## Packages', '')
    for (const [name, pkg] of Object.entries(config.packages)) {
      const locked = lock.packages[name]
      const latest = resolveRemoteRef(pkg.repo, pkg.version) || locked?.latest || locked?.resolved || 'missing'
      const status = locked?.resolved === latest ? 'up to date' : 'upstream changed'
      lines.push(`- **${name}**: ${status}`)
      lines.push(`  - requested: \`${pkg.version}\``)
      lines.push(`  - resolved: \`${locked?.resolved || 'missing'}\``)
      lines.push(`  - latest: \`${latest}\``)
    }

    lines.push('', '## Artifacts', '')
    for (const artifact of config.artifacts) {
      const generated = generateArtifact(config, artifact)
      const locked = lock.artifacts[artifact.id]
      const unchanged = JSON.stringify(locked?.steps || []) === JSON.stringify(generated.lockEntry.steps)
      const stale = generated.outputs.some((output) => !outputMatches(output))
      lines.push(`- **${artifact.id}** (${artifact.kind}): ${stale ? 'stale generated file' : 'up to date'}`)
      lines.push(`  - ${unchanged ? 'steps unchanged' : 'steps changed'}`)
    }

    writeReport(config, 'drift.md', lines.join('\n') + '\n')
    log('Wrote .ai-artifacts/reports/drift.md')
  }

  function writeRiskReport() {
    const config = readManifest()
    ensurePackagesFetched(config)
    checkoutLockedPackages(config)
    const rows = collectRisks(config)
    const lines = [
      '# AI Artifact Risk Assessment',
      '',
      reportFingerprint(readLock()),
      '',
      '| Artifact | Level | Risk | Mitigation |',
      '| --- | --- | --- | --- |',
      ...rows.map(([artifact, level, risk, mitigation]) => `| ${artifact} | ${level} | ${risk} | ${mitigation} |`),
      '',
    ]
    writeReport(config, 'risk-assessment.md', lines.join('\n'))
    log('Wrote .ai-artifacts/reports/risk-assessment.md')
    enforceRiskPolicy(config, rows)
    return rows
  }

  function collectRisks(config) {
    const lock = readLock()
    const rows = []
    for (const artifact of config.artifacts) {
      const risks = []
      const generated = generateArtifact(config, artifact)
      const locked = lock.artifacts[artifact.id]
      if (!locked) risks.push(['Medium', 'Artifact is not present in lock file', 'Run sync and review generated output'])
      if (locked && JSON.stringify(locked.steps || []) !== JSON.stringify(generated.lockEntry.steps)) risks.push(['Low', 'Artifact steps changed', 'Review generated output'])
      if (generated.outputs.some((output) => !outputMatches(output))) risks.push(['Medium', 'Generated target is stale or manually edited', 'Run sync and review diff'])
      if (artifact.kind === 'prompt') {
        for (const output of generated.outputs.filter((item) => item.type === 'file')) {
          if (output.content.includes('.copilot-tracking/')) risks.push(['High', 'Generated prompt still references `.copilot-tracking/`', 'Use `.ai-tracking/` for shared workflow artifacts'])
        }
      }
      if (artifact.kind === 'skill' && artifact.targetDir) {
        const copiedTargets = new Set(artifact.steps.filter((step) => step.copy).map((step) => step.copy.to))
        for (const sibling of ['scripts', 'references']) {
          if (fs.existsSync(path.join(root, artifact.targetDir, sibling)) && !copiedTargets.has(sibling)) {
            risks.push(['Medium', `Generated skill has local \`${sibling}/\` directory that is not modeled by a copy step`, 'Move the directory under `.ai-artifacts/files/<artifact-id>/` and add a copy step'])
          }
        }
      }
      if (risks.length === 0) risks.push(['Low', 'No obvious risk detected', 'Standard review only'])
      for (const risk of risks) rows.push([artifact.id, ...risk])
    }
    return rows
  }

  function enforceRiskPolicy(config, rows) {
    const failOn = new Set(config.riskPolicy?.failOn || [])
    const failures = rows.filter(([, level]) => failOn.has(level))
    if (failures.length > 0) {
      const summary = failures.map(([artifact, level, risk]) => `${artifact}:${level}:${risk}`).join('; ')
      throw new Error(`risk policy failed: ${summary}`)
    }
  }

  function validateAll() {
    const config = readManifest()
    ensurePackagesFetched(config)
    checkoutLockedPackages(config)
    syncArtifacts({ check: true })
    validateInstalledPackageFiles()
    validateGeneratedArtifacts()
    writeDriftReport()
    writeRiskReport()
    writeSummaryReport()
    log('AI artifacts validation passed.')
  }

  function validateInstalledPackageFiles() {
    installAIArtifacts(root, { check: true, packageRoot })
    log('Packaged AI artifact files are installed.')
  }

  function validateGeneratedArtifacts() {
    const config = readManifest()
    const failures = []
    for (const artifact of config.artifacts) {
      if (!['agent', 'prompt', 'skill'].includes(artifact.kind)) continue
      const generated = generateArtifact(config, artifact)
      for (const output of generated.outputs.filter((item) => item.type === 'file' && item.relativePath.endsWith('.md'))) {
        failures.push(...validateGeneratedMarkdown(output))
      }
    }
    if (failures.length > 0) throw new Error(`generated artifact validation failed: ${failures.join('; ')}`)
    log('Generated artifact structure is valid.')
  }

  function validateGeneratedMarkdown(output) {
    const failures = []
    const content = fs.existsSync(output.path) ? fs.readFileSync(output.path, 'utf8') : output.content
    if (!content.startsWith('---\n')) failures.push(`${output.relativePath}: missing YAML frontmatter`)
    if (content.includes('Generated file. Do not edit directly.')) failures.push(`${output.relativePath}: generated metadata must stay out of artifact bodies; use .ai-artifacts/lock.yml`)
    failures.push(...validateMarkdownHygiene(output, content))
    for (const link of extractMarkdownLinks(content)) {
      if (isExternalOrVirtualLink(link)) continue
      const target = path.resolve(path.dirname(output.path), link.split('#')[0])
      if (!target.startsWith(root) || !fs.existsSync(target)) failures.push(`${output.relativePath}: broken link ${link}`)
    }
    return failures
  }

  function validateMarkdownHygiene(output, content) {
    const failures = []
    if (!content.endsWith('\n')) failures.push(`${output.relativePath}: missing final newline`)
    const lines = content.split('\n')
    for (const [index, line] of lines.entries()) {
      const lineNumber = index + 1
      if (line.includes('\t')) failures.push(`${output.relativePath}:${lineNumber}: tab character`)
    }
    return failures
  }

  function extractMarkdownLinks(content) {
    const links = []
    const markdownLinks = content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)
    for (const match of markdownLinks) links.push(match[1].trim())
    return links
  }

  function isExternalOrVirtualLink(link) {
    if (!link || link.startsWith('#')) return true
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return true
    if (link.startsWith('{{')) return true
    if (link.startsWith('${')) return true
    return false
  }

  function writeSummaryReport() {
    const config = readManifest()
    const lock = readLock()
    const risks = collectRisks(config)
    const lines = ['# AI Artifact Update Summary', '', '## Summary', '', 'This PR updates generated AI artifacts from pinned upstream packages and local playbook steps.', '', '## Packages', '', '| Package | Requested | Resolved | Latest |', '| --- | --- | --- | --- |']
    for (const [name, pkg] of Object.entries(config.packages)) {
      const locked = lock.packages[name]
      lines.push(`| ${name} | \`${pkg.version}\` | \`${locked?.resolved || 'missing'}\` | \`${locked?.latest || 'missing'}\` |`)
    }
    lines.push('', '## Generated Artifacts', '', '| Artifact | Kind | Target |', '| --- | --- | --- |')
    for (const artifact of config.artifacts) lines.push(`| ${artifact.id} | ${artifact.kind} | \`${artifact.target || artifact.targetDir}\` |`)
    lines.push('', '## Risk Assessment', '', '| Artifact | Level | Risk |', '| --- | --- | --- |')
    for (const [artifact, level, risk] of risks) lines.push(`| ${artifact} | ${level} | ${risk} |`)
    lines.push('', '## Validation', '', '- [ ] `npm run test:ai-artifacts`', '- [ ] `npm run ai-artifacts:sync -- --check`', '- [ ] `npm run validate:ai-artifacts`', '')
    writeReport(config, 'update-summary.md', lines.join('\n'))
    log('Wrote .ai-artifacts/reports/update-summary.md')
  }

  function reportFingerprint(lock) {
    return `Generated from lock: ${sha256(JSON.stringify(lock))}`
  }

  function ensurePackagesFetched(config) {
    for (const name of Object.keys(config.packages)) {
      if (!fs.existsSync(path.join(getPackageDir(config, name), '.git'))) throw new Error(`package ${name} is missing; run npm run ai-artifacts:fetch`)
    }
  }

  function checkoutLockedPackages(config) {
    const lock = readLock()
    for (const [name, pkg] of Object.entries(config.packages)) {
      const locked = lock.packages[name]
      if (!locked?.resolved) throw new Error(`package ${name} is not locked; run npm run ai-artifacts:fetch`)
      try {
        runGit(['checkout', '--force', locked.resolved], getPackageDir(config, name))
      } catch (error) {
        try {
          runGit(['fetch', '--no-tags', 'origin', pkg.version], getPackageDir(config, name))
          runGit(['checkout', '--force', locked.resolved], getPackageDir(config, name))
        } catch {
          throw new Error(`package ${name}: locked commit ${locked.resolved} is unavailable for requested version ${pkg.version}; repin or accept a new upstream commit`)
        }
      }
    }
  }

  function resolveRemoteRef(repo, version) {
    try {
      const output = execFileSync('git', ['ls-remote', repo, version, `refs/tags/${version}`, `refs/heads/${version}`], { encoding: 'utf8' }).trim()
      if (!output) return null
      return output.split(/\s+/)[0]
    } catch {
      return null
    }
  }

  function getPackageDir(config, name) {
    return path.join(root, config.vendorDir || '.ai-artifacts/vendor', name)
  }

  function readLock() {
    if (!fs.existsSync(lockPath)) return { version: 1, packages: {}, artifacts: {} }
    const lock = parseArtifactConfig(fs.readFileSync(lockPath, 'utf8'))
    lock.packages = lock.packages || {}
    lock.artifacts = lock.artifacts || {}
    return lock
  }

  function writeLock(lock) {
    ensureDir(path.dirname(lockPath))
    const data = { version: 1, packages: lock.packages || {}, artifacts: lock.artifacts || {} }
    fs.writeFileSync(lockPath, `${serializeYaml(data)}\n`)
  }

  function writeReport(config, name, content) {
    const reportsDir = path.join(root, config.reportsDir || '.ai-artifacts/reports')
    ensureDir(reportsDir)
    fs.writeFileSync(path.join(reportsDir, name), content)
  }

  function runGit(args, cwd = root) {
    execFileSync('git', args, { cwd, env: gitEnv(cwd), stdio: quiet ? 'ignore' : 'inherit' })
  }

  function gitOutput(args, cwd = root) {
    return execFileSync('git', args, { cwd, env: gitEnv(cwd), encoding: 'utf8' }).trim()
  }

  function gitEnv(cwd) {
    if (path.resolve(cwd) === path.resolve(root)) return process.env
    const env = { ...process.env }
    for (const key of Object.keys(env)) {
      if (key === 'GIT_DIR' || key === 'GIT_WORK_TREE' || key.startsWith('GIT_INDEX')) delete env[key]
    }
    return env
  }

  function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true })
  }

  function hashGeneratedTarget(targetPath) {
    if (!fs.existsSync(targetPath)) return 'missing'
    const stat = fs.statSync(targetPath)
    if (stat.isDirectory()) return hashDirectory(targetPath)
    return sha256(fs.readFileSync(targetPath))
  }

  function hashDirectory(dirPath) {
    const entries = listFilesRecursive(dirPath)
    return sha256(entries.map((filePath) => `${path.relative(dirPath, filePath).split(path.sep).join('/')}\0${sha256(fs.readFileSync(filePath))}`).join('\n'))
  }

  function listFilesRecursive(dirPath) {
    const entries = []
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const entryPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) entries.push(...listFilesRecursive(entryPath))
      if (entry.isFile()) entries.push(entryPath)
    }
    return entries.sort((a, b) => a.localeCompare(b))
  }

  function relative(filePath) {
    return path.relative(root, filePath)
  }

  return {
    fetchSources,
    generateArtifact,
    readManifest,
    syncArtifacts,
    validateGeneratedArtifacts,
    validateInstalledPackageFiles,
    validateAll,
    writeDriftReport,
    writeRiskReport,
    writeSummaryReport,
  }
}

module.exports = { createApp }
