---
name: add-skill
description: Create a new skill in the correct location and register it in WORKFLOW.md or the appropriate agent. Use when the user asks to add a skill, create a new skill, or scaffold a skill.
disable-model-invocation: true
---

# Add Skill

Scaffold a new skill in the correct location and ensure it is properly registered in the project workflow or agent configuration.

## Workflow

1. **Determine skill type** — Is this a workflow skill (invoked in the development pipeline) or an agent skill (used by a specific agent)?
2. **Create the skill** — Write the SKILL.md and any supporting scripts
3. **Register the skill** — Add it to WORKFLOW.md or the relevant agent file
4. **Validate** — Confirm the skill is discoverable and the project remains consistent

## Step 1: Determine Skill Type

Ask or infer:

| Type | Location | Registered in |
|------|----------|---------------|
| Workflow skill | `.github/skills/<name>/SKILL.md` | `WORKFLOW.md` — Available Skills table + Pipeline table if it has a step |
| Agent skill | `.github/skills/<name>/SKILL.md` | The agent file in `.github/agent/` that should invoke it |
| Prompt skill | `.github/skills/<name>/SKILL.md` | `WORKFLOW.md` — alongside prompt-build/analyze/refactor |

All hand-authored skills go in `.github/skills/<name>/`. Never place them in `.opencode/skills/` or `.ai-artifacts/` — those are for generated artifacts.

## Step 2: Create the Skill

### SKILL.md structure

```markdown
---
name: <kebab-case-name>
description: <one-line description for tool discovery>
disable-model-invocation: true
---

# <Title>

<One paragraph explaining what the skill does and when to use it.>

## Workflow

1. **Step 1** — ...
2. **Step 2** — ...

## <Step details>

...

## Important Rules

- <Hard constraints>
```

### Conventions

- `name` must be kebab-case, matching the directory name
- `description` should include trigger phrases (what the user says to invoke this skill)
- Set `disable-model-invocation: true` unless the skill is purely informational
- Scripts go in `.github/skills/<name>/scripts/` if needed
- Keep the skill self-contained — another agent should be able to follow it without external context

## Step 3: Register the Skill

### For workflow skills

Edit `WORKFLOW.md`:

1. Add a row to the **Available Skills** table:
   ```
   | `/skill-name` | Brief purpose description |
   ```

2. If the skill represents a pipeline step, add it to the **Pipeline** table at the appropriate position with a "When to skip" column.

### For agent skills

Edit the relevant agent in `.github/agent/<agent-name>.md` to reference the skill in its instructions.

## Step 4: Validate

Run:

```bash
npm run validate:ai-artifacts
```

This ensures:
- No broken references
- Lock file is consistent
- Installed artifacts are up to date

## Important Rules

- **Never place hand-authored skills in `.opencode/skills/`** — that path is for symlinks to generated artifacts
- **Never place skills in `.ai-artifacts/`** — that path is for upstream-sourced artifacts and config
- **Always register the skill** — an unregistered skill is invisible to agents
- **Match the naming convention** — kebab-case, directory name = frontmatter name
- **Keep skills focused** — one skill, one responsibility
