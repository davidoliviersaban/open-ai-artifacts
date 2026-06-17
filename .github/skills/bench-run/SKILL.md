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
| `variants=` | all discovered | Comma-separated variant IDs to run |
| `challenges=` | all discovered | Comma-separated challenge IDs to run |
| `iterations=` | `1` | Number of runs per (model, variant, challenge) cell |
| `parallel=` | `3` | Max concurrent runs per model batch |
| `deadline=` | `900` | Hard kill deadline in seconds (never told to model) |
| `report-only` | false | Skip runs, regenerate report from existing scored runs |

## Workflow

### Step 0 — Locate the bench entrypoint

Each project lays out its bench directory differently. Discover it before doing anything else:

```bash
# Find the batch runner — the file that accepts --model/--challenges/--variants
find . -name "batch.js" -o -name "run.js" | grep -v node_modules | head -5
# Find baseline.json — defines default_models and variant list
find . -name "baseline.json" | grep -v node_modules | head -3
# Find the report script
find . -name "report.js" | grep -v node_modules | head -3
```

From the results, derive:
- `BENCH_DIR` — the directory containing `baseline.json` (e.g. `ab-test/` or `bench/`)
- `BATCH_CMD` — the command to run one batch (e.g. `node ab-test/scripts/batch.js` or `node bench/run.js`)
- `REPORT_CMD` — the command to generate the report (e.g. `node ab-test/scripts/report.js` or `node bench/report.js`)
- `RUNS_DIR` — where scored runs are written (read from config or default to `$BENCH_DIR/runs/`)

Use these variables in all subsequent steps. Never hardcode paths.

### Step 1 — Resolve models

If `models=` not provided, read `$BENCH_DIR/baseline.json`:
- If it has a `default_models` array, use those.
- If absent, list the three current Anthropic Bedrock model IDs and ask the user to confirm.

### Step 2 — Resolve scope

Discover `variants` and `challenges` from `$BENCH_DIR/variants/` and `$BENCH_DIR/challenges/` unless overridden. Print the full matrix before proceeding: `N models × M variants × K challenges × I iterations = total runs`.

### Step 3 — Guard rails

- Confirm the matrix is not larger than 60 runs without explicit user confirmation.
- Check `$RUNS_DIR` exists and is writable.
- Verify `$BATCH_CMD --help` or a dry-run exits without fatal errors.

### Step 4 — Launch batches

For each model, launch a background batch process using the discovered `$BATCH_CMD`:

```bash
$BATCH_CMD \
  --model <model-id> \
  --challenges <challenges> \
  --variants <variants> \
  --iterations <n> \
  --hard-deadline <deadline> \
  --parallel <parallel> \
  >> /tmp/bench-<model-slug>-<timestamp>.log 2>&1 &
```

Report all PIDs and log paths to the user.

### Step 5 — Wait and monitor

Poll every 60s while any batch process is still running. Report progress by counting new files in `$RUNS_DIR`.

### Step 6 — Score runs

Once all batches finish, score any unscored runs if the batch runner does not auto-score. Check whether `$BATCH_CMD` already scores on completion — if so, skip this step.

### Step 7 — Generate report

```bash
$REPORT_CMD
```

This writes `$RUNS_DIR/report.json` and prints the decision tables to terminal.

### Step 8 — Print decision summary

Display the two canonical views from the report:
- **View A** — which model per use-case category (default lens: `cost`)
- **View B** — variant sensitivity per model (config-sensitive flag)

## Important Rules

- **Never push to main** — this skill runs and reports only. Commit results with `/ship`.
- **Hard deadline is never injected** — the `deadline` argument is a kill switch on the runner side, never put in `CLAUDE.md` or the variant config. Only a `time-aware` variant injects a time budget into the model.
- **Three independent axes** — variant (AI context), model (engine), and hard deadline are separate. Never conflate them in the matrix or the report.
- **Models run in parallel, runs within a model run with `--parallel`** — spawn one process per model.
- **Discover, don't assume** — always run Step 0. Never hardcode `ab-test/` or any project-specific path.
- **report-only skips steps 1–6** — jumps straight to step 7. Useful when runs already exist.
- **Always show the matrix before launching** — the user must be able to cancel before any run starts.
