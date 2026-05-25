---
name: pipeline
description: 'Orchestrate the full development pipeline for the current feature. Tracks progress, invokes skills in order, and produces a summary at the end. Use when the user says "run the pipeline", "next step", or "what is left".'
argument-hint: '[status] [next] [summary]'
disable-model-invocation: true
---

# Pipeline

Orchestrate the full SDLC pipeline for a feature, tracking which skills have been invoked and what remains.

## Process

### If called with `status` or no argument:

1. Read `.ai-artifacts/audit.jsonl` and `.ai-artifacts/tools.audit.jsonl` to find all skill/script invocations for the current branch.
2. Map invocations to pipeline steps:
   | Step | Skill match |
   |------|-------------|
   | 0. Branch | `multi-feature` or `start` |
   | 1. Research | `task-research-guidelines` |
   | 2. Plan | `task-plan-guidelines` |
   | 3. Implement | `task-implement-guidelines` |
   | 3b. Refactor | `package-maintainer` |
   | 4. Review | `task-review-checklist` |
   | 5. Doc check | `doc-check` |
   | 6. Ship | `ship` |

3. Display progress:
   ```
   Pipeline: feat/my-feature
   [x] 0. Branch        — /multi-feature (2026-05-25T10:00)
   [x] 1. Research      — /task-research-guidelines (2026-05-25T10:05)
   [x] 2. Plan          — /task-plan-guidelines (2026-05-25T10:15)
   [ ] 3. Implement     — /task-implement-guidelines
   [ ] 4. Review        — /task-review-checklist
   [ ] 5. Doc check     — /doc-check
   [ ] 6. Ship          — /ship
   ```

### If called with `next`:

1. Determine the next uncompleted step from the status above.
2. Invoke the corresponding skill automatically.
3. After the skill completes, update status and report.

### If called with `summary`:

1. Read `.ai-artifacts/audit.local.jsonl` (feature-scoped entries only).
2. Count invocations per skill and per script.
3. Produce a feature summary:
   ```
   ## Feature Summary: feat/my-feature

   **Duration:** 45 minutes (10:00 — 10:45)
   **Skills invoked:** 6 total
   **Scripts called:** 3 total

   ### Skill usage
   | Skill | Count |
   |-------|-------|
   | /multi-feature | 1 |
   | /task-research-guidelines | 1 |
   | /task-plan-guidelines | 1 |
   | /task-implement-guidelines | 2 |
   | /task-review-checklist | 1 |
   | /ship | 1 |

   ### Script usage
   | Script | Count |
   |--------|-------|
   | worktree.js | 2 |
   | validate.js | 1 |

   ### Pipeline steps completed
   - [x] Branch — created worktree feat/my-feature
   - [x] Research — gathered context on X
   - [x] Plan — designed approach Y
   - [x] Implement — 3 files changed, 45 insertions
   - [x] Review — all checks passed
   - [x] Doc check — no updates needed
   - [x] Ship — PR #42 created

   ### Audit trail
   | Time | Type | Action |
   |------|------|--------|
   | 10:00 | skill | /multi-feature create |
   | 10:01 | script | worktree.js create |
   | ... | ... | ... |
   ```

## Rules

- This skill is informational and orchestrating — it never modifies code directly.
- When invoking `next`, it MUST use the slash command (`/skill-name`), never call scripts directly.
- The summary should be generated before `/ship` so it can be included in the PR description.
- If the audit trail is empty or incomplete, report what's missing and ask if steps were done outside the pipeline.
