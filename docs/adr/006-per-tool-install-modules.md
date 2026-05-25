# ADR-006: Per-tool install modules

**Status**: Accepted  
**Date**: 2025-05-25

## Context

Different AI tools (Claude Code, OpenCode, Copilot) expect different file layouts. The package needs to know how to check and create tool-specific artifacts without hard-coding tool knowledge in the core.

## Decision

Modular install files per tool:

- `claude/install.js` — checks/creates symlinks for `claude-*` artifacts.
- `opencode/install.js` — checks that `.opencode/` targets exist.

Tool-specific framework files live with their install module. Claude Code hooks are packaged under `claude/`; OpenCode plugins are packaged under `opencode/`. Installing the package copies these framework-provided files into the consuming repository's tool-specific locations.

Doctor uses them to validate setup. Install uses them on fresh clones to recreate missing artifacts.

## Consequences

- Adding a new tool = adding a new module, no core changes.
- Doctor provides tool-specific diagnostics.
- Each module owns its own validation logic and knows what "correct" looks like for that tool.
