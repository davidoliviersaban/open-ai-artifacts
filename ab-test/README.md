# A/B Test Framework for Agent Configurations

Compare different agent configurations (CLAUDE.md, skills, system prompts) on identical coding tasks.

## Structure

```
ab-test/
├── challenges/       # Task definitions (the "what to build")
├── variants/         # Agent configurations (the "how to build it")
├── runs/             # Output from each run (auto-generated, gitignored)
├── scripts/
│   ├── lib.js        # Pure logic (scoring, aggregation, parsing)
│   ├── lib.test.js   # Tests for lib.js
│   ├── runner.js     # Launches a single Claude Code run
│   ├── runner.test.js# Tests for runner logic
│   ├── score.js      # Scores a completed run against acceptance criteria
│   ├── score.test.js # Tests for scoring logic
│   ├── batch.js      # Runs all variants × N iterations
│   ├── quick-run.js  # One variant, score immediately
│   ├── report.js     # Aggregates scores into comparison table
│   └── cleanup.js    # Remove worktrees and optionally run data
└── README.md
```

## Quick Start

```bash
# Run tests
node --test ab-test/scripts/lib.test.js ab-test/scripts/runner.test.js ab-test/scripts/score.test.js

# Quick run one variant
node ab-test/scripts/quick-run.js b-bare-agent --model sonnet

# Full batch: all variants × 3 iterations
node ab-test/scripts/batch.js --iterations 3 --model sonnet

# Report only (on existing runs)
node ab-test/scripts/report.js

# Cleanup worktrees
node ab-test/scripts/cleanup.js        # worktrees only
node ab-test/scripts/cleanup.js --all  # worktrees + run data
```

## Concepts

### Challenge

A task definition with:
- A prompt (what to tell the agent)
- Acceptance criteria (independently checkable assertions)
- Scoring weights (criteria adherence, efficiency, code quality)

### Variant

An agent configuration:
- `claude_md`: `inherit` | `none` | `custom` — controls CLAUDE.md in the worktree
- `bare`: whether to run with `--bare` (no hooks, no LSP, no auto-discovery)
- `disable_skills`: whether to pass `--disable-slash-commands`
- `system_prompt`: optional system prompt override
- `model`: model override

### Isolation

The agent never sees `ab-test/` — it's deleted from the worktree before the run. Scoring happens in a separate worktree after the run completes. The referee is the test suite, not the agent.

### Scoring

Final score = weighted combination of:
- **Criteria adherence** (50%): pass/fail on each acceptance criterion
- **Efficiency** (30%): token usage + wall-clock time vs budget
- **Code quality** (20%): existing test suite passes (no regressions)

## OpenCode Support

The framework also supports running tasks via OpenCode (`opencode run`).

```bash
# Single validation run
node ab-test/scripts/opencode-test.js [model]

# Parallel A/B: full vs agents-no-skills vs bare
node ab-test/scripts/opencode-ab.js [model]
```

Default model: `amazon-bedrock/us.anthropic.claude-opus-4-6-v1`

### OpenCode Variants

| ID | Description |
|----|-------------|
| `oc-full` | AGENTS.md (cleaned of blocking rules) + skills |
| `oc-agents-no-skills` | AGENTS.md only (no skill mentions, no skills dir) |
| `oc-bare` | No AGENTS.md, no .opencode config |

### Worktree Preparation (OpenCode)

AGENTS.md contains rules like "Never make code changes in the main repo checkout" and "Always invoke skills via slash command" that prevent the agent from coding directly. These are stripped from test worktrees so agents can work. The variant still gets all other guidance (project structure, editorial rules, working style).

## Token Counting: Claude Code vs OpenCode

**Important**: Token counts are not directly comparable between tools.

| | Claude Code | OpenCode |
|--|-------------|----------|
| `total_tokens` includes | input + output | input + output + cache_write + cache_read |
| System prompt impact | Counted once | Recounted at every step |
| Typical "total" for same task | ~13,000 | ~770,000 |
| Actual cost | $0.56 | $0.86 |

OpenCode reports cache tokens (the system prompt being stored/retrieved from Anthropic's prompt cache) in its total. These are nearly free but inflate the reported number. **Compare cost (`$`), not raw token counts**, when evaluating across tools.

## Results: Hook Enforcement + TDD Guidelines

Benchmark: Claude Code + Opus, challenge `story-ac` (YAML block scalar parser implementation).

| Variant | Score | Criteria | Tests Pass | Cost | Time |
|---------|-------|----------|-----------|------|------|
| **e-tdd-hooks** | **0.903** | **100%** | **100%** | $0.44 | 147s |
| b-bare-agent | 0.749 | 95% | 50% | $0.57 | 183s |
| c-lightweight-guidance | 0.696 | 94% | 40% | $0.56 | 238s |
| d-hook-enforced | 0.685 | 80% | 40% | $0.32 | 228s |
| a-full-pipeline | 0.466 | 50% | 0% | $0.45 | 123s |

### Key Findings

1. **Heavy governance blocks autonomous agents.** `a-full-pipeline` (full CLAUDE.md with mandatory pipeline) scores 50% criteria — the agent refuses to code or waits for human approval.

2. **Bare agents are fast but unreliable.** `b-bare-agent` (no CLAUDE.md) implements correctly 95% of the time but only passes existing tests 50% of the time — it doesn't verify its own work.

3. **Hook enforcement works.** `d-hook-enforced` (PostToolUse + Stop hooks that run tests) forces agents to see and fix test failures mechanically. Tests-pass rate improves from 50% to 60%.

4. **TDD guidelines + hooks is the winning combination.** `e-tdd-hooks` scores 0.903 with 100% criteria pass and 100% existing tests pass. It's also faster and cheaper than bare.

5. **Skills are not invoked spontaneously.** No variant (Claude Code or OpenCode, any model) invokes skills unless the prompt explicitly says "Run /skill-name". GPT-5.5 on OpenCode was the sole exception (invoked `/package-maintainer` once).

6. **Explicit skill instructions work.** When the prompt says "Run /task-research-guidelines", all variants obey — but it adds time without improving the result.

### Architecture: What Works

```
Minimal CLAUDE.md (context + TDD coding guidelines, no pipeline mandate)
  + PostToolUse hook on Edit|Write (runs tests, injects failures into context)
  + Stop hook (blocks agent from finishing if tests still fail)
  = Agent codes freely, gets mechanical feedback, cannot exit broken
```

### What Doesn't Work

- Large CLAUDE.md with mandatory steps → agent blocks or ignores
- "Run tests before finishing" as text instruction → agent lies ("all 57 tests pass" when they don't)
- Mandatory skill pipeline → requires human to trigger, incompatible with headless/autonomous
- OpenCode parallel execution → sqlite deadlock

## Hook Enforcement

The framework supports hook-based validation via the `hooks: true` flag in variant configs.

When enabled, the runner installs two hooks in the test worktree:

1. **PostToolUse (Edit|Write)**: Runs `npm run test:ai-artifacts` after source edits. If tests fail, injects the failure output into Claude's context via `additionalContext`.
2. **Stop**: Final gate — if package source was modified and tests fail, exits with code 2 (blocks Claude from stopping).

Hooks are contextual: they only fire when `packages/ai-artifacts/**/*.js` files are edited. Documentation-only changes skip validation entirely.

## Recommended: A/B Test Prompt & Skill Changes

When modifying agent instructions (CLAUDE.md, AGENTS.md, skills, overlays), consider running the benchmark before and after to validate the change improves (or at least doesn't regress) autonomous execution quality.

```bash
# Before your change
node ab-test/scripts/batch.js --variants e-tdd-hooks --iterations 3 --model opus

# Make your change

# After
node ab-test/scripts/batch.js --variants e-tdd-hooks --iterations 3 --model opus

# Compare
node ab-test/scripts/report.js
```

This catches common pitfalls: rules that block autonomous execution, instructions the agent ignores, or guidelines that slow down without improving quality.

## Known Issues

- `--disable-slash-commands` (Claude Code) only prevents invocation; skills are still loaded and visible to the model
- Debug log format (Claude Code) is plain-text, not JSONL — requires regex parsing
- **OpenCode cannot run in parallel**: all `opencode run` instances share a single sqlite DB (`~/.local/share/opencode/opencode.db`). Running 3+ processes concurrently causes a deadlock — all processes hang for 5min, produce 0 stdout, 0 diff. Sequential execution is mandatory.
