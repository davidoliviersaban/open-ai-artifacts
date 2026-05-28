# A/B Testing Analysis: Agent Variants, Scenarios, and Models

**Date:** 2026-05-26
**Source data:** `ab-test/runs/report.json`, `ab-test/RESULTS.md`, variant definitions, challenge definitions
**Scope:** 38 benchmark runs across 5 executed variants, 4 challenge scenarios, and 2 model families.
**Baseline:** Legacy unversioned run set. Treat these results as historical findings, not as a directly comparable current baseline.

## Executive Summary

The benchmark shows a clear winner: `e-tdd-hooks`, a minimal TDD/refactoring instruction set combined with mechanical validation hooks. It reaches the best aggregate score, the only perfect existing-test pass rate, the lowest average token use, and one of the lowest costs.

The main lesson is not that agents need more process. The main lesson is that autonomous coding agents need a short, behavior-oriented operating frame plus automated feedback loops they cannot bypass. Heavy governance and mandatory skill pipelines are useful for human-in-the-loop repository collaboration, but they degrade headless coding execution because they add blocking rules, context noise, and non-deterministic human process dependencies.

| Variant | Runs | Avg Score | Criteria | Existing Tests | Avg Tokens | Avg Time | Avg Cost | Full Pass |
|---------|------|-----------|----------|----------------|------------|----------|----------|-----------|
| `e-tdd-hooks` | 12 | 0.872 | 95% | 12/12 | 6,384 | 166s | $0.34 | 75% |
| `b-bare-agent` | 12 | 0.798 | 93% | 9/12 | 8,265 | 183s | $0.44 | 42% |
| `c-lightweight-guidance` | 5 | 0.696 | 94% | 2/5 | 11,683 | 238s | $0.56 | 40% |
| `d-hook-enforced` | 5 | 0.685 | 80% | 3/5 | 6,902 | 228s | $0.32 | 40% |
| `a-full-pipeline` | 4 | 0.466 | 50% | 0/4 | 7,691 | 123s | $0.45 | 0% |

## What Was Tested

### Executed Variants

| Variant | Configuration | Hypothesis | Observed Result |
|---------|---------------|------------|-----------------|
| `a-full-pipeline` | Inherited repository `CLAUDE.md`, skills available, full pipeline/worktree/ship rules | Strong governance improves quality | Failed. 0% existing-test pass rate and frequent non-implementation/blocking behavior. |
| `b-bare-agent` | No `CLAUDE.md`, skills disabled | Model capability alone is enough | Partially true. High feature criteria, but weak regression safety. |
| `c-lightweight-guidance` | Minimal project context and TDD/refactoring guidance, no hooks, skills disabled | Written guidance is enough | Failed as a reliability mechanism. Criteria were good, but validation was inconsistent. |
| `d-hook-enforced` | Minimal project context, hooks enabled, skills available | Mechanical test gates alone are enough | Partially true. Hooks helped regression safety but did not shape implementation quality enough. |
| `e-tdd-hooks` | Minimal TDD/refactoring guidance plus PostToolUse and Stop hooks | Guidance plus enforcement is best | Confirmed. Best quality, reliability, speed, and cost profile. |

Additional variants exist for future isolation of individual pipeline skills (`d-no-ship`, `e-no-research`, `f-no-plan`, `g-no-review`, `h-no-implement`), but they are not part of the 38-run aggregate in `report.json`.

### Scenarios

| Scenario | Prompt Style | Acceptance Criteria Visible To Agent | Purpose |
|----------|--------------|---------------------------------------|---------|
| `story-ac` | User story with explicit checklist | Yes | Measures implementation against detailed AC for YAML block scalars. |
| `story-ac-with-skills` | Same as `story-ac`, plus explicit slash-command process | Yes, plus skill instructions | Tests whether mandatory skill use improves output. |
| `vague-flow` | Casual feature request | No | Measures behavior on realistic ambiguous feature work. |
| `vague-refactor` | Casual bug report | No | Measures codebase understanding and repair on roundtrip serialization/parsing. |

## Scenario Analysis

### `story-ac`: Structured YAML Block Scalar Feature

The explicit checklist made it easy for most variants to implement the visible behavior. `b-bare-agent` and `c-lightweight-guidance` both reached high criteria adherence, but often broke existing tests or failed to verify regressions. `a-full-pipeline` also implemented much of the requested behavior in some runs, but never passed the existing test suite.

`e-tdd-hooks` won because the hooks turned validation into a non-optional feedback loop. The written TDD guidance shaped the approach, and the hooks forced correction before completion. This is why `e-tdd-hooks` reached 100% existing-test pass rate while still maintaining high criteria adherence.

Failure pattern: the structured prompt did not solve regression safety. The key differentiator was `existing_tests_pass`, not whether the prompt listed enough requirements.

### `story-ac-with-skills`: Structured Feature With Explicit Skill Invocation

This scenario performed worse than the equivalent scenario without explicit skills. The full pipeline variant collapsed to 10% criteria adherence in its two runs, while the bare and lightweight variants still implemented most feature criteria but failed existing tests.

The cause is configuration/prompt mismatch. The prompt asks the agent to run `/task-research-guidelines` and `/task-plan-guidelines`, but in autonomous benchmark execution these skills add process latency and interaction overhead without adding new machine-checkable signal. For `a-full-pipeline`, the inherited repository instructions also include worktree, skill, and delivery rules designed for collaborative development. In a temporary benchmark worktree, those rules become blockers rather than safeguards.

Failure pattern: mandatory slash-command process is not a reliable autonomous quality mechanism unless the harness can execute the process end-to-end and the process emits deterministic validation signals.

### `vague-flow`: Casual Flow Syntax Feature

Both `b-bare-agent` and `e-tdd-hooks` handled this well. The agent could infer the required behavior from the code and nearby tests even without explicit acceptance criteria. The main difference was consistency and efficiency.

`e-tdd-hooks` passed nested flow parsing in all measured runs and averaged a higher score. `b-bare-agent` failed the `flow_nested` criterion once. The likely cause is that the bare agent solved the common cases but did not receive enough pressure to generalize parsing for nested inline structures.

Success pattern: vague prompts are acceptable when the repository has local tests, clear code structure, and a mechanical validation loop. They are risky when the agent must decide by itself whether the implementation is complete.

### `vague-refactor`: Casual Roundtrip Bug Report

This was the most diagnostic scenario. It required understanding the relationship between `serializeYaml` and `parseArtifactConfig`, not just adding isolated parsing cases.

`e-tdd-hooks` completed all three runs with existing tests passing and no timeout. `b-bare-agent` passed existing tests in aggregate but had one timeout/parse-error run and one run that missed `roundtrip_simple_array` and `roundtrip_mixed_object`. The bare agent could make local fixes, but it lacked a stable correction loop when the problem required tracing behavior across two functions.

Failure pattern: harder codebase-understanding tasks amplify the value of hooks. The hook feedback prevents dead-end exploration from becoming a silent failure or timeout.

## Variant-Level Root Cause Analysis

### Why `e-tdd-hooks` Succeeded

`e-tdd-hooks` combines two complementary controls:

| Control | Effect |
|---------|--------|
| Minimal TDD/refactoring guidance | Biases the agent toward behavior-first changes, small tests, local clarity, and minimal scope. |
| PostToolUse hook | Runs tests after relevant edits and injects failures back into the agent context. |
| Stop hook | Blocks completion when package tests fail. |

The configuration aligns with current agent-engineering best practice: keep the prompt small, make success criteria executable, close the feedback loop quickly, and enforce hard gates outside the model. The model remains free to implement, but the environment supplies deterministic correction signals.

### Why `a-full-pipeline` Failed

The full repository instructions include rules that are correct for real repository collaboration but harmful in a benchmark worktree:

| Failure Mode | Cause |
|--------------|-------|
| Refusal or hesitation to code | Worktree and approval rules are interpreted as constraints the benchmark cannot satisfy. |
| Low autonomous throughput | Mandatory research/plan/review/ship pipeline shifts the agent from implementation to process compliance. |
| 0% existing-test pass rate | The process does not mechanically force tests green before finishing. |
| Context noise | Large governance instructions compete with the local coding task. |

The issue is not that governance is bad. The issue is that governance should be externalized into deterministic harness checks for autonomous execution, not embedded as a long instruction stack the model must self-enforce.

### Why `b-bare-agent` Was Strong But Unsafe

The bare agent demonstrates that modern models are already competent at local coding tasks. It reached 93% average criteria adherence without project instructions. However, it passed existing tests only 75% of the time and had lower full-pass reliability.

The root cause is validator unreliability. Without hooks or a final gate, the model may stop after satisfying the visible task while missing regressions. It can also spend more tokens exploring because it lacks a short project-specific orientation.

### Why `c-lightweight-guidance` Was Not Enough

Written guidance improved intent but not enforcement. The agent often implemented the requested feature but still failed `existing_tests_pass`. This is the standard prompt-only failure mode: instructions such as "run tests before finishing" are probabilistic. They can be ignored, misremembered, or summarized incorrectly.

The result supports a practical rule: do not use prompt text as the only enforcement mechanism for quality gates.

### Why `d-hook-enforced` Was Not Enough

Hooks alone improved some regression behavior but did not reliably produce the right implementation strategy. In one run, the variant timed out/parse-failed with only 2/10 criteria passing; in other runs, it still missed existing tests.

The likely cause is that validation hooks can detect failures but cannot teach the model which implementation shape is most appropriate. Without lightweight behavior-first guidance, the agent may make larger or less coherent changes and then spend the budget reacting to failures.

## Model Analysis

Only `e-tdd-hooks` has a clean direct model comparison in the current result set.

| Model | Runs | Avg Score | Criteria | Existing Tests | Avg Cost | Avg Time |
|-------|------|-----------|----------|----------------|----------|----------|
| Claude Opus 4.6 | 3 | 0.903 | 100% | 3/3 | $0.44 | 147s |
| Claude Sonnet 4.5 | 9 | 0.862 | 93% | 9/9 | $0.32 | 169s |

Opus is more reliable on exact criteria. Sonnet is cheaper and still safe when hooks are active. The important observation is that hooks normalized regression safety across both models: both reached 100% existing-test pass rate under `e-tdd-hooks`.

Recommendation: use Sonnet-class models for routine package tasks under hooks, and reserve Opus-class models for higher-risk changes, ambiguous architecture work, or benchmark reruns where exact criteria adherence matters more than cost.

## State Of The Art Alignment

The results align with current practice in production agent and LLM application engineering:

| Practice | Implication For This Repo |
|----------|---------------------------|
| Task-specific evals outperform generic judgment | Keep challenge suites focused on concrete repository behaviors and machine-checkable criteria. |
| Deterministic checks beat self-reported compliance | Use tests, hooks, CI gates, and command outputs rather than asking the model to promise validation. |
| Smaller prompts often outperform heavy instruction stacks | Keep agent-facing coding guidance short and local; move policy enforcement outside the prompt. |
| Evaluator-optimizer loops improve reliability | PostToolUse failure injection is a practical evaluator-optimizer loop for coding agents. |
| Prompt/version changes need regression tests | Run A/B benchmarks before merging changes to skills, prompts, or generated agent instructions. |
| Cost should be measured against quality | Compare score per dollar and pass rate, not raw token totals alone, especially across tools with cache accounting differences. |

## Recommendations

### Immediate Recommendation

Adopt `e-tdd-hooks` as the default autonomous coding configuration for package-code benchmark tasks:

```text
Minimal project context + behavior-first TDD/refactoring guidance
+ PostToolUse tests after relevant edits
+ Stop hook that blocks completion while tests fail
```

This should be the baseline candidate for future prompt, skill, and agent-instruction experiments. Future comparisons must be rerun with the same explicit `ab-test/baseline.json` metadata rather than mixed with this legacy unversioned run set.

### Governance Recommendation

Separate collaborative governance from autonomous execution:

| Context | Recommended Control |
|---------|---------------------|
| Human-in-the-loop repository work | Keep pipeline skills, worktree rules, review, doc-check, and ship process. |
| Headless benchmark/autonomous coding | Strip blocking process rules and enforce quality through hooks and test gates. |
| Prompt/skill changes | Require before/after A/B runs against the baseline. |

### Benchmark Roadmap

1. Promote `e-tdd-hooks` to the benchmark baseline.
2. Execute the untested skill-ablation variants (`d-no-ship`, `e-no-research`, `f-no-plan`, `g-no-review`, `h-no-implement`) only if the goal is to measure pipeline-skill contribution explicitly.
3. Add scenarios for documentation-only tasks, multi-file package changes, generated artifact sync, and failure recovery from a deliberately failing test.
4. Add statistical reporting: confidence intervals, per-scenario variance, timeout rate, and cost per full pass.
5. Persist summarized run artifacts in Git while keeping raw transcripts/logs ignored.
6. Add PR automation that posts the benchmark summary whenever `ab-test/runs/report.json` changes.

### Model Policy

Use this model policy until more data is available:

| Work Type | Recommended Model | Reason |
|-----------|-------------------|--------|
| Routine package fixes with hooks | Sonnet | Lower cost; hooks preserve regression safety. |
| Ambiguous parser/architecture changes | Opus | Better exact-criteria reliability. |
| Final benchmark confirmation before changing agent instructions | Opus plus Sonnet sample | Measures both best reliability and cost-effective operating mode. |

## Final Decision

For autonomous coding execution, the best current configuration is **minimal TDD guidance plus mechanical hook enforcement**. Heavy instruction stacks and mandatory skill pipelines should remain part of the human collaboration workflow, but they should not be used as the primary quality mechanism for headless agent execution.
