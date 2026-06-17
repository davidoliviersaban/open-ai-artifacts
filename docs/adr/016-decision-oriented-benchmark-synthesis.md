# ADR-016: Decision-oriented benchmark synthesis

**Status**: Accepted
**Date**: 2026-06-17

## Context

The benchmark produces a single weighted `final_score` per run and a global `winner`.
That answers "which configuration scored highest on average" but not the question the
project actually needs:

> For a given kind of task in *this* project, which **model + configuration** gives the
> best result, and is the difference worth the cost?

This is the thesis of the A/B methodology publication: benchmark *your environment*
instead of always reaching for the newest model or piling noise-inducing rules into an
agent instruction file. To support that decision, the tool must:

1. Compare **(model × configuration)** candidates, not just configurations.
2. Report **quality and cost as separate axes** — never hide the trade-off in one number.
3. Give a **per-use-case recommendation**, because the right choice depends on the task kind.
4. Be **deterministic and repeatable** — the same runs always produce the same verdict.
5. Keep any **LLM interpretation optional and downstream** of the numbers, to help
   non-experts read clear results — never as part of the computation.

## Decision

Add a deterministic synthesis layer on top of the existing per-run scores.

### Unit of comparison: candidate

A **candidate** is a `(model, variant)` pair. The variant captures the AI context
(CLAUDE.md, hooks, skills); the model captures the engine. Both matter to the decision.

### Use-case categories

Each challenge declares a `category` in `challenge.json`. Recommendations are produced
**per category**, never only globally. Initial categories for this project:

| Category | Meaning | Example challenges |
|----------|---------|--------------------|
| `spec-feature` | Well-specified single feature | block-scalar variants |
| `delivery` | Feature + commit/doc delivery hygiene | semantic-merge-deliver |
| `ambiguous` | Vague requirements needing judgment | ambiguous-improvement |
| `refactor` | Multi-file refactoring | cross-file-refactor |

Categories are data, not code — adding one is editing `challenge.json`, nothing else.

### Two axes, never merged

- **Quality** = mean `criteria_score` (the rendered copy: fraction of acceptance
  criteria passed). A timed-out / incomplete run scores 0 — the blank-exam rule stands.
- **Cost** = real measured `time_seconds`, `total_tokens`, `cost_usd` for completed runs.
  Cost is reported as actual values, not normalized against an arbitrary budget.

The weighted `final_score` stays for backward compatibility but is **not** used by the
recommendation logic.

### Confidence (deterministic)

Quality is reported with a **parametric 95% confidence interval**:
`margin = z · σ / √n` with `z = 1.96`. No bootstrap — bootstrap needs a random resample
and would not be repeatable without a fixed seed. Parametric CI is exact, cheap and
deterministic.

- `n = 1` → no interval; the candidate is flagged `insufficient_data`. A recommendation
  built on single runs is explicitly marked low-confidence.
- Two candidates whose quality intervals **overlap** are treated as *statistically tied*
  on quality. This is the rule that lets the cost axis break ties honestly.

### Pareto frontier

Within a category, a candidate is **dominated** if another candidate is at least as good
on quality **and** at least as cheap on the chosen cost axis, and strictly better on one.
The recommendation is always drawn from the **non-dominated frontier** — dominated
candidates are never recommended. This removes weak options without any arbitrary
weighting.

### Decision profiles

The cost axis and tie-breaking depend on the use case. Three built-in profiles:

| Profile | Cost axis | Rule |
|---------|-----------|------|
| `quality` | `cost_usd` | Highest mean quality on the frontier; ties broken by lower cost. |
| `cost` | `cost_usd` | Among candidates statistically tied with the best quality (overlapping CI), pick the cheapest. Never sacrifices quality outside the noise band. |
| `latency` | `time_seconds` | Same tie rule as `cost`, but the cost axis is wall-clock time. |

The `cost`/`latency` rule is the core insight: *if two configs are indistinguishable on
quality, prefer the cheaper/faster one.* "4× slower for an epsilon gain" is then visibly
rejected, without hiding the trade-off in a blended score.

### Output

The synthesis is emitted as structured JSON (`decision` block in `report.json`) plus a
deterministic terminal table per category. An **optional** LLM pass can translate that
JSON into prose for non-experts; it consumes the verdict, it never computes it.

## Consequences

### Positive

- Answers the real question: model + config per use case, with the cost trade-off visible.
- Fully deterministic and repeatable; same runs → same verdict.
- No arbitrary weighting; Pareto + CI overlap are principled and explainable.
- LLM-free core; optional LLM layer only humanizes clear numbers.
- Categories and profiles are data — extensible without touching logic.

### Negative

- Per-category recommendations need enough runs per `(model, variant, category)` cell;
  with one challenge per category the CI is wide and confidence is low.
- Parametric CI assumes roughly normal spread; with very small `n` it is approximate
  (flagged as low-confidence rather than hidden).
- More structure to maintain than a single leaderboard number.

### Risks

- Users may read a single-run recommendation as strong. Mitigated by the explicit
  `insufficient_data` / low-confidence flags.
- Choosing the wrong profile for a use case gives a misleading "best". Mitigated by
  reporting all three profiles' picks side by side.

## Alternatives considered

1. **Keep the single weighted score, tune weights.** Rejected — hides the trade-off and
   is sensitive to arbitrary weights; this is the documented criticism of single-number
   leaderboards.
2. **Bootstrap confidence intervals.** Rejected for the core — not repeatable without a
   fixed seed, which conflicts with the determinism requirement.
3. **LLM-as-judge for quality.** Rejected — non-deterministic and carries verbosity /
   self-preference / position biases. Unit-test grading stays the source of truth.
