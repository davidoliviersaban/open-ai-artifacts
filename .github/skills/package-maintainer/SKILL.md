---
name: package-maintainer
description: Maintain a Node CLI package and its generated artifact dogfooding setup.
---

# Package Maintainer

Use this skill when editing a Node CLI package, package tests, generated artifact configuration, or dogfooding setup.

## Rules

- Keep package behavior generic. Do not depend on one consuming repository's paths or assumptions.
- Treat product repositories as examples, not as package runtime context.
- Prefer Node.js built-ins unless a dependency is clearly justified.
- Keep generated artifact bodies clean. Provenance belongs in `.ai-artifacts/lock.yml` and reports, not inline headers.
- Dogfood changes through `.ai-artifacts/artifacts.yml` when they affect instructions, agents or skills.

## JavaScript Refactoring Loop

For package JavaScript changes, do a short refactoring review inspired by Kent Beck, Martin Fowler, TDD/ATDD, Tidy First and SOLID principles:

- Behavior first: identify the observable behavior, acceptance criteria or failing test that justifies the change.
- Test where useful: prefer a small regression/unit test before changing behavior; use ATDD-style examples when the behavior is user-facing or workflow-level.
- Tidy first when it reduces risk: separate small structural cleanup from behavior changes when it makes the intended change safer.
- Refactor in small steps: preserve behavior, keep tests green, and avoid mixing broad cleanup with feature work.
- Single responsibility: is this function or file doing one coherent job?
- Separation of concerns: is install, validation, environment detection, rendering or reporting mixed in a way that will be hard to change?
- Composability: would a small extraction make the behavior easier to test or reuse without adding ceremony?
- Dependency direction: can the generic package code stay independent from one consuming repository's layout?
- Practicality: is the abstraction justified by current usage, or is a little duplication clearer until the feature proves itself in real use?

Do not over-apply the rules. For new or unvalidated features, prefer local clarity, explicit tests and modest duplication over premature frameworks.

## Validation

Run the package test target and generated-artifact validation target from the repository root.

## Release Process

Only release when the package is stable and ready for external consumers. Changes accumulate on main until a coherent version is ready — typically every 1–2 weeks. No pre-release tags (beta, rc, alpha).

Do NOT release for: CI fixes, typos, docs-only changes, refactors that only affect this repo's dogfooding. Test those locally via the workspace.

Steps:
1. Ensure all tests pass: `npm run test:ai-artifacts && npm run test:ai-artifacts-bench`
2. Ensure validation passes: `npm run validate:ai-artifacts`
3. Bump version in BOTH `packages/ai-artifacts/package.json` and `packages/ai-artifacts-bench/package.json` (keep them in sync)
4. Commit: `chore: release vX.Y.Z`
5. Push to main
6. Create a GitHub Release with tag `vX.Y.Z` — the workflow handles tests, publish with `--provenance` (SLSA Build L3)

Semver:
- `patch` — bug fixes, no API change
- `minor` — new features, backward compatible
- `major` — breaking changes
