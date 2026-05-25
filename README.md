# ai-artifacts

`ai-artifacts` is an internal-public Amadeus repository for versioning, composing and auditing AI instructions, agents, skills, tools and knowledge bases as code.

The repository has two tracks:

| Area | Path | Purpose |
|---|---|---|
| Product documentation | `docs/` | Whitepaper, rationale and adoption guidance. |
| Node package | `packages/ai-artifacts/` | CLI/package that manages AI artifacts as versioned dependencies. |

## Status

Current status: internal-public incubation inside Amadeus.

Target direction: extract into a reusable package that can later become open-source once the model, APIs, packaging and governance are stable.

## Repository Layout

```text
docs/
  whitepaper/              # Markdown sources, PDF generation and generated PDFs
packages/
  ai-artifacts/            # Node CLI/package
.ai-artifacts/             # Dogfooding playbook, local sources, overlays and lock metadata
.opencode/                 # Generated opencode config, agents and skills
```

## Nx Workspace

This repository is configured as an Nx workspace.

Common commands:

```bash
npm install
npm run nx -- show projects
npm run build:whitepaper
npm run test:ai-artifacts
npm run validate:ai-artifacts
npm run ai-artifacts:doctor
```

Equivalent Nx commands:

```bash
npm run nx -- build whitepaper
npm run nx -- test ai-artifacts
npm run nx -- validate ai-artifacts
```

## Whitepaper

The whitepaper lives in `docs/whitepaper`.

```bash
npm run build:whitepaper
```

Generated outputs:

| File | Purpose |
|---|---|
| `docs/whitepaper/whitepaper-v3.pdf` | Long-form PDF. |
| `docs/whitepaper/whitepaper-management-summary.pdf` | Management summary PDF. |

## Package

The package lives in `packages/ai-artifacts` and exposes the `ai-artifacts` CLI.

For now this package is internal-public and experimental. Do not assume stable external API compatibility yet.

## Dogfooding Setup

This repository uses its own package to manage its AI-agent artifacts. The source of truth is `.ai-artifacts/artifacts.yml`; generated outputs include `AGENTS.md`, `CLAUDE.md`, `.opencode/opencode.json`, `.opencode/agent/*` and `.opencode/skills/*`.

When changing instructions, skills, agents or opencode config, edit the source files under `.ai-artifacts/files/` or `.ai-artifacts/overlays/`, then regenerate:

```bash
npm run ai-artifacts:sync
npm run validate:ai-artifacts
```

The generated opencode setup provides repository-specific agents for research, planning, implementation, review, prompt artifact work and documentation operations. Restart opencode after changing `.opencode/opencode.json`, generated agents or generated skills.

Use `npm run ai-artifacts:doctor` to check the local Node/git/tooling context, packaged workflow/schema installation, generated instructions and opencode artifacts. Tool detection is best effort because terminals and agent hosts do not expose a shared standard marker.

## Installation Guide

See `docs/installation-guide.md` for a practical guide to implementing this repository pattern in another repo: package installation, artifact playbook layout, generated-file boundaries, opencode conventions, CI checks and adoption practices.
