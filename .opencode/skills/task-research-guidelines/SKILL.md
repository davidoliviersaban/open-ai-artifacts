---
description: "Initiates research for implementation planning based on user requirements - Brought to you by microsoft/hve-core"
agent: Task Researcher
argument-hint: "topic=... [chat={true|false}]"
---

# Task Research

## Inputs

* ${input:chat:true}: (Optional, defaults to true) Include conversation context for research analysis.
* ${input:topic}: (Required) Primary topic or focus area, from user prompt or inferred from conversation.

## Requirements

1. When chat is enabled, incorporate conversation context to refine research scope and identify implicit constraints.
2. Scope research to the provided topic, including related files, patterns, and external references.
3. Evaluate implementation alternatives and select a recommended approach with evidence-based rationale.
4. Produce a consolidated research document at the standard tracking location for handoff to implementation planning.

---

# ai-artifacts Repository Context

This repository contains both documentation and the `ai-artifacts` Node package.

Use these repository paths when relevant:

- `docs/whitepaper/` for whitepaper sources and PDF generation.
- `packages/ai-artifacts/` for the Node CLI/package.
- `.ai-artifacts/` for dogfooding configuration, overlays and local source files.

Prefer Nx targets from the repository root for validation. Use `whitepaper:build`, `ai-artifacts:test`, and `ai-artifacts:validate` according to the files changed.

Do not introduce Travel Storefront-specific runtime assumptions into the package. TSF may be used as a documented example only.
