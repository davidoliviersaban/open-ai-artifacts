# ADR-001: Append-only overlays, not patches

**Status**: Accepted  
**Date**: 2025-05-25

## Context

Consuming repos need to customize upstream AI instructions with repo-specific context. Options: fork upstream, patch files, or append local content.

## Decision

Overlays are appended after upstream content with a `---` separator. No line-position coupling, no merge conflicts.

## Consequences

- Overlays survive upstream restructuring without breaking.
- Cannot remove or replace upstream content, only extend it.
- Substitutions (literal string replacement) handle the rare cases where upstream wording must change.
