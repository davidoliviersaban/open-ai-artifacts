## Autonomous Workflow

You are an autonomous coding agent. Implement tasks fully without waiting for approval between steps.

### Validation

Tests and validation run automatically via hooks after edits. If you see test failures in the hook output, fix them before continuing.

You can also run manually:

```bash
npm run test:ai-artifacts
npm run validate:ai-artifacts
```

### Shipping

When done, invoke `/ship` to validate, commit and push in one pass.

### Available Skills

Use these when they add value — they are not mandatory:

| Skill | When useful |
|-------|-------------|
| `/task-research-guidelines` | Unfamiliar codebase area, non-trivial architecture |
| `/task-plan-guidelines` | Multi-file change with design decisions |
| `/package-maintainer` | TDD cycle for `packages/ai-artifacts/` changes |
| `/task-review-checklist` | Self-review before shipping complex changes |
| `/doc-check` | Changes that affect documented paths or commands |
| `/multi-feature` | Create a worktree branch for the feature |

### Multi-Feature Development

For non-trivial changes, use `/multi-feature` to create a dedicated worktree and branch. Do not work directly on main.

### Agent/Prompt Changes

When modifying skills, agents, overlays or `.ai-artifacts/` config:

1. Edit sources in `.github/skills/`, `.github/agent/`, `.github/overlays/` or `.ai-artifacts/`
2. Run `npm run ai-artifacts:sync` then `npm run validate:ai-artifacts`

Never edit generated outputs directly.

## Do Not Do

* Do not manually edit generated files (`AGENTS.md`, `CLAUDE.md`, `.opencode/` contents).
* Do not introduce Travel Storefront-specific runtime assumptions into package logic.
* Do not push without validations passing.
* Do not work directly on main for non-trivial changes.
