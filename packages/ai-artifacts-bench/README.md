# @d-o.s/ai-artifacts-bench

Generic benchmark engine for A/B testing AI agent configurations. Provides the pluggable runner, scorer, reporter, and adapter interfaces — project-specific logic (worktree preparation, scenario definitions) lives in the consumer.

## Plugin Interface

### Adapter

An adapter drives the AI agent. It must export:

```js
module.exports = {
  run(worktree, prompt, options) → { stdout, stderr, elapsed, exitCode },
  parseUsage(raw) → { input_tokens, output_tokens, total_tokens, cost_usd, ... } | null,
}
```

See `adapters/claude-code.js` for the reference implementation.

### Config

The runner accepts a `config` object:

```js
{
  challengesDir,   // path to challenges/<id>/challenge.json files
  variantsDir,     // path to variants/<id>/variant.json files
  baselineFile,    // path to baseline.json
  runsDir,         // output directory for run artifacts
  repoRoot,        // git repo root (for worktree creation)
  prepare(worktree, variant, challenge, { repoRoot, runDir }),  // optional
  postRun(worktree, { runDir, variant, challenge, metadata }),  // optional
  prepareScoringWorktree(worktree, variant),                    // optional (scorer)
}
```

## Modules

| Module | Purpose |
|--------|---------|
| `lib.js` | Pure scoring math: `avg`, `median`, `computeScore`, `summarizeVariant`, `determineWinner` |
| `runner.js` | Single run execution with worktree lifecycle |
| `batch.js` | Matrix builder + concurrent execution |
| `score.js` | Run scoring with diff application and criteria evaluation |
| `report.js` | Report generation with baseline grouping |
| `decision.js` | Deterministic decision synthesis: per-use-case model+config recommendation |
| `adapters/claude-code.js` | Claude Code CLI adapter |

## Decision Synthesis

`decision.js` turns per-run scores into an actionable recommendation: **for a given
use-case category, which `(model, variant)` candidate to pick**. It is fully
deterministic — no randomness, no LLM — so the same runs always produce the same verdict.

- **Two axes, never merged:** quality (mean criteria pass rate) and cost (real time /
  tokens / $). The blended `final_score` is not used for recommendations.
- **Confidence:** parametric 95% CI (`mean ± 1.96·σ/√n`), no bootstrap. Single runs are
  flagged `insufficient_data` and discounted so they can't outrank replicated candidates.
- **Pareto frontier:** dominated candidates (worse on quality *and* cost) are never picked.
- **Profiles:** `quality` (highest reliable lower-bound), `cost` and `latency` (cheapest /
  fastest among candidates statistically tied on quality).
- **Variant sensitivity:** per model, the best/worst variant and the quality spread —
  shows how much the AI context tweaks each model's result (`config_sensitive` flag).

The report renders two views to avoid dumping every value: **View A** (which model per
use case — each model under its best variant, default lens `cost`) and **View B** (how to
configure each model — the variant spread). Default profile is `cost`.

### Hard deadline vs scored budget

The hard deadline is a **safety kill switch** (default 900s, `hard_deadline_seconds` in
`challenge.json` or `--hard-deadline`), decoupled from the scored cost. It is generous so
legitimate work finishes, and is never told to the model — a run killed here failed.
Time-awareness (telling the model its budget) is a separate variant axis, never silently
folded into a model comparison.

Challenges declare a `category` in `challenge.json`. An optional LLM pass may translate the
resulting `decision` JSON into prose for non-experts, but it consumes the verdict — it
never computes it. See `docs/adr/016-decision-oriented-benchmark-synthesis.md`.

## Writing Acceptance Criteria

Acceptance criteria are the unit of measurement. They must be written so the bench
produces a meaningful signal — not false positives. Follow these rules:

### Every criterion must FAIL on the base commit

A criterion that already passes before the agent touches anything contributes zero
signal. It inflates the score equally across all variants and models.

Before adding a criterion, check it against the challenge's `base_commit`:

```bash
git checkout <base_commit>
<run the criterion command>
# if it passes → the criterion is useless, rewrite it
```

If you cannot make a criterion fail on the base state, it is not testing the change.
Drop it or replace it with one that does.

**Baseline score threshold: the untouched code must score below 0.25.** Run the full
scorer on the base commit with no modifications. If the score is above 0.25, too many
criteria pass by default — the challenge cannot discriminate between an agent that did
nothing and one that made things worse. Rewrite criteria until the baseline is under
0.25. This guarantees that any score above 0.25 reflects real work by the agent.

Guard-rail criteria (build passes, tests pass, exports preserved) will always pass on
the base. That is acceptable — they protect against regressions. But they must be a
minority: if guard rails alone push the baseline above 0.25, add more discriminating
criteria until they are diluted below the threshold.

### Test the change, not the state

Bad: `grep -r 'async' src/utils/` — passes if any async function already exists.

Good: `node --test src/utils/retry.test.js` — a test file that imports the function
the agent must create, exercises its behavior, and asserts the contract. It fails
before implementation and passes after.

The strongest criteria are **unit tests that the agent must make pass**. They encode
the expected behavior precisely and cannot pass by accident.

### Avoid negation traps

`! grep 'deprecated_call()' src/` passes whenever the file is missing OR the
pattern is absent. On an unmodified base, the deprecated call might live in a
different file than expected, giving a false pass.

If you need a negation ("the agent must remove X"), verify the pattern exists on the
base first. If it doesn't, the criterion tests nothing.

### Lint/build/tests: necessary but not sufficient

`npx nx build`, `npx nx lint`, `npx nx test` are valid criteria — they catch
regressions. But they almost always pass on the base commit too. They only
discriminate when the agent introduces a regression, not when it succeeds.

Use them, but never as the only criteria. They are guard rails, not signal.

### Summary

| Rule | Why |
|------|-----|
| Fails on base_commit | Otherwise identical scores across all candidates |
| Tests behavior, not grep patterns | Grep is fragile and often accidentally passes |
| Unit test > grep > file existence | Precision of signal, from best to worst |
| Negation requires base verification | `! grep X` can silently pass when X was never there |
| Build/lint/test = guard rail only | They pass by default, they don't measure the fix |

## Finding Valid Model IDs

The `--model` flag passed to the benchmark must match exactly what `claude --model`
accepts. The format depends on your authentication backend:

| Backend | Format | Example |
|---------|--------|---------|
| Anthropic API (direct) | `claude-<family>-<version>` | `claude-sonnet-4-5-20250929` |
| AWS Bedrock | `us.anthropic.claude-<family>-<version>-v1:0` | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| Bedrock (short) | `us.anthropic.claude-<family>-<version>` | `us.anthropic.claude-opus-4-8` |

To discover which IDs are valid for your setup:

```bash
# Quick test — if this returns a model ID, it works:
claude -p --model <candidate-id> --output-format json "say hi" 2>&1 | head -3

# AWS Bedrock — list available inference profiles:
aws bedrock list-inference-profiles --region us-east-1 --output json \
  | jq '.inferenceProfileSummaries[].inferenceProfileId' | grep claude

# Anthropic API — list models:
curl -s https://api.anthropic.com/v1/models -H "x-api-key: $ANTHROPIC_API_KEY" \
  | jq '.data[].id' | grep claude
```

A wrong model ID causes a `400 The provided model identifier is invalid` error.
The run produces an empty diff and scores 0. If all runs score identically, check
the `stdout.json` for API errors before debugging criteria.

Store valid IDs in `baseline.json` to avoid re-discovering them each time:

```json
{
  "id": "my-baseline-v1",
  "default_models": [
    "us.anthropic.claude-opus-4-8",
    "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
  ]
}
```

## Testing

```bash
node --test 'packages/ai-artifacts-bench/**/*.test.js'
# or via Nx
npm run test:ai-artifacts-bench
```

79 tests cover all modules and prove the plugin architecture works end-to-end.
