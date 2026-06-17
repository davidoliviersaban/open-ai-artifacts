# ADR-012: Central artifact library for cross-project sharing

**Status**: Postponed — existing initiatives at Amadeus already cover this space  
**Date**: 2026-06-03

## Context

Today, `ai-artifacts` supports pulling skills and instructions from external git packages (e.g., `hve-core`). However, the current model assumes technical users who can edit `artifacts.yml`, run the CLI, and understand git versioning. Non-developers (UX designers, product managers, tech writers) cannot participate in the creation, curation, or consumption of shared agents.

A UX design discussion surfaced the following unmet needs:

1. **Discoverability** — no central place to browse available agents across the organization.
2. **Accessibility** — non-devs cannot author or modify agents without developer assistance.
3. **Reusability** — agents proven in one project are not easily portable to others.
4. **Governance** — no review process for shared agents beyond ad-hoc PR reviews.

The existing `packages` concept in `artifacts.yml` (git repos pinned by tag) provides the mechanical foundation but lacks the social and UX layers needed for broad adoption.

## Decision

Introduce a **central mono-repo** (`ai-artifacts-library` or similar) that serves as the canonical source of shared artifacts, with the following properties:

### Repository structure

```
ai-artifacts-library/
├── catalog.yml                  # Machine-readable index of all artifacts
├── artifacts/
│   ├── skills/
│   │   ├── code-review/
│   │   │   ├── SKILL.md
│   │   │   └── metadata.yml    # Category, tool compat, author, stats
│   │   └── ux-research/
│   │       ├── SKILL.md
│   │       └── metadata.yml
│   ├── instructions/
│   │   └── secure-coding/
│   │       ├── INSTRUCTIONS.md
│   │       └── metadata.yml
│   ├── agents/
│   │   └── documentation-writer/
│   │       ├── AGENT.md
│   │       └── metadata.yml
│   └── packs/                   # Curated collections
│       └── frontend-team/
│           ├── PACK.yml         # References other artifacts
│           └── metadata.yml
├── schemas/
│   └── metadata.schema.json    # JSON Schema for metadata.yml
└── .github/
    └── workflows/
        └── validate.yml        # CI: schema validation, lint, catalog rebuild
```

### Metadata schema

Each artifact carries a `metadata.yml` with structured information for discovery:

```yaml
name: code-review
description: "Structured code review with security and performance lenses"
kind: skill                      # skill | instruction | agent | hook | pack
author: team-platform
category: [development, quality]
tools: [claude-code, copilot, cursor]  # Compatible tools
tags: [review, security, performance]
version: 1.2.0
created: 2026-03-15
updated: 2026-05-28
status: stable                   # draft | stable | deprecated
```

### Catalog generation

A CI workflow rebuilds `catalog.yml` on every merge — a flat, denormalized index of all artifacts with their metadata. This file is the data source for the web app and CLI discovery features.

### Multi-channel distribution

The library serves different audiences through different channels, all built from the same source of truth:

```
                    ┌──────────────────────────┐
                    │  ai-artifacts-library    │
                    │  (mono-repo, source)     │
                    └────────┬─────────────────┘
                             │
              ┌──────────────┼──────────────────┐
              ▼              ▼                   ▼
     ┌────────────┐  ┌─────────────┐  ┌────────────────────┐
     │ npm package│  │ GitHub      │  │ Web catalog app    │
     │            │  │ Releases    │  │ (ADR-013)          │
     ├────────────┤  ├─────────────┤  ├────────────────────┤
     │ Developers │  │ CI/CD &     │  │ Non-devs           │
     │ (install,  │  │ automation  │  │ (browse, edit,     │
     │  import,   │  │ (download,  │  │  share, install    │
     │  compose)  │  │  pin, audit)│  │  via guided UX)    │
     └────────────┘  └─────────────┘  └────────────────────┘
```

#### Channel 1: npm package (developers)

Published as `@org/ai-artifacts-library` on npm (or internal registry). Enables:

```bash
# Install the full library
npm install @org/ai-artifacts-library

# Or use specific artifacts programmatically
import { catalog } from '@org/ai-artifacts-library'
import codeReview from '@org/ai-artifacts-library/skills/code-review'
```

The package exposes:
- `catalog.json` — full index for tooling integration
- Individual artifact directories importable by path
- TypeScript types for metadata schema
- A lightweight SDK for querying/filtering artifacts programmatically

Version follows semver. Breaking changes (removed/renamed artifacts) bump major. New artifacts bump minor. Content fixes bump patch.

#### Channel 2: GitHub Releases (CI/CD & pinning)

Each tagged version produces a GitHub Release with:
- **Release notes** — auto-generated changelog (new/updated/deprecated artifacts)
- **Tarball asset** — `library-v2.4.0.tar.gz` containing all artifacts (for air-gapped environments)
- **catalog.json asset** — standalone index file (for tools that only need discovery, not content)
- **Per-kind archives** — `skills-v2.4.0.tar.gz`, `agents-v2.4.0.tar.gz` (for selective download)

This supports:
- CI pipelines that download specific versions without npm
- Audit trails (pinned to exact release SHA)
- Air-gapped or restricted environments without npm access
- `ai-artifacts` CLI `fetch` using release assets as an alternative to git clone

#### Channel 3: Web catalog app (non-developers)

Detailed in ADR-013. The web app provides browse, search, edit, and guided installation — abstracting away git, npm, and CLI entirely.

For non-devs who want to **use** an artifact in their project:
1. Browse/search in the catalog → find the right artifact
2. Click "Add to my project" → guided flow:
   - Select target repository (from their GitHub access)
   - App generates the correct `artifacts.yml` snippet
   - App creates a PR in the target repo with the configuration change
   - Developer on the team reviews and merges

For non-devs who want to **create/edit** an artifact:
1. Use the web editor (Monaco split-pane, see ADR-013)
2. Submit → app creates PR in the library repo
3. Reviewer validates and merges → appears in all channels on next release

### Consumption model (ai-artifacts CLI)

Consuming repos reference the library as a package in their `artifacts.yml`:

```yaml
packages:
  - name: library
    type: git
    url: github.com/org/ai-artifacts-library
    tag: v2.4.0
    paths:
      - artifacts/skills/code-review
      - artifacts/packs/frontend-team
```

Alternative: reference via npm (requires CLI enhancement):

```yaml
packages:
  - name: library
    type: npm
    package: "@org/ai-artifacts-library"
    version: "^2.4.0"
    paths:
      - skills/code-review
      - packs/frontend-team
```

The existing `fetch` + `sync` + `drift` pipeline handles the rest unchanged. The `type: npm` source would be a new package resolver alongside the existing `type: git`.

### Governance

- All contributions go through PRs with mandatory review.
- The web app creates PRs on behalf of non-dev users (GitHub API).
- CI validates schema conformance, metadata completeness, and artifact format.
- Status lifecycle: `draft` → `stable` → `deprecated` (with deprecation notice).

### Release automation

CI on tag push:
1. Validate all artifacts (schema, format, references)
2. Build `catalog.json` (denormalized index)
3. Publish npm package (`@org/ai-artifacts-library@<version>`)
4. Create GitHub Release with assets (tarball, catalog, per-kind archives)
5. Notify web app to revalidate (webhook)

```yaml
# .github/workflows/release.yml (simplified)
on:
  push:
    tags: ['v*']
jobs:
  release:
    steps:
      - validate-artifacts
      - build-catalog
      - npm-publish
      - gh-release-create (with assets)
      - webhook-notify (web app ISR revalidation)
```

## Consequences

- **Positive**: Single source of truth with three consumption channels — every persona has an appropriate path to access artifacts.
- **Positive**: npm package enables programmatic integration, IDE extensions, and tooling built on top of the library.
- **Positive**: GitHub Releases provide immutable, auditable snapshots for compliance and air-gapped environments.
- **Positive**: Web app removes all technical barriers for non-devs while maintaining the same governance standards.
- **Positive**: Metadata-driven discovery enables filtering by category, tool, author, and popularity across all channels.
- **Positive**: Governance through PRs + CI maintains quality without blocking experimentation (drafts are visible but clearly marked).
- **Negative**: Mono-repo may grow large over time. Mitigation: sparse checkout support in `fetch`, tree-shaking in npm package.
- **Negative**: Three distribution channels to maintain in sync. Mitigation: fully automated release pipeline — one `git tag` produces all three.
- **Negative**: npm package adds a publishing step and registry dependency. Mitigation: GitHub Packages as registry (no external infra), or fallback to git-only for restricted environments.
- **Risk**: Version coordination — a breaking change to a popular artifact affects all consumers. Mitigation: semver + drift detection + deprecation lifecycle.
- **Risk**: Metadata quality depends on authors filling it correctly. Mitigation: CI enforces required fields; the web app pre-fills from templates.

## Alternatives considered

### Distributed repos with central index

Each artifact lives in its own repo. A central `index.yml` aggregates references. Rejected because:
- Too much overhead for a single skill (repo creation, CI setup, permissions).
- Harder to browse, review, and maintain consistency.
- The mono-repo can always be split later if scale demands it.

### npm-only distribution (no git source)

Publish artifacts solely as npm packages without a git mono-repo. Rejected because:
- npm is a distribution channel, not a collaboration platform — PRs, reviews, and issues live in git.
- Non-devs cannot participate via npm alone (no browse, no edit UI).
- Loses the ability to overlay/compose via `ai-artifacts` existing git-based pipeline.
- npm is one of the three channels, not the single source of truth.

### GitHub Releases with topic-based discovery

Each team publishes releases; a crawler aggregates them. Rejected because:
- Fragile discovery (depends on consistent topic usage).
- No single place to browse or enforce quality standards.
- Non-devs still can't participate in authoring.

## Relationship to other ADRs

- **ADR-001** (overlays): Consuming repos can still overlay library artifacts with local context.
- **ADR-003** (drift detection): Drift reports surface when library artifacts update.
- **ADR-004** (zero deps): The library itself has no runtime deps. The web app and DB are separate deployments.
- **ADR-007** (validation): Library CI runs schema + format validation on every PR.
- **ADR-008** (lock file): Consumers lock to specific library commits for reproducibility.
- **ADR-013** (web app): The UI layer that makes this library accessible to non-developers.
- **ADR-014** (hybrid storage + lifecycle): Defines how artifacts graduate from draft to core, and how DB and git coexist.
