# OpenCode Support

This folder contains OpenCode-specific framework files shipped by `ai-artifacts`.

The installer tries to copy these files into the consuming repository, but local setup can prevent a clean install: files may already exist, permissions may differ, or a project may intentionally customize its OpenCode configuration. This README explains what the framework is trying to install and why, so a developer can verify or repair the setup manually when needed.

- `install.js` checks and installs OpenCode-related repository artifacts.
- `skill-audit.js` is the local skill audit plugin installed to `.opencode/plugin/skill-audit.js`.

OpenCode auto-discovers plugins under `.opencode/plugin/`. The plugin appends local JSONL entries to `.ai-artifacts/audit.jsonl` and must never block normal tool execution.

Expected installed location:

- `.opencode/plugin/skill-audit.js`

Purpose:

- Capture local skill usage without central infrastructure.
- Keep audit data private to the developer machine by default.
- Use the same `.ai-artifacts/audit.jsonl` format as other supported tools.
- Rely on OpenCode plugin auto-discovery instead of requiring project-specific config when possible.
