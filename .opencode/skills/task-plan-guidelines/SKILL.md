---
name: task-plan-guidelines
description: "Initiates implementation planning based on user context or research documents - Brought to you by microsoft/hve-core"
agent: task-planner
argument-hint: "[research=...] [chat={true|false}]"
---

# Task Plan

## Inputs

* ${input:chat:true}: (Optional, defaults to true) Include conversation context for planning analysis.
* ${input:research}: (Optional) Research file path from user prompt, open file, or conversation.

## Requirements

1. Use `${input:research}` when provided; otherwise check `.copilot-tracking/research/` for relevant files.
2. Accept user-provided context, attached files, or conversation history as sufficient input for planning.
3. Summarize planning outcomes including implementation plan files created and scope items deferred for future planning.

---

# ai-artifacts Repository Context

This repository contains both documentation and the `ai-artifacts` Node package.

Use these repository paths when relevant:

- `docs/whitepaper/` for whitepaper sources and PDF generation.
- `packages/ai-artifacts/` for the Node CLI/package.
- `.ai-artifacts/` for dogfooding configuration, overlays and local source files.

Prefer Nx targets from the repository root for validation. Use `whitepaper:build`, `ai-artifacts:test`, and `ai-artifacts:validate` according to the files changed.

Do not introduce Travel Storefront-specific runtime assumptions into the package. TSF may be used as a documented example only.
