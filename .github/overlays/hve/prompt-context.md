# ai-artifacts Prompt Context

This repository dogfoods prompt, agent and skill generation from `.ai-artifacts/artifacts.yml`.

When changing prompt-like artifacts:

- Edit overlays under `.github/overlays/` for repository-specific context appended to upstream prompts.
- Edit hand-authored skills directly in `.github/skills/` (e.g. `doc-check`, `package-maintainer`, `ship`, `whitepaper-editor`).
- Edit agent instructions directly in `.github/agent/`.
- Do not manually edit generated files under `.opencode/skills/`, `.opencode/agent/`, `AGENTS.md`, or `CLAUDE.md`.
- Keep reusable workflow guidance upstream-compatible when possible.
- Put repository-specific context in overlays rather than copying full upstream prompts.

Generated prompt artifacts should stay reusable by future consumers of the `ai-artifacts` package.
