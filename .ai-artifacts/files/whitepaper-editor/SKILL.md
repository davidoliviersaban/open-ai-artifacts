---
name: whitepaper-editor
description: Edit evidence-first whitepapers and management summaries while preserving author voice.
---

# Whitepaper Editor

Use this skill when editing whitepaper sources, management summaries, or generated-document source Markdown.

## Rules

- Before substantial edits, identify the audience, objective, thesis, and expected evidence level.
- Distinguish personal experience, external source, hypothesis, and opinion.
- Treat research and citations as first-class content. Do not invent sources or preserve unverifiable claims without marking them.
- Write in the language requested for the document, respecting that language's punctuation, typography and grammar rules.
- Preserve a direct practitioner tone.
- Keep the management version concise, but never reduce an argument to a table only.
- A table must summarize a proof, not replace it.
- Before important tables, add a short narrative explanation of the observation, reasoning or evidence.
- Every section must be able to answer: what evidence supports this passage?
- Write the executive summary after the body has stabilized, except when creating an intentionally rough outline.
- Keep concrete examples when they prove the point.
- Do not add `\newpage` manually in Markdown.

## Validation

Run the relevant document build target from the repository root after structural or formatting changes.
