---
name: bench-run
description: 'Run an A/B benchmark matrix against one or more models. Use when the user says run bench, launch benchmark, test models, or compare models.'
argument-hint: '[models=<id,...>] [variants=<id,...>] [challenges=<id,...>] [iterations=<n>] [parallel=<n>] [deadline=<s>] [report-only]'
disable-model-invocation: true
---

# Bench Run

Run the A/B benchmark matrix for this project. Executes one or more models across challenges and variants, then generates a decision report.

Invoke this skill when the user asks to run a benchmark, test model performance, or compare model configurations on this project's task suite.

## Inputs

| Argument | Default | Description |
|----------|---------|-------------|
| `models=` | see step 1 | Comma-separated model IDs to benchmark |
| `variants=` | all in `ab-test/variants/` | Comma-separated variant IDs to run |
| `challenges=` | all in `ab-test/challenges/` | Comma-separated challenge IDs to run |
| `iterations=` | `1` | Number of runs per (model, variant, challenge) cell |
| `parallel=` | `3` | Max concurrent runs per model batch |
| `deadline=` | `900` | Hard kill deadline in seconds (never told to model) |
| `report-only` | false | Skip runs, regenerate report from existing scored runs |

## Workflow

1. **Resolve models** — If `models=` not provided, check `ab-test/baseline.json` for a `default_models` list. If absent, list the three current Anthropic Bedrock model IDs and ask the user to confirm or select.

2. **Resolve scope** — Resolve `variants` and `challenges`. If not specified, discover all from `ab-test/variants/` and `ab-test/challenges/`. Print the full matrix: `N models × M variants × K challenges × I iterations = total runs`.

3. **Guard rails** — Before launching:
   - Confirm the matrix is not larger than 60 runs without explicit user confirmation.
   - Check `ab-test/runs/` exists and is writable.
   - Verify `node ab-test/scripts/batch.js --help` exits 0 (batch runner available).

4. **Launch batches** — For each model, launch a background batch process:
   ```bash
   node ab-test/scripts/batch.js \
     --model <model-id> \
     --challenges <challenges> \
     --variants <variants> \
     --iterations <n> \
     --hard-deadline <deadline> \
     --parallel <parallel> \
     >> /tmp/bench-<model-slug>.log 2>&1 &
   ```
   Log files go to `/tmp/bench-<model-slug>-<timestamp>.log`. Report all PIDs and log paths to the user.

5. **Wait and monitor** — Poll every 60s while any batch process is still running:
   ```bash
   ps aux | grep "batch.js" | grep -v grep
   tail -3 /tmp/bench-<model-slug>-<timestamp>.log
   ```
   Report progress as runs complete (count new files in `ab-test/runs/`).

6. **Score runs** — Once all batches finish, score any unscored runs:
   ```bash
   node ab-test/scripts/score.js
   ```

7. **Generate report** — Run the reporter and save results:
   ```bash
   node ab-test/scripts/report.js
   ```
   This writes `ab-test/runs/report.json` and prints the decision tables to terminal.

8. **Print decision summary** — Display the two canonical views from the report:
   - **View A** — which model per use-case category (default lens: `cost`)
   - **View B** — variant sensitivity per model (config-sensitive flag)

## Important Rules

- **Never push to main** — this skill runs and reports only. Commit results with `/ship`.
- **Hard deadline is never injected** — the `deadline` argument is a kill switch on the runner side, never put in `CLAUDE.md` or the variant config. Only the `time-aware-agent` variant injects a time budget into the model.
- **Three independent axes** — variant (AI context), model (engine), and hard deadline are separate. Never conflate them in the matrix or the report.
- **Models run in parallel, runs within a model run with `--parallel`** — do not run multiple models in a single batch.js call; spawn one process per model.
- **report-only skips steps 1–6** — jumps straight to step 7. Useful when runs already exist and you just want to refresh the analysis.
- **Always show the matrix before launching** — the user must be able to cancel before any run starts.
