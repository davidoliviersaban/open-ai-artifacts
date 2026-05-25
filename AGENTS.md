# ai-artifacts Repository

## Repository Scope

This repository incubates `ai-artifacts` as an internal-public Amadeus project that may later become open-source.

It has two main areas:

| Area | Path | Purpose |
|---|---|---|
| Documentation | `docs/` | Whitepaper, rationale, adoption guidance and generated PDFs. |
| Node package | `packages/ai-artifacts/` | CLI/package for versioning, composing and auditing AI artifacts. |

## Nx Workflow

This repository is an Nx workspace.

Use these commands from the repository root:

```bash
npm run nx -- show projects
npm run nx -- build whitepaper
npm run nx -- test ai-artifacts
npm run nx -- validate ai-artifacts
```

Shortcut scripts:

```bash
npm run build:whitepaper
npm run test:ai-artifacts
npm run validate:ai-artifacts
```

## Dogfooding ai-artifacts

This repository uses its own `packages/ai-artifacts` package to generate repository instructions, local skills, opencode agents and opencode configuration from `.ai-artifacts/artifacts.yml`.

Source files live under `.ai-artifacts/files/` and `.github/overlays/`. Generated outputs include `AGENTS.md`, `CLAUDE.md`, `.opencode/opencode.json`, `.github/agent/*` and `.github/skills/*` (with symlinks at `.opencode/agent` and `.opencode/skills`).

When changing repo instructions, generated skills, generated agents or generated opencode configuration, edit `.ai-artifacts/` sources first, then run:

```bash
npm run ai-artifacts:sync
npm run validate:ai-artifacts
```

## Package Direction

- Current status: internal-public incubation inside Amadeus.
- Future direction: external reusable package, eventually open-source if APIs, packaging and governance stabilize.
- Keep package code in `packages/ai-artifacts/`.
- Keep consuming-repository configuration examples under `.ai-artifacts/` only when this repo needs to dogfood its own package.
- Avoid hard-coding Travel Storefront assumptions into package logic. TSF can remain a concrete example in docs, but not a hidden product dependency.

## Whitepaper Editorial Rules

- Write in the language requested for the document, respecting that language's punctuation, typography and grammar rules.
- Keep the tone direct, practical and management-friendly.
- Preserve the author's voice: practitioner, not academic.
- Use first person for the project experience in the document's language, for example `my test project` and `we` in English.
- Do not refer impersonally to Storefront as an external case study.
- The long version can be more detailed and manifesto-like.
- The management version must be shorter, but not reduced to tables.
- A table is a synthesis of an argument already explained. Never use a table as the only proof or as the first explanation of a concept.
- Before any important table, include a short narrative paragraph explaining the reasoning, observation or proof.
- Keep examples concrete when they prove the point: GMS Runner, agent QA, color picker, CI/CD scale-up, monorepo, PR environments.
- Do not over-condense by removing the force of the proof.
- Do not add `\newpage` manually in Markdown. Pagination is handled by `docs/whitepaper/chapter-pagebreaks.lua`.

## Core Content Decisions

- The pilot's first goal is learning, setup and adoption, not immediate ROI or faster delivery.
- Speed is a consequence of a working system, not the starting promise.
- Governance must guide, inform, help and support. It must not impose a central framework.
- Standards should become de facto standards because they prove their value.
- Prefer monorepo when possible: code, docs, CI/CD, infra, agents, skills and tests should live together when it reduces friction.
- The agentic flow is the full SDLC: ideation -> requirements -> user stories -> implementation -> validation -> release -> production.
- The setup should emerge organically through adoption, failures and learning.
- QA does not disappear. In the current prototype setup, QA is transverse expertise; in mature or critical products, stronger QA focus is required.
- Non-developers must be trained to use GitHub, PRs, PR environments and acceptance criteria.
- Code owners remain accountable for technical validation.

## Development Workflow

All code and configuration changes must follow the structured pipeline defined in `WORKFLOW.md`. Read it before starting any implementation task.

## Do Not Do

- Do not replace narrative proof with table-only content.
- Do not manually edit generated `.generated.tex` files if they appear.
- Do not introduce a central imposed framework tone.
- Do not remove concrete examples unless the same proof is preserved elsewhere.
- Do not make package behavior depend on the Travel Storefront repository layout.
