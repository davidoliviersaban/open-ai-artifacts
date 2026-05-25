---
name: doc-check
description: 'Verify documentation is up to date with current code changes before commit/push'
argument-hint: '[scope=staged|all]'
---

# Documentation Freshness Check

Verify that documentation accurately reflects the current state of the code, especially recent changes. Run this before committing or pushing to catch stale docs.

## Process

1. **Identify changes**: Run `git diff --cached --name-only` (staged) or `git diff HEAD --name-only` (all uncommitted) to see what changed.

2. **Determine impact**: For each changed file, assess whether it affects documented behavior:
   - Package code changes (`packages/ai-artifacts/`) → check README commands, ADRs
   - Config changes (`.ai-artifacts/artifacts.yml`, `.gitignore`) → check README layout section
   - Workflow changes (`.github/workflows/`) → check README workflow section
   - New/removed files → check README layout, any path references in docs
   - ADR-relevant changes → check if an ADR needs updating or creating

3. **Verify documentation**: For each impacted doc, check:
   - File paths referenced still exist
   - Commands documented still match `package.json` scripts
   - Directory layout matches reality
   - New features/breaking changes are mentioned
   - Removed features are no longer documented

4. **Report**: List findings as:
   - ✓ Doc X is up to date
   - ✗ Doc X needs update: [specific issue]
   - ? Doc X may need review: [uncertain impact]

## Inputs

* ${input:scope:staged}: Scope of changes to check against:
  * staged — only check against staged changes (pre-commit)
  * all — check against all uncommitted changes (pre-push)

## Rules

- Do NOT make changes automatically. Report findings and let the user decide.
- Do NOT check generated files (AGENTS.md, .opencode/skills/*, .opencode/agent/*) — those are managed by ai-artifacts sync.
- Do NOT check whitepaper content — that has its own editorial process.
- Focus on structural accuracy: paths, commands, layout descriptions, feature presence.
- Be concise. Only flag real discrepancies, not style preferences.
