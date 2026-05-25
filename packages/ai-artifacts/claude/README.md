# Claude Code Support

This folder contains Claude Code-specific framework files shipped by `ai-artifacts`.

The installer tries to copy these files into the consuming repository, but local setup can prevent a clean install: files may already exist, permissions may differ, or a project may intentionally customize its Claude Code configuration. This README explains what the framework is trying to install and why, so a developer can verify or repair the setup manually when needed.

- `install.js` checks and installs Claude-related repository artifacts.
- `audit-skill.js` is the local skill audit hook installed to `.claude/hooks/audit-skill.js`.

The hook appends local JSONL entries to `.ai-artifacts/audit.jsonl`. The audit file is ignored by Git so each developer keeps their own local usage trail.

Expected installed location:

- `.claude/hooks/audit-skill.js`

Purpose:

- Capture local skill usage without central infrastructure.
- Keep audit data private to the developer machine by default.
- Use the same `.ai-artifacts/audit.jsonl` format as other supported tools.
