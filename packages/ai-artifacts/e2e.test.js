const assert = require('node:assert')
const fs = require('node:fs')
const { execSync } = require('node:child_process')
const path = require('node:path')
const { test } = require('node:test')

// E2E test: Full workflow from clean slate to validated artifacts
test('E2E: complete workflow from fetch to validate', () => {
  const repoRoot = path.join(__dirname, '..', '..')

  // 1. Verify artifacts.yml exists and is valid YAML
  const artifactsPath = path.join(repoRoot, '.ai-artifacts/artifacts.yml')
  assert.ok(fs.existsSync(artifactsPath), 'artifacts.yml must exist')

  const artifactsContent = fs.readFileSync(artifactsPath, 'utf8')
  assert.ok(artifactsContent.includes('version: 1'), 'artifacts.yml must have version: 1')
  assert.ok(artifactsContent.includes('packages:'), 'artifacts.yml must define packages')
  assert.ok(artifactsContent.includes('artifacts:'), 'artifacts.yml must define artifacts')

  // 2. Fetch upstream packages (required before validate)
  execSync('npm run ai-artifacts:fetch', {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  // 3. Run validation (sync --check, install --check, drift, risk)
  const result = execSync('npm run validate:ai-artifacts', {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  assert.ok(result.includes('AI artifacts validation passed'), 'Validation must pass')

  // 4. Verify lock.yml exists and has expected structure
  const lockPath = path.join(repoRoot, '.ai-artifacts/lock.yml')
  assert.ok(fs.existsSync(lockPath), 'lock.yml must exist')

  const lockContent = fs.readFileSync(lockPath, 'utf8')
  assert.ok(lockContent.includes('version: 1'), 'lock.yml must have version')
  assert.ok(lockContent.includes('packages:'), 'lock.yml must track packages')
  assert.ok(lockContent.includes('artifacts:'), 'lock.yml must track artifacts')
  assert.ok(lockContent.includes('hve-core:'), 'lock.yml must include hve-core package')
  assert.ok(lockContent.includes('web-quality-skills:'), 'lock.yml must include web-quality-skills package')
  assert.ok(lockContent.includes('task-research-guidelines:'), 'lock.yml must include RPI skill artifacts')

  // 5. Verify generated artifacts exist
  const expectedArtifacts = [
    '.github/skills/task-research-guidelines/SKILL.md',
    '.github/skills/task-plan-guidelines/SKILL.md',
    '.github/skills/task-implement-guidelines/SKILL.md',
    '.github/skills/task-review-checklist/SKILL.md',
    '.github/skills/web-quality-skills/SKILL.md',
    '.github/skills/web-quality-performance/SKILL.md',
    '.github/skills/web-quality-core-web-vitals/SKILL.md',
    '.github/skills/web-quality-accessibility/SKILL.md',
    '.github/skills/web-quality-seo/SKILL.md',
    '.github/skills/web-quality-best-practices/SKILL.md',
    'CLAUDE.md',
    '.github/copilot-instructions.md',
  ]

  for (const artifact of expectedArtifacts) {
    const artifactPath = path.join(repoRoot, artifact)
    assert.ok(fs.existsSync(artifactPath), `Generated artifact must exist: ${artifact}`)
  }

  // 6. Verify generated artifacts keep operational metadata out of artifact bodies
  const taskResearchContent = fs.readFileSync(path.join(repoRoot, '.github/skills/task-research-guidelines/SKILL.md'), 'utf8')
  assert.ok(!taskResearchContent.includes('Generated file. Do not edit directly.'), 'task-research must not have a generated header')
  assert.ok(!taskResearchContent.includes('Hashes:'), 'task-research must not include verbose metadata')

  const copilotContent = fs.readFileSync(path.join(repoRoot, '.github/copilot-instructions.md'), 'utf8')
  assert.ok(!copilotContent.includes('Generated file. Do not edit directly.'), 'copilot-instructions must not have a generated header')
  assert.ok(!copilotContent.includes('Hashes:'), 'copilot-instructions must not include verbose metadata')

  assert.ok(lockContent.includes('outputs:'), 'lock.yml must record generated outputs')
  assert.ok(lockContent.includes('path: .github/skills/task-research-guidelines/SKILL.md'), 'lock.yml must identify generated task-research output')

  // 7. Verify reports were generated
  const reports = ['drift.md', 'risk-assessment.md', 'update-summary.md']
  for (const report of reports) {
    const reportPath = path.join(repoRoot, '.ai-artifacts/reports', report)
    assert.ok(fs.existsSync(reportPath), `Report must exist: ${report}`)
  }

  // 8. Verify drift report structure
  const driftContent = fs.readFileSync(path.join(repoRoot, '.ai-artifacts/reports/drift.md'), 'utf8')
  assert.ok(driftContent.includes('# AI Artifact Drift Report'), 'Drift report must have title')
  assert.ok(driftContent.includes('## Packages'), 'Drift report must have packages section')

  // 9. Verify risk assessment structure
  const riskContent = fs.readFileSync(path.join(repoRoot, '.ai-artifacts/reports/risk-assessment.md'), 'utf8')
  assert.ok(riskContent.includes('# AI Artifact Risk Assessment'), 'Risk report must have title')

  // 10. Verify CLAUDE.md and AGENTS.md are in sync
  const agentsContent = fs.readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8')
  const claudeContent = fs.readFileSync(path.join(repoRoot, 'CLAUDE.md'), 'utf8')
  assert.strictEqual(agentsContent, claudeContent, 'CLAUDE.md must be identical to AGENTS.md')

  // 11. Verify web-quality-skills has local resources
  const webQualitySkillPath = path.join(repoRoot, '.github/skills/web-quality-skills/SKILL.md')
  const webQualityContent = fs.readFileSync(webQualitySkillPath, 'utf8')
  assert.ok(webQualityContent.includes('# Local Resources'), 'web-quality-skills must document local resources')
  assert.ok(webQualityContent.includes('run_audit.js'), 'web-quality-skills must reference run_audit.js')
  assert.ok(webQualityContent.includes('compare.js'), 'web-quality-skills must reference compare.js')

  // 12. Verify scripts directory exists for web-quality-skills
  const scriptsDir = path.join(repoRoot, '.github/skills/web-quality-skills/scripts')
  assert.ok(fs.existsSync(scriptsDir), 'web-quality-skills scripts/ must exist')
  assert.ok(fs.existsSync(path.join(scriptsDir, 'run_audit.js')), 'run_audit.js must exist')
  assert.ok(fs.existsSync(path.join(scriptsDir, 'compare.js')), 'compare.js must exist')

  console.log('✅ E2E validation complete: All workflow steps passed')
})

// E2E test: Verify sync --check detects stale artifacts
test('E2E: sync --check detects stale artifacts when overlay changes', () => {
  const repoRoot = path.join(__dirname, '..', '..')
  const sourcePath = path.join(repoRoot, '.ai-artifacts/overlays/rpi/task-research.md')

  // Read original overlay
  const originalContent = fs.readFileSync(sourcePath, 'utf8')

  try {
    // Modify overlay temporarily
    fs.writeFileSync(sourcePath, originalContent + '\n# Test change\n')

    // sync --check should fail (stale artifacts)
    let checkFailed = false
    try {
      execSync('npm run ai-artifacts:sync -- --check', {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: 'pipe',
      })
    } catch (error) {
      checkFailed = true
      assert.ok(error.message.includes('generated artifacts are stale'), 'Check should detect stale artifacts')
    }

    assert.ok(checkFailed, 'sync --check must fail when overlays change')
  } finally {
    // Restore original overlay
    fs.writeFileSync(sourcePath, originalContent)
  }

  // Verify check passes again after restore
  const result = execSync('npm run ai-artifacts:sync -- --check', {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  assert.ok(result.includes('Generated artifacts are up to date'), 'Check must pass after overlay restore')

  console.log('✅ E2E stale detection: Correctly detects and validates overlay changes')
})

// E2E test: Instructions sync workflow
test('E2E: instructions sync maintains AGENTS.md as source of truth', () => {
  const repoRoot = path.join(__dirname, '..', '..')

  // 1. Verify AGENTS.md exists
  const agentsPath = path.join(repoRoot, 'AGENTS.md')
  assert.ok(fs.existsSync(agentsPath), 'AGENTS.md must exist')

  // 2. Verify CLAUDE.md is identical
  const claudePath = path.join(repoRoot, 'CLAUDE.md')
  const agentsContent = fs.readFileSync(agentsPath, 'utf8')
  const claudeContent = fs.readFileSync(claudePath, 'utf8')
  assert.strictEqual(agentsContent, claudeContent, 'CLAUDE.md must match AGENTS.md exactly')

  // 3. Verify copilot-instructions.md exists without generated header metadata
  const copilotPath = path.join(repoRoot, '.github/copilot-instructions.md')
  assert.ok(fs.existsSync(copilotPath), 'copilot-instructions.md must exist')

  const copilotContent = fs.readFileSync(copilotPath, 'utf8')
  assert.ok(!copilotContent.includes('Generated file. Do not edit directly'), 'copilot-instructions must not have generated header metadata')
  assert.ok(copilotContent.includes('Travel Storefront - GitHub Copilot Instructions'), 'copilot-instructions must have title')

  // 4. Verify key sections present in AGENTS.md are referenced in copilot-instructions.md
  assert.ok(copilotContent.includes('Test-Driven Development (TDD)'), 'copilot-instructions must include TDD')
  assert.ok(copilotContent.includes('Performance Requirements'), 'copilot-instructions must include performance')
  assert.ok(copilotContent.includes('Validation Checklist'), 'copilot-instructions must include checklist')

  console.log('✅ E2E instructions sync: AGENTS.md → CLAUDE.md + copilot-instructions.md workflow verified')
})
