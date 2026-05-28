# Research: A/B Test Framework Architecture Split

**Date**: 2026-05-28
**Branch**: feat/ab-test-architecture (from feat/benchmark-baseline-protocol-clean)
**Question**: Which parts of the ab-test framework stay project-specific vs. move to the package?

## Current Architecture

The entire framework lives in `ab-test/` at the repo root:

```
ab-test/
├── challenges/          # Task definitions (project-specific scenarios)
├── variants/            # Agent configurations (project-specific configurations)
├── baseline.json        # Baseline protocol (project-specific)
├── runs/                # Run outputs (gitignored)
├── scripts/
│   ├── lib.js           # Pure scoring/aggregation logic
│   ├── runner.js        # Creates worktrees, runs Claude, captures output
│   ├── score.js         # Applies challenge criteria to run output
│   ├── batch.js         # Matrix orchestration (variants × challenges × iterations)
│   ├── report.js        # Aggregates scores, renders comparison tables
│   ├── analyze-run.js   # Debug log parsing, diff analysis
│   ├── quick-run.js     # One-shot variant run
│   ├── check-delivery.js, check-doc-touch.js  # Custom evaluators
│   └── opencode-*.js    # OpenCode-specific runners
└── README.md, ANALYSIS.md, RESULTS.md
```

### Separation of Concerns (Current)

| Concern | Files | Generic? |
|---------|-------|----------|
| **Scenario definition** | `challenges/*/challenge.json` | Format is generic; content is project-specific |
| **Variant definition** | `variants/*/variant.json` | Format is generic; content is project-specific |
| **Runner** | `runner.js` | Mostly generic (worktree creation, Claude invocation, diff capture) with project-specific worktree prep (strips specific dirs) |
| **Evaluator** | `score.js`, `check-*.js` | `score.js` is generic (runs arbitrary commands); `check-*` are project-specific evaluators |
| **Scoring math** | `lib.js` (computeScore, summarizeVariant, etc.) | Fully generic |
| **Orchestration** | `batch.js` | Fully generic |
| **Reporting** | `report.js` | Fully generic |
| **Baseline protocol** | `baseline.json` | Format is generic; values are project-specific |

## External Framework Patterns

### Promptfoo
- **Scenarios**: YAML/JSON config files (declarative)
- **Runner**: Generic multi-provider CLI (`promptfoo eval`)
- **Evaluators**: Plugin directory; red teaming extensions; assertion-based
- **Key insight**: Config-driven simplicity, runs 100% locally

### OpenAI Evals
- **Scenarios**: YAML config + JSON data registry
- **Runner**: Generic `oaieval` CLI
- **Evaluators**: Template-based (basic matching, model-graded); custom eval via Python classes
- **Key insight**: Registry pattern for community contributions without code changes

### Braintrust
- **Scenarios**: Versioned datasets + pluggable scorers
- **Runner**: Multi-SDK execution (Python, TS, Go, Ruby, C#)
- **Evaluators**: Multi-modal scorers (automated LLM/code, human reviewers)
- **Key insight**: Framework-agnostic; hybrid deployment; MCP integration

### Inspect AI
- **Scenarios**: Python tasks combine datasets, solvers, and scorers via `@task` decorator
- **Runner**: Generic multi-provider runner with sandboxing (Docker/K8s/Modal)
- **Evaluators**: Solver chains + 200+ pre-built evaluators; Python package extensibility
- **Key insight**: Clean pipeline: Dataset → Solver chain → Model → Scorer → Report

## Analysis: What's Generic vs. Project-Specific

### Clearly Generic (Package Material)

1. **Scoring math** (`lib.js`): `computeScore`, `summarizeVariant`, `determineWinner`, `criterionPassRates`, `avg`, `median`, `groupBy` — pure functions with zero project knowledge.

2. **Runner engine** (`runner.js` core): worktree lifecycle, Claude/agent invocation, flag building, diff capture, usage parsing — parameterizable by project.

3. **Batch orchestration** (`batch.js` core): matrix generation, concurrency control, sequential/parallel dispatch — fully generic.

4. **Report generation** (`report.js`): aggregation, baseline grouping, table rendering — fully generic.

5. **Baseline protocol** format: the schema (id, created_at, variants, models) is reusable.

### Clearly Project-Specific

1. **Challenge content**: The actual prompts, acceptance criteria commands, and scoring weights are tied to this codebase.

2. **Variant content**: The `claude_md_content`, disabled skills, specific model choices are this project's configurations.

3. **Worktree preparation rules** (`prepareWorktree`): Stripping `ab-test/`, `.claude/`, specific ADR files, trimming CLAUDE.md sections — these are project-specific isolation rules.

4. **Custom evaluators** (`check-delivery.js`, `check-doc-touch.js`): Project-specific scoring scripts.

5. **OpenCode runners** (`opencode-*.js`): Tool-specific adapters that may not generalize.

### Gray Area (Plugin Candidates)

1. **Worktree preparation**: The *mechanism* (create worktree, apply isolation, install hooks) is generic; the *rules* (what to strip, what to keep) are project-specific. → **Plugin: `prepareWorktree(config)` where config comes from the project.**

2. **Agent adapters**: Claude Code runner vs. OpenCode runner vs. future tools. → **Plugin: `AgentAdapter` interface with `run(worktree, prompt, flags)` → `{stdout, stderr, elapsed, exitCode}`.**

3. **Score evaluator commands**: `score.js` already runs arbitrary shell commands from `challenge.json`. This IS the plugin interface — it just needs to be documented and standardized.

## Recommendation: Package as `packages/ai-artifacts-bench`

### Architecture

```
packages/ai-artifacts-bench/          # NEW package in the monorepo
├── lib.js                            # Scoring math (from ab-test/scripts/lib.js)
├── runner.js                         # Generic runner engine
├── batch.js                          # Orchestrator
├── report.js                         # Report generator
├── adapters/
│   ├── claude-code.js                # Claude Code adapter
│   └── opencode.js                   # OpenCode adapter (future)
├── schemas/
│   ├── challenge.schema.json         # Challenge format validation
│   ├── variant.schema.json           # Variant format validation
│   └── baseline.schema.json          # Baseline format validation
├── cli.js                            # CLI entry point
└── package.json

ab-test/                              # Stays at repo root (project-specific dogfooding)
├── challenges/                       # THIS project's challenges
├── variants/                         # THIS project's variants
├── baseline.json                     # THIS project's baseline
├── prepare.js                        # Project-specific worktree prep (plugin)
├── evaluators/                       # Project-specific evaluator scripts
│   ├── check-delivery.js
│   └── check-doc-touch.js
└── runs/                             # Output (gitignored)
```

### Plugin Interface

The runner accepts a `prepare` function and an `adapter`:

```javascript
// Project-level prepare.js — the ONLY project-specific code needed
module.exports = {
  prepareWorktree(worktree, variant, challenge) {
    // Strip project-specific dirs, modify CLAUDE.md, etc.
  }
}
```

```javascript
// Package adapter interface
class AgentAdapter {
  run(worktree, prompt, options) → { stdout, stderr, elapsed, exitCode }
  parseUsage(raw) → { total_tokens, cost_usd, elapsed_seconds, model }
}
```

```javascript
// Challenge format (already generic — no change needed)
{
  "id": "...",
  "prompt": "...",
  "acceptance_criteria": [{ "id": "...", "command": "..." }],
  "scoring": { "criteria_weight": 0.5, "efficiency_weight": 0.3, "code_quality_weight": 0.2 }
}
```

### Why This Over Alternatives

| Option | Pros | Cons |
|--------|------|------|
| **A. Keep project-local** | Zero effort now | No reuse; duplicate in every project; can't share scoring improvements |
| **B. Central in `packages/ai-artifacts`** | Single package | Muddies the core package's scope (artifact management ≠ benchmarking) |
| **C. Separate package `packages/ai-artifacts-bench`** | Clean separation; reusable; dogfoodable | More files; new package to maintain |
| **D. Plugin architecture only** | Maximum flexibility | Over-engineered for 1-2 consumers; needs runtime discovery |

**Recommendation: Option C** — a sibling package `packages/ai-artifacts-bench` that provides the engine, with `ab-test/` staying at repo root as the dogfooding consumer.

This matches how `packages/ai-artifacts` is dogfooded by `.ai-artifacts/artifacts.yml` — the package is generic, the configuration is project-specific.

### Migration Path

1. Create `packages/ai-artifacts-bench/` with the generic scripts
2. Extract project-specific prep/evaluation into `ab-test/prepare.js` and `ab-test/evaluators/`
3. `ab-test/` becomes a thin consumer: `baseline.json`, challenges, variants, and a one-liner config that points to the package
4. The package CLI: `ai-artifacts-bench run --config ab-test/config.json`

### Minimal Plugin Contract

```javascript
// ab-test/config.json (project-level)
{
  "challengesDir": "ab-test/challenges",
  "variantsDir": "ab-test/variants",
  "baselineFile": "ab-test/baseline.json",
  "runsDir": "ab-test/runs",
  "prepare": "ab-test/prepare.js",
  "adapter": "claude-code"
}
```

The package provides scoring math, orchestration, reporting, and the Claude Code adapter. The project provides challenges, variants, baseline, and worktree preparation rules.

### Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Premature abstraction (only 1 consumer today) | Start with extract-and-wrap: move code, keep interface minimal, don't add features |
| Breaking existing workflows | Keep `ab-test/scripts/*.js` as thin wrappers that delegate to the package during transition |
| Over-engineering the plugin system | Only `prepare` is a plugin initially; evaluators already use shell commands |
| Test isolation complexity | Runner tests already use temp worktrees; no change needed |

## Decision: ab-test Moves Under `packages/`

Per user direction: the ab-test folder should live under `packages/` as a proper monorepo package, dogfooded the same way `packages/ai-artifacts` is dogfooded via `.ai-artifacts/artifacts.yml`.

### Target Layout

```
packages/ai-artifacts-bench/          # Generic benchmark engine (the package)
├── lib.js                            # Scoring math
├── runner.js                         # Generic runner engine (parameterized prep)
├── batch.js                          # Orchestrator
├── report.js                         # Report generator
├── adapters/
│   └── claude-code.js                # Claude Code adapter
├── schemas/
│   ├── challenge.schema.json
│   ├── variant.schema.json
│   └── baseline.schema.json
├── cli.js                            # CLI: ai-artifacts-bench run/score/report
├── package.json
└── *.test.js

ab-test/                              # Dogfooding consumer (project-specific)
├── challenges/                       # THIS repo's challenges
├── variants/                         # THIS repo's variants
├── baseline.json                     # THIS repo's baseline config
├── prepare.js                        # Worktree prep plugin (what to strip)
├── config.json                       # Points to package + declares paths
└── runs/                             # Output (gitignored)
```

### Dogfooding Model

Same pattern as the existing setup:
- `packages/ai-artifacts` → dogfooded by `.ai-artifacts/artifacts.yml`
- `packages/ai-artifacts-bench` → dogfooded by `ab-test/config.json`

Both are registered as Nx workspace packages and share `node_modules/`.

### Open Questions for Planning

1. Should we support multiple adapters now or just Claude Code?
   → **Claude Code only** initially; OpenCode is unreliable (sqlite deadlock). Design the interface, don't implement the second adapter yet.

2. Should `prepare.js` be a module export or a CLI script?
   → **Module export** (`module.exports = { prepareWorktree }`) — simpler, testable, no IPC overhead.

3. Should the package own the schemas or should they stay in `ab-test/`?
   → **Package owns schemas** (validation is generic); project owns *instances* of those schemas.

4. What Nx targets does the package need?
   → `test`, `run` (delegates to cli.js), `report`. Registered in workspace `package.json`.
