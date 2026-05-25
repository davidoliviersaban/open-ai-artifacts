---
name: ship
description: 'Validate, generate commit message and prepare a clean commit+push'
argument-hint: '[scope=staged|all] [message=...]'
---

# Ship

Run all pre-commit validations then generate a commit message and the exact commands to commit and push cleanly.

## Process

1. **Check staged changes**: Run `git status` and `git diff --cached --stat`. If nothing is staged, report and stop.

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
   - `git push`

6. **Report**: Confirm what was shipped (commit hash, branch, remote).

## Rules

- Do NOT skip validations. All must pass before committing.
- If the user provided a `message=` argument, use it as the commit message instead of generating one (still validate first).
- Keep commit messages concise. The diff speaks for itself.
- If doc-check finds issues, list them and stop — do not commit with known stale docs.
- If tests or validation fail, stop and report. Do not retry automatically.
