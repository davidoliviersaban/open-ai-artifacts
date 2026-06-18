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

5. **Report** — run the report script. It writes `runs/report.json` and prints View A (which model per use case) and View B (variant sensitivity per model).

## Rules

- Never push to main. Commit results separately with `/ship`.
- `deadline` is a kill switch on the runner, never injected into the model prompt.
- `report-only` skips steps 3–4 and regenerates the report from existing runs.
- Model IDs must be validated (step 2) before launching. An invalid ID wastes the entire matrix.
- Acceptance criteria must score below 0.25 on the unmodified base commit. If all runs produce identical scores, suspect invalid model IDs or criteria that pass by default.
