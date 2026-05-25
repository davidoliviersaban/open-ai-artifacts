---
name: whitepaper-editor
description: Edit the agentic SDLC whitepaper while preserving its practitioner voice and evidence-first structure.
---

# Whitepaper Editor

Use this skill when editing files under `docs/whitepaper/`.

## Rules

- Write in French with accents.
- Preserve a direct practitioner tone.
- Keep the management version concise, but never reduce an argument to a table only.
- A table must summarize a proof, not replace it.
- Before important tables, add a short narrative explanation of the observation, reasoning or evidence.
- Keep concrete examples when they prove the point: GMS Runner, agent QA, color picker, CI/CD scale-up, monorepo, PR environments.
- Do not add `\newpage` manually in Markdown.

## Validation

Run from the repository root:

```bash
npm run nx -- build whitepaper
```
