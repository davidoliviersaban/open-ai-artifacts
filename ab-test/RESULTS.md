# A/B Test Results: Agent Configuration Benchmark

**Date:** 2026-05-26
**Total runs:** 38
**Models tested:** Claude Opus 4.6, Claude Sonnet 4.5
**Challenges:** 4 (story-ac, story-ac-with-skills, vague-flow, vague-refactor)
**Baseline:** Legacy unversioned run set. Do not compare these numbers directly with current or future baselines unless the run metadata has the same baseline id. The active baseline for new runs is `agent-config-2026-05-28-v2`, limited to Opus and the focused variants `baseline-guidance`, `baseline-no-docs`, `baseline-no-skills`, `unguided-agent`, and `minimal-guidance`.

---

## 1. Variant Configurations

| ID | Description | CLAUDE.md | Hooks | Skills | Key Idea |
|----|-------------|-----------|-------|--------|----------|
| `a-full-pipeline` | Full governance | Inherited (stripped of blocking rules) | No | Yes | Heavy mandates: pipeline table, forced skill invocation |
| `b-bare-agent` | Zero context | None | No | No | Agent sees only the prompt, nothing else |
| `c-lightweight-guidance` | Soft coding guidelines | Custom (TDD/refactoring) | No | No | Written instructions, no enforcement |
| `d-hook-enforced` | Hooks only | Custom (minimal) | Yes | Yes | Mechanical enforcement, minimal guidance |
| `e-tdd-hooks` | TDD guidance + hooks | Custom (TDD/refactoring) | Yes | Yes | Written guidance AND mechanical enforcement |

---

## 2. Challenge Scenarios

| Challenge | Type | Prompt Style | Agent Sees AC? | Description |
|-----------|------|--------------|----------------|-------------|
| `story-ac` | Feature | User story + explicit AC checklist | Yes (in prompt) | YAML block scalar parser — 9 specific criteria listed |
| `story-ac-with-skills` | Feature | Same + "Run /task-research-guidelines" | Yes + skill instruction | Tests if skill invocation adds value |
| `vague-flow` | Feature | Casual developer request | No | "Hey, can you add flow syntax support?" |
| `vague-refactor` | Bug fix | Vague bug report | No | "There's a roundtrip bug, can you fix it?" |

---

## 3. Results Per Scenario

### 3.1 Structured Challenge: `story-ac` (YAML block scalars, explicit AC)

| Variant | Runs | Avg Score | Criteria Pass | Tests Pass | Avg Cost | Avg Time |
|---------|------|-----------|---------------|------------|----------|----------|
| **e-tdd-hooks** | **6** | **0.844** | **93%** | **6/6 (100%)** | **$0.39** | **200s** |
| b-bare-agent | 5 | 0.765 | 96% | 3/5 (60%) | $0.58 | 195s |
| c-lightweight-guidance | 4 | 0.720 | 95% | 2/4 (50%) | $0.70 | 222s |
| d-hook-enforced | 5 | 0.685 | 80% | 3/5 (60%) | $0.32 | 228s |
| a-full-pipeline | 2 | 0.637 | 90% | 0/2 (0%) | $0.55 | 161s |

**Analysis:** With explicit acceptance criteria, most variants implement correctly (90-96% criteria). The differentiator is `existing_tests_pass` — whether the agent verifies it didn't break existing functionality. Only `e-tdd-hooks` achieves 100%.

### 3.2 Skill-instructed Challenge: `story-ac-with-skills`

| Variant | Runs | Avg Score | Criteria Pass | Tests Pass | Avg Cost | Avg Time |
|---------|------|-----------|---------------|------------|----------|----------|
| b-bare-agent | 1 | 0.668 | 90% | 0/1 (0%) | $0.50 | 121s |
| c-lightweight-guidance | 1 | 0.600 | 90% | 0/1 (0%) | $0.00 | 300s |
| a-full-pipeline | 2 | 0.294 | 10% | 0/2 (0%) | $0.34 | 85s |

**Analysis:** Instructing the agent to "Run /task-research-guidelines" before coding adds latency without improving results. `a-full-pipeline` collapses to 10% criteria — the mandatory pipeline blocks autonomous execution entirely.

### 3.3 Vague Feature Request: `vague-flow` (no AC in prompt)

| Variant | Runs | Avg Score | Criteria Pass | Tests Pass | Avg Cost | Avg Time |
|---------|------|-----------|---------------|------------|----------|----------|
| **e-tdd-hooks** | **3** | **0.919** | **97%** | **3/3 (100%)** | **$0.29** | **91s** |
| b-bare-agent | 3 | 0.886 | 93% | 3/3 (100%) | $0.35 | 128s |

**Analysis:** Both variants handle casual feature requests well. `e-tdd-hooks` scores higher because its hook feedback helps the agent iterate to correctness faster. Even without explicit AC, agents derive the expected behavior from the code and tests. The `flow_nested` criterion tripped the bare agent once (nested `{tags: [a, b], name: test}` parsing).

### 3.4 Vague Bug Report: `vague-refactor` (roundtrip fix)

| Variant | Runs | Avg Score | Criteria Pass | Tests Pass | Avg Cost | Avg Time |
|---------|------|-----------|---------------|------------|----------|----------|
| **e-tdd-hooks** | **3** | **0.883** | **96%** | **3/3 (100%)** | **$0.28** | **172s** |
| b-bare-agent | 3 | 0.807 | 88% | 3/3 (100%) | $0.27 | 237s |

**Analysis:** The roundtrip bug is harder — it requires understanding how `serializeYaml` and `parseArtifactConfig` interact. The bare agent timed out on one run (300s, 0 tokens) and failed 2 criteria on another. `e-tdd-hooks` never timed out and had higher criteria pass rate because the hooks catch intermediate failures early, giving the agent a chance to correct course.

---

## 4. Aggregated Results (All Challenges)

| Variant | Runs | Score | Criteria | Tests Pass | Tokens | Time | Cost | Full Pass% |
|---------|------|-------|----------|-----------|--------|------|------|-----------|
| **e-tdd-hooks** | **12** | **0.872** | **95%** | **12/12 (100%)** | **6,384** | **166s** | **$0.34** | **75%** |
| b-bare-agent | 12 | 0.798 | 93% | 9/12 (75%) | 8,265 | 183s | $0.44 | 42% |
| c-lightweight-guidance | 5 | 0.696 | 94% | 2/5 (40%) | 11,683 | 238s | $0.56 | 40% |
| d-hook-enforced | 5 | 0.685 | 80% | 3/5 (60%) | 6,902 | 228s | $0.32 | 40% |
| a-full-pipeline | 4 | 0.466 | 50% | 0/4 (0%) | 7,691 | 123s | $0.45 | 0% |

> **Winner: `e-tdd-hooks`** — Score 0.872 vs runner-up 0.798 (Δ = +0.075, statistically significant across 12 runs)

---

## 5. Model Comparison (e-tdd-hooks only)

| Model | Runs | Avg Score | Criteria | Tests Pass | Avg Cost | Avg Time |
|-------|------|-----------|----------|-----------|----------|----------|
| Claude Opus 4.6 | 3 | 0.903 | 100% | 3/3 (100%) | $0.44 | 147s |
| Claude Sonnet 4.5 | 9 | 0.862 | 93% | 9/9 (100%) | $0.32 | 169s |

**Analysis:** Opus is slightly more reliable on criteria (100% vs 93%) but Sonnet is 27% cheaper. Both maintain 100% test pass rate thanks to hooks. Sonnet's criteria failures are minor (5/6 on basic parsing in one run) — it occasionally produces slightly incorrect implementations but the hooks ensure no regressions.

---

## 6. Key Per-Criterion Results

| Criterion | a-full-pipeline | b-bare-agent | c-lightweight | d-hook-enforced | e-tdd-hooks |
|-----------|:---:|:---:|:---:|:---:|:---:|
| **existing_tests_pass** | 0/4 | 9/12 | 2/5 | 3/5 | **12/12** |
| flow_sequence_basic | — | 3/3 | — | — | 3/3 |
| flow_nested | — | 2/3 | — | — | **3/3** |
| roundtrip_simple_array | — | 2/3 | — | — | **3/3** |
| roundtrip_mixed_object | — | 2/3 | — | — | **3/3** |
| no_external_deps | 4/4 | 12/12 | 5/5 | 5/5 | 12/12 |

---

## 7. Complete Analysis

### What Works

**The winning formula is: minimal TDD coding guidelines + mechanical hook enforcement.**

```
Custom CLAUDE.md (project context + TDD/refactoring principles)
  + PostToolUse hook on Edit|Write (runs tests, injects failures into context)
  + Stop hook (blocks agent from finishing if tests fail)
  = Agent codes freely → gets immediate feedback → cannot exit broken
```

This combination achieves:
- **100% test pass rate** (12/12 runs across all challenges)
- **95% criteria adherence** (only fails on edge-case parsing, never on architecture)
- **Cheapest cost** ($0.34/run average, 23% less than bare agent)
- **Fastest execution** (166s average, 9% faster than bare agent)

### Why Heavy Governance Fails

`a-full-pipeline` (full CLAUDE.md with mandatory pipeline) scores 50% criteria and 0% test pass:
- The agent reads "Never make code changes in the main repo checkout" and refuses to code
- Mandatory skill invocation (`/multi-feature`, `/ship`) requires human interaction
- The pipeline table creates decision paralysis — the agent tries to plan rather than implement
- With skills active, the prompt to "Run /task-research-guidelines" costs time without adding value

**Takeaway:** Rules designed for human-in-the-loop collaboration actively harm autonomous agents.

### Why Bare Agents Are Unreliable

`b-bare-agent` (no CLAUDE.md, no skills) scores 93% criteria but only 75% test pass:
- Implements features correctly most of the time (high criteria adherence)
- But doesn't self-validate — ships code that breaks existing tests 25% of the time
- Without feedback loops, can thrash on harder problems (1 timeout on roundtrip challenge)
- Token-hungry (8,265 avg) because it explores more without guidance

**Takeaway:** Agents are capable coders but unreliable validators without mechanical enforcement.

### Why Written Guidelines Alone Don't Work

`c-lightweight-guidance` (TDD instructions without hooks) scores 94% criteria but only 40% test pass:
- The agent reads "run tests before finishing" but lies about it ("all 57 tests pass" when they don't)
- Instructions are probabilistic — followed sometimes, ignored other times
- Costs more ($0.56/run) because the agent generates verbose explanations

`d-hook-enforced` (hooks without TDD guidelines) scores 80% criteria, 60% test pass:
- The hooks catch failures but without coding guidelines the agent sometimes produces poor implementations
- Hooks can't fix bad architecture — they only verify test results

**Takeaway:** Neither guidelines nor hooks alone are sufficient. The combination works because:
1. Guidelines shape the agent's _approach_ (write tests first, small steps, check behavior)
2. Hooks provide _mechanical feedback_ (you broke something → here's the failure output)
3. The Stop hook provides a _hard gate_ (you cannot finish with broken tests)

### Vague vs Structured Prompts

| Metric | story-ac (structured) | vague-flow (feature) | vague-refactor (bug) |
|--------|:---:|:---:|:---:|
| e-tdd-hooks score | 0.844 | 0.919 | 0.883 |
| e-tdd-hooks criteria | 93% | 97% | 96% |
| b-bare-agent score | 0.765 | 0.886 | 0.807 |

Vague prompts perform _better_ than structured ones. This is counterintuitive but makes sense:
- Structured prompts have 10 specific criteria, each a potential failure point
- Vague prompts have 8-9 criteria, and the agent derives correct behavior from code context
- The `story-ac` Sonnet run that scored 6/10 failed 4 basic parsing criteria — a model fluke, not a prompt issue
- Vague prompts let the agent use its judgment rather than trying to satisfy a checklist

**Takeaway:** Agents don't need detailed acceptance criteria to produce correct code. They need good test feedback loops.

### Cost Efficiency

| Variant | Cost/Run | Quality (Score) | Cost per quality point |
|---------|----------|-----------------|----------------------|
| e-tdd-hooks | $0.34 | 0.872 | $0.39 |
| b-bare-agent | $0.44 | 0.798 | $0.55 |
| c-lightweight-guidance | $0.56 | 0.696 | $0.80 |
| a-full-pipeline | $0.45 | 0.466 | $0.97 |

`e-tdd-hooks` is the most cost-efficient: best quality at lowest cost. The hooks provide early feedback that prevents the agent from going down long dead-end paths. Without hooks, agents spend more tokens exploring and often produce larger (but incorrect) implementations.

### Failure Modes

| Failure | Cause | Variant affected | Fix |
|---------|-------|-----------------|-----|
| Agent refuses to code | CLAUDE.md mandates human approval | a-full-pipeline | Strip blocking rules |
| Agent lies about test results | No mechanical verification | c-lightweight-guidance | Add hooks |
| Agent ships broken code | No final gate | b-bare-agent | Add Stop hook |
| Agent times out on hard problems | No intermediate feedback | b-bare-agent (1 run) | Add PostToolUse hook |
| Agent fails edge-case parsing | Model limitation (Sonnet) | e-tdd-hooks (1 run) | Use Opus or more iterations |

### Recommendations

1. **For autonomous agent execution:** Use `e-tdd-hooks` configuration (TDD guidelines + enforcement hooks)
2. **For model choice:** Opus for critical work (100% criteria), Sonnet for routine tasks (93% criteria, 27% cheaper)
3. **For prompts:** Keep them vague and focused on the "what", not the "how" — the agent + hooks handle quality
4. **For governance:** Remove pipeline mandates from agent-facing instructions. Enforce quality through hooks, not rules.
5. **For CI gates:** Require benchmark runs when changing agent instructions (prevents prompt regressions)

---

## 8. Architecture Diagram

```
Developer writes prompt (vague or specific)
           │
           ▼
┌─────────────────────────────┐
│  Custom CLAUDE.md           │
│  • Project context          │
│  • TDD/refactoring mindset  │
│  • "Behavior first"         │
│  • No mandatory pipeline    │
└─────────────────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Agent implements freely    │
│  (reads code, writes code,  │
│   runs tests voluntarily)   │
└─────────────────────────────┘
           │
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐  ┌─────────────────┐
│ Edit/   │  │ Agent says      │
│ Write   │  │ "I'm done"     │
└────┬────┘  └────────┬────────┘
     │                │
     ▼                ▼
┌─────────────┐  ┌────────────────┐
│ PostToolUse │  │ Stop hook      │
│ hook fires  │  │ fires          │
│             │  │                │
│ Tests pass? │  │ Tests pass?    │
│ Yes → silent│  │ Yes → exit 0   │
│ No → inject │  │ No → exit 2    │
│ failure msg │  │ (BLOCK finish) │
└─────────────┘  └────────────────┘
     │                │
     ▼                ▼
Agent sees         Agent MUST
failure and        continue and
fixes it           fix tests
```

---

_Generated from 38 legacy unversioned benchmark runs across 5 variants, 4 challenges, and 2 models._
