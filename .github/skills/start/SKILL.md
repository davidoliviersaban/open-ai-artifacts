---
name: start
description: 'Pre-flight check before starting work. Confirms scope, creates worktree, and reminds the pipeline. Use when starting any new task, feature, or fix.'
argument-hint: '<short description of the work>'
disable-model-invocation: true
---

# Start

Pre-flight checkpoint before any implementation work begins.

## Process

1. **Confirm scope**: Ask the user to describe the work in one sentence. If ambiguous, ask clarifying questions until the scope is tight (1 subject = 1 worktree = 1 PR).

2. **Check current state**: Run `git branch --show-current`. If not on `main`, warn that there may already be work in progress. Run `node .github/skills/multi-feature/scripts/worktree.js list` to show existing worktrees.

3. **Create worktree**: Once scope is confirmed, invoke `/multi-feature` to create the worktree. The branch name should be derived from the scope description (e.g., "fix audit trail" -> `feat/fix-audit-trail`).

4. **Remind pipeline**: Display the pipeline steps that apply to this work:

   ```
   Pipeline for this change:
   [ ] 0. Branch        — /multi-feature (done)
   [ ] 1. Research      — /task-research-guidelines
   [ ] 2. Plan          — /task-plan-guidelines
   [ ] 3. Implement     — /task-implement-guidelines
   [ ] 4. Review        — /task-review-checklist
   [ ] 5. Doc check     — /doc-check
   [ ] 6. Ship          — /ship
   ```

   Ask which steps can be skipped (per the skip rules in CLAUDE.md) and confirm before proceeding.

5. **Set environment**: Export `SKILL_INVOCATION=1` for all subsequent script calls in this session.

## Rules

- Never skip this skill when starting new work. It is step 0.
- If the user says "just do it" or "skip the ceremony", still create the worktree but compress the reminder to one line.
- If the scope covers multiple unrelated subjects, ask the user to split. One start = one subject.
- The worktree MUST be created before any code changes happen.
