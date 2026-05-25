# ADR-010: A/B test framework for agent configurations

**Status**: Proposed  
**Date**: 2026-05-26

## Context

This project provides skills, CLAUDE.md instructions, and pipeline rules intended to improve agent output quality. However, we have no empirical evidence that these artifacts actually help. The mandatory pipeline (research → plan → implement → review → ship) adds overhead that may or may not improve outcomes compared to a bare agent given the same task.

Skills that are never invoked, or that the agent invokes only because a CLAUDE.md rule forces it, may be adding context noise rather than value. The audit trail (ADR-009) tells us *what* gets called but not *whether it helped*.

We need a way to answer: "Does this configuration produce better code than a simpler one, controlling for the same task and model?"

## Decision

Introduce an A/B testing framework (`ab-test/`) that:

1. **Defines challenges** — repeatable coding tasks with machine-checkable acceptance criteria.
2. **Defines variants** — agent configurations (CLAUDE.md content, skills, system prompts, model).
3. **Runs blind** — the agent never sees the acceptance criteria or the scoring logic (the `ab-test/` directory is deleted from the worktree before each run).
4. **Scores impartially** — a separate worktree applies the agent's diff and runs each criterion independently.
5. **Reports comparatively** — aggregates results across iterations to compare variants on criteria adherence, efficiency (tokens + time + cost), and regression safety.

The framework is pure Node.js with unit tests covering scoring math, argument parsing, worktree preparation, and criterion evaluation.

## Scoring Model

Final score = weighted sum of:

| Dimension | Weight | How measured |
|-----------|--------|-------------|
| Criteria adherence | 50% | Pass/fail on each acceptance criterion |
| Efficiency | 30% | Linear decay based on tokens/budget + time/budget |
| Code quality | 20% | Existing test suite passes (no regressions) |

## Consequences

- We can now make data-driven decisions about which skills/instructions to keep, simplify, or remove.
- Challenge definitions serve as executable specifications — they're reusable for regression testing of prompt changes.
- The framework itself follows the project's own standards: no external deps, Node.js built-in test runner, testable pure functions extracted from I/O.
- Risk: a single challenge may not generalize. We should build a diverse challenge set over time (refactoring, bug fixing, multi-file features, documentation tasks).
- The scoring model is opinionated (weights are fixed). Future work may introduce per-challenge weight overrides.

## Alternatives Considered

- **Manual comparison**: subjective, doesn't scale, can't be repeated.
- **LLM-as-judge**: uses another model to evaluate output. Adds cost, introduces evaluator bias, harder to debug disagreements. May be valuable later for qualitative criteria but not needed for v1.
- **CI-based eval harness**: tools like Braintrust or Evalica. Adds infra dependency and assumes cloud execution. Our runs are local (developer laptop) and budget-constrained.

## Future Evolutions

### Mandatory A/B gate for skill/prompt changes

Once the framework is validated, every modification to a skill, CLAUDE.md instruction, or agent prompt must pass through A/B testing before merge. The workflow would be:

1. Author changes a skill or prompt on a feature branch.
2. A/B batch runs compare the **before** (current main) vs **after** (feature branch) configurations on the same challenge set.
3. If the new config does not improve (or regresses) on factual scores, the change is rejected or requires explicit justification.

This turns "I think this prompt is better" into "the data shows this prompt produces better results on N criteria with M% confidence."

### Retrospective validation of existing skills

The framework can also run retrospectively: disable each existing skill individually and compare against the baseline to measure its actual contribution. Skills that don't measurably improve outcomes get candidates for removal — reducing context noise and cost.

### Scoring model validation

The current scoring weights (50% criteria, 30% efficiency, 20% code quality) and the linear decay functions are assumptions, not validated parameters. Future work should:

- Calibrate weights against human judgment on a set of rated runs.
- Validate that the efficiency score doesn't unfairly penalize agents that take longer but produce better code.
- Consider whether the code quality dimension (existing tests pass) is too binary — partial regression detection may be more informative.
- Investigate if cost-normalized scoring (score per dollar) is a better comparison metric than weighted composite.

### Expanded challenge set

A single parsing task does not generalize. The challenge set should grow to cover:

- Refactoring (change structure without changing behavior)
- Bug fixing (given a failing test, find and fix the bug)
- Multi-file features (coordination across modules)
- Documentation tasks (generate docs from code)
- Tasks with ambiguous requirements (measure how the agent handles uncertainty)

### Transcript analysis

Detailed transcript analysis (`--debug-file`) enables understanding *why* a variant performs better — not just *that* it does. Future tooling should extract: tools called, files read, retry count, error recovery patterns, dead-end exploration time.
