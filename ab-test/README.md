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
