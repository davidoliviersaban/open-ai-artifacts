# ADR-009: Local skill audit trail

**Status**: Accepted  
**Date**: 2026-05-25

## Context

We need to measure skill adoption — which skills are called, how often, and by whom. This data informs which skills to invest in and which to deprecate. A centralized solution (webhook, database) requires infra and raises privacy concerns about transmitting conversation metadata. We need a lightweight starting point.

## Decision

Implement a local audit trail using Claude Code hooks (PostToolUse on the Skill matcher). Each invocation appends a JSONL entry to `.ai-artifacts/audit.jsonl` with:

- timestamp (UTC ISO-8601)
- skill name
- session ID
- tool name (Skill, Read on SKILL.md, etc.)

The hook is project-scoped (`.claude/settings.json`), runs async, and does not block the tool call. The audit file is gitignored — each developer accumulates their own local data.

A periodic aggregation script (or future centralized collector) can consume the JSONL for reporting.

## Logged Fields

`timestamp`, `skill`, `tool`, `session_id`, `user`, `repo`.

## Known Limitations

**Caller identity (which agent invoked the skill) is not available.** Claude Code's hook payload provides `session_id`, `tool_name`, `tool_input`, `cwd`, and `transcript_path` — but no field identifying the calling agent. Since a skill can be invoked by any agent (main, subagent, custom), the `agent:` field in a skill's frontmatter only declares an association, not the actual caller. We accept this gap.

## Alternatives Considered

**Include skill origin (local vs upstream package) in each log entry.**  
Rejected for now: origin is derivable from `artifacts.yml` at analysis time (a skill with a `render.from: <package>:...` step comes from upstream, otherwise it's local). A join at aggregation avoids duplication and desync. If logs are ever sent to a central collector without access to the repo's `artifacts.yml`, revisit and add an `origin` field to each entry.

## Tool Support

| Tool | Mechanism | Status |
|------|-----------|--------|
| Claude Code | PostToolUse hook on Skill matcher (`.claude/settings.json`) | Implemented |
| OpenCode | Custom plugin via `tool.execute.after` hook | Deferred — plugin API not yet stable |

## Consequences

- Zero infra required, works offline.
- Each developer owns their data — no privacy concern.
- Fragmented view: no cross-developer aggregation without manual collection.
- Future path: add an optional webhook target that posts the same JSONL entries to a central endpoint when configured.
- OpenCode hook support can be added as a second module when their hook API stabilizes.
