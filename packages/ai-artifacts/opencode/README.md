# OpenCode Support

This folder contains OpenCode-specific framework files shipped by `ai-artifacts`.

The installer tries to copy these files into the consuming repository, but local setup can prevent a clean install: files may already exist, permissions may differ, or a project may intentionally customize its OpenCode configuration. This README explains what the framework is trying to install and why, so a developer can verify or repair the setup manually when needed.

- `install.js` checks and installs OpenCode-related repository artifacts.
- `skill-audit.js` is the local skill audit plugin installed to `.opencode/plugins/skill-audit.js`.

OpenCode auto-discovers plugins under `.opencode/plugins/`. The plugin appends local skill JSONL entries to `.ai-artifacts/audit.jsonl` and local command/script entries to `.ai-artifacts/tools.audit.jsonl` plus `.ai-artifacts/audit.local.jsonl`. It must never block normal tool execution. Each entry records `invocation_tool: "opencode"`, `invocation_origin` (`user` or `agent`) and `invocation_agent` when OpenCode exposes a named agent/subagent.

Expected installed location:

- `.opencode/plugins/skill-audit.js`

Purpose:

- Capture local skill usage without central infrastructure.
- Capture local command and script usage so workflow stats can show delivery cost.
- Keep audit data private to the developer machine by default.
- Use the same `.ai-artifacts/audit.jsonl` format as other supported tools.
- Rely on OpenCode plugin auto-discovery instead of requiring project-specific config when possible.
