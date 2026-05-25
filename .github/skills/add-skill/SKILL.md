---
name: add-skill
description: Create a new skill in the correct location and register it in WORKFLOW.md or the appropriate agent. Use when the user asks to add a skill, create a new skill, or scaffold a skill.
disable-model-invocation: true
---

# Add Skill

Scaffold a new skill in the correct location and ensure it is properly registered in the project workflow or agent configuration.

## Workflow

1. **Research existing skills** — Check if the skill already exists upstream or in a known skill registry
2. **Determine skill type** — Is this a workflow skill (invoked in the development pipeline) or an agent skill (used by a specific agent)?
3. **Create or install the skill** — Write the SKILL.md, add a render in `artifacts.yml`, or extend an existing skill
4. **Register the skill** — Add it to WORKFLOW.md or the relevant agent file
5. **Validate** — Confirm the skill is discoverable and the project remains consistent

## Step 0: Research Before Creating (RPI)

Before writing anything, verify the skill does not already exist. Follow the RPI (Research-Plan-Implement) principle — never implement what already exists elsewhere.

### Where to look:

1. **Upstream vendor** — Check `.ai-artifacts/vendor/hve-core/.github/` for existing skills, prompts and agents:
   ```bash
   find .ai-artifacts/vendor/hve-core/.github/skills -name "SKILL.md" | sort
   find .ai-artifacts/vendor/hve-core/.github/prompts -name "*.prompt.md" | sort
   ```

2. **Already installed in this repo** — Check for local skills that overlap:
   ```bash
   ls .github/skills/
   grep -r "<keyword>" .github/skills/*/SKILL.md
   ```

3. **Known skill registries** — If the project references external skill databases or collections, check those too. For hve-core:
   ```bash
   find .ai-artifacts/vendor/hve-core/collections -name "*.collection.yml" -exec grep -l "<keyword>" {} \;
   ```

### Decision matrix:

| Found in | Action |
|----------|--------|
| Vendor skill exists, fits as-is | Add a render step in `artifacts.yml` with overlays for repo context |
| Vendor skill exists, partially fits | Fork as hand-authored, reference the original as inspiration |
| Similar skill exists locally | Extend or refactor the existing skill instead of creating a new one |
| Nothing found | Proceed to create a new hand-authored skill |

Do NOT create a skill that duplicates logic already available upstream. If a vendor skill covers 80%+ of the need, use it with overlays rather than rewriting from scratch.

> **Safety net:** If research is skipped or incomplete, `/skill-audit` will catch cross-skill duplication via COMPOSABILITY rules during periodic audits. But catching it early here avoids wasted effort and unnecessary rewrites later.

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
- **Always research first** — Step 0 is not optional. Do not create what already exists upstream.
- **Use `/multi-feature`** — Create a worktree for skill development, do not work directly on main.

## Installation Philosophy

Skills, agents, and instructions follow a strict separation between **hand-authored** and **managed** artifacts:

| Origin | Location | Managed by |
|--------|----------|------------|
| Hand-authored (local) | `.github/skills/<name>/`, `.github/copilot-instructions.md` | Developers directly |
| Upstream (framework) | Generated into `.github/skills/` via `artifacts.yml` | `ai-artifacts` package (render + overlays) |
| Symlinks (tool access) | `.opencode/skills/`, `.claude/commands/` | `ai-artifacts` package (link steps) |

### When creating a new skill, choose the right approach:

1. **Managed via `artifacts.yml`** — The skill exists upstream and you customize it with overlays. Edit the render config in `.ai-artifacts/artifacts.yml`, add overlays in `.github/overlays/`, then run `npm run ai-artifacts:sync`. This is the preferred path when vendor coverage is 80%+.

2. **Hand-authored** — The skill is 100% specific to this repo and does not exist upstream. Write it directly in `.github/skills/<name>/SKILL.md`. This is the default for local workflow skills (ship, doc-check, multi-feature, etc.).

3. **Future: package-provided base skills** — When the `ai-artifacts` package ships built-in skills, consuming repos will get them via `npx ai-artifacts install`. Until then, keep local skills hand-authored.

### The rule is simple:

> If it exists upstream and you customize it → managed in `artifacts.yml` with overlays.
> If you wrote it from scratch for this repo → hand-authored in `.github/skills/`.
> Never mix: do not manually edit a managed skill, do not put a hand-authored skill in `artifacts.yml`.
