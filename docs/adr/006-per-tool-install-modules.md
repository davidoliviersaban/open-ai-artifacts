# ADR-006: Per-tool install modules

**Status**: Accepted  
**Date**: 2025-05-25

## Context

Different AI tools (Claude Code, OpenCode, Copilot) expect different file layouts. The package needs to know how to check and create tool-specific artifacts without hard-coding tool knowledge in the core.

## Decision

Modular install files per tool:

- `install.claude.js` — checks/creates symlinks for `claude-*` artifacts.
- `install.opencode.js` — checks that `.opencode/` targets exist.

Doctor uses them to validate setup. Install uses them on fresh clones to recreate missing artifacts.

## Consequences

- Adding a new tool = adding a new module, no core changes.
- Doctor provides tool-specific diagnostics.
- Each module owns its own validation logic and knows what "correct" looks like for that tool.
