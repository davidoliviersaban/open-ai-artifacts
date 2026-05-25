# Audit Rules Reference

## VISIBILITY-001 — High-Risk Side Effects

**Severity:** High

**Trigger:** Skill body or description contains keywords associated with destructive/irreversible actions: `deploy`, `push`, `commit`, `merge`, `release`, `publish`, `send message`, `send email`, `delete`, `drop database`, `force-push`, `rm -rf`, `kubectl apply`, `helm install`, `terraform apply`.

**Required fix:** Add `disable-model-invocation: true` to YAML frontmatter.

**True positive examples:**
- A skill that runs `git push` as part of its workflow
- A skill that deploys to production via `kubectl apply`
- A skill that sends Slack messages

**False positive examples:**
- A skill that says "Never force-push" in guidelines (negation context)
- A skill referencing `git commit` only in documentation examples users must run themselves
- Directory listing mentioning a file called `deploy.md`

**Judgment:** Check if the skill *actually executes* the risky action or merely *references* it in documentation.

---

## VISIBILITY-002 — Background Knowledge

**Severity:** Medium

**Trigger:** Skill contains 2+ signals of being reference-only: `reference only`, `guidelines`, `standards`, `conventions`, `do not run`, `informational`, `coding style`, `brand guide`.

**Required fix:** Add `user-invocable: false` to YAML frontmatter.

**True positive examples:**
- A brand guidelines skill that only provides color codes and typography rules
- A coding standards skill that defines naming conventions

**False positive examples:**
- A skill that happens to mention "conventions" and "guidelines" but has actionable workflow steps
- The skill-creator skill (references guidelines but IS an active workflow)

**Judgment:** Does the skill produce actions/outputs, or is it purely informational?

---

## DETERMINISM-001 — Scriptable Bash Block

**Severity:** Medium

**Trigger:** A fenced code block (bash/sh) contains 3+ lines of commands.

**Required fix:** Extract to a script file in the skill's `scripts/` directory.

**True positive examples:**
- A 6-line sequence that fetches PR data via `gh api` calls
- A lint+test+build validation sequence
- A series of `curl` commands that always hit the same endpoints

**False positive examples:**
- A directory tree diagram shown with ``` fencing
- Usage examples showing different invocations (teaching, not executing)
- Code blocks with `<PLACEHOLDER>` values that change every time

**Judgment:** "Would running these exact commands (with only known variable substitution like PR number) produce correct results every time?"

---

## DETERMINISM-002 — Prose Describes Fixed Operation

**Severity:** Low

**Trigger:** Prose in the skill body matches patterns for data transformations, file operations, or API calls that are typically deterministic.

**Required fix:** Consider extracting to a script. This is advisory — many matches are false positives.

**True positive examples:**
- "Parse the JSON response and extract the `id` field" — always the same jq command
- "Convert the CSV to a markdown table" — deterministic transformation

**False positive examples:**
- "Format the response appropriately for the user" — requires judgment
- "Extract the relevant information" — context-dependent

**Judgment:** Is the operation *fully specified* (exact input format, exact output format, no ambiguity)?

---

## COMPOSABILITY-001 — Duplicated Code Across Skills

**Severity:** Medium

**Trigger:** Two or more skills contain code blocks with 50+ characters of identical prefix.

**Required fix:** Extract into a shared script or composable sub-skill.

**True positive examples:**
- Three skills all run `npm run test:ai-artifacts && npm run validate:ai-artifacts`
- Two skills both fetch PR metadata with the same `gh api` call

**False positive examples:**
- Two skills both start with `#!/usr/bin/env bash` (trivial boilerplate)
- Similar but contextually different validation (different error handling)

**Judgment:** Is the duplication *meaningful* (maintained logic) or *incidental* (shared boilerplate)?

---

## COMPOSABILITY-002 — Shared Command Pattern

**Severity:** Low

**Trigger:** A command pattern appears in 3+ different skills.

**Required fix:** Consider a shared utility script if the invocation is identical across all usages.

**True positive examples:**
- `npm run test:ai-artifacts` used identically in 4 skills as a validation step
- `npm run validate:ai-artifacts` in 3 skills

**False positive examples:**
- `git` commands used differently (different flags, different purposes)
- `node` commands running different scripts

**Judgment:** Are the arguments and purpose identical, or just the base command?
