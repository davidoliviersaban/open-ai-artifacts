# ai-artifacts Prompt Context

This repository dogfoods prompt, agent and skill generation from `.ai-artifacts/artifacts.yml`.

When changing prompt-like artifacts:

- Edit source files under `.ai-artifacts/files/` or overlays under `.ai-artifacts/overlays/`.
- Do not manually edit generated files under `.opencode/skills/`, `AGENTS.md`, or `CLAUDE.md`.
- Keep reusable workflow guidance upstream-compatible when possible.
- Put repository-specific context in overlays rather than copying full upstream prompts.

Generated prompt artifacts should stay reusable by future consumers of the `ai-artifacts` package.
