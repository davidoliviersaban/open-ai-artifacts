# Research: A/B Testing And Agent Benchmarking Practices

Date: 2026-05-28
Scope: `ab-test/` benchmark methodology for AI agent configuration experiments.

## Question

How should this repository benchmark agent configurations without producing misleading results, and what can we borrow from off-the-shelf tools such as Tau-Bench, SWE-bench, Inspect AI, DeepEval, Ragas, and OpenAI Evals?

## Current Repository Context

The current harness already has useful benchmark primitives:

- `ab-test/challenges/*/challenge.json` defines hidden task prompts, criteria, and scoring settings.
- `ab-test/variants/*/variant.json` defines agent configurations.
- `ab-test/scripts/runner.js` runs each variant in an isolated worktree and removes `ab-test/` from the agent-visible tree.
- `ab-test/scripts/score.js` applies the captured diff in a separate scoring worktree and runs deterministic criteria.
- `ab-test/runs/*` stores per-run metadata, usage, diffs, stdout/stderr, delivery state, and scores.
- `ab-test/scripts/report.js` aggregates scored runs into `ab-test/runs/report.json`.
- `ab-test/baseline.json` now gives the benchmark a named baseline, but existing stored runs are still `legacy-unversioned`.

The biggest current weakness is not the execution model. It is comparability: historical reports mix different challenge definitions, tools, models, run counts, and baseline assumptions.

## Sources Reviewed

### A/B Testing And Benchmark Statistics

- Evan Miller, "How Not To Run an A/B Test": https://www.evanmiller.org/how-not-to-run-an-ab-test.html
- Google Benchmark user guide: https://google.github.io/benchmark/user_guide.html
- Airspeed Velocity documentation: https://asv.readthedocs.io/en/stable/using.html
- pytest-benchmark comparison docs: https://pytest-benchmark.readthedocs.io/en/latest/comparing.html
- GitLab Code Quality docs: https://docs.gitlab.com/ci/testing/code_quality/
- Martin Fowler / Thoughtworks Practical Test Pyramid: https://martinfowler.com/articles/practical-test-pyramid.html

Key points:

- Do not stop an experiment because it looks significant unless the stopping rule was predeclared. Repeated peeking inflates false positives.
- Compare only like-for-like runs: same benchmark definition, same environment class, same metric semantics.
- Store run metadata with commit/time/environment/context, not just scores.
- Repetitions and aggregate statistics matter. Report means/medians plus variance or standard error, not only a single weighted score.
- CI-quality reporting should show changes relative to a known baseline and make findings visible in review.

### Tau-Bench / Tau2 / Tau3

Primary sources:

- Tau-Bench repository: https://github.com/sierra-research/tau-bench
- Tau2/Tau3 repository: https://github.com/sierra-research/tau2-bench
- Tau2 README: https://raw.githubusercontent.com/sierra-research/tau2-bench/main/README.md
- Tau2 task evaluation docs: https://raw.githubusercontent.com/sierra-research/tau2-bench/main/docs/evaluation.md
- Tau2 leaderboard submission docs: https://raw.githubusercontent.com/sierra-research/tau2-bench/main/docs/leaderboard-submission.md
- Tau2 CLI docs: https://raw.githubusercontent.com/sierra-research/tau2-bench/main/docs/cli-reference.md

Note: `https://taubench.com/#home` returned HTTP 403 through the available fetch tool, so this research uses the public GitHub repository and raw documentation as primary sources.

What it solves:

- Benchmarks conversational tool-using agents in realistic domains such as airline, retail, telecom, banking knowledge, and voice.
- Uses simulated users, domain policies, domain tools, and mutable environment state.

How it works:

- A domain defines policy, tools, database, user data, and tasks.
- A task defines `evaluation_criteria`: reference `actions`, `env_assertions`, `communicate_info`, `nl_assertions`, and `reward_basis`.
- Official scoring is usually outcome-based. In standard airline/retail/telecom tasks, `actions` is one reference trajectory used to derive a target DB state, not a mandatory call sequence.
- Reward is the product of enabled reward components, commonly DB state correctness and required communication.
- Runs are launched with `tau2 run --domain ... --agent-llm ... --user-llm ... --num-trials ...`.
- Results are stored under `data/simulations/` and inspected with `tau2 view`.
- Leaderboard submissions require validation, consistent configuration, full task coverage, and preferably 4+ trials.

Relevant patterns for this repo:

- Separate reference trajectory from correctness. For code, one expected implementation path should not be required unless path-following is explicitly what is being evaluated.
- Use task sets and trials as first-class dimensions.
- Provide a validation/submission contract before publishing or comparing results.
- Report pass rates over repeated trials, not only weighted average score.
- Keep diagnostic signals separate from official reward, such as action similarity vs actual correctness.

Limitations for this repo:

- Tau-Bench is optimized for tool-agent-user conversations, not repository mutation and patch validation.
- It is not a drop-in replacement for coding-agent benchmarks.

### SWE-bench

Primary sources:

- Website and leaderboard: https://www.swebench.com/
- Repository: https://github.com/SWE-bench/SWE-bench

What it solves:

- Evaluates coding agents and models on real GitHub issues.
- Main artifact is a generated patch applied to a fixed repository state, then evaluated by tests.

How it works:

- Dataset instances identify repository, issue, base commit, and tests.
- Predictions are separated from scoring, typically as JSONL with `instance_id`, `model_name_or_path`, and `model_patch`.
- Evaluation applies the patch in an isolated environment and runs tests.
- Main metric is resolved rate.
- Results include per-instance logs and aggregate resolved percentages.

Relevant patterns for this repo:

- This is the closest off-the-shelf reference for `ab-test`.
- Keep generation and scoring replayable. Current `changes.diff` is aligned with this.
- Record base commit and challenge version per run.
- Consider a prediction-like artifact schema for future runs: run metadata + patch + tool/model metadata + scoring result.
- Prefer resolved/full-pass rates as primary metrics and keep cost/time separate.

Limitations for this repo:

- SWE-bench is built around external datasets and Dockerized Python project evaluation. Our benchmark is repository-specific and focused on prompt/agent configuration deltas.
- Useful as a design model rather than a replacement.

### Inspect AI

Primary sources:

- Docs: https://inspect.aisi.org.uk/
- Repository: https://github.com/UKGovernmentBEIS/inspect_ai
- Logs: https://inspect.aisi.org.uk/eval-logs.html
- Scorers: https://inspect.aisi.org.uk/scorers.html

What it solves:

- General LLM and agent evaluation framework developed by the UK AI Security Institute and Meridian Labs.
- Supports tasks, datasets, solvers, scorers, agents, tool calling, external agents, sandboxes, logs, viewers, and analysis APIs.

How it works:

- Evaluation = `Task(dataset, solver, scorer)`.
- Dataset samples contain inputs, targets, files, and metadata.
- Solvers drive model or agent execution.
- Scorers evaluate outputs using exact match, regex, model grading, custom logic, or sandbox-aware checks.
- Logs are stored in `.eval` or JSON format and viewed with `inspect view`.
- Metrics include accuracy, mean, stderr, and custom reducers.

Relevant patterns for this repo:

- Strong model for logs, viewers, stderr metrics, and sandboxed agent evaluation.
- Could wrap current `challenge.json` files as Inspect tasks later.
- Useful if we want richer visualization and standardized eval logs.

Limitations for this repo:

- Python-heavy dependency and workflow.
- Replacing the existing Node harness now would add scope and risk.
- Best near-term option is not replacement, but borrowing concepts: task/dataset/scorer separation, log API, confidence metrics, explicit sandbox metadata.

### DeepEval / Confident AI

Primary sources:

- Docs: https://docs.confident-ai.com/docs/getting-started
- Repository: https://github.com/confident-ai/deepeval

What it solves:

- LLM application testing, regression testing, component traces, and cloud dashboards.

How it works:

- Defines `LLMTestCase`, `ConversationalTestCase`, datasets, and metrics.
- Runs local tests with `deepeval test run`.
- Supports 0-1 metric thresholds and regression dashboards through Confident AI.
- Agent evaluation can use tracing/decorators to score internal components.

Relevant patterns for this repo:

- Good model for regression dashboards and component-level trace scoring.
- Could be useful for qualitative transcript analysis, such as process adherence or PR summary quality.

Limitations for this repo:

- Many metrics are LLM-as-judge. That is weaker than deterministic tests for coding correctness.
- Adds external service/API-key dependencies unless used locally only.
- Not recommended as the core correctness judge for `ab-test`.

### Ragas

Primary sources:

- Docs: https://docs.ragas.io/en/stable/
- Repository: https://github.com/vibrantlabsai/ragas

What it solves:

- Evaluation loops for LLM apps, especially RAG, agent/tool use, natural-language comparison, and synthetic testset generation.

Relevant patterns for this repo:

- Experiments-first workflow.
- Dataset + metrics + repeated experiment loops.
- Potentially useful if `ai-artifacts` later benchmarks documentation retrieval or natural-language artifact quality.

Limitations for this repo:

- Less aligned with repository mutation and code patch scoring.
- Not a near-term fit for the core coding-agent benchmark.

### OpenAI Evals

Primary sources:

- Docs: https://platform.openai.com/docs/guides/evals
- Repository: https://github.com/openai/evals

What it solves:

- Model/prompt evaluations inside or near the OpenAI ecosystem.
- Supports eval definitions, graders, custom code, datasets, and platform reporting.

Relevant patterns for this repo:

- Good for prompt/model comparisons when the evaluated system is an API call or chain.
- Useful concepts: eval spec, grader spec, dataset versioning, dashboard reporting.

Limitations for this repo:

- Less suited to local worktree mutation, patch capture, multi-tool coding agents, and non-OpenAI execution.
- Not recommended as the main harness.

## Comparison Table

| Tool | Closest Use Case | Strong Pattern To Borrow | Fit For Current `ab-test` |
|------|------------------|--------------------------|----------------------------|
| SWE-bench | Coding agents patch real repos | Patch-first prediction artifacts, fixed base commits, resolved rate | High as design reference |
| Inspect AI | General agent eval framework | Task/dataset/scorer separation, logs, sandboxing, stderr metrics | Medium-high as future adapter |
| Tau-Bench/Tau2 | Tool-agent-user simulation | Outcome scoring, multi-trial Pass^k, submission validation | Medium as methodology reference |
| DeepEval | LLM app regression testing | Trace/component evals, dashboards | Medium for qualitative/process metrics |
| Ragas | RAG and AI app eval loops | Experiment/dataset/metric discipline | Low-medium for future doc/RAG evals |
| OpenAI Evals | Prompt/model evaluation | Eval specs and graders | Low-medium; ecosystem-specific |

## Recommended Direction

Do not replace the current `ab-test` harness now. It is already closer to SWE-bench than to generic LLM evaluation tools, because it evaluates actual repository mutations through deterministic tests.

Instead, evolve it toward a SWE-bench-style local benchmark with Tau-Bench-style validation discipline:

1. Add a run manifest.
   - Include base commit, branch/head commit, dirty state, benchmark baseline id, challenge hashes, variant hashes, scoring script hash, runner/report versions, tool version, model, command line, OS, CPU, Node/npm versions, and timestamp.

2. Add a comparability validator.
   - Mark reports as `decision-grade` only when they use one baseline id, one model/tool class, a balanced matrix, fixed task set, fixed iteration count, and minimum trials.
   - Mark current historical results as `exploratory` or `legacy-unversioned`.

3. Separate primary and diagnostic metrics.
   - Primary: full-pass/resolved rate per challenge and variant.
   - Secondary: criteria score, cost, time, tokens, timeout rate, parse-error rate.
   - Diagnostic: skill invocations, tool calls, delivery hygiene, tests run by the agent, transcript/process signals.

4. Replace the current confidence language.
   - Remove or rename `confident` if it is only `delta >= 0.05`.
   - Add standard deviation, standard error, confidence intervals, and paired comparisons later.

5. Adopt Tau-Bench's submission discipline for PR evidence.
   - Require a validation command before publishing benchmark results.
   - Validate all required variants/challenges are present.
   - Validate no mixed baseline is used for the active report.
   - Store raw run artifacts, but publish concise summaries.

6. Consider Inspect AI as a future adapter, not an immediate replacement.
   - If the benchmark grows beyond this repository, an Inspect wrapper could provide standardized logs, viewers, sandboxes, and metrics.
   - For now, the Node harness is smaller and aligned with repo-local package tests.

## Concrete Next Implementation Steps

1. Add `ab-test/scripts/manifest.js` to compute a benchmark manifest and hashes.
2. Extend `runner.js`, `batch.js`, and Claude runners to persist the manifest in each run.
3. Add `ab-test/scripts/validate-report.js` to classify reports as `decision-grade`, `exploratory`, or `invalid`.
4. Extend `report.js` to group by baseline + model + tool + challenge set and add warnings for unbalanced matrices.
5. Update `README.md` with a benchmark protocol:
   - fixed matrix before running;
   - no early stopping unless predeclared;
   - minimum 4 trials for decision-grade results, matching Tau-Bench's leaderboard preference;
   - full-pass/resolved rate as primary metric;
   - no cross-tool token aggregation.

## Bottom Line

For this repository, the right target is not generic A/B testing and not generic LLM judging. The benchmark should be a local, deterministic, coding-agent evaluation harness:

- SWE-bench supplies the closest execution model.
- Tau-Bench supplies strong multi-trial, outcome-scoring, validation, and submission discipline.
- Inspect AI supplies a credible future path for standardized logs and metrics.
- DeepEval, Ragas, and OpenAI Evals are useful references for broader AI app evals, but should not be the core judge for repository mutation correctness.
