# Agent & Skill Management Workflow

This workflow governs the creation, maintenance and quality assurance of AI agents, skills and prompt artifacts. It applies to any change that modifies how agents behave, what skills are available, or how prompts are structured.

## Scope

Changes governed by this workflow:

- Skills in `.github/skills/`
- Agent instructions in `.github/agent/`
- Context overlays in `.github/overlays/`
- Upstream artifact configuration in `.ai-artifacts/`
- Generated outputs (`AGENTS.md`, `CLAUDE.md`, `.opencode/skills/`, `.opencode/agent/`)

## Available Skills

| Skill | Purpose |
|-------|---------|
| `/prompt-build` | Build or improve prompt engineering artifacts |
| `/prompt-analyze` | Evaluate prompt artifacts against quality criteria |
| `/prompt-refactor` | Refactor and clean up prompt artifacts |
| `/add-skill` | Scaffold a new skill and register it in the correct workflow |
| `/skill-audit` | Audit skills for visibility safety, determinism and composability |
| `/doc-ops-update` | Documentation quality assurance and updates |

## Pipeline

| Step | Skill | When to skip |
|------|-------|--------------|
| 1. Build/edit | `/prompt-build` | Editing an existing skill (use `/prompt-refactor` instead) |
| 2. Analyze | `/prompt-analyze` | Trivial wording fix with no structural change |
| 3. Refactor | `/prompt-refactor` | New skill that was just built with `/prompt-build` |
| 4. Audit | `/skill-audit` | Single skill edit with no cross-skill impact |
| 5. Validate | `npm run validate:ai-artifacts` | Never — always validate |

## Adding a New Skill

Use `/add-skill`. It ensures:

1. The skill is placed in `.github/skills/<name>/SKILL.md`
2. The skill is registered in the appropriate workflow file:
   - Business/development skills → `WORKFLOW.md` (root)
   - Agent/prompt management skills → `.github/WORKFLOW.md` (this file)
3. The skill follows naming conventions (kebab-case, matching directory name)
4. Project validation passes after the addition

## Rules

- Never edit generated outputs directly — edit sources in `.github/overlays/`, `.github/skills/`, or `.github/agent/`.
- After modifying overlays or `.ai-artifacts/` config, run `npm run ai-artifacts:sync` then `npm run validate:ai-artifacts`.
- Run `/skill-audit` periodically or after adding multiple skills to catch drift.
- Keep skills focused: one skill, one responsibility. Split rather than bloat.
- Framework-provided skills (from `hve-core`) should not be edited locally — customize via overlays.

## Framework Installation

This file is installed by the `ai-artifacts` package. Consuming repositories get it via:

```bash
npx ai-artifacts install
```

Repositories can extend it with local additions but should not remove framework-provided skills.
