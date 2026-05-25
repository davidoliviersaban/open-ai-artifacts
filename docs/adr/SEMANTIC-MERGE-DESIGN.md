# Semantic Merge Design

**Status**: Canonical Phase 4 design, not implemented
**Context**: Epic #944 AI artifact framework

This is the maintained package design for future semantic overlays and agent-assisted merges. Earlier v1/v2 designs were removed because they described obsolete schemas, direct API integrations, and commands that do not exist in the current package.

## Current Baseline

The implemented framework is deterministic:

- `.ai-artifacts/artifacts.yml` declares packages and artifact steps.
- `.ai-artifacts/lock.yml` records `requested`, `resolved`, `latest`, and artifact step hashes.
- `render` steps apply literal substitutions, append overlays, and preserve frontmatter without inline generated metadata.
- `copy` steps model local or upstream resource files explicitly.
- `validate` checks freshness, frontmatter/header structure, local relative links, minimal Markdown hygiene, drift, and risk.
- Phase 3 automation opens review PRs for upstream drift but does not accept upstream changes automatically.

## Problem

Append overlays and literal substitutions are safe, but limited. They work when upstream keeps roughly the same structure. They become noisy or insufficient when upstream:

- renames or removes sections that local intent depends on
- moves content into a different structure
- already satisfies local intent in a new way
- introduces new behavior that conflicts with local overlays

Today, these cases should remain review-gated and manual.

## Goals

- Preserve local intent when upstream structure changes.
- Keep deterministic behavior as the default path.
- Produce reviewable artifacts, rationale, and validation evidence.
- Never auto-merge agent output.
- Avoid direct dependency on one AI provider or tool.

## Non-Goals

- No autonomous acceptance of upstream changes.
- No scheduled agent merge execution.
- No direct Claude/OpenAI/Copilot API coupling in the core CLI.
- No replacement for `render` and `copy` steps.
- No implementation of `npm run ai-artifacts:merge` until the design is validated with examples.

## Proposed Two-Tier Model

### Tier 1: Enhanced Deterministic Transform

Semantic overlay files can describe deterministic checks and transformations:

```yaml
overlay:
  version: 1
  id: tool-neutral-tracking
  intent: Replace tool-specific tracking with repo-standard tracking.
  reason: Travel Storefront uses multiple AI coding agents.

  appliesTo:
    artifactIds:
      - task-research-guidelines
      - task-plan-guidelines

  substitutions:
    - pattern: '\\.copilot-tracking/'
      replacement: '.ai-tracking/'
      minMatches: 1

  assertions:
    - type: notContains
      pattern: '\\.copilot-tracking/'
    - type: contains
      pattern: '.ai-tracking/'

  thresholds:
    maxChangedLines: 150
    minSectionOverlap: 0.8

  agentMerge:
    enabled: true
    triggerWhen:
      - substitutionValidationFailed
      - sectionOverlapBelowThreshold
```

Tier 1 can be implemented without an AI agent. It should fail closed and report why deterministic application was insufficient.

### Tier 2: Agent-Assisted Review Package

When Tier 1 fails and `agentMerge.enabled` is true, the framework prepares a review package instead of editing generated files directly:

```text
.ai-artifacts/merge-results/<artifact-id>/
  old-upstream.md
  new-upstream.md
  current-generated.md
  semantic-overlay.yml
  deterministic-log.json
  review-prompt.md
```

An AI coding agent can then inspect the package and propose a merge. The agent output is reviewed by a human before any lock or generated artifact changes are accepted.

## Agent Output Contract

Agent output should be a proposed result, not an accepted change:

```json
{
  "version": 1,
  "status": "success",
  "confidence": 0.9,
  "proposedContentPath": ".ai-artifacts/merge-results/task-research/proposed.md",
  "analysis": {
    "upstreamChanges": ["section renamed", "tracking wording removed"],
    "intentPreservation": ["kept .ai-tracking/ convention"]
  },
  "validation": [
    { "criterion": "no .copilot-tracking/ references", "status": "pass" }
  ],
  "manualReviewItems": [
    "Confirm inserted tracking note belongs in the new configuration section."
  ]
}
```

The framework may later validate this JSON and produce a review report, but accepting it must remain manual and PR-gated.

## Safety Rules

- Scheduled workflows may prepare drift reports, but must not run agent merge acceptance.
- Agent output must not update `.ai-artifacts/lock.yml` automatically.
- Generated targets must still pass `npm run validate:ai-artifacts` after any accepted merge.
- Any accepted merge must include drift/risk reports and a human-authored PR summary.
- If confidence is below threshold or validation fails, keep the current deterministic output and request manual review.

## Current Example Target

Use `web-quality-skills` as the example artifact family, not the old `web-quality-audit` target name:

- Package: `web-quality-skills`
- Bundle target: `.github/skills/web-quality-skills/`
- Action targets: `.github/skills/web-quality-performance/`, `.github/skills/web-quality-accessibility/`, etc.

## Recommended Phase 4 Implementation Order

1. Add semantic overlay schema under `.ai-artifacts/schemas/`.
2. Add two real semantic overlay examples for existing artifacts.
3. Add a dry-run command that only writes `.ai-artifacts/merge-results/**`.
4. Add validation for agent output JSON.
5. Add review report generation.
6. Only then consider an explicit manual accept command.

## Open Questions

- Should semantic overlays live beside append overlays or under `.ai-artifacts/semantic-overlays/`?
- Should the first implementation support only substitutions/assertions before insertions/deletions?
- Should agent output include full proposed content or a patch file?
- How should review packages be retained or cleaned up?
