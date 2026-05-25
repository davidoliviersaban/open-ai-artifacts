const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createApp } = require('./app')

test('app fetches, syncs, checks, and reports using only a temp root', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-root-'))
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-upstream-'))

  try {
    initGitRepo(upstream)
    writeFile(path.join(upstream, 'prompts/research.md'), `---\ndescription: Demo\n---\n\n# Research\n\nUse .copilot-tracking/ for output.\n`)
    git(upstream, ['add', '.'])
    git(upstream, ['commit', '-m', 'add research prompt'])
    const commit = gitOutput(upstream, ['rev-parse', 'HEAD'])

    writeFile(path.join(tempRoot, '.ai-artifacts/overlays/common.md'), '# Local Overlay\n\nUse `.ai-tracking/`.\n')
    writeFile(path.join(tempRoot, '.ai-artifacts/artifacts.yml'), `version: 1
packages:
  upstream:
    type: git
    repo: ${upstream}
    version: ${commit}
artifacts:
  - id: research
    kind: prompt
    target: .generated/research.md
    steps:
      - render:
          from: upstream:prompts/research.md
          overlays:
            - common.md
          substitutions:
            - from: .copilot-tracking/
              to: .ai-tracking/
`)

    const app = createApp({ root: tempRoot, log: () => {}, quiet: true, packageRoot: path.join(tempRoot, 'scripts/ai-artifacts') })
    app.fetchSources()
    app.syncArtifacts()
    app.syncArtifacts({ check: true })
    app.writeDriftReport()
    app.writeRiskReport()
    app.writeSummaryReport()

    const generated = fs.readFileSync(path.join(tempRoot, '.generated/research.md'), 'utf8')
    assert.match(generated, /^---\ndescription: Demo\n---\n\n# Research/)
    assert.match(generated, /Use \.ai-tracking\/ for output\./)
    assert.match(generated, /# Local Overlay/)
    assert.doesNotMatch(generated, /\.copilot-tracking\//)
    assert.doesNotMatch(generated, /Generated file\. Do not edit directly/)

    const { parseArtifactConfig } = require('./lib')
    const lock = parseArtifactConfig(fs.readFileSync(path.join(tempRoot, '.ai-artifacts/lock.yml'), 'utf8'))
    assert.equal(lock.packages.upstream.requested, commit)
    assert.equal(lock.packages.upstream.resolved, commit)
    assert.equal(lock.packages.upstream.latest, commit)
    assert.equal(lock.artifacts.research.target, '.generated/research.md')
    assert.equal(lock.artifacts.research.outputs[0].path, '.generated/research.md')

    const drift = fs.readFileSync(path.join(tempRoot, '.ai-artifacts/reports/drift.md'), 'utf8')
    assert.match(drift, /research.*up to date/)
    assert.match(drift, /Generated from lock: sha256:[a-f0-9]{64}/)

    const risk = fs.readFileSync(path.join(tempRoot, '.ai-artifacts/reports/risk-assessment.md'), 'utf8')
    assert.match(risk, /No obvious risk detected/)
    assert.match(risk, /Generated from lock: sha256:[a-f0-9]{64}/)

    const summary = fs.readFileSync(path.join(tempRoot, '.ai-artifacts/reports/update-summary.md'), 'utf8')
    assert.match(summary, /## Summary/)
    assert.match(summary, /research/)
    assert.match(summary, /npm run validate:ai-artifacts/)

    assert.equal(fs.existsSync(path.join(process.cwd(), '.generated/research.md')), false)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(upstream, { recursive: true, force: true })
  }
})

test('app writes stable drift and risk reports for unchanged locks', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-root-'))
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-upstream-'))

  try {
    initGitRepo(upstream)
    writeFile(path.join(upstream, 'prompts/research.md'), '# Research\n')
    git(upstream, ['add', '.'])
    git(upstream, ['commit', '-m', 'add research prompt'])
    const commit = gitOutput(upstream, ['rev-parse', 'HEAD'])

    writeFile(path.join(tempRoot, '.ai-artifacts/artifacts.yml'), `version: 1
packages:
  upstream:
    type: git
    repo: ${upstream}
    version: ${commit}
artifacts:
  - id: research
    kind: prompt
    target: .generated/research.md
    steps:
      - render:
          from: upstream:prompts/research.md
`)

    const app = createApp({ root: tempRoot, log: () => {}, quiet: true, packageRoot: path.join(tempRoot, 'scripts/ai-artifacts') })
    app.fetchSources()
    app.syncArtifacts()
    app.writeDriftReport()
    app.writeRiskReport()

    const firstDrift = fs.readFileSync(path.join(tempRoot, '.ai-artifacts/reports/drift.md'), 'utf8')
    const firstRisk = fs.readFileSync(path.join(tempRoot, '.ai-artifacts/reports/risk-assessment.md'), 'utf8')

    app.writeDriftReport()
    app.writeRiskReport()

    assert.equal(fs.readFileSync(path.join(tempRoot, '.ai-artifacts/reports/drift.md'), 'utf8'), firstDrift)
    assert.equal(fs.readFileSync(path.join(tempRoot, '.ai-artifacts/reports/risk-assessment.md'), 'utf8'), firstRisk)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(upstream, { recursive: true, force: true })
  }
})

test('app copies package directories using playbook copy steps', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-root-'))
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-upstream-'))

  try {
    initGitRepo(upstream)
    writeFile(path.join(upstream, 'skill/scripts/analyze.sh'), '#!/usr/bin/env bash\nset -euo pipefail\n')
    writeFile(path.join(upstream, 'skill/scripts/README.md'), '# Scripts\n')
    git(upstream, ['add', '.'])
    git(upstream, ['commit', '-m', 'add scripts directory'])
    const commit = gitOutput(upstream, ['rev-parse', 'HEAD'])

    writeFile(path.join(tempRoot, '.ai-artifacts/artifacts.yml'), `version: 1
packages:
  upstream:
    type: git
    repo: ${upstream}
    version: ${commit}
artifacts:
  - id: skill-scripts
    kind: directory
    targetDir: .generated
    steps:
      - copy:
          from: upstream:skill/scripts
          to: scripts
`)

    const app = createApp({ root: tempRoot, log: () => {}, quiet: true, packageRoot: path.join(tempRoot, 'scripts/ai-artifacts') })
    app.fetchSources()
    app.syncArtifacts()
    app.syncArtifacts({ check: true })
    app.writeDriftReport()
    app.writeRiskReport()

    assert.equal(fs.readFileSync(path.join(tempRoot, '.generated/scripts/analyze.sh'), 'utf8'), '#!/usr/bin/env bash\nset -euo pipefail\n')
    assert.equal(fs.readFileSync(path.join(tempRoot, '.generated/scripts/README.md'), 'utf8'), '# Scripts\n')

    const { parseArtifactConfig } = require('./lib')
    const lock = parseArtifactConfig(fs.readFileSync(path.join(tempRoot, '.ai-artifacts/lock.yml'), 'utf8'))
    assert.equal(lock.packages.upstream.resolved, commit)
    assert.equal(lock.artifacts['skill-scripts'].kind, 'directory')
    assert.equal(lock.artifacts['skill-scripts'].targetDir, '.generated')

    const drift = fs.readFileSync(path.join(tempRoot, '.ai-artifacts/reports/drift.md'), 'utf8')
    assert.match(drift, /skill-scripts.*up to date/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(upstream, { recursive: true, force: true })
  }
})

test('app tracks declared supplementary skill resources', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-root-'))
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-upstream-'))

  try {
    initGitRepo(upstream)
    writeFile(path.join(upstream, 'skills/demo/SKILL.md'), `---\nname: demo\ndescription: Demo\n---\n\n# Demo\n`)
    git(upstream, ['add', '.'])
    git(upstream, ['commit', '-m', 'add demo skill'])
    const commit = gitOutput(upstream, ['rev-parse', 'HEAD'])

    writeFile(path.join(tempRoot, '.ai-artifacts/artifacts.yml'), `version: 1
packages:
  upstream:
    type: git
    repo: ${upstream}
    version: ${commit}
artifacts:
  - id: demo-skill
    kind: skill
    targetDir: .generated/demo
    steps:
      - render:
          from: upstream:skills/demo/SKILL.md
          to: SKILL.md
      - copy:
          from: root:sources/demo-skill/scripts
          to: scripts
      - copy:
          from: root:sources/demo-skill/references
          to: references
`)
    writeFile(path.join(tempRoot, 'sources/demo-skill/scripts/run.js'), 'console.log("audit")\n')
    writeFile(path.join(tempRoot, 'sources/demo-skill/references/scoring.md'), '# Scoring\n')

    const app = createApp({ root: tempRoot, log: () => {}, quiet: true, packageRoot: path.join(tempRoot, 'scripts/ai-artifacts') })
    app.fetchSources()
    app.syncArtifacts()
    app.syncArtifacts({ check: true })
    app.writeDriftReport()
    app.writeRiskReport()

    const { parseArtifactConfig } = require('./lib')
    const lock = parseArtifactConfig(fs.readFileSync(path.join(tempRoot, '.ai-artifacts/lock.yml'), 'utf8'))
    assert.equal(lock.artifacts['demo-skill'].targetDir, '.generated/demo')
    assert.equal(lock.artifacts['demo-skill'].steps.length, 3)
    assert.equal(fs.readFileSync(path.join(tempRoot, '.generated/demo/scripts/run.js'), 'utf8'), 'console.log("audit")\n')
    assert.equal(fs.readFileSync(path.join(tempRoot, '.generated/demo/references/scoring.md'), 'utf8'), '# Scoring\n')

    const drift = fs.readFileSync(path.join(tempRoot, '.ai-artifacts/reports/drift.md'), 'utf8')
    assert.match(drift, /steps unchanged/)

    const risk = fs.readFileSync(path.join(tempRoot, '.ai-artifacts/reports/risk-assessment.md'), 'utf8')
    assert.doesNotMatch(risk, /not sourced from upstream/)
    assert.match(risk, /No obvious risk detected/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(upstream, { recursive: true, force: true })
  }
})

test('app merges directory copy steps without deleting existing files', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-root-'))
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-upstream-'))

  try {
    initGitRepo(upstream)
    writeFile(path.join(upstream, 'refs/performance.md'), '# Performance\n')
    writeFile(path.join(upstream, 'refs/core-web-vitals.md'), '# Core Web Vitals\n')
    git(upstream, ['add', '.'])
    git(upstream, ['commit', '-m', 'add upstream references'])
    const commit = gitOutput(upstream, ['rev-parse', 'HEAD'])

    writeFile(path.join(tempRoot, '.ai-artifacts/artifacts.yml'), `version: 1
packages:
  upstream:
    type: git
    repo: ${upstream}
    version: ${commit}
artifacts:
  - id: analytics
    kind: skill
    targetDir: .generated/analytics
    steps:
      - copy:
          from: upstream:refs/performance.md
          to: references/performance.md
      - copy:
          from: upstream:refs/core-web-vitals.md
          to: references/core-web-vitals.md
      - copy:
          from: root:sources/analytics/references
          to: references
`)
    writeFile(path.join(tempRoot, 'sources/analytics/references/travel-storefront-analytics.md'), '# TSF Analytics\n')

    const app = createApp({ root: tempRoot, log: () => {}, quiet: true, packageRoot: path.join(tempRoot, 'scripts/ai-artifacts') })
    app.fetchSources()
    app.syncArtifacts()
    app.syncArtifacts({ check: true })

    assert.equal(fs.readFileSync(path.join(tempRoot, '.generated/analytics/references/performance.md'), 'utf8'), '# Performance\n')
    assert.equal(fs.readFileSync(path.join(tempRoot, '.generated/analytics/references/core-web-vitals.md'), 'utf8'), '# Core Web Vitals\n')
    assert.equal(fs.readFileSync(path.join(tempRoot, '.generated/analytics/references/travel-storefront-analytics.md'), 'utf8'), '# TSF Analytics\n')
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(upstream, { recursive: true, force: true })
  }
})

test('app validateAll fails when risk policy failOn includes detected risk level', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-root-'))
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-upstream-'))

  try {
    initGitRepo(upstream)
    writeFile(path.join(upstream, 'skills/demo/SKILL.md'), `---\nname: demo\ndescription: Demo\n---\n\n# Demo\n`)
    git(upstream, ['add', '.'])
    git(upstream, ['commit', '-m', 'add demo skill'])
    const commit = gitOutput(upstream, ['rev-parse', 'HEAD'])

    writePackagedWorkflow(tempRoot)
    writeFile(path.join(tempRoot, '.github/workflows/ai-artifacts.yml'), 'name: AI Artifacts\n')
    writeFile(path.join(tempRoot, '.ai-artifacts/schemas/artifacts.schema.json'), '{"title":"schema"}\n')
    writeFile(path.join(tempRoot, '.claude/hooks/audit-skill.js'), 'claude audit\n')
    writeFile(path.join(tempRoot, '.opencode/plugin/skill-audit.js'), 'opencode audit\n')
    writeFile(path.join(tempRoot, '.ai-artifacts/artifacts.yml'), `version: 1
riskPolicy:
  failOn:
    - Medium
    - High
packages:
  upstream:
    type: git
    repo: ${upstream}
    version: ${commit}
artifacts:
  - id: demo-skill
    kind: skill
    targetDir: .generated/demo
    steps:
      - render:
          from: upstream:skills/demo/SKILL.md
          to: SKILL.md
`)

    const app = createApp({ root: tempRoot, log: () => {}, quiet: true, packageRoot: path.join(tempRoot, 'scripts/ai-artifacts') })
    app.fetchSources()
    app.syncArtifacts()
    writeFile(path.join(tempRoot, '.generated/demo/scripts/local.js'), 'console.log("local")\n')

    assert.throws(() => app.validateAll(), /risk policy failed/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(upstream, { recursive: true, force: true })
  }
})

test('app validateAll fails when packaged workflow is not installed', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-root-'))
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-upstream-'))

  try {
    initGitRepo(upstream)
    writeFile(path.join(upstream, 'skills/demo/SKILL.md'), `---\nname: demo\ndescription: Demo\n---\n\n# Demo\n`)
    git(upstream, ['add', '.'])
    git(upstream, ['commit', '-m', 'add demo skill'])
    const commit = gitOutput(upstream, ['rev-parse', 'HEAD'])

    writePackagedWorkflow(tempRoot)
    writeFile(path.join(tempRoot, '.github/workflows/ai-artifacts.yml'), 'name: stale\n')
    writeFile(path.join(tempRoot, '.ai-artifacts/artifacts.yml'), `version: 1
packages:
  upstream:
    type: git
    repo: ${upstream}
    version: ${commit}
artifacts:
  - id: demo-skill
    kind: skill
    targetDir: .generated/demo
    steps:
      - render:
          from: upstream:skills/demo/SKILL.md
          to: SKILL.md
`)

    const app = createApp({ root: tempRoot, log: () => {}, quiet: true, packageRoot: path.join(tempRoot, 'scripts/ai-artifacts') })
    app.fetchSources()
    app.syncArtifacts()

    assert.throws(() => app.validateAll(), /installed AI artifacts workflow is stale/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(upstream, { recursive: true, force: true })
  }
})

test('app validates generated markdown frontmatter', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-root-'))
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-upstream-'))

  try {
    initGitRepo(upstream)
    writeFile(path.join(upstream, 'skills/demo/SKILL.md'), '# Demo\n')
    git(upstream, ['add', '.'])
    git(upstream, ['commit', '-m', 'add demo skill without frontmatter'])
    const commit = gitOutput(upstream, ['rev-parse', 'HEAD'])

    writeFile(path.join(tempRoot, '.ai-artifacts/artifacts.yml'), `version: 1
packages:
  upstream:
    type: git
    repo: ${upstream}
    version: ${commit}
artifacts:
  - id: demo-skill
    kind: skill
    targetDir: .generated/demo
    steps:
      - render:
          from: upstream:skills/demo/SKILL.md
          to: SKILL.md
`)

    const app = createApp({ root: tempRoot, log: () => {}, quiet: true })
    app.fetchSources()
    app.syncArtifacts()

    assert.throws(() => app.validateGeneratedArtifacts(), /missing YAML frontmatter/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(upstream, { recursive: true, force: true })
  }
})

test('app validates generated markdown relative links', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-root-'))
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-upstream-'))

  try {
    initGitRepo(upstream)
    writeFile(path.join(upstream, 'skills/demo/SKILL.md'), `---\nname: demo\ndescription: Demo\n---\n\n# Demo\n\nSee [missing](references/missing.md).\n`)
    git(upstream, ['add', '.'])
    git(upstream, ['commit', '-m', 'add demo skill with broken link'])
    const commit = gitOutput(upstream, ['rev-parse', 'HEAD'])

    writeFile(path.join(tempRoot, '.ai-artifacts/artifacts.yml'), `version: 1
packages:
  upstream:
    type: git
    repo: ${upstream}
    version: ${commit}
artifacts:
  - id: demo-skill
    kind: skill
    targetDir: .generated/demo
    steps:
      - render:
          from: upstream:skills/demo/SKILL.md
          to: SKILL.md
`)

    const app = createApp({ root: tempRoot, log: () => {}, quiet: true })
    app.fetchSources()
    app.syncArtifacts()

    assert.throws(() => app.validateGeneratedArtifacts(), /broken link references\/missing\.md/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(upstream, { recursive: true, force: true })
  }
})

test('app validates generated markdown hygiene', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-root-'))
  const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-upstream-'))

  try {
    initGitRepo(upstream)
    writeFile(path.join(upstream, 'skills/demo/SKILL.md'), `---\nname: demo\ndescription: Demo\n---\n\n# Demo\n\n\tTabbed content\n`)
    git(upstream, ['add', '.'])
    git(upstream, ['commit', '-m', 'add demo skill with markdown hygiene issues'])
    const commit = gitOutput(upstream, ['rev-parse', 'HEAD'])

    writeFile(path.join(tempRoot, '.ai-artifacts/artifacts.yml'), `version: 1
packages:
  upstream:
    type: git
    repo: ${upstream}
    version: ${commit}
artifacts:
  - id: demo-skill
    kind: skill
    targetDir: .generated/demo
    steps:
      - render:
          from: upstream:skills/demo/SKILL.md
          to: SKILL.md
`)

    const app = createApp({ root: tempRoot, log: () => {}, quiet: true })
    app.fetchSources()
    app.syncArtifacts()

    assert.throws(() => app.validateGeneratedArtifacts(), /tab character/)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    fs.rmSync(upstream, { recursive: true, force: true })
  }
})

function initGitRepo(repoPath) {
  git(repoPath, ['init'])
  git(repoPath, ['config', 'user.email', 'test@example.com'])
  git(repoPath, ['config', 'user.name', 'Test User'])
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

function writePackagedWorkflow(root) {
  writeFile(path.join(root, 'scripts/ai-artifacts/workflows/ai-artifacts.yml'), 'name: AI Artifacts\n')
  writeFile(path.join(root, 'scripts/ai-artifacts/schemas/artifacts.schema.json'), '{"title":"schema"}\n')
  writeFile(path.join(root, 'scripts/ai-artifacts/claude/audit-skill.js'), 'claude audit\n')
  writeFile(path.join(root, 'scripts/ai-artifacts/opencode/skill-audit.js'), 'opencode audit\n')
}

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

function gitOutput(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}
