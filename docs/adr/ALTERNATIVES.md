# Existing Tools & Why They Don't Fit

This document explains why existing prompt management tools don't solve the problem `ai-artifacts` addresses, and what gap the framework fills.

## The Problem We Solve

AI coding agents (Claude Code, GitHub Copilot, OpenCode) consume **static markdown files** as instructions — skills, prompts, and copilot-instructions checked into the repo. When these derive from upstream open-source frameworks (HVE Core, web-quality-skills), we need:

1. **Upstream pinning** — track which version we're based on
2. **Local overlays** — append repo-specific context without forking
3. **Drift detection** — know when upstream moves ahead
4. **Reproducible generation** — deterministic build from sources to output

## Evaluated Alternatives

### LiteLLM Prompt Management (GitOps)

**What it does**: Stores prompts as `.prompt` files with YAML frontmatter. Serves them at runtime via `prompt_id`. Supports Jinja templating, input validation, Git-based storage.

**Why it doesn't fit**:
- Designed for **runtime prompt serving** (API calls with model/temperature/tools config)
- Our artefacts are static markdown consumed by IDE agents — no runtime, no API fetch
- No upstream dependency concept (can't declare `import hve-core@v3.2.2`)
- No overlay/composition model
- No drift detection

### MLflow Prompt Registry

**What it does**: Central registry with immutable versions, commit messages, diff, aliases (production/staging), and lineage to evals/monitoring.

**Why it doesn't fit**:
- Registry model assumes prompts are **deployed artifacts** fetched at inference time
- Our consumers (Claude Code, Copilot) read files from the working tree — no registry client
- No overlay/kustomize concept
- Versioning is per-prompt, not per-upstream-package
- Requires MLflow infrastructure

### Langfuse Prompt Management

**What it does**: Open-source prompt CMS with versioning, labels, SDK retrieval, and trace analysis per prompt version.

**Why it doesn't fit**:
- Optimized for **observability** — linking prompt versions to LLM call traces
- Runtime SDK fetch model (agents don't call Langfuse to get their instructions)
- No upstream dependency tracking
- No composition/overlay mechanism
- Requires running Langfuse server

### Agenta / Pezzo / Helicone

**What they do**: Open-source prompt ops platforms with git-like versioning, environments, eval pipelines, and collaboration features.

**Why they don't fit**:
- All assume **LLM API runtime** as the consumption model
- Focus on A/B testing, playground iteration, cost tracking
- None solve the "derive from upstream + overlay + detect drift" workflow
- Infrastructure overhead for a problem that's fundamentally file-based

## Why ai-artifacts Exists

The gap: **no tool manages static AI instruction files as dependencies**.

| Concern | Runtime tools (above) | ai-artifacts |
|---------|----------------------|--------------|
| Consumer | LLM API calls | IDE agents reading files from disk |
| Delivery | Registry/SDK fetch | `git commit` of generated files |
| Composition | Template variables | Append-only overlays + substitutions |
| Versioning | Per-prompt versions | Per-package git tags + lock file |
| Drift | Eval regression | Content hash comparison to upstream |
| Infrastructure | Server required | Zero deps (Node.js + git) |

The closest analogy is **Kustomize for Kubernetes manifests**: take an upstream base, apply local overlays, produce a resolved output checked into the repo. That's exactly what `ai-artifacts` does for AI instructions.

## Future Convergence

As the ecosystem matures, some of these tools may add file-based workflows. When that happens, evaluate whether they replace `ai-artifacts` or complement it (e.g., Langfuse for eval-based drift detection on top of our generated files). Phase 2/3 roadmap items (eval drift, auto-PR on upstream changes) could integrate with external eval runners.

## References

- [LiteLLM Prompt Management](https://docs.litellm.ai/docs/proxy/prompt_management)
- [MLflow Prompt Registry](https://mlflow.org/docs/latest/llms/prompt-registry/index.html)
- [Langfuse Prompt Management](https://langfuse.com/docs/prompts)
- [GitHub topic: prompt-management](https://github.com/topics/prompt-management)
