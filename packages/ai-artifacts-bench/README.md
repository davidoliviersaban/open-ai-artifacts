# @amadeus-nexwave/ai-artifacts-bench

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
| `adapters/claude-code.js` | Claude Code CLI adapter |

## Testing

```bash
node --test 'packages/ai-artifacts-bench/**/*.test.js'
# or via Nx
npm run test:ai-artifacts-bench
```

53 tests cover all modules and prove the plugin architecture works end-to-end.
