# Development Workflow

This project enforces a structured workflow for any code or configuration change. Each step uses a dedicated skill that must be invoked in order.

## Pipeline

| Step | Skill | When to skip |
|------|-------|--------------|
| 1. Research | `/task-research-guidelines` | Trivial fix with obvious solution |
| 2. Plan | `/task-plan-guidelines` | Single-file change with no design decision |
| 3. Implement | `/task-implement-guidelines` | Never — always use structured implementation |
| 4. Review | `/task-review-checklist` | Never — always validate before commit |
| 5. Doc check | `/doc-check` | No documentation exists for the changed area |

## Rules

- Steps 3 and 4 are mandatory for every change.
- Steps 1 and 2 may be skipped only for trivial, self-contained fixes (typo, single-line bug).
- Step 5 is mandatory when changes affect paths, commands, features or architecture documented in README or ADRs.
- If a step reveals issues, loop back to the appropriate earlier step before continuing.
- Do not commit or push until step 4 (and step 5 if applicable) passes cleanly.

## Validation before commit

Before committing, verify:
1. `npm run test:ai-artifacts` passes
2. `npm run validate:ai-artifacts` passes
3. `/task-review-checklist` has no blocking findings
4. `/doc-check` reports no stale documentation (when applicable)
