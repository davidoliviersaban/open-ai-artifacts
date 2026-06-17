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

2. **Confirm matrix** — resolve models (from `models=` or `baseline.json#default_models`), variants, and challenges. Print `N models × M variants × K challenges × I iterations = total runs`. Ask before launching if total > 60.

3. **Run** — spawn one background process per model:
   ```bash
   node <batch-runner> --model <id> --challenges <list> --variants <list> \
     --iterations <n> --hard-deadline <deadline> --parallel <parallel> \
     >> /tmp/bench-<model>-<ts>.log 2>&1 &
   ```
   Report PIDs and log paths. Poll until all finish.

4. **Report** — run the report script. It writes `runs/report.json` and prints View A (which model per use case) and View B (variant sensitivity per model).

## Rules

- Never push to main. Commit results separately with `/ship`.
- `deadline` is a kill switch on the runner, never injected into the model prompt.
- `report-only` skips steps 2–3 and regenerates the report from existing runs.
