---
name: package-maintainer
description: Maintain the ai-artifacts Node package and its dogfooding setup.
---

# Package Maintainer

Use this skill when editing `packages/ai-artifacts/` or `.ai-artifacts/`.

## Rules

- Keep package behavior generic. Do not depend on Travel Storefront paths or assumptions.
- Treat TSF as an example, not as package runtime context.
- Prefer Node.js built-ins unless a dependency is clearly justified.
- Keep generated artifact bodies clean. Provenance belongs in `.ai-artifacts/lock.yml` and reports, not inline headers.
- Dogfood changes through `.ai-artifacts/artifacts.yml` when they affect instructions, agents or skills.

## Validation

Run from the repository root:

```bash
npm run nx -- test ai-artifacts
npm run validate:ai-artifacts
```
