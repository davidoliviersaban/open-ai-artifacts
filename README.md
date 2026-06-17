# ai-artifacts

Version, compose and audit AI agents, skills, tools and instructions across repositories.

## Status

Apache 2.0 licensed. Open-source project by David-Olivier Saban.

**Repository**: [github.com/davidoliviersaban/open-ai-artifacts](https://github.com/davidoliviersaban/open-ai-artifacts)

## What it does

```text
upstream source (pinned git package)
+ local overlays (repo-specific context)
+ substitutions (literal replacements)
= generated artifact (consumed by AI agents)
```

The CLI pins upstream versions, locks exact commits, generates final artifacts, detects drift and validates everything in CI.

## Repository Layout

```text
packages/ai-artifacts/       # Node CLI/package (zero dependencies beyond Node 20+ and git)
docs/
  whitepaper/                # Adoption whitepaper (markdown + PDF)
  adr/                       # Architecture Decision Records
.ai-artifacts/               # Dogfooding: this repo uses its own package
  artifacts.yml              #   Playbook: packages + artifacts + steps
  lock.yml                   #   Pinned commits + content hashes
  vendor/                    #   Cloned upstream repos (gitignored)
  reports/                   #   Generated drift + risk reports (gitignored)
  schemas/                   #   JSON Schema for artifacts.yml (gitignored, installed)
.github/
  overlays/                  #   Local markdown appended to upstream content
  workflows/                 #   CI workflows including ai-artifacts validation
```

## Quick Start

```bash
npm install
npm run ai-artifacts:sync       # Generate artifacts from upstream + overlays
npm run validate:ai-artifacts   # Full validation (sync --check + install + reports)
npm run ai-artifacts:doctor     # Check local setup and tool context
```

## Commands

| Command | Purpose |
|---------|---------|
| `ai-artifacts:fetch` | Clone/update upstream sources, write lock |
| `ai-artifacts:sync` | Generate artifacts from sources + overlays |
| `ai-artifacts:sync -- --check` | Verify artifacts are up to date (CI gate) |
| `ai-artifacts:drift` | Report upstream drift since last lock |
| `ai-artifacts:risk` | Report risk assessment |
| `ai-artifacts:doctor` | Check local install and tool context |
| `validate:ai-artifacts` | All checks in one pass |

## Development Workflow

This repo is an Nx workspace. The AI artifacts CI workflow (`.github/workflows/ai-artifacts.yml`) handles:

**On PR and push to main** (when ai-artifacts files change):
1. Fetch upstream packages
2. Run package tests
3. Verify generated artifacts are up to date (`--check`)
4. Verify packaged install files match sources
5. Generate and upload drift/risk reports

**Weekly (Monday 07:00 UTC) or on-demand**:
1. Refresh upstream lock pointers
2. Generate drift/risk/summary reports
3. Open a review PR if upstream moved (`chore/ai-artifact-upstream-review`)

### Making changes

When editing AI instructions, overlays or package code:

```bash
# 1. Edit sources
#    - Overlays: .github/overlays/
#    - Package code: packages/ai-artifacts/
#    - Playbook: .ai-artifacts/artifacts.yml

# 2. Regenerate and validate
npm run ai-artifacts:sync
npm run validate:ai-artifacts

# 3. Run tests if you changed package code
npm run test:ai-artifacts
```

## Whitepaper

```bash
npm run build:whitepaper
```

| Output | Purpose |
|--------|---------|
| `docs/whitepaper/whitepaper-v3.pdf` | Long-form version for Engineering Managers and Tech Leads |
| `docs/whitepaper/whitepaper-management-summary.pdf` | Condensed version for Heads of Engineering and Product Leaders |

## Packages

| Package | npm | Purpose |
|---------|-----|---------|
| `@d-o.s/ai-artifacts` | [![npm](https://img.shields.io/npm/v/@d-o.s/ai-artifacts)](https://www.npmjs.com/package/@d-o.s/ai-artifacts) | CLI/library for versioning, composing and auditing AI artifacts |
| `@d-o.s/ai-artifacts-bench` | [![npm](https://img.shields.io/npm/v/@d-o.s/ai-artifacts-bench)](https://www.npmjs.com/package/@d-o.s/ai-artifacts-bench) | A/B testing framework for agent configurations |

### Dogfooding

This repository consumes its own packages. The `.ai-artifacts/` directory uses `@d-o.s/ai-artifacts` to generate agent instructions, skills, hooks and tool configs from upstream sources + local overlays. The `ab-test/` directory uses `@d-o.s/ai-artifacts-bench` to benchmark agent configurations.

### Release Strategy

Development happens on main. Changes accumulate until a coherent, stable version is ready for external consumers. There are no pre-release tags (beta, rc, alpha) — the only consumer during incubation is this repo itself via the workspace.

**When to release:**
- You have a set of changes ready for another repo to consume
- Typically every 1–2 weeks, not every commit

**When NOT to release:**
- CI fixes, typos, refactors that only affect this repo
- Work-in-progress iterations — test locally via the workspace

**Process:**
1. Validate: `npm run test:ai-artifacts && npm run test:ai-artifacts-bench && npm run validate:ai-artifacts`
2. Bump version in both `packages/ai-artifacts/package.json` and `packages/ai-artifacts-bench/package.json`
3. Commit: `chore: release vX.Y.Z`
4. Push to main, create a GitHub Release with tag `vX.Y.Z`
5. The workflow runs tests and publishes both packages with `--provenance` (SLSA Build L3)

**Semver:**
- `patch` — bug fixes, no API change
- `minor` — new features, backward compatible
- `major` — breaking changes

## A/B Benchmark

```bash
node ab-test/scripts/quick-run.js baseline-guidance --model opus
node ab-test/scripts/batch.js --iterations 3 --model opus
node ab-test/scripts/report.js
```

See `ab-test/README.md` for the full benchmark framework documentation and `docs/publication-ab-test-methodology.md` for the methodology paper.

## Architecture Decisions

See `docs/adr/` for individual ADRs covering: append-only overlays, step types, drift detection, zero dependencies, overlaysDir design, per-tool modules, validation, and lock file.

## License

Apache 2.0 — see `LICENSE`.
