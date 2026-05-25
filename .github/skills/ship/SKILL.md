---
name: ship
description: 'Validate, commit, push and create PR in one pass. Use when the user says ship, ship it, send it, or is done with a feature.'
argument-hint: '[scope=staged|all] [message=...] [no-pr]'
---

# Ship

Run all pre-commit validations, commit, push, and create a pull request — all in one pass.

## Process

1. **Check staged changes**: Run `git status` and `git diff --cached --stat`. If nothing is staged but there are unstaged changes, stage all modified and untracked files relevant to the feature. If truly nothing to commit, report and stop.

2. **Run validations**:
   - `npm run test:ai-artifacts` — tests must pass
   - `npm run validate:ai-artifacts` — sync and install checks must pass
   - `/doc-check scope=staged` — documentation must be up to date

3. **If any validation fails**: Report the failure clearly. Do NOT proceed. The user must fix the issue first.

4. **Generate commit message**: Analyze the staged diff and produce a conventional commit message:
   - First line: `type(scope): short description` (max 70 chars)
   - Blank line
   - Body: 1-3 bullet points explaining WHY, not what
   - Types: feat, fix, refactor, chore, docs, test

5. **Commit and push**: Execute:
   - `git commit -m "<generated message>\n\nCo-Authored-By: <agent> <noreply@anthropic.com>"`
   - `git push` (with `-u` if the branch has no upstream tracking)

6. **Create pull request**: If the current branch is not `main` and `no-pr` was not specified:
   - Generate a PR title from the commit message first line
   - Generate a PR body with:
     ```
     ## Summary
     - <1-3 bullet points from commit body>

     ## Validations
     - [x] Tests pass
     - [x] AI artifacts validation pass
     - [x] Documentation up to date
     ```
   - Create the PR: `gh pr create --title "<title>" --body "<body>"`
   - If already on `main`, skip PR creation.

7. **Report**: Confirm what was shipped (commit hash, branch, remote, PR URL if created).

## Rules

- Do NOT skip validations. All must pass before committing.
- If the user provided a `message=` argument, use it as the commit message instead of generating one (still validate first).
- Keep commit messages concise. The diff speaks for itself.
- If doc-check finds issues, list them and stop — do not commit with known stale docs.
- If tests or validation fail, stop and report. Do not retry automatically.
- Always create a PR unless on `main` or `no-pr` is specified. The PR is the deliverable.
- If `gh` is not available or PR creation fails, still report success for commit+push and note PR must be created manually.
