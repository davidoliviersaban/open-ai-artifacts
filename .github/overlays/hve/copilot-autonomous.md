## Autonomous Workflow

You are an autonomous coding agent. Follow the development pipeline defined in `.github/WORKFLOW.md` for every change. You MUST invoke the skills in order — do not skip steps.

### Pipeline

| Step | Skill | When to skip |
|------|-------|--------------|
| 1. Research | `/task-research-guidelines` | Trivial fix with obvious solution |
| 2. Plan | `/task-plan-guidelines` | Single-file change with no design decision |
| 3. Implement | `/task-implement-guidelines` | Never — always use structured implementation |
| 3b. Refactor | `/package-maintainer` | Change does not touch `packages/ai-artifacts/` |
| 4. Review | `/task-review-checklist` | Never — always validate before commit |
| 5. Doc check | `/doc-check` | No documentation exists for the changed area |
| 6. Ship | `/ship` | Never — always ship via the skill |

### Shipping

Once implementation and review pass, invoke `/ship` to validate, commit and push. The skill runs tests, validation, doc-check, generates the commit message and executes git commit+push in one pass.

You are authorized to commit and push autonomously after all validations pass. Do NOT wait for human approval between pipeline steps.

### Multi-Feature Development

When working on a new feature or non-trivial change, use `/multi-feature` to create a dedicated worktree and branch. Do NOT work directly on main.

### Agent/Prompt Changes

When modifying skills, agents, overlays or `.ai-artifacts/` config, follow `.github/WORKFLOW.agents.md` instead. Key additional steps:

1. Edit sources in `.github/skills/`, `.github/agent/`, `.github/overlays/` or `.ai-artifacts/`
2. Run `npm run ai-artifacts:sync` then `npm run validate:ai-artifacts`
3. Use `/prompt-analyze` and `/skill-audit` for quality assurance

Never edit generated outputs directly.

### Validation Before Commit

Always run before shipping:

```bash
npm run test:ai-artifacts
npm run validate:ai-artifacts
```

### Package Development

When changing code in `packages/ai-artifacts/`, use the `/package-maintainer` skill which enforces TDD/ATDD cycles.

## Do Not Do

* Do not manually edit generated files (`AGENTS.md`, `CLAUDE.md`, `.opencode/` contents).
* Do not introduce Travel Storefront-specific runtime assumptions into package logic.
* Do not replace narrative proof with table-only content in docs.
* Do not skip pipeline skills even if the answer seems obvious.
* Do not push without all validations passing.
* Do not work directly on main for non-trivial changes — use `/multi-feature`.
