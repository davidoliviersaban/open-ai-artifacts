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

## Testing

```bash
node --test 'packages/ai-artifacts-bench/**/*.test.js'
# or via Nx
npm run test:ai-artifacts-bench
```

79 tests cover all modules and prove the plugin architecture works end-to-end.
