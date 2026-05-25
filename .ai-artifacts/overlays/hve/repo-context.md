# ai-artifacts Repository Context

This repository contains both documentation and the `ai-artifacts` Node package.

Use these repository paths when relevant:

- `docs/whitepaper/` for whitepaper sources and PDF generation.
- `packages/ai-artifacts/` for the Node CLI/package.
- `.ai-artifacts/` for dogfooding configuration, overlays and local source files.

Prefer Nx targets from the repository root for validation. Use `whitepaper:build`, `ai-artifacts:test`, and `ai-artifacts:validate` according to the files changed.

Do not introduce Travel Storefront-specific runtime assumptions into the package. TSF may be used as a documented example only.
