# ADR-015: Multi-turn autonomy benchmark

**Status**: Proposed  
**Date**: 2026-06-17

## Context

Current benchmarks measure single-turn agent performance: one prompt in, evaluate the final output. This misses a critical dimension observed in practice — some models (notably Opus 4.7/4.8) perform better when they can interact with a human to refine their understanding before acting, while others (GPT-5.x, Opus 4.6) tend to execute autonomously with fewer clarifications.

Neither approach is inherently superior:
- **High autonomy** is faster but risks going in the wrong direction silently.
- **Clarification-seeking** produces better-aligned results but costs human attention.

The current bench framework has no way to measure this tradeoff. A model that asks 3 questions and nails the task scores the same as one that silently produces a mediocre result — or worse, the clarification-seeker times out / gets penalized for not producing output on the first turn.

## Decision

Introduce a **multi-turn autonomy benchmark** that measures the interaction cost vs. outcome quality tradeoff.

### Key metrics

| Metric | Definition |
|--------|-----------|
| `turns_to_complete` | Number of human interactions before the task reaches acceptance criteria |
| `autonomy_score` | Inverse of turns: `1 / turns_to_complete` (1.0 = fully autonomous) |
| `quality_at_turn_n` | Quality score evaluated at each interaction checkpoint |
| `efficiency_ratio` | `final_quality / turns_to_complete` — the value per interaction |

### Adapter design

A new adapter type (`multi-turn`) that:

1. Sends the initial prompt to the model
2. If the model responds with a question or clarification request (detected via heuristic or structured output), feeds it to a **simulated human** (LLM-as-judge playing the role of a knowledgeable user with the challenge's ground truth)
3. Loops until the model produces a final deliverable or hits a max-turn cap
4. Evaluates the final output against the same criteria as single-turn

### Simulated human

The simulated human receives:
- The original challenge description and acceptance criteria (ground truth)
- The model's question
- Instructions to answer concisely and honestly, as a developer who knows what they want but won't do the work themselves

This avoids requiring actual human-in-the-loop during batch runs while preserving realistic interaction dynamics.

### Challenge compatibility

Multi-turn challenges reuse existing `challenge.json` format with an added field:

```json
{
  "mode": "multi-turn",
  "max_turns": 10,
  "human_context": "You are a senior developer who wants X because Y..."
}
```

Existing single-turn challenges remain unchanged. The multi-turn adapter falls back to single-turn scoring if the model never asks a question.

### Reporting

Results include both dimensions:

```
| Model      | Quality | Turns | Efficiency |
|------------|---------|-------|------------|
| Opus 4.8   | 0.95    | 3     | 0.32       |
| Opus 4.6   | 0.78    | 1     | 0.78       |
| GPT-5.5    | 0.82    | 1     | 0.82       |
```

This lets teams choose based on their constraint: "I want max quality and don't mind answering questions" vs. "I need fire-and-forget autonomy."

## Consequences

### Positive

- Captures a real behavioral difference between models that current benchmarks miss
- Helps teams select the right model for their workflow style (pair-programming vs. delegation)
- Reuses existing challenge infrastructure and scoring criteria
- Simulated human enables batch runs without manual intervention

### Negative

- Simulated human introduces a confound — real humans are inconsistent, impatient, sometimes wrong
- LLM-as-judge playing human adds cost (extra API calls per turn per run)
- "Did the model ask a question?" detection is imperfect for free-form output
- Results depend heavily on the simulated human's prompt — needs calibration

### Risks

- Models may game the metric by never asking questions (optimize for autonomy_score alone)
- The simulated human may be too helpful compared to real users, inflating multi-turn quality scores
- Max-turn cap choice affects results — too low penalizes thorough models, too high wastes budget

## Alternatives considered

1. **Separate benchmark suite**: Run a completely different benchmark for multi-turn. Rejected — creates maintenance burden and prevents direct comparison.
2. **Human-in-the-loop only**: Require real human answers. Rejected — doesn't scale for batch runs across many models/iterations.
3. **Penalize questions as failures**: Treat any clarification as a negative signal. Rejected — contradicts the observation that asking leads to better outcomes.
