---
description: "Initiates implementation review based on user context or automatic artifact discovery - Brought to you by microsoft/hve-core"
agent: Task Reviewer
argument-hint: "[plan=...] [changes=...] [research=...] [scope=...]"
---

# Task Review

## Inputs

* ${input:chat:true}: (Optional, defaults to true) Include conversation context for review analysis.
* ${input:plan}: (Optional) Implementation plan file path.
* ${input:changes}: (Optional) Changes log file path.
* ${input:research}: (Optional) Research file path.
* ${input:scope}: (Optional) Time-based scope such as "today", "this week", or "since last review".

## Requirements

1. Resolve review scope using this priority: explicitly provided inputs, attached or open files, time-based scope from `${input:scope}`, then artifacts since the last review log.
2. When `${input:chat}` is true, extract artifact references and context from the conversation history.
3. Summarize findings with severity counts, review log path, and recommended next steps.

---

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
