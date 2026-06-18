---
name: bench-run
description: 'Run an A/B benchmark matrix against one or more models. Use when the user says run bench, launch benchmark, test models, or compare models.'
argument-hint: '[models=<id,...>] [variants=<id,...>] [challenges=<id,...>] [iterations=<n>] [parallel=<n>] [deadline=<s>] [report-only]'
disable-model-invocation: true
---

# Bench Run

Run the project's A/B benchmark, then print the decision report.

## Process

1. **Locate** — find `baseline.json` to determine the bench root. Derive the batch runner and report script from the files next to it. Never hardcode paths.

2. **Validate model IDs** — if `models=` is provided or read from `baseline.json#default_models`, verify each ID is valid before launching the full matrix:
   ```bash
   claude -p --model <id> --output-format json "say hi" 2>&1 | head -3
   ```
   A `400 invalid model identifier` means the ID is wrong. The format depends on the backend: `us.anthropic.claude-<family>-<version>-v1:0` for Bedrock, `claude-<family>-<version>` for direct API. Fix before proceeding — an invalid ID produces empty diffs and scores 0.

3. **Confirm matrix** — resolve variants and challenges. Print `N models × M variants × K challenges × I iterations = total runs`. Ask before launching if total > 60.

4. **Run** — spawn one background process per model:
   ```bash
   node <batch-runner> --model <id> --challenges <list> --variants <list> \
     --iterations <n> --hard-deadline <deadline> --parallel <parallel> \
     >> /tmp/bench-<model>-<ts>.log 2>&1 &
   ```
   Report PIDs and log paths. Poll until all finish.

5. **Report** — run the report script. It writes `runs/report.json` and prints two views.

## Reading the Results

### View A — "Which model should I use?"

One line per task category. Each model competes under its best config. The default lens is `cost`: among models tied on quality, pick the cheapest.

```
▸ spec-feature → sonnet-4-5 / time-aware-agent  (q=0.81, 130s, $0.29)
    (quality: opus-4-6 / time-aware-agent)
```

Read as: **for spec-feature tasks, sonnet-4-5 with time-aware config is the best value** (quality 0.81, costs $0.29, takes 130s). The `(quality: ...)` sub-line only appears when a different model wins if you optimize purely for quality instead of cost — if no sub-line, the same model wins on all axes.

- `q=` is the mean criteria pass rate (0 to 1). Higher is better.
- Time and cost are averages across runs in that category.

### View B — "How should I configure model X?"

Shows how much the variant (AI context) changes each model's result.

```
    opus-4-8     best=time-aware-agent (0.90)  worst=unguided-agent (0.20)  Δ0.70  config-sensitive
    sonnet-4-5   best=time-aware-agent (0.81)  worst=unguided-agent (0.50)  Δ0.31  config-sensitive
```

Read as: **opus-4-8 scores anywhere from 0.20 to 0.90 depending on config** — the context you give it matters more than the model itself. `config-sensitive` (Δ ≥ 0.10) means tuning the CLAUDE.md/variant is high-value for this model. `config-robust` means the model performs similarly regardless of context.

### What to do with this

1. Pick your task category (bugfix, feature, refactor, architecture…)
2. View A tells you which model+config to use by default
3. If you disagree with a cost/quality tradeoff, look at other profiles in the sub-lines
4. View B tells you whether investing time in CLAUDE.md tuning is worth it for your model

## Rules

- Never push to main. Commit results separately with `/ship`.
- `deadline` is a kill switch on the runner, never injected into the model prompt.
- `report-only` skips steps 3–4 and regenerates the report from existing runs.
- Model IDs must be validated (step 2) before launching. An invalid ID wastes the entire matrix.
- Acceptance criteria must score below 0.25 on the unmodified base commit. If all runs produce identical scores, suspect invalid model IDs or criteria that pass by default.
