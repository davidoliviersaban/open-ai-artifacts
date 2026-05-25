# Development Workflow

This project enforces a structured workflow for any code or configuration change. Each step uses a dedicated skill that must be invoked in order.

For agent/skill/prompt management, see [WORKFLOW.agents.md](WORKFLOW.agents.md).

## Project Structure

| Path | Purpose |
|------|---------|
| `docs/whitepaper/` | Whitepaper sources (Markdown, Lua filters, PDF output) |
| `docs/adr/` | Architecture Decision Records |
| `docs/research/` | Research documents and references |
| `docs/installation-guide.md` | Installation and setup guide |
| `packages/ai-artifacts/` | Node CLI package (versioning, composing, auditing AI artifacts) |
| `.ai-artifacts/` | Dogfooding config — generates `AGENTS.md`, `CLAUDE.md`, skills, agents |

## Available Skills

| Skill | Purpose |
|-------|---------|
| `/task-research-guidelines` | Research phase — gather context and constraints |
| `/task-plan-guidelines` | Plan phase — design implementation approach |
| `/task-implement-guidelines` | Implement phase — structured code changes |
| `/task-review-checklist` | Review phase — validate before commit |
| `/doc-check` | Documentation check — ensure docs stay current |
| `/code-review` | Review code for reuse, quality and efficiency |
| `/pr-review` | Handle external PR review comments — evaluate, implement, respond |
| `/multi-feature` | Manage parallel feature development using git worktrees |
| `/package-maintainer` | TDD/ATDD refactoring loop for package JavaScript changes |
| `/ship` | Validate, commit and push in one pass |

## Pipeline

| Step | Skill | When to skip |
|------|-------|--------------|
| 1. Research | `/task-research-guidelines` | Trivial fix with obvious solution |
| 2. Plan | `/task-plan-guidelines` | Single-file change with no design decision |
| 3. Implement | `/task-implement-guidelines` | Never — always use structured implementation |
| 3b. Refactor | `/package-maintainer` | Change does not touch `packages/ai-artifacts/` |
| 4. Review | `/task-review-checklist` | Never — always validate before commit |
| 5. Doc check | `/doc-check` | No documentation exists for the changed area |

## Rules

- Steps 3 and 4 are mandatory for every change.
- Steps 1 and 2 may be skipped only for trivial, self-contained fixes (typo, single-line bug).
- Step 5 is mandatory when changes affect paths, commands, features or architecture documented in README or ADRs.
- If a step reveals issues, loop back to the appropriate earlier step before continuing.
- Do not commit or push until step 4 (and step 5 if applicable) passes cleanly.

## Ship

Once implementation and review are done, call `/ship` to validate, commit and push. It runs tests, validation, doc-check, generates the commit message and executes git commit+push in one pass.
