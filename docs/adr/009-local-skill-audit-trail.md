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
- invocation tool (`claude-code` or `opencode`)
- invocation origin (`user` or `agent`)
- invocation agent name when the hook payload exposes one

The hook is project-scoped (`.claude/settings.json`), runs async, and does not block the tool call. The audit file is gitignored — each developer accumulates their own local data.

A periodic aggregation script (or future centralized collector) can consume the JSONL for reporting.

## Logged Fields

`timestamp`, `skill`, `tool`, `invocation_tool`, `invocation_origin`, `invocation_agent`, `session_id`, `user`, `repo`.

## Known Limitations

**Caller identity depends on tool payloads.** Claude Code and OpenCode hooks always identify the tool integration because each hook is tool-specific. Agent identity is recorded only when the hook payload exposes a named agent/subagent. Otherwise `invocation_origin` can still distinguish direct user calls from agent calls when the payload exposes that origin, but `invocation_agent` remains `null`.

## Alternatives Considered

**Include skill origin (local vs upstream package) in each log entry.**  
Rejected for now: origin is derivable from `artifacts.yml` at analysis time (a skill with a `render.from: <package>:...` step comes from upstream, otherwise it's local). A join at aggregation avoids duplication and desync. If logs are ever sent to a central collector without access to the repo's `artifacts.yml`, revisit and add an `origin` field to each entry.

## Tool Support

| Tool | Mechanism | Status |
|------|-----------|--------|
| Claude Code | PostToolUse hook on Skill matcher (`.claude/settings.json`) | Implemented |
| OpenCode | Custom plugin via `tool.execute.after` hook | Implemented |

## Addendum: OpenCode Implementation

OpenCode should use the same local audit file and JSONL shape as Claude Code: `.ai-artifacts/audit.jsonl` with `timestamp`, `skill`, `tool`, `invocation_tool`, `invocation_origin`, `invocation_agent`, `session_id`, `user`, and `repo`. The implementation should be project-scoped and local-only by default.

The recommended mechanism is an OpenCode project plugin provided by the base framework at `packages/ai-artifacts/opencode/skill-audit.js` and installed into `.opencode/plugins/skill-audit.js`. The plugin registers `tool.execute.after` and appends one JSON object per detected skill invocation. It must be best-effort: logging failures must not fail or slow down the agentic workflow.

Detection should start conservatively:

- Treat explicit skill tool executions as direct skill invocations when the hook payload exposes a skill name or skill path.
- Treat reads of `SKILL.md` under `.opencode/skills/<name>/`, `.github/skills/<name>/`, `.claude/commands/<name>/`, or equivalent symlinked paths as indirect skill usage.
- Resolve symlinks to normalize `.opencode/skills` entries that point to `.github/skills`.
- Ignore reads outside recognized skill directories to avoid over-logging normal documentation usage.

The plugin should derive fields as follows:

| Field | Source |
|-------|--------|
| `timestamp` | `new Date().toISOString()` |
| `skill` | skill name parsed from the tool payload path or skill tool input |
| `tool` | OpenCode hook tool name |
| `invocation_tool` | Fixed by the hook implementation: `opencode` for OpenCode, `claude-code` for Claude Code |
| `invocation_origin` | `agent` when the payload exposes an agent/subagent or an agent origin marker; otherwise `user` |
| `invocation_agent` | Named agent/subagent from the hook payload when available; otherwise `null` |
| `session_id` | session identifier from the hook payload when available; otherwise `null` |
| `user` | `process.env.USER` or `process.env.USERNAME`, otherwise `null` |
| `repo` | repository root from the OpenCode plugin project/directory context |

The plugin should create `.ai-artifacts/` when needed and append with `fs.appendFile` or `fs.appendFileSync` using one compact JSON object per line. The audit file remains gitignored through `.ai-artifacts/audit.jsonl`.

OpenCode configuration should register the plugin explicitly only if auto-discovery is not sufficient:

```json
{
  "plugin": ["./.opencode/plugins/skill-audit.js"]
}
```

Claude Code should follow the same packaging model: the base framework provides the hook at `packages/ai-artifacts/claude/audit-skill.js` and installs it into `.claude/hooks/audit-skill.js`.

Known limitations for OpenCode mirror the Claude Code limitations: exact caller agent identity may not be available, and skill origin should still be derived during aggregation from `artifacts.yml` rather than duplicated in each log entry. The implementation should be revisited if OpenCode exposes a first-class skill invocation event with richer agent identity.

## Consequences

- Zero infra required, works offline.
- Each developer owns their data — no privacy concern.
- Fragmented view: no cross-developer aggregation without manual collection.
- Future path: add an optional webhook target that posts the same JSONL entries to a central endpoint when configured.
- OpenCode hook support can be added as a second module when their hook API stabilizes.
