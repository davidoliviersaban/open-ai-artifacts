# ADR-011: Comparable benchmark protocol for agent configurations

**Status**: Proposed
**Date**: 2026-05-28

## Context

ADR-010 introduced `ab-test/` to compare agent configurations on repeatable coding tasks. The first benchmark results were useful for exploration, but they also exposed a methodological risk: reports can become misleading when they aggregate runs from different baselines, challenge definitions, tools, models, run counts, or scoring assumptions.

This is not only a local problem. A/B testing and benchmark tooling consistently separates exploratory evidence from comparable evidence:

- A/B testing practice requires fixed sample sizes or explicit stopping rules; repeatedly checking and stopping when a result looks good inflates false positives.
- Software benchmark tools such as Google Benchmark, Airspeed Velocity, and pytest-benchmark store context, repetitions, and historical results so comparisons are tied to a specific run environment and benchmark definition.
- SWE-bench evaluates coding agents by separating generation from scoring: a patch is generated for a fixed instance and base commit, then applied and tested in an isolated environment.
- Tau-Bench/Tau2 evaluates agent trajectories over repeated trials, validates leaderboard submissions, recommends full task coverage and 4+ trials, and distinguishes outcome correctness from matching one reference trajectory.
- Inspect AI shows a mature framework shape: task/dataset/scorer separation, structured logs, sandboxing, viewers, and standard error metrics.

Research summary: `.copilot-tracking/research/2026-05-28-ab-testing-benchmarking-tools.md`.

## Decision

Keep the local Node.js `ab-test/` harness as the primary benchmark implementation for now, but formalize it as a SWE-bench-style local coding-agent benchmark with Tau-Bench-style validation discipline.

We will not replace the harness with Tau-Bench, Inspect AI, DeepEval, Ragas, or OpenAI Evals in the near term. Those tools provide useful patterns, but the repository needs a small, local, deterministic benchmark for repository mutation and package-code validation.

Comparable benchmark reports must follow these rules:

1. **Explicit baseline** — every new run records a benchmark baseline id. Runs from different baselines are not aggregated into one winner.
2. **Replayable generation artifact** — each run keeps the agent-produced diff, metadata, usage, stdout/stderr, delivery state, and score details so scoring can be audited.
3. **Fixed matrix before comparison** — a decision-grade report declares the variants, challenges, model/tool class, and iteration count before results are interpreted.
4. **No unplanned early stopping** — benchmark runs must not stop because one variant appears to be winning unless a sequential stopping rule was designed in advance.
5. **Balanced comparability** — decision-grade reports require comparable run counts across variants for the selected challenge/model/tool group.
6. **Outcome-first scoring** — the primary metric is full-pass/resolved rate against deterministic criteria. Composite weighted scores remain secondary.
7. **Diagnostic metrics are separate** — cost, time, tokens, skill invocation, tool-call behavior, delivery hygiene, and transcript/process signals are diagnostic unless explicitly promoted to scoring criteria.
8. **Confidence wording must be statistical** — do not call a result statistically significant or confident based only on a fixed score delta such as `0.05`. Reports should either avoid confidence language or compute an explicit method such as standard error, confidence intervals, or paired comparisons.
9. **Legacy data remains historical** — runs without baseline metadata are `legacy-unversioned`; they may support qualitative findings but must not be treated as the current comparable baseline.

## Protocol

The benchmark protocol should evolve in this order:

1. Add a run manifest with base commit, head commit, dirty state, baseline id, challenge hashes, variant hashes, scoring script hash, runner/report versions, tool versions, model id, command line, OS, CPU, Node/npm versions, and timestamp.
2. Add a report validator that classifies a report as `decision-grade`, `exploratory`, or `invalid`.
3. Extend reporting to group by baseline, model, tool, challenge set, and matrix completeness.
4. Report primary metrics first: full-pass/resolved rate by challenge and variant, with failure/error rates.
5. Add variance, standard deviation, standard error, confidence intervals, and paired deltas once enough repeated data exists.
6. Keep an optional future path for an Inspect AI adapter if standardized logs, viewers, or richer sandbox support become more valuable than the current harness simplicity.

## Consequences

- Benchmark claims become auditable and less likely to mix incompatible data.
- Existing benchmark results must be downgraded to historical/exploratory unless rerun under an explicit baseline and fixed matrix.
- PR evidence can distinguish "interesting finding" from "decision-grade benchmark result".
- The current `ab-test/` harness remains small, local, dependency-light, and aligned with repository tests.
- Additional metadata and validation add implementation work before benchmark results can be used as a merge gate.
- Some current documentation must avoid words like "statistically significant" until the report computes statistical support.

## Alternatives Considered

### Replace `ab-test/` with Tau-Bench

Rejected for now. Tau-Bench is strong for tool-agent-user simulations and contributes useful methodology: outcome scoring, Pass^k, repeated trials, validation, and submission requirements. It is not a direct fit for coding agents that mutate this repository and are scored by package tests.

### Replace `ab-test/` with SWE-bench

Rejected as a direct replacement, accepted as the closest design reference. SWE-bench evaluates coding agents through patches against fixed repository states, which matches our needs conceptually. However, this repository needs custom local challenges and agent-configuration variants rather than an external dataset runner.

### Adopt Inspect AI now

Deferred. Inspect AI provides a mature evaluation framework with tasks, solvers, scorers, logs, viewers, and sandboxing. It may be valuable later, especially as an adapter. Replacing the current Node harness now would add Python dependency weight and expand scope before the benchmark protocol is stable.

### Use DeepEval, Ragas, or OpenAI Evals as the core judge

Rejected for core coding correctness. These tools are valuable for LLM app, RAG, prompt, and qualitative process evaluations, but many workflows rely on LLM-as-judge or platform-specific assumptions. Deterministic tests and replayable diffs remain the primary judge for repository mutation.

### Keep current reporting unchanged

Rejected. Aggregating by variant alone is too weak because it can mix incompatible baselines, models, tools, challenges, and run counts. It risks turning exploratory observations into false benchmark claims.

## Open Questions

- What minimum trial count should be required for `decision-grade` reports? Tau-Bench recommends 4+ trials for leaderboard reliability; this is a reasonable starting point but may be expensive for local coding-agent runs.
- Should current results be rerun under the new baseline before any whitepaper claim cites numeric benchmark results?
- Should OpenCode and Claude Code runs share one report only for outcome metrics, while token/cost metrics stay tool-specific?
- Should benchmark artifacts be committed, uploaded as CI artifacts, or summarized in Git while keeping raw logs local?
