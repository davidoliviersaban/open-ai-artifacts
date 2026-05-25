# ADR-007: Validation as a first-class concern

**Status**: Accepted  
**Date**: 2025-05-25

## Context

Generated AI instructions can silently go stale, contain broken links, or accumulate untracked files. CI needs to catch these problems.

## Decision

Multiple validation layers:

- `--check` mode verifies artifacts match their sources (CI gate).
- Risk assessment flags untracked files in artifact target directories.
- Markdown hygiene: frontmatter presence, broken relative links, tab characters.
- Doctor validates the full setup: node version, git, config, lock, overlays, installed files, per-tool checks.
- Risk policy (`failOn`) can fail CI on detected risk levels.

## Consequences

- Validation runs in CI and blocks PRs that ship stale or broken instructions.
- Doctor gives actionable diagnostics on fresh clones or misconfigured repos.
- Risk policy gives repo owners control over how strict enforcement is.
