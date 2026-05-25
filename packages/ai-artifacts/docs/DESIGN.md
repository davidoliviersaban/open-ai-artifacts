# ai-artifacts Package Design

## Status

MVP package delivery for Travel Storefront issue `#944`.

The package currently lives in `scripts/ai-artifacts/`, as if a future `ai-artifacts` Node module had been installed into Travel Storefront and deployed repo-local configuration into `.ai-artifacts/`.

## Problem

Travel Storefront uses multiple AI coding agents and already has local prompts, skills, and instructions. Some useful AI artifacts also exist in external repositories, such as HVE Core and `addyosmani/web-quality-skills`.

Copying upstream prompt/skill files directly into this repo creates a silent fork. Over time it becomes unclear what came from upstream, what was changed locally, whether upstream improved, and whether local changes still make sense.

The repo needs a framework-like model with package management plus an Ansible-style playbook:

```text
package source artifact
+ local overlay/files
+ deterministic steps
= final repo artifact
```

The repo also needs drift and risk reporting so upstream updates can be reviewed safely.

## Goals

- Use external AI artifact repositories as pinned packages.
- Support more than one upstream package.
- Keep local behavior in explicit overlays and files.
- Generate final files consumed by agents.
- Preserve frontmatter and agent discovery semantics.
- Detect stale generated files.
- Report drift and implementation risks.
- Avoid new dependencies for the MVP.
- Keep the implementation small and extractable.

## Non-Goals

- Do not build a general package manager; only resolve and lock the packages needed by this playbook.
- Do not adopt all of HVE Core.
- Do not implement HVE collections/plugins in this repo unless later justified.
- Do not introduce semantic or agentic merging in the MVP.
- Do not automatically merge upstream updates.
- Do not replace existing application build/test workflows.

## Architecture

```text
.ai-artifacts/artifacts.yml
        │
        ▼
scripts/ai-artifacts/package.json
scripts/ai-artifacts/cli.js
        │
        ├── fetch ──► .ai-artifacts/vendor/<package>/
        │              .ai-artifacts/lock.yml
        │
        ├── sync ───► generated target files
        │              .ai-artifacts/lock.yml artifact hashes
        │
        ├── drift ──► .ai-artifacts/reports/drift.md
        │
        ├── risk ───► .ai-artifacts/reports/risk-assessment.md
        │
        └── validate = fetch + sync --check + drift + risk
```

## Core Concepts

### Package

A package is an upstream repository that contains AI artifacts. Packages are the source of truth for upstream prompts, skills, and templates.

MVP package type:

```yaml
packages:
  hve-core:
    type: git
    repo: https://github.com/microsoft/hve-core.git
    version: hve-core-v3.2.2
```

The `fetch` command clones or updates the package under `.ai-artifacts/vendor/` and checks out the configured version.

### Lock File

`lock.yml` records requested, resolved, and latest package commits plus hashes for each artifact step.

It answers:

- Which package version did we request?
- Which exact package commit did we use?
- Has the remote ref moved since we generated artifacts?
- Which package/local content did each step use?
- Which overlay content did we apply?
- What generated output did we expect?

### Artifact

An artifact describes one generated file or directory tree through ordered steps.

```yaml
artifacts:
  - id: task-research
    kind: prompt
    target: .github/prompts/task-research.prompt.md
    steps:
      - render:
          from: hve-core:.github/prompts/hve-core/task-research.prompt.md
          overlays:
            - common/tool-neutral.md
          substitutions:
            - from: .copilot-tracking/
              to: .ai-tracking/
```

For bundled skills, use `targetDir` and multiple steps:

```yaml
artifacts:
  - id: web-quality-skills
    kind: skill
    targetDir: .github/skills/web-quality-skills
    steps:
      - render:
          from: web-quality-skills:skills/web-quality-audit/SKILL.md
          to: SKILL.md
          overlays:
            - web-quality/storefront-audit.md
      - copy:
          from: local:scripts
          to: scripts
      - copy:
          from: local:references
          to: references
```

`local:<path>` resolves from `.ai-artifacts/files/<artifact-id>/`.

### Requested, Resolved, And Latest

Package refs have different meanings depending on whether they are immutable or floating:

```yaml
packages:
  web-quality-skills:
    type: git
    repo: https://github.com/addyosmani/web-quality-skills.git
    version: main
```

The lock file separates the moving ref from the exact commit used for generation:

```yaml
packages:
  web-quality-skills:
    requested: main
    resolved: 7b59d48aaf1f793935002f4998dfccc656f40839
    latest: 7b59d48aaf1f793935002f4998dfccc656f40839
```

- `requested`: the configured version from `artifacts.yml`.
- `resolved`: the exact commit that generated current outputs.
- `latest`: the latest remote commit currently observed for `requested`.

Generation must use `resolved`, not `latest`, when a lock entry exists. This keeps `main` reproducible and prevents unrelated upstream/client changes from silently rewriting generated files.

When `latest` differs from `resolved`, drift should report that an update is available. The update only becomes active after a deliberate accept/update action changes `resolved` and regenerates artifacts.

If `resolved` cannot be checked out, for example because a floating branch was force-pushed and the old commit was garbage collected, validation should fail loudly. The mitigation is to repin to an immutable tag/SHA or explicitly accept a new resolved commit after review.

### Overlay

An overlay is local repository-specific Markdown appended to an upstream artifact.

MVP overlays are deliberately simple:

- append local Markdown after the upstream content
- optionally apply literal substitutions before append

This is less powerful than patching, but more stable and easier to review.

### Generated Target

A generated target is the final file used by agents, for example:

```text
.github/prompts/task-research.prompt.md
.github/skills/web-quality-skills/SKILL.md
```

Generated targets should not be manually edited. They do not include inline generated metadata; source, overlay, output paths, and hash provenance stay in `.ai-artifacts/lock.yml` and reports so prompts/skills are not polluted with operational metadata.

## Composition Model

The current generation algorithm is:

1. Resolve packages from `artifacts.yml` into `.ai-artifacts/vendor/`.
2. Execute each artifact step in order.
3. For `render`, read a package file, apply substitutions, append overlays, and preserve YAML frontmatter.
4. For `copy`, copy package or local files/directories into the target directory.
5. Write target files and update step hashes in `lock.yml`.

Frontmatter preservation matters because many agent runtimes discover prompts and skills from top-of-file YAML metadata.

## Drift Model

The drift report compares:

- configured package versions
- locked commits
- current local vendor commits
- remote commit for the configured version
- floating refs where `latest` differs from `resolved`
- generated target hash versus expected generated hash
- package, local file, and overlay hashes versus lock file hashes

The report is intentionally Markdown so it can be attached to PRs and reviewed without tooling.

## Risk Model

The risk report is rule-based in the MVP.

Current risk checks include:

- artifact step missing from lock file
- upstream package content hash changed
- local overlay hash changed
- generated target is stale or manually edited
- generated prompt still references `.copilot-tracking/`
- generated skill has local `scripts/` or `references/` folders not modeled as copy steps

The model should evolve toward configurable policies in `artifacts.yml`.

## Current Pilot Artifacts

### `task-research`

Source:

```text
microsoft/hve-core
.github/prompts/hve-core/task-research.prompt.md
```

Target:

```text
.github/prompts/task-research.prompt.md
```

Purpose:

- Prove HVE can be consumed as an upstream prompt source.
- Add Travel Storefront-specific research requirements via overlays.
- Replace Copilot-specific tracking conventions with `.ai-tracking/`.

### `web-quality-skills`

Source:

```text
addyosmani/web-quality-skills
skills/web-quality-audit/SKILL.md
```

Target:

```text
.github/skills/web-quality-skills/SKILL.md
```

Purpose:

- Prove the framework supports non-HVE sources.
- Convert the existing attribution (`based-on: addyosmani/web-quality-skills`) into an explicit upstream source.
- Add Travel Storefront-specific Lighthouse/mobile guidance via overlay.

## Design Decisions

### Use YAML Playbook

The artifact definition should be YAML because this is closer to infrastructure-as-code than a package manifest. It has package declarations at the top and ordered artifact steps below.

Future option: add schema validation for editor support and clearer CI errors.

### Keep Fetch Logic Minimal

The CLI uses Git directly. This is enough for two sources and keeps the MVP self-contained.

Future option: use a dedicated vendoring tool if source management becomes the hard part.

### Append Overlays Before Patches

Append overlays are less fragile than patches. They do not depend on upstream line positions.

Future option: semantic overlays and an agentic merger for cases where upstream structure changes significantly.

### RPI Skills: Derive from HVE Prompts with Minimal Overlays

**Decision**: RPI skills (Research-Plan-Implement-Review) derive from HVE Core prompts via render pipeline with minimalist TSF overlays.

**Context**:
- HVE Core provides RPI **agents** (180+ lines, complex, subagents, handoffs) and RPI **prompts** (67 lines, concise entry points)
- TSF uses Claude Code/OpenCode (not GitHub Copilot), doesn't need agents
- Initial approach was 100% custom local skills (250+ lines each) = no drift tracking, no upstream benefits

**Approach**:
```yaml
- id: task-research-guidelines
  kind: skill
  steps:
    - render:
        from: hve-core:.github/prompts/hve-core/task-research.prompt.md
        overlays:
          - common/tool-neutral.md      # Remove Copilot-specific references
          - rpi/task-research.md         # Minimal TSF overlay (see below)
```

**Overlay Philosophy - Minimalist**:
1. **Point to existing documentation**: `CLAUDE.md`, `docs/architecture/`, `docs/guides/`
2. **High-level principles only**: TDD, Tidy First, mobile-first - agent already knows these
3. **TSF-specific constraints**: acceptance criteria, NFRs (Lighthouse ≥90, no Sleep keyword)
4. **Output locations**: where to save artifacts (`.ai-tracking/research/`, etc.)

**No need to document**:
- ❌ TDD red-green-refactor patterns (agent knows)
- ❌ Refactoring principles (Fowler, Uncle Bob - agent knows)
- ❌ Clean Code practices (agent knows)
- ❌ Git workflows (standard conventions - agent knows)

**Do document**:
- ✅ TSF tech stack pointers (`CLAUDE.md` has it all)
- ✅ TSF-specific acceptance criteria (file:line citations, mobile viewport)
- ✅ TSF-specific NFRs (Robot Framework, no Sleep, Lighthouse budgets)
- ✅ Where to save outputs (`.ai-tracking/` structure)

**Benefits**:
- ✅ Track drift vs HVE Core (get upstream improvements)
- ✅ Minimal overlays = easy to maintain
- ✅ Trust agent knowledge = avoid redundant documentation
- ✅ TSF-specific only = clear separation of concerns

**Rationale**: Agents are compiled on up-to-date best practices. Don't reinvent documentation for principles they already know. Focus overlays on TSF-specific context, constraints, and conventions only.

### Local Skills Stay Outside artifacts.yml

**Decision**: Skills that are 100% local (no upstream source) live directly in `.github/skills/` without being declared in `artifacts.yml`.

**Examples of local skills** (no upstream, not managed):
- `local-dev/` — dev server script
- `multi-feature/` — worktree workflow
- `playwright-cli/` — browser automation helper
- `skill-creator/` — skill scaffolding

**Examples of managed skills** (upstream source, declared in artifacts.yml):
- `task-research-guidelines/` — from HVE Core prompt + TSF overlay
- `web-quality-skills/` — from addyosmani + TSF overlay

**Rationale**: The framework exists to track drift vs upstream. If there is no upstream, there is nothing to track — `artifacts.yml` would add ceremony (hashes, generated headers, "do not edit") without value.

**Guideline**: Put a skill in `artifacts.yml` only when it derives from an external source and benefits from drift detection.

### Generate Into Existing Tool Paths

The generated files live where current tools expect them, such as `.github/prompts/` and `.github/skills/`.

This makes adoption incremental and avoids changing agent discovery.

## Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Generated files are edited manually | `lock.yml` lists generated outputs; `sync --check` detects stale output |
| Upstream changes silently | `drift` report compares lock/source/current state |
| Local overlays become obsolete | `risk` report flags source/overlay changes; future semantic overlays can detect intent drift |
| Tool lock-in leaks into shared prompts | Local overlay and substitutions enforce `.ai-tracking/` and tool-neutral wording |
| Skill bundled resources may diverge | Model scripts/references as explicit `copy` steps from `.ai-artifacts/files/<artifact-id>/` |
| Source refs like `main` move | Lock file records resolved commit; drift report shows remote ref movement |

## Future Evolution

### Phase 1: MVP

- Manifest and lock file
- Git fetch
- Append overlays
- Literal substitutions
- Generated headers
- Drift and risk reports
- Validation command

### Phase 2: Better Artifact Modeling

- Directory artifacts
- Bundled skill resources
- Schema validation
- Configurable risk policy
- Generated PR body snippets

### Phase 3: Upstream Update Automation

- Scheduled/manual workflow
- Update source refs
- Regenerate artifacts
- Commit lock/report/generated changes
- Open review-gated PR

### Phase 4: Semantic Overlays And Agentic Merger

Semantic overlays describe intent rather than line-level changes:

```yaml
intent: Make workflow tracking tool-neutral.
reason: This repo uses Claude Code, OpenCode, and GitHub Copilot.
rules:
  - Use `.ai-tracking/` instead of `.copilot-tracking/`.
acceptance:
  - No generic workflow step writes to `.copilot-tracking/`.
risk:
  manualReviewIf:
    - Upstream no longer mentions tracking directories.
```

An agentic merger can later use these semantic overlays to re-apply local intent when upstream changes too much for deterministic composition.

Agentic merge outputs must always be review-gated and must produce drift and risk reports.

## Extraction Criteria

Keep this framework inside Travel Storefront until at least one of these is true:

- another repository wants to use it
- update automation becomes broadly useful
- semantic overlays need a dedicated release cycle
- the CLI grows beyond this repo's needs

If extracted, the repo-specific configuration should remain in `.ai-artifacts/artifacts.yml` and overlays, while the CLI becomes a package.
