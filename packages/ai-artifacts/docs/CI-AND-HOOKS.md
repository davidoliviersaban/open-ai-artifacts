# CI and Install Hooks

This document describes automation shipped by the `scripts/ai-artifacts/` package and installed into Travel Storefront.

## Pre-commit Hook

**File**: `scripts/pre-commit-checks.js`

### What it does

When you commit changes that affect AI artifacts, the pre-commit hook automatically validates that generated files are up to date.

### Triggers

The validation runs when any of these files are staged:
- `.ai-artifacts/artifacts.yml`
- `.ai-artifacts/files/**/*`
- `.ai-artifacts/overlays/**/*`
- `scripts/ai-artifacts/**/*`

### Validation

Runs `npm run ai-artifacts:sync -- --check` to verify that:
- Generated prompts match their upstream sources + overlays
- Generated skills match their upstream sources + overlays
- Lock file hashes match current state

### On failure

If generated files are stale, the commit is blocked with:

```
ERROR: Generated AI artifacts are stale!
Run 'npm run ai-artifacts:sync' to regenerate artifacts.
```

### Bypass (not recommended)

```bash
git commit --no-verify
```

Only use when you understand the implications (e.g., fixing a broken manifest in an emergency).

---

## CI Workflow

**Installed file**: `.github/workflows/ai-artifacts.yml`

**Packaged source**: `scripts/ai-artifacts/workflows/ai-artifacts.yml`

`npm install` installs the packaged workflow to the GitHub workflow location through the root `postinstall` script. Use `npm run ai-artifacts:install -- --check` to verify the installed copy without writing.

### What it does

On every PR or push to `main` that touches AI artifact files, the workflow:

1. **Tests** the AI artifacts framework (`npm run test:ai-artifacts`)
2. **Validates** generated files are up to date (`npm run ai-artifacts:sync --check`)
3. **Generates** drift and risk reports
4. **Uploads** reports as artifacts (accessible in GitHub Actions UI)

### Triggers

```yaml
on:
  pull_request:
    paths:
      - '.ai-artifacts/**'
      - 'scripts/ai-artifacts/**'
      - '.github/prompts/**'
      - '.github/skills/**'
      - 'package.json'
      - 'package-lock.json'
```

### Artifacts uploaded

Available in the GitHub Actions run page:

- `drift-report.md` - Shows upstream changes and staleness
- `risk-assessment.md` - Risk analysis for review
- `update-summary.md` - Summary of what changed

### On failure

CI fails if:
- Any test fails
- Generated files are stale (someone committed without syncing)
- Manifest validation fails

---

## Testing

### Run all AI artifacts tests

```bash
npm run test:ai-artifacts
```

**Test coverage**:
- Framework core (`app.test.js`) - 3 tests
- Composition utilities (`composer.test.js`) - 5 tests
- Manifest validation (`lib.js` tests) - 6 tests
- Documentation examples (`docs.test.js`) - 2 tests
- Pre-commit hook logic (`pre-commit.test.js`) - 2 tests

**Total**: 18 tests

### Run specific test file

```bash
node --test scripts/ai-artifacts/app.test.js
```

### Run tests in watch mode (Node.js 20+)

```bash
node --test --watch scripts/ai-artifacts/*.test.js
```

---

## Local Validation

### Full validation (what CI runs)

```bash
npm run validate:ai-artifacts
```

This runs:
1. `fetch` - Update vendor sources
2. `sync --check` - Verify generated files
3. `drift` - Generate drift report
4. `risk` - Generate risk assessment
5. `summary` - Generate update summary

### Quick check (no fetch)

```bash
npm run ai-artifacts:sync -- --check
```

Verifies generated files without fetching upstream sources.

---

## Workflow Examples

### Adding a new upstream artifact

```bash
# 1. Edit playbook
vim .ai-artifacts/artifacts.yml

# 2. Add overlay if needed
vim .ai-artifacts/overlays/my-overlay.md

# 3. Fetch upstream source
npm run ai-artifacts:fetch

# 4. Generate artifact
npm run ai-artifacts:sync

# 5. Validate everything
npm run validate:ai-artifacts

# 6. Review changes
git diff .github/prompts/ .github/skills/

# 7. Commit (pre-commit hook validates automatically)
git add .ai-artifacts/ .github/
git commit -m "feat: adopt upstream artifact X"
```

### Updating an upstream source

```bash
# 1. Change version in playbook
vim .ai-artifacts/artifacts.yml  # Update package version

# 2. Fetch new version
npm run ai-artifacts:fetch

# 3. Regenerate artifacts
npm run ai-artifacts:sync

# 4. Check what changed
npm run ai-artifacts:drift
npm run ai-artifacts:risk

# 5. Review reports
cat .ai-artifacts/reports/drift.md
cat .ai-artifacts/reports/risk-assessment.md

# 6. If acceptable, commit
git add .ai-artifacts/ .github/
git commit -m "chore: update upstream source X to vY.Z"
```

### Modifying an overlay

```bash
# 1. Edit overlay
vim .ai-artifacts/overlays/my-overlay.md

# 2. Regenerate (updates hashes)
npm run ai-artifacts:sync

# 3. Review diff
git diff .github/prompts/ .github/skills/

# 4. Commit (pre-commit hook validates)
git add .ai-artifacts/overlays/ .github/
git commit -m "feat: enhance overlay for X"
```

---

## Troubleshooting

### Pre-commit hook fails but files look correct

```bash
# Regenerate to update lock file hashes
npm run ai-artifacts:sync

# Verify check passes
npm run ai-artifacts:sync -- --check

# Stage and retry
git add .github/ .ai-artifacts/lock.yml
git commit
```

### CI fails: "Generated files have uncommitted changes"

Someone edited a generated file manually instead of updating the source/overlay.

**Fix**:
```bash
# Regenerate from sources
npm run ai-artifacts:sync

# Commit the corrected generated files
git add .github/prompts/ .github/skills/
git commit --amend --no-edit
```

### Want to skip validation temporarily

```bash
# Skip pre-commit hook (use sparingly!)
git commit --no-verify

# Note: CI will still validate
```

---

## Implementation Details

### Pre-commit check function

Located in `scripts/pre-commit-checks.js`:

```javascript
function checkAIArtifacts() {
  // Get staged files
  const staged = spawnSync('git', ['diff', '--cached', '--name-only']);
  const stagedFiles = staged.stdout.trim().split(/\r?\n/).filter(Boolean);

  // Check if AI artifact files changed
  const aiArtifactPatterns = [
    /^\.ai-artifacts\/artifacts\.yml$/,
    /^\.ai-artifacts\/overlays\//,
    /^scripts\/ai-artifacts\//,
  ];

  const aiArtifactsChanged = stagedFiles.some((file) =>
    aiArtifactPatterns.some((pattern) => pattern.test(file))
  );

  if (!aiArtifactsChanged) return true;

  // Run validation
  const result = spawnSync('node', ['scripts/ai-artifacts/cli.js', 'sync', '--check']);

  if (result.status !== 0) {
    console.error('ERROR: Generated AI artifacts are stale!');
    console.error("Run 'npm run ai-artifacts:sync' to regenerate artifacts.");
    return false;
  }

  return true;
}
```

### Test coverage

Pre-commit hook tests (`scripts/ai-artifacts/pre-commit.test.js`):

1. **Pattern detection** - Verifies artifact playbook changes are detected
2. **Skip logic** - Verifies non-AI-artifact commits are not blocked

Framework tests (`scripts/ai-artifacts/*.test.js`):

1. **End-to-end** - Full fetch/sync/validate cycle
2. **Directory artifacts** - Bundled skill resources
3. **Risk policy** - Validation with risk thresholds
4. **Composition** - Overlay append and substitutions
5. **Frontmatter** - YAML preservation in generated files
6. **Manifest validation** - Schema enforcement
7. **Documentation** - JSON examples in docs stay valid

---

## Future Enhancements

### Phase 2
- [ ] Automatic PR creation for upstream updates
- [ ] Slack/GitHub notifications for drift detection
- [ ] Weekly scheduled workflow to check for upstream updates

### Phase 3
- [ ] Agentic drift review for complex changes
- [ ] Semantic overlay application
- [ ] Multi-repo artifact sharing

---

## References

- Package README: [../README.md](../README.md)
- Package design: [DESIGN.md](./DESIGN.md)
- Future semantic merge design: [SEMANTIC-MERGE-DESIGN.md](./SEMANTIC-MERGE-DESIGN.md)
- CLI implementation: `scripts/ai-artifacts/cli.js`, exposed as the `ai-artifacts` package binary
- Pre-commit checks: `scripts/pre-commit-checks.js`
- Packaged CI workflow source: `scripts/ai-artifacts/workflows/ai-artifacts.yml`
- Installed CI workflow: `.github/workflows/ai-artifacts.yml`
