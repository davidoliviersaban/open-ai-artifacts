---
name: multi-feature
description: Manage parallel feature development using git worktrees. Use when the user wants to start a new feature, work on multiple features simultaneously, switch between features, or clean up finished features. Triggers on requests like "new feature", "start working on X", "switch to feature Y", "list features", "clean up feature Z", "parallel development".
disable-model-invocation: true
---

# Multi-Feature Development

Work on multiple features in parallel using `git worktree`. Each feature gets its own directory, branch, and installed dependencies — no conflicts.

## Quick Start

All commands run from the **main repo root**:

```bash
node .github/skills/multi-feature/scripts/worktree.js create feat/my-feature   # New feature from main
node .github/skills/multi-feature/scripts/worktree.js list                      # List all worktrees
node .github/skills/multi-feature/scripts/worktree.js info feat/my-feature      # Show path and status
node .github/skills/multi-feature/scripts/worktree.js remove feat/my-feature    # Clean up
```

Options:

```bash
# Branch from something other than main
node .github/skills/multi-feature/scripts/worktree.js create feat/hotfix --from origin/release

# Skip dependency installation (faster, manual install later)
node .github/skills/multi-feature/scripts/worktree.js create feat/quick --skip-install
```

## Agent Workflow

When the user asks to start a new feature:

1. Run `worktree.js create feat/<name>` from the main repo root
2. Note the `WORKTREE_PATH` from the output
3. **Use that path as `workdir` for ALL subsequent bash commands**
4. **Use absolute paths under that directory for ALL file reads/writes/edits**
5. The worktree is a full checkout — all project files are there

When switching between features:

1. Run `worktree.js list` to see all active worktrees
2. Run `worktree.js info feat/<name>` to get the path
3. Change `workdir` to the target worktree path

## Directory Layout

```
~/git/nexwave/HVE/
├── ai-artifacts/                   # Main repo
├── ai-artifacts--feat-my-feature/  # Worktree 1
├── ai-artifacts--feat-other/       # Worktree 2
```

Branch `feat/my-feature` → directory `ai-artifacts--feat-my-feature` (slashes become dashes, `ai-artifacts--` prefix).

## Key Files

- `.github/skills/multi-feature/scripts/worktree.js` — Worktree management script
- `.git/worktree-registry.json` — Registry of active worktrees (auto-managed)
