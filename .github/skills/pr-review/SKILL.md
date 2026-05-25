---
name: pr-review
description: Handle external code review comments on GitHub pull requests. Use when the user asks to address PR review comments, respond to reviewer feedback, process PR review, handle review comments, or fix PR feedback. Triggers on requests like "address PR comments", "handle review feedback", "process review on PR 123", "respond to reviewer", "fix PR review comments".
disable-model-invocation: true
---

# PR Review Handler

Process external reviewer comments on a GitHub PR: evaluate each comment critically, implement valid suggestions, respond with clear explanations. Ship only with explicit user approval.

## Workflow

1. **Fetch PR comments** — Retrieve all pending review comments
2. **Challenge each comment** — Evaluate if the feedback makes sense given the PR's intent
3. **Implement or dismiss** — Apply useful changes, skip unhelpful ones
4. **Respond to every comment** — Explain the action taken and reasoning
5. **Ask permission to /ship** — Present summary and wait for user approval before commit+push

## Step 1: Fetch PR Comments

Determine the PR number from context (current branch, user input, or URL).

```bash
node .github/skills/pr-review/scripts/fetch-comments.js [PR_NUMBER]
```

The script outputs JSON with `pr` metadata, `total_comments`, `pending_comments` count, and a `comments` array of unresolved comments (both inline and top-level). Each comment includes `id`, `type`, `path`, `line`, `body`, `user`.

Focus on the `comments` array — these are the ones that need a response.

## Step 2: Challenge Each Comment

For each comment, critically evaluate:

1. **Read the diff** — Understand what the PR changes and why
2. **Assess relevance** — Does the comment address a real issue in the changed code?
3. **Check correctness** — Is the reviewer's suggestion technically correct?
4. **Weigh trade-offs** — Does the suggestion improve the code without introducing regressions?

Classification:
- **Valid & actionable** — The comment identifies a real problem or improvement. Implement it.
- **Valid but out of scope** — Correct observation but unrelated to the PR's changes. Acknowledge but do not implement.
- **Incorrect or misguided** — The reviewer misunderstood the code or context. Explain why respectfully.
- **Style preference** — Subjective with no clear improvement. Follow project conventions; if ambiguous, defer to the reviewer only if it doesn't degrade code quality.

## Step 3: Implement Changes

For each valid & actionable comment:

1. Make the code change in the correct file
2. Ensure consistency with surrounding code and project conventions
3. Run relevant checks before moving to the next comment

Group related comments that affect the same file/area to avoid conflicting edits.

## Step 4: Respond to Comments

Reply to **every** comment on the PR using `gh api`:

```bash
# Reply to an inline review comment (thread reply)
gh api repos/{owner}/{repo}/pulls/{pr}/comments/{comment_id}/replies -f body="<response>"

# For top-level issue comments
gh api repos/{owner}/{repo}/issues/{pr}/comments -f body="<response>"
```

### Response format

Each response must include:

1. **Action taken** — What was done (implemented, skipped, partially applied)
2. **Reasoning** — Why this decision was made (technical justification)

### Response templates

**When implementing the suggestion:**
> Done — [brief description of change made].
>
> [Explain why this improves the code.]

**When declining the suggestion:**
> Kept as-is — [brief explanation].
>
> [Explain the reasoning: why the current approach is correct/preferred given the PR context.]

**When partially implementing:**
> Partially applied — [what was changed and what was kept].
>
> [Explain which part was adopted and why the rest was not applicable.]

**When out of scope:**
> Good catch — this is valid but out of scope for this PR. I've noted it for a follow-up.
>
> [Brief explanation of why it's separate from the current changes.]

### Tone guidelines

- Be respectful and collaborative — the reviewer is trying to help
- Be direct — avoid filler words or excessive apologies
- Be educational — explain patterns and reasoning
- Never be dismissive — even incorrect comments deserve a clear explanation

## Step 5: Request Permission to Ship

**STOP here. Do NOT commit or push without explicit user approval.**

Present a summary to the user:

```
Ready to ship. Here's what will happen:

Changes:
- [file1] — [one-line description]
- [file2] — [one-line description]

Comments replied to: X/Y
- [comment summary] → [action taken]
- ...

Validation: will run test + validate

Type /ship to validate, commit, and push.
```

Wait for the user to explicitly say `/ship` (or equivalent confirmation).

### When user approves (/ship)

Run validation, then commit and push:

```bash
node .github/skills/pr-review/scripts/validate.js
```

If validation passes:

```bash
git add -A
git commit -m "fix: address PR review feedback

- [list key changes made based on review comments]"
git push
```

If validation fails, report the error and do NOT push. Fix and re-ask.

### What NOT to do

- Never commit/push without `/ship` approval
- Never skip validation before push
- Never force-push unless explicitly asked

## Important Rules

- **Never commit/push without user saying /ship** — this is a hard gate, no exceptions
- **Never force-push** unless explicitly asked — it destroys review history
- **Never modify files outside the PR's scope** just because a reviewer mentioned something tangential
- **Always respond to comments before shipping** — the reviewer should see replies even if no code changed
- **If uncertain about a comment's intent**, ask for clarification in the reply rather than guessing
- **Batch related changes** into a single commit rather than one commit per comment
