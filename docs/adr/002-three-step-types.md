# ADR-002: Three step types — render, copy, link

**Status**: Accepted  
**Date**: 2025-05-25

## Context

Artifacts need different operations: some combine upstream + overlays, some copy verbatim, some avoid duplication via symlinks.

## Decision

Exactly three step types:

- `render` — read source, apply substitutions, append overlays, write target.
- `copy` — copy files/directories verbatim.
- `link` — create a relative symlink (no duplication).

## Consequences

- Covers all observed use cases without complexity.
- `link` avoids file duplication when multiple tools (Claude Code, OpenCode) need the same content.
- Adding a new step type requires explicit justification.
