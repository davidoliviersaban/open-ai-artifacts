# ADR-005: Configurable overlaysDir, no sourceDir

**Status**: Accepted  
**Date**: 2025-05-25

## Context

Earlier design had a `sourceDir` with a `local:` prefix for referencing repo-local files. In practice, most "local sources" were just files being copied to another location — unnecessary duplication.

## Decision

- Files that don't need composition live directly at their target. No duplication.
- Only overlays (fragments appended to upstream content) need a dedicated directory.
- `overlaysDir` is configurable (default: `.ai-artifacts/overlays`).
- Removed `sourceDir` and `local:` prefix entirely.
- References use `root:` (repo root) or `<package>:` (upstream).

## Consequences

- No more redundant copies of files that could just live at their target.
- Overlays are the only real "sources" managed by the pipeline.
- Doctor warns when artifacts copy files without transformation.
