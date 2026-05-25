# Bibliography: Agents and Skills for Whitepaper Writing

Research date: 2026-05-25.

## Question

Are there public skills, agents, or prompts dedicated to whitepaper writing, and what should we reuse for our own `whitepaper-editor` skill?

## Short Synthesis

There are public whitepaper-focused agents, but few mature references. Most results are either generic marketing prompts or lightly adopted open-source prototypes. The most useful sources are not necessarily "whitepaper agents". They are agent design, deep research, evaluation, prompt/versioning, and workflow references from Anthropic, OpenAI, Microsoft/HVE, Hamel Husain, Chip Huyen, Eugene Yan, Simon Willison, Armin Ronacher, and Steve Yegge's Gas Town work.

The best design for our need is therefore not a simple "whitepaper generator". It is a specialized chain: framing -> research -> outline -> section writing -> critique -> revision -> citations -> export.

## Sources Directly Related To Whitepapers

| Source | Type | What it provides | Assessment |
|---|---|---|---|
| `lashan3/Whitepaper-Agent` | Open-source agent | End-to-end generation: input collection, MBB outline, Perplexity research, Writer LLM, Critic LLM, `[SRC-X]` citations, section-level revision, `.docx` export. | Closest source to our need. Limited visible adoption, but the design is interesting: Brain/Writer/Critic separation, traceable citations, executive summary written last. |
| `sally-jankovic/BEARY` | Agentic skill/workflow | Web research, notes, cited whitepaper output, attended/unattended modes, scratchpad, user configuration. | Highly relevant for the research phase. It explicitly warns about hallucinations, citations, plagiarism, and human verification. |
| `fsystemweb/whitepaper-agent` | Research/analysis agent | Whitepaper search and analysis through Arxiv, Next.js, LangChain, OpenAI; Spanish/English language bridge. | More focused on analyzing existing papers than writing a whitepaper. Useful as a signal for specialized external research. |
| `awesome-agent-skills/.../whitepaper-analyzer` | Analysis skill | Analysis of whitepapers, technical reports, and research documents. | More analysis than generation. Worth watching, but public adoption signal is weak. |
| DocsBot `Whitepaper Writing` | Prompt library | Classic prompt: define purpose, audience, research, outline, introduction, sections, conclusion, references, review. | Useful as a minimum baseline, but too generic: little governance, no critique, no citation threading, no agentic workflow. |
| Taskade `White Paper Writing Assistant` | Commercial agent | Research, outline, writing suggestions, style/coherence editing. | Direct page access returned `403` in this session, but the public snippet confirms content-assistant positioning. Marketing signal, not a technical reference. |

## Serious References On Agents, Research, And Quality

| Source | Useful idea for our skill |
|---|---|
| Anthropic, **Building effective agents** | Start simple. Use composable workflows instead of complex frameworks. For a whitepaper, relevant patterns include prompt chaining, orchestrator-workers, evaluator-optimizer, and multi-source research. |
| Anthropic Claude Code Skills docs | A skill is appropriate when a workflow or checklist is repeated. Skills should stay lightweight and load context only when useful. Supporting files, scripts, and examples are better than one large `AGENTS.md`. |
| OpenAI, **Deep Research** | A good research agent produces a documented report, cites sources, works in several steps, can take 5-30 minutes, and suits knowledge-intensive tasks in finance, science, policy, and engineering. |
| Microsoft `hve-core` | Provides RPI prompts/skills, prompt-build/analyze/refactor, and doc-ops. Use it as upstream for generic workflows instead of reinventing them locally. |
| Armin Ronacher / `mitsuhiko/agent-prompts` | Experimental prompt repository with a research pipeline: research lead, subagents, citations. Its experimental status is useful context for confidence level. |
| Hamel Husain, **Fuck You, Show Me The Prompt** | Avoid opaque abstractions. Prompts should be visible, versioned, and auditable. This is strongly aligned with `ai-artifacts`. |
| Chip Huyen, **Building LLM applications for production** | Prompts should be versioned, evaluated, tested, and split into composable tasks. Complex workflows combine tools, flow control, and agents. |
| Eugene Yan, **Task-Specific LLM Evals** | Generic evaluations are insufficient. Whitepapers need task-specific criteria: coherence, consistency with sources, relevance, length, citations, and absence of invented claims. |
| Simon Willison, tag `ai-agents` | Pragmatic definition: agents are LLMs calling tools in a loop to achieve a goal. Strong emphasis on human-in-the-loop controls for external actions and the risks of poorly constrained autonomy. |
| Steve Yegge / Gas Town | Not a whitepaper agent, but a strong reference for persistent multi-agent orchestration: roles, work tracking, handoff, directives, overlays, and workflows materialized as reusable or inline structures. The public GitHub project also has visible adoption signal, with roughly 15k stars observed during this research session. Highly relevant to `ai-artifacts` as a model for governance and composition. |
| Andrej Karpathy | No specific whitepaper source found, but strong influence on the idea of agents as a new layer above LLMs and on the importance of simple, understandable, auditable systems. |

## Focus: Steve Yegge / Gas Town

The `gastownhall/gastown` repository does not provide a whitepaper writing skill. It provides a broader system: a multi-agent workspace manager for Claude Code, GitHub Copilot, Codex, Gemini, and other agents. Its value for us is structural. The README explicitly frames the core problem as context loss and manual coordination when multiple agents work at once, and its answer is persistent work state in git-backed hooks, identities, mailboxes, handoffs, and structured work tracking.

Useful concepts observed:

| Gas Town concept | Transferable idea for `ai-artifacts` |
|---|---|
| Mayor | A coordinating agent that keeps the big picture and delegates. Applicable to a future full whitepaper workflow: research, outline, drafting, review, publication. |
| Polecats | Worker agents with persistent identity but ephemeral sessions. Useful for specialized workers: researcher, writer, critic, publisher. |
| Hooks | Persistent storage for work outside session memory. Aligned with our preference for versioned sources and states instead of fragile context. |
| Convoys / Beads | Traceable and assignable work units. Transferable to long-form writing: each section or claim can become a validatable unit. |
| Molecules / Formulas | Reusable step-based workflows. Very close to what `ai-artifacts` could manage as agentic playbooks. |
| Directives | Role-specific rules injected without modifying the binary. Conceptually equivalent to `ai-artifacts` overlays. |
| Formula overlays | Surgical modifications to workflow steps without forking the upstream workflow. Strongly aligned with our upstream + local overlays model. |
| Handoff / Seance | Explicit transfer and predecessor-session discovery with recoverable context. Important for long whitepapers, where drafting often exceeds one session. |

Important difference: Gas Town targets large-scale development-agent orchestration, not editorial production. It does not replace a whitepaper skill, but it validates several architecture choices for `ai-artifacts`: persistence, overlays, directives, workflow templates, and separation between generic role and local context. The design is especially relevant because directives and overlays are external files that change behavior without rebuilding or forking upstream formulas.

Direct implication: a future `whitepaper-*` workflow should avoid becoming one oversized skill. The model should look more like a composed formula of steps and overlays: framing, research, outline, section-by-section writing, critique, rework, publication.

Secondary sources found during this session were less useful than the primary repository and docs. The previously noted Pragmatic Engineer and The New Stack URLs from search snippets returned `404`, and the Medium profile URL for `@steve.yegge` resolved to an unrelated/spam profile. They should not be cited unless replaced by stable, verified links.

## Recurring Patterns Observed

1. The simple prompt "write a whitepaper" is insufficient.
2. The best prototypes separate at least three roles: orchestrator, writer, critic/reviewer.
3. Research must be an explicit phase, with traceable sources and verifiable citations.
4. The outline should be approved before long-form drafting.
5. The executive summary is better written last.
6. Section-level revision is more robust than full-document regeneration.
7. Serious agents keep a scratchpad or intermediate state, but final sources must remain versioned.
8. Human verification remains necessary for citations, factual accuracy, plagiarism, and editorial positioning.
9. Prompts and skills should stay visible, versioned, and auditable.
10. PDF/DOCX outputs are secondary: quality comes first from the editorial workflow and the evidence.

## Implications For `whitepaper-editor`

The current skill is too short if it must cover more than local editing. It is acceptable as an editorial guardrail, but insufficient as a whitepaper production agent.

Recommended evolution: split the workflow into several composable skills or sub-workflows.

| Proposed skill | Role |
|---|---|
| `whitepaper-research` | Bibliographic research, sources, contradictions, versioned notes. Can build on HVE `task-research-guidelines`. |
| `whitepaper-outline` | Audience/thesis framing, structure, promise, evidence level, section plan. |
| `whitepaper-editor` | Section writing/rewriting, tone, language, evidence before tables, narrative coherence. |
| `whitepaper-reviewer` | Independent critique: citations, hallucinations, weak evidence, repetition, unjustified tables, unsourced claims. |
| `whitepaper-publisher` | PDF/DOCX generation, layout verification, links, tables, references. |

Short-term improvements for `whitepaper-editor`:

1. Mandatory framing phase: audience, objective, thesis, expected evidence level.
2. Citation rule: distinguish personal experience, external source, hypothesis, and opinion.
3. Structure rule: executive summary only after the body has stabilized, except for an initial draft.
4. Critique rule: every section must be able to answer, "what evidence supports this passage?"
5. Table rule: a table summarizes evidence already explained.
6. Language rule: respect the requested language, including punctuation, typography, and grammar.

## Annotated Bibliography

1. lashan3, **Whitepaper-Agent**, GitHub. https://github.com/lashan3/Whitepaper-Agent
2. Sally Jankovic, **BEARY**, GitHub. https://github.com/sally-jankovic/BEARY
3. fsystemweb, **whitepaper-agent**, GitHub. https://github.com/fsystemweb/whitepaper-agent
4. SheetalKarnawadi18, **whitepaper-analyzer**, GitHub. https://github.com/SheetalKarnawadi18/awesome-agent-skills/tree/main/Research-Skills/whitepaper-analyzer
5. DocsBot, **Whitepaper Writing - AI Prompt**. https://docsbot.ai/prompts/writing/whitepaper-writing
6. Anthropic, **Building effective agents**, 2024. https://www.anthropic.com/engineering/building-effective-agents
7. Anthropic, **Claude Code Skills documentation**. https://docs.anthropic.com/en/docs/claude-code/skills
8. OpenAI, **Introducing deep research**, 2025. https://openai.com/index/introducing-deep-research/
9. Microsoft, **HVE Core**, GitHub. https://github.com/microsoft/hve-core
10. Armin Ronacher, **agent-prompts**, GitHub. https://github.com/mitsuhiko/agent-prompts
11. Hamel Husain, **Fuck You, Show Me The Prompt**, 2024. https://hamel.dev/blog/posts/prompt/
12. Chip Huyen, **Building LLM applications for production**, 2023. https://huyenchip.com/2023/04/11/llm-engineering.html
13. Eugene Yan, **Task-Specific LLM Evals that Do & Don't Work**. https://eugeneyan.com/writing/evals/
14. Simon Willison, **ai-agents tag**. https://simonwillison.net/tags/agents/
15. Steve Yegge / Gastown Hall, **Gas Town**, GitHub. https://github.com/gastownhall/gastown
16. Gas Town, **Role Directives and Formula Overlays**. https://github.com/gastownhall/gastown/blob/main/docs/design/directives-and-overlays.md
17. Gas Town, **Molecules**. https://github.com/gastownhall/gastown/blob/main/docs/concepts/molecules.md
18. Gas Town, **README raw source**, used as a stable primary-source read of concepts and positioning. https://raw.githubusercontent.com/gastownhall/gastown/main/README.md
19. Andrej Karpathy, personal site and AI education references. https://karpathy.ai/

## Confidence Level

Confidence is medium to high for the general patterns, because they converge across several recognized sources. It is lower for open-source whitepaper-specific agents, because public adoption appears limited and some repositories are recent or experimental.
