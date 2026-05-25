const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { parseArtifactConfig, validateArtifactConfig } = require('./lib')

const ROOT = path.resolve(__dirname, '..', '..')

test('package README artifact YAML examples stay valid', () => {
  const examples = extractYamlBlocks(path.join(ROOT, 'scripts/ai-artifacts/README.md'))

  assert.ok(examples.length >= 1, 'expected at least one YAML example in README')
  for (const example of examples) {
    if (looksLikeArtifactConfig(example)) validateArtifactConfig(example)
  }
})

test('ai-artifacts tooling stays dev-only and out of package manager project discovery', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'scripts/ai-artifacts/package.json')), false)
  const rootPackage = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.ok(!rootPackage.workspaces.includes('scripts/ai-artifacts'), 'ai-artifacts must not be an npm workspace (future external dep)')
  assert.match(rootPackage.scripts['ai-artifacts:fetch'], /node scripts\/ai-artifacts\/cli\.js fetch/)
  assert.match(rootPackage.scripts['test:ai-artifacts'], /node --test scripts\/ai-artifacts/)
  assert.doesNotThrow(() => runPostinstallWithoutDevScripts(rootPackage.scripts.postinstall))
})

test('Docker dependency layers keep root install configuration', () => {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(rootPackage.optionalDependencies['lightningcss-linux-arm64-musl'], '^1.30.2')

  const storefrontDockerfile = fs.readFileSync(path.join(ROOT, 'apps/storefront-ui/Dockerfile'), 'utf8')
  assert.match(storefrontDockerfile, /COPY package\.json package-lock\.json \.npmrc \.\//)
  assert.match(storefrontDockerfile, /RUN npm ci --ignore-scripts --no-audit --no-fund/)

  const payloadDockerfile = fs.readFileSync(path.join(ROOT, 'apps/payloadcms/Dockerfile'), 'utf8')
  assert.match(payloadDockerfile, /COPY package\.json package-lock\.json \.npmrc \.\//)
  assert.match(payloadDockerfile, /RUN npm ci --ignore-scripts --no-audit --no-fund/)
})

test('Storefront AI artifacts README documents deployed config only', () => {
  const readme = fs.readFileSync(path.join(ROOT, '.ai-artifacts/README.md'), 'utf8')
  assert.match(readme, /Storefront AI Artifacts Configuration/)
  assert.match(readme, /scripts\/ai-artifacts\//)
  assert.match(readme, /artifacts\.yml/)
  assert.match(readme, /lock\.yml/)
  assert.match(readme, /overlays\//)
  assert.match(readme, /files\//)
  assert.doesNotMatch(readme, /Semantic overlays describe intent/)
})

test('DESIGN artifact YAML examples stay valid', () => {
  const examples = extractYamlBlocks(path.join(ROOT, 'scripts/ai-artifacts/docs/DESIGN.md'))

  assert.ok(examples.length >= 2, 'expected artifact YAML examples in DESIGN')
  for (const example of examples) {
    if (looksLikeArtifactConfig(example)) validateArtifactConfig(example)
  }
})

test('AI artifact governance files cover review gates and ownership', () => {
  const prTemplate = fs.readFileSync(path.join(ROOT, '.github/PULL_REQUEST_TEMPLATE.md'), 'utf8')
  assert.match(prTemplate, /npm run validate:ai-artifacts/)
  assert.match(prTemplate, /drift\.md/)
  assert.match(prTemplate, /risk-assessment\.md/)
  assert.match(prTemplate, /375x812/)
  assert.match(prTemplate, /Lighthouse scores/)

  const codeowners = fs.readFileSync(path.join(ROOT, 'CODEOWNERS'), 'utf8')
  assert.match(codeowners, /^\/\.ai-artifacts\/\s+@\S+/m)
  assert.match(codeowners, /^\/scripts\/ai-artifacts\/\s+@\S+/m)
  assert.match(codeowners, /^\/\.github\/agents\/\s+@\S+/m)
  assert.match(codeowners, /^\/\.github\/skills\/\s+@\S+/m)
  assert.match(codeowners, /^\/\.github\/workflows\/\s+@\S+/m)
})

test('Storefront README documents untracked AI tracking files', () => {
  const readme = fs.readFileSync(path.join(ROOT, '.ai-artifacts/README.md'), 'utf8')
  assert.match(readme, /\.ai-tracking\//)
  assert.match(readme, /not tracked for now/)
  assert.match(readme, /refined over time/)
})

test('AI artifacts schema documents current playbook fields', () => {
  const packagedSchemaPath = path.join(ROOT, 'scripts/ai-artifacts/schemas/artifacts.schema.json')
  const installedSchemaPath = path.join(ROOT, '.ai-artifacts/schemas/artifacts.schema.json')
  const packagedSchema = fs.readFileSync(packagedSchemaPath, 'utf8')
  const installedSchema = fs.readFileSync(installedSchemaPath, 'utf8')
  assert.equal(installedSchema, packagedSchema, 'installed schema must match packaged schema')

  const schema = JSON.parse(packagedSchema)
  assert.equal(schema.properties.version.const, 1)
  assert.ok(schema.required.includes('packages'))
  assert.ok(schema.required.includes('artifacts'))
  assert.equal(schema.properties.packages.additionalProperties.properties.type.const, 'git')
  assert.ok(schema.properties.artifacts.items.oneOf, 'schema must require target xor targetDir')
  assert.ok(schema.$defs.renderStep.properties.render.properties.substitutions, 'schema must model render substitutions')
  assert.ok(schema.$defs.copyStep.properties.copy.required.includes('to'), 'schema must model copy.to')

  const config = fs.readFileSync(path.join(ROOT, '.ai-artifacts/artifacts.yml'), 'utf8')
  assert.match(config, /yaml-language-server: \$schema=\.\/schemas\/artifacts\.schema\.json/)
})

test('AI artifacts package includes a valid playbook template', () => {
  const template = parseArtifactConfig(fs.readFileSync(path.join(ROOT, 'scripts/ai-artifacts/templates/artifacts.yml'), 'utf8'))
  validateArtifactConfig(template)
  assert.ok(template.packages['example-package'])
  assert.equal(template.artifacts[0].id, 'example-skill')
})

test('AI artifact workflow schedules drift review without accepting upstream updates', () => {
  const packagedWorkflow = fs.readFileSync(path.join(ROOT, 'scripts/ai-artifacts/workflows/ai-artifacts.yml'), 'utf8')
  const installedWorkflow = fs.readFileSync(path.join(ROOT, '.github/workflows/ai-artifacts.yml'), 'utf8')
  assert.equal(installedWorkflow, packagedWorkflow, 'installed workflow must match packaged framework workflow')

  const workflow = packagedWorkflow
  assert.match(workflow, /schedule:/)
  assert.match(workflow, /cron: '0 7 \* \* 1'/)
  assert.match(workflow, /propose-ai-artifact-updates:/)
  assert.match(workflow, /contents: write/)
  assert.match(workflow, /pull-requests: write/)
  assert.match(workflow, /peter-evans\/create-pull-request@v6/)

  const proposeJob = workflow.slice(workflow.indexOf('propose-ai-artifact-updates:'))
  assert.match(proposeJob, /npm run ai-artifacts:fetch/)
  assert.match(proposeJob, /npm run ai-artifacts:drift/)
  assert.doesNotMatch(proposeJob, /npm run ai-artifacts:sync/)
})

function extractYamlBlocks(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const blocks = [...content.matchAll(/```yaml\n([\s\S]*?)\n```/g)]
  return blocks.map(([, yaml]) => parseArtifactConfig(yaml))
}

function looksLikeArtifactConfig(value) {
  return value && value.version === 1 && value.packages && Array.isArray(value.artifacts)
}

function runPostinstallWithoutDevScripts(postinstall) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-postinstall-'))
  fs.writeFileSync(
    path.join(tempRoot, 'package.json'),
    JSON.stringify({ private: true, scripts: { postinstall } }),
    'utf8',
  )
  const postinstallResult = spawnSync('npm', ['run', 'postinstall', '--ignore-scripts'], {
    cwd: tempRoot,
    encoding: 'utf8',
    env: { ...process.env },
  })
  fs.rmSync(tempRoot, { recursive: true, force: true })
  if (postinstallResult.error) throw postinstallResult.error
  assert.equal(postinstallResult.status, 0, postinstallResult.stderr || postinstallResult.stdout)
}
