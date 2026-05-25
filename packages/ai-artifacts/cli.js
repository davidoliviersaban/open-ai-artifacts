#!/usr/bin/env node

const { createApp } = require('./app')

function main() {
  const [, , command, ...args] = process.argv
  const root = readRoot(args) || process.cwd()
  const app = createApp({ root })

  try {
    switch (command) {
      case 'fetch':
        app.fetchSources()
        break
      case 'install':
        app.validateInstalledPackageFiles()
        break
      case 'sync':
        app.syncArtifacts({ check: args.includes('--check') })
        break
      case 'drift':
        app.writeDriftReport()
        break
      case 'risk':
        app.writeRiskReport()
        break
      case 'summary':
        app.writeSummaryReport()
        break
      case 'validate':
        app.validateAll()
        break
      default:
        printUsage()
        process.exit(command ? 1 : 0)
    }
  } catch (error) {
    console.error(`ai-artifacts: ${error.message}`)
    process.exit(1)
  }
}

function readRoot(args) {
  const index = args.indexOf('--root')
  if (index === -1) return null
  const root = args[index + 1]
  if (!root) throw new Error('--root requires a path')
  return root
}

function printUsage() {
  console.log(`Usage: ai-artifacts <command> [--check] [--root <path>]

Commands:
  install    Verify packaged automation is installed in repo locations
  fetch      Clone/update upstream sources and write lock metadata
  sync       Generate target artifacts from upstream sources and overlays
  sync --check
             Verify generated target artifacts are up to date
  drift      Write .ai-artifacts/reports/drift.md
  risk       Write .ai-artifacts/reports/risk-assessment.md
  summary    Write .ai-artifacts/reports/update-summary.md
  validate   Run manifest, source, install, generated-file, drift, and risk checks`)
}

main()
