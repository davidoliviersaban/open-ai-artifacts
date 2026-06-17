# ai-artifacts

## Hard Rules

These are non-negotiable. If any rule conflicts with a task request, stop and ask.

### Git Safety

- Never push to `main`.
- Before any `git push`, run `git branch --show-current` and abort if it returns `main`.
- Never force-push unless explicitly asked.
- All work targets `main` through a PR.

### Worktree Requirement

- Never make code changes in the main repo checkout. Always use a worktree.
- Create worktrees with `node .github/skills/multi-feature/scripts/worktree.js create feat/<name> --from upstream/main`.
- All file reads, writes, and bash commands must use the worktree path as working directory.

### Skill Invocation

- Never execute skill steps manually. Always invoke skills via the slash command mechanism (`/skill-name`).
- Executing `git commit`, `git push`, `npm run validate:ai-artifacts` by hand does NOT count as using the skill. The skill must be invoked so it enforces the full process and leaves an audit trail.
- Mandatory skills for every change: `/multi-feature` (before starting), `/ship` (to deliver).
- Never skip a skill because you "already know" how to do it. The skill is the process, not a how-to.

### Other Absolutes

- Never commit secrets or API keys.
- Never manually edit generated files (`AGENTS.md`, `CLAUDE.md`, `.opencode/` contents, `.github/copilot-instructions.md`). Edit sources and run `npm run ai-artifacts:sync`.
- Always follow existing patterns and keep PR scope tight.
- Write tests for package code changes. Use `/package-maintainer` for TDD.

## Project Workflow

Read `.github/WORKFLOW.md` for the full development pipeline and `.github/WORKFLOW.agents.md` for agent/skill management.

### Pipeline (every change)

| Step | Skill | Skip only if |
|------|-------|--------------|
| 0. Branch | `/multi-feature` | Never |
| 1. Research | `/task-research-guidelines` | Trivial fix with obvious solution |
| 2. Plan | `/task-plan-guidelines` | Single-file change with no design decision |
| 3. Implement | `/task-implement-guidelines` | Never |
| 3b. Refactor | `/package-maintainer` | Change does not touch `packages/ai-artifacts/` |
| 4. Review | `/task-review-checklist` | Never |
| 5. Doc check | `/doc-check` | No documentation exists for the changed area |
| 6. Ship | `/ship` | Never |

## Skills And Workflows

- `multi-feature`: create/list/remove git worktrees for parallel development.
- `ship`: validate, commit, push, and create PR in one pass.
- `task-research-guidelines`: research phase — gather context and constraints.
- `task-plan-guidelines`: plan phase — design implementation approach.
- `task-implement-guidelines`: implement phase — structured code changes.
- `task-review-checklist`: review phase — validate before commit.
- `doc-check`: verify documentation stays current with code changes.
- `package-maintainer`: TDD/ATDD refactoring loop for package JavaScript.
- `pr-review`: handle external PR review comments.
- `skill-audit`: audit skills for quality, safety, and composability.
- `whitepaper-editor`: whitepaper editorial assistance.
- `prompt-build` / `prompt-analyze` / `prompt-refactor`: prompt engineering pipeline.
- `add-skill`: scaffold and register new skills (with RPI research step).
- `bench-run`: run A/B benchmark matrix across models and variants, generate decision report.

## Repository Scope

This repository incubates `ai-artifacts` as an internal-public Amadeus project that may later become open-source.

| Area | Path | Purpose |
|------|------|---------|
| Documentation | `docs/` | Whitepaper, rationale, adoption guidance and generated PDFs |
| Node package | `packages/ai-artifacts/` | CLI/package for versioning, composing and auditing AI artifacts |
| Dogfooding | `.ai-artifacts/` | Generates repo instructions, skills, agents from upstream + overlays |

## Nx Workspace

```bash
npm run build:whitepaper
npm run test:ai-artifacts
npm run validate:ai-artifacts
```

## Dogfooding ai-artifacts

This repository uses its own `packages/ai-artifacts` package to generate repository instructions, local skills, opencode agents and opencode configuration from `.ai-artifacts/artifacts.yml`.

Source files live under `.github/overlays/`. Generated outputs include `AGENTS.md`, `CLAUDE.md`, `.opencode/opencode.json`, `.github/agent/*` and `.github/skills/*` (with symlinks at `.opencode/agent` and `.opencode/skills`).

When changing generated artifacts, edit sources first, then run:

```bash
npm run ai-artifacts:sync
npm run validate:ai-artifacts
```

## Package Direction

The `ai-artifacts` package is incubating internally and targeting future open-source release. Keep package code generic — no hard-coded assumptions about any single consuming repository.

## Documentation Maintenance

When adding or changing public API, CLI behavior, config schema, or validation rules, update the closest existing documentation in the same commit.

Prefer updating existing docs over creating new files. Keep documentation concise and factual — one short section is better than a new page.

Documentation is not needed for: internal refactors, test-only changes, or cleanup with no observable behavior change.

## Working Style

- Implement the issue fully before requesting review unless blocked.
- If requirements are ambiguous, make a reasonable assumption and document it in the PR.
- If validation fails, attempt to fix it before asking for help.
- Do not fix unrelated problems; mention them separately.
- Prefer the smallest correct change.
- Follow existing patterns in the same directory.
