const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { installAIArtifacts } = require('./install')

test('installAIArtifacts installs packaged files to repo paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-install-'))
  const packageRoot = path.join(root, 'package')

  try {
    const sourcePath = path.join(packageRoot, 'workflows/ai-artifacts.yml')
    const schemaSourcePath = path.join(packageRoot, 'schemas/artifacts.schema.json')
    const targetPath = path.join(root, '.github/workflows/ai-artifacts.yml')
    const schemaTargetPath = path.join(root, '.ai-artifacts/schemas/artifacts.schema.json')
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
    fs.mkdirSync(path.dirname(schemaSourcePath), { recursive: true })
    fs.writeFileSync(sourcePath, 'name: AI Artifacts\n', 'utf8')
    fs.writeFileSync(schemaSourcePath, '{"title":"schema"}\n', 'utf8')

    const result = installAIArtifacts(root, { packageRoot })

    assert.equal(result.installed, true)
    assert.equal(fs.readFileSync(targetPath, 'utf8'), 'name: AI Artifacts\n')
    assert.equal(fs.readFileSync(schemaTargetPath, 'utf8'), '{"title":"schema"}\n')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('installAIArtifacts check mode fails when installed workflow is stale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-install-check-'))
  const packageRoot = path.join(root, 'package')

  try {
    const sourcePath = path.join(packageRoot, 'workflows/ai-artifacts.yml')
    const schemaSourcePath = path.join(packageRoot, 'schemas/artifacts.schema.json')
    const targetPath = path.join(root, '.github/workflows/ai-artifacts.yml')
    const schemaTargetPath = path.join(root, '.ai-artifacts/schemas/artifacts.schema.json')
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true })
    fs.mkdirSync(path.dirname(schemaSourcePath), { recursive: true })
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.mkdirSync(path.dirname(schemaTargetPath), { recursive: true })
    fs.writeFileSync(sourcePath, 'name: AI Artifacts\n', 'utf8')
    fs.writeFileSync(schemaSourcePath, '{"title":"schema"}\n', 'utf8')
    fs.writeFileSync(targetPath, 'name: stale\n', 'utf8')
    fs.writeFileSync(schemaTargetPath, '{"title":"schema"}\n', 'utf8')

    assert.throws(() => installAIArtifacts(root, { check: true, packageRoot }), /workflow is stale/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
