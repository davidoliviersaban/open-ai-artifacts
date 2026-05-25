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

## Validation

Run the package test target and generated-artifact validation target from the repository root.
