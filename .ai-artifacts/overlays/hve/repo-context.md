# ai-artifacts Repository Context

This repository contains both documentation and the `ai-artifacts` Node package.

Use these project paths:

- `docs/whitepaper/` for whitepaper sources and PDF generation.
- `packages/ai-artifacts/` for the Node CLI/package.
- `.ai-artifacts/` for dogfooding configuration, overlays and local source files.

Prefer Nx commands from the repository root:

```bash
npm run nx -- test ai-artifacts
npm run nx -- build whitepaper
npm run validate:ai-artifacts
```

Do not introduce Travel Storefront-specific runtime assumptions into the package. TSF may be used as a documented example only.
