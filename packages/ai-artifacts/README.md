# ai-artifacts

Dependency management for AI prompts, skills, and instructions. Tracks upstream sources, applies local overlays, and detects drift.

> **Status**: Incubating as an internal-public Amadeus package under `packages/ai-artifacts/`. Repository-specific configuration lives in `.ai-artifacts/` in consuming repositories.

This directory is a self-contained package named `@amadeus-nexwave/ai-artifacts`. It has its own `package.json` with `bin` entrypoints and is registered as a workspace package while it incubates here.

## Why

AI coding agents (Copilot, Claude Code, Cursor, etc.) rely on repository-level instruction files (`CLAUDE.md`, `.github/copilot-instructions.md`, skills, prompts) to understand project conventions. Managing these files by hand creates real problems:

1. **Silent drift** -- upstream prompt libraries evolve, but local copies don't update themselves. You fall behind without knowing it.
2. **Tool fragmentation** -- Claude, Copilot, and Cursor each need their own format. Copy-pasting between them leads to divergence and inconsistency.
3. **No provenance** -- it's unclear which version of an upstream prompt generated a local file, or whether someone manually edited it after generation.
4. **Unsafe customization** -- forking an upstream prompt means losing future updates; editing in place means losing the upstream baseline.

`ai-artifacts` treats AI instructions like versioned dependencies: pin an upstream package, overlay repository-specific context, generate tool-specific outputs, and detect when upstream moves -- without auto-accepting changes.

## What it does

```text
upstream source (HVE Core, web-quality-skills, …)
+ local overlays (TSF-specific guidance)
+ substitutions (tool-neutral wording)
= generated artifact (.github/skills/*, CLAUDE.md, …)
```

The CLI pins upstream versions, locks exact commits, generates final artifacts consumed by AI agents, and reports when upstream moves.

## Commands

```bash
npm run ai-artifacts:fetch      # Clone/update upstream sources, write lock
npm run ai-artifacts:sync       # Generate artifacts from sources + overlays
npm run ai-artifacts:sync -- --check  # Verify artifacts are up to date (CI)
npm run ai-artifacts:drift      # Report upstream drift
npm run ai-artifacts:risk       # Report risk assessment
npm run validate:ai-artifacts   # All checks in one pass
```

## Configuration

All configuration lives in `.ai-artifacts/artifacts.yml`:

```yaml
version: 1

packages:
  hve-core:
    type: git
    repo: https://github.com/microsoft/hve-core.git
    version: hve-core-v3.2.2

artifacts:
  - id: task-research-guidelines
    kind: skill
    targetDir: .github/skills/task-research-guidelines
    steps:
      - render:
          from: hve-core:.github/prompts/hve-core/task-research.prompt.md
          to: SKILL.md
          overlays:
            - common/tool-neutral.md
            - rpi/task-research.md
          substitutions:
            - from: .copilot-tracking/
              to: .ai-tracking/
```

## Directory layout

```
.ai-artifacts/
  artifacts.yml          # Playbook: packages + artifacts + steps
  lock.yml               # Pinned commits + content hashes
  vendor/                # Cloned upstream repos (gitignored)
  overlays/              # Local markdown appended to upstream content
    common/              #   Tool-neutral overlay
    rpi/                 #   RPI workflow overlays (research, plan, implement, review)
    web-quality/         #   Web quality audit overlays
  files/                 # Local source files for artifacts using local: refs
  reports/               # Generated drift + risk reports
  schemas/               # JSON Schema for artifacts.yml (optional)

packages/ai-artifacts/
  package.json           # npm package metadata and bin entrypoints
  cli.js                 # Entry point
  app.js                 # Core logic (fetch, sync, drift, risk, validate)
  lib.js                 # Shared utilities (hashing, git, file I/O)
  workflows/             # GitHub workflow templates shipped with the package
  templates/             # Starter templates copied or adapted by installed repos
  schemas/               # JSON Schema grammar for artifacts.yml
  docs/                  # Package design, CI, and future roadmap
  install.js             # Installs packaged automation into repo locations
  *.test.js              # Test suite
```

## Key concepts

| Concept | Description |
|---------|-------------|
| **Package** | Upstream git repo pinned to a version (tag, branch, SHA) |
| **Artifact** | One generated file or directory, produced by ordered steps |
| **Render step** | Read source → apply substitutions → append overlays → write target |
| **Copy step** | Copy files/directories verbatim into target |
| **Overlay** | Local markdown appended after upstream content |
| **Lock file** | Records requested version, resolved commit, content hashes |
| **Drift report** | Shows when upstream moved since last generation |

## Design principles

- **No runtime dependencies** — uses only Node.js built-ins and git.
- **Append-only overlays** — more stable than patches, no line-position coupling.
- **Trust agent knowledge** — overlays contain only repo-specific context (NFRs, output paths, constraints), not universal best practices the agent already knows.
- **Drift detection, not auto-update** — reports drift; humans decide when to update.
- **Generated files stay clean** — no inline generated header; provenance and generated target paths live in `lock.yml` and reports.
- **Delivery includes automation** — workflow templates live in `packages/ai-artifacts/workflows/` and installed copies must stay identical.

## Install hooks

`npm install` runs `node packages/ai-artifacts/install.js` through the root `postinstall` script. This installs packaged automation into repo-specific locations:

| Packaged source | Installed path |
|-----------------|----------------|
| `packages/ai-artifacts/workflows/ai-artifacts.yml` | `.github/workflows/ai-artifacts.yml` |
| `packages/ai-artifacts/schemas/artifacts.schema.json` | `.ai-artifacts/schemas/artifacts.schema.json` |

Run `npm run ai-artifacts:install -- --check` to verify installed files match the packaged sources without writing.

## Templates And Grammar

- `templates/artifacts.yml` is the starter playbook for repositories installing the package.
- `schemas/artifacts.schema.json` is the JSON Schema grammar for `artifacts.yml`.
- Installed repositories should reference the schema from `.ai-artifacts/artifacts.yml` with `# yaml-language-server: $schema=./schemas/artifacts.schema.json`.

## Tests

```bash
npm run test:ai-artifacts
```

## Package Docs

- `docs/DESIGN.md` - architecture and package boundaries
- `docs/CI-AND-HOOKS.md` - installed workflow, npm install behavior, CI checks
- `docs/SEMANTIC-MERGE-DESIGN.md` - future semantic overlays and agent-assisted merge design

## Extraction plan

This tool will be extracted to its own repository when:
- Another project needs it
- Update automation becomes broadly useful
- The CLI grows beyond this repo's scope

At external open-source extraction, `packages/ai-artifacts/` becomes the package source; `.ai-artifacts/` stays repo-local configuration in consuming repositories.
