# ADR-008: Lock file for reproducibility

**Status**: Accepted  
**Date**: 2025-05-25

## Context

Generated artifacts must be deterministic: running sync twice with the same config must produce the same output. We also need to know exactly which upstream commit produced current artifacts.

## Decision

`lock.yml` records for each package: requested version, resolved commit SHA, latest upstream commit. For each artifact: target path, step hashes, output content hashes.

## Consequences

- Same lock = same output, regardless of upstream changes since lock was written.
- Drift report = diff between lock's `resolved` and upstream HEAD.
- Lock file is committed to git, providing audit trail of upstream versions consumed.
- `--check` mode uses lock hashes to verify artifacts without re-fetching upstream.
