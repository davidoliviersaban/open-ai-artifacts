# ADR-004: Zero runtime dependencies

**Status**: Accepted  
**Date**: 2025-05-25

## Context

The package runs in diverse environments: developer machines, CI, Docker, corporate VDIs. Dependency installation is often slow, unreliable, or policy-restricted.

## Decision

Use only Node.js built-ins and git. No npm dependencies at runtime. Runs anywhere Node 20+ and git exist.

## Consequences

- No `node_modules` required in consuming repos beyond the package itself.
- Custom YAML parser (subset) instead of a yaml library.
- Custom crypto (built-in `node:crypto`) for content hashing.
- Limits what the tool can do, but keeps it portable and fast.
