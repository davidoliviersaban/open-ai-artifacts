---
name: skill-audit
description: Audit skills for quality, safety, and efficiency. Checks visibility flags (disable-model-invocation), identifies deterministic steps that should be scripts, and flags cross-skill duplication for composability. Use when asked to "audit skills", "validate skills", "check skill quality", "review skill safety", "optimize skills", or "find skill duplication".
---

# Skill Audit

Analyze skills for three dimensions: visibility safety, determinism optimization, and composability. Produce a changelog of recommended rewrites.

## Workflow

1. **Run the automated scanner** — catches structural issues deterministically
2. **Apply judgment** — filter false positives, assess context-dependent findings
3. **Propose rewrites** — show before/after with a changelog explaining each change
4. **Implement** — apply accepted changes (or present for approval)

## Step 1: Automated Scan

```bash
node .github/skills/skill-audit/scripts/audit.js .github/skills

# Machine-readable output
node .github/skills/skill-audit/scripts/audit.js .github/skills --json
```

The script outputs findings grouped by skill with severity levels (`!!!` high, ` ! ` medium, ` . ` low).

## Step 2: Apply Judgment (AI Steps)

The scanner produces candidates. Filter them using these heuristics:

### Visibility — accept or dismiss

| Finding | Accept if | Dismiss if |
|---------|-----------|------------|
| VISIBILITY-001 (high-risk) | Skill actually performs destructive/irreversible actions autonomously | Keywords appear only in documentation/examples (e.g., "don't force-push") |
| VISIBILITY-002 (background) | Skill is truly reference-only, never action-oriented | Skill has actionable workflow steps despite containing guideline language |

### Determinism — accept or dismiss

| Finding | Accept if | Dismiss if |
|---------|-----------|------------|
| DETERMINISM-001 (bash block) | Block is a repeatable sequence with no variable judgment | Block is a usage example, directory diagram, or output illustration |
| DETERMINISM-002 (prose pattern) | The operation is truly fixed (same input → same output) | The step requires contextual decision-making despite matching the regex |

**Key question:** "Would a junior developer get the same result every time by copy-pasting this?" If yes → script. If no → keep as AI instruction.

### Composability — accept or dismiss

| Finding | Accept if | Dismiss if |
|---------|-----------|------------|
| COMPOSABILITY-001 (duplicate code) | Logic is truly identical and maintained independently | Similar but contextually different (different error handling, different vars) |
| COMPOSABILITY-002 (shared command) | Exact same invocation pattern with same arguments | Command is common but used differently in each skill |

## Step 3: Propose Rewrites

For each accepted finding, produce a changelog entry:

```markdown
### [skill-name] — RULE-ID

**What changed:** <one-line summary>
**Why:** <reasoning — token savings, safety, or DRY>

Before:
\`\`\`yaml
# frontmatter as-is
\`\`\`

After:
\`\`\`yaml
# frontmatter with fix applied
\`\`\`
```

For determinism extractions:

```markdown
### [skill-name] — DETERMINISM-001

**What changed:** Extracted bash block → `scripts/<action>.js`
**Why:** Same N commands every time. Script = 0 tokens, deterministic, testable.

New file: `scripts/<action>.js`

SKILL.md change:
- Before: inline bash block (N lines)
- After: `Run \`scripts/<action>.js <ARGS>\``
```

For composability extractions:

```markdown
### _cross-skill — COMPOSABILITY-001

**What changed:** Extracted shared logic → `scripts/shared/<action>.js`
**Why:** Identical sequence in N skills. Single source of truth.

Skills affected: skill-a, skill-b, skill-c
```

## Step 4: Implement

After presenting the changelog:

1. Ask for confirmation (or apply directly if instructed)
2. Edit SKILL.md files with the proposed frontmatter/content changes
3. Create extracted scripts in the appropriate `scripts/` directories
4. Re-run `node .github/skills/skill-audit/scripts/audit.js .github/skills` to confirm fixes
5. Run `npm run validate:ai-artifacts` to ensure project consistency

## Rules Reference

See [references/rules.md](references/rules.md) for the complete rule catalog with examples of true/false positives for each rule.
