#!/usr/bin/env node

const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const ROOT = path.resolve(__dirname, '..')
const PACKAGES = ['ai-artifacts', 'ai-artifacts-bench']
const DIST = path.join(ROOT, 'dist')

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts })
}

function step(label) {
  console.log(`\n\x1b[1m[${label}]\x1b[0m`)
}

function main() {
  const startTime = Date.now()

  step('1/5 — Tests')
  run('npm run test:ai-artifacts')
  run('npm run test:ai-artifacts-bench')

  step('2/5 — Validation')
  run('npm run validate:ai-artifacts')

  step('3/5 — Pack')
  fs.rmSync(DIST, { recursive: true, force: true })
  fs.mkdirSync(DIST, { recursive: true })
  const tarballs = []
  for (const pkg of PACKAGES) {
    const pkgDir = path.join(ROOT, 'packages', pkg)
    const output = execSync('npm pack --pack-destination ' + DIST, { cwd: pkgDir, encoding: 'utf8' }).trim()
    const tarball = path.join(DIST, output.split('\n').pop())
    tarballs.push(tarball)
    console.log(`  → ${path.relative(ROOT, tarball)}`)
  }

  step('4/5 — Install test')
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-artifacts-prerelease-'))
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), '{"name":"install-test","private":true}\n')
    const tarballArgs = tarballs.map((t) => `"${t}"`).join(' ')
    run(`npm install ${tarballArgs}`, { cwd: tmpDir })

    for (const pkg of PACKAGES) {
      const pkgJson = path.join(tmpDir, 'node_modules', '@d-o.s', pkg, 'package.json')
      if (!fs.existsSync(pkgJson)) {
        throw new Error(`Package @d-o.s/${pkg} not found after install`)
      }
      const version = JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version
      console.log(`  ✓ @d-o.s/${pkg}@${version} installs correctly`)
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }

  step('5/5 — Version check')
  const versions = new Set()
  for (const pkg of PACKAGES) {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', pkg, 'package.json'), 'utf8'))
    versions.add(pkgJson.version)
    console.log(`  ${pkgJson.name}@${pkgJson.version}`)
  }
  if (versions.size > 1) {
    throw new Error('Package versions are out of sync — both must match')
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`\n\x1b[32m✓ Prerelease checks passed in ${elapsed}s\x1b[0m`)
  console.log(`  Tarballs ready in dist/`)
  console.log(`  Next: bump version → commit → push → create GitHub Release v${[...versions][0]}`)
}

try {
  main()
} catch (err) {
  console.error(`\n\x1b[31m✗ Prerelease failed: ${err.message}\x1b[0m`)
  process.exitCode = 1
}
