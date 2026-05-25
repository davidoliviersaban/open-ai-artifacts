# ADR-003: Drift detection, not auto-update

**Status**: Accepted  
**Date**: 2025-05-25

## Context

Upstream packages evolve. The tool must communicate changes without silently applying them.

## Decision

The tool reports when upstream moved ahead of the locked version. Humans decide when and how to update. No auto-accept of upstream changes.

## Consequences

- Lock file guarantees reproducibility: same lock = same output.
- Drift reports make upstream movement visible in CI and reports.
- Updates require explicit human action: run sync, review diff, commit.
- AI instructions that control agent behavior are never changed without review.
