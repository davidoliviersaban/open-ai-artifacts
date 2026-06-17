# ADR-013: Web catalog app for artifact browsing and editing

**Status**: Postponed — depends on ADR-012 which is itself postponed  
**Date**: 2026-06-03

## Context

ADR-012 establishes a central mono-repo as the source of shared artifacts, distributed through three channels: npm (developers), GitHub Releases (CI/automation), and a web app (non-developers). The first two channels serve technical users well but leave non-developers without a path to participate.

UX designers, product managers, tech writers, and other non-technical roles need:

1. A way to **browse** available artifacts without cloning a repo or running CLI commands.
2. A way to **edit and publish** artifacts without knowing git, npm, or YAML syntax.
3. A way to **discover** relevant artifacts through search, filtering, and social signals (ratings, popularity).
4. A way to **install** artifacts into projects they collaborate on, without developer intermediation.
5. A way to **stay informed** of updates to artifacts they use or authored.

This ADR defines the web application that provides these capabilities.

## Decision

Build a **Next.js web application** that serves as the user-facing layer over the artifact library (ADR-012).

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Web App (Next.js)                  │
├─────────────┬──────────────┬────────────────────────┤
│  Catalog    │   Editor     │   Integration          │
│  (SSR/SSG)  │   (client)   │   (API routes)         │
└──────┬──────┴──────┬───────┴──────────┬─────────────┘
       │             │                  │
       ▼             ▼                  ▼
┌─────────────┐ ┌──────────┐  ┌──────────────────────┐
│ catalog.yml │ │ GitHub   │  │ ai-artifacts CLI     │
│ (CDN/build) │ │ API      │  │ (config generation)  │
└─────────────┘ └──────────┘  └──────────────────────┘
```

### Hosting model: hybrid access

- **Public (unauthenticated)**: Browse catalog, view artifact content, search and filter, copy install commands.
- **Authenticated (GitHub OAuth)**: Edit artifacts, create new ones, submit for review (creates PR), view personal drafts, rate/comment.

### Core features

#### 1. Catalog browser (public)

- **Server-rendered pages** from `catalog.yml` (rebuilt on library repo push via webhook).
- **Discovery axes** (from requirements gathering):
  - By category/domain (UX, DevOps, Testing, Documentation, Security...)
  - By target tool (Claude Code, Copilot, Cursor, OpenCode...)
  - By popularity/rating (download count proxy via git log; star-based ratings)
  - By author/team
- **Full-text search** across artifact names, descriptions, tags, and content.
- **Detail page** per artifact: rendered markdown content, metadata sidebar, version history, usage stats, related artifacts.

#### 2. Editor (authenticated)

- **Split-pane view**: code editor (left) + live preview (right).
- **Code editor**: Monaco-based with YAML frontmatter syntax highlighting and markdown body editing.
- **Live preview**: renders the artifact as it would appear in the consuming tool (skill card, instruction block, etc.).
- **Metadata form**: structured inputs above the editor for required metadata fields (category, tools, tags). Validates against schema in real-time.
- **Save workflow**: 
  1. User clicks "Submit for review"
  2. App creates a branch + PR in the library repo via GitHub API
  3. PR triggers CI validation
  4. Reviewer merges → artifact appears in catalog

#### 3. Integration helpers (public + authenticated)

The web app bridges the gap between browsing and actually using an artifact. It provides progressively richer install paths depending on the user's technical level:

| Approach | Target user | UX | Coupling | Implementation |
|----------|-------------|-----|---------|----------------|
| **Config snippet** | Developer | Copy YAML block to paste in `artifacts.yml` | Low | String template |
| **CLI command** | Developer | Copy `npx ai-artifacts add library/skill-name` | Medium | CLI `add` subcommand |
| **npm install** | Developer | Copy `npm install @org/ai-artifacts-library` | Low | Shown for npm consumers |
| **One-click install** | Non-dev | "Add to project" → select repo → app creates PR | High | GitHub App + repo access |

The **one-click install** is the key differentiator for non-devs:
1. User finds artifact in catalog → clicks "Add to my project"
2. App shows repos they have access to (via GitHub OAuth)
3. User selects target repo → app detects if it has `artifacts.yml`
4. If yes: app adds the artifact reference and opens a PR
5. If no: app scaffolds a minimal `artifacts.yml` and opens a PR with setup instructions
6. A developer on the team reviews and merges — the artifact is now available in the project

**Recommendation**: Ship all approaches simultaneously — the snippet and npm command are trivial to generate. The one-click flow is the high-value investment for the non-dev persona.

### Tech stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | SSR for SEO + catalog pages, client components for editor |
| Editor | Monaco Editor (@monaco-editor/react) | VS Code-like editing, YAML/markdown support, familiar to devs |
| Markdown render | unified + remark + rehype | Already standard in Node ecosystem, extensible |
| Auth | NextAuth.js + GitHub OAuth | Native GitHub integration, no custom auth infra |
| Data source | `catalog.yml` fetched at build + ISR | No database needed. Rebuild on webhook. |
| Styling | Tailwind CSS | Utility-first, fast iteration, good for catalog layouts |
| Deployment | Vercel or GitHub Pages (static export) | Zero infra management. Vercel for SSR; Pages for static-only MVP |

### Data flow

```
Library repo push
    → GitHub webhook → Next.js revalidation (ISR)
    → Fresh catalog.yml fetched
    → Pages re-rendered with new data

User edits artifact
    → Monaco editor state (client)
    → "Submit" → API route
    → GitHub API: create branch, commit file, open PR
    → PR appears in library repo for review
```

### URL structure

```
/                           → Home: featured artifacts, search
/browse                     → Full catalog with filters
/browse/:category           → Category listing
/artifact/:kind/:name       → Detail page (rendered content + metadata)
/artifact/:kind/:name/edit  → Editor (authenticated)
/new                        → Create new artifact (authenticated)
/my                         → My drafts and contributions (authenticated)
```

## Consequences

- **Positive**: Non-devs can browse, create, and share artifacts without any git/CLI knowledge.
- **Positive**: SSR ensures the catalog is indexable and loads fast. Good for internal search engines.
- **Positive**: PR-based publishing maintains quality standards without custom moderation infrastructure.
- **Positive**: Hybrid public/auth model allows open discovery while protecting write operations.
- **Negative**: Introduces a frontend application to maintain. The project was previously CLI-only.
- **Negative**: GitHub API rate limits may affect editor UX for high-frequency saves. Mitigation: client-side autosave with debounced commits.
- **Negative**: Monaco Editor adds ~2MB to client bundle for editor pages. Mitigation: dynamic import, only loaded on edit routes.
- **Risk**: Catalog freshness depends on webhook reliability. Mitigation: fallback polling + manual revalidation endpoint.
- **Risk**: Non-dev authored artifacts may have lower quality. Mitigation: CI validation on PR + clear style guide + templates.

## Alternatives considered

### Astro with islands

Static-first framework, hydrate only interactive parts. Rejected because:
- Editor interactivity is substantial (Monaco, real-time preview, form validation).
- API routes for GitHub integration would require a separate backend.
- Next.js handles both static catalog pages (SSG/ISR) and dynamic editor routes in one framework.

### SPA (Vite + React) calling GitHub API directly

Pure client-side app with no server. Rejected because:
- No SSR means poor SEO/discoverability for the catalog.
- GitHub OAuth flow is more complex without a server-side component.
- Rate limits hit harder with client-side token usage (no server-side caching).

### GitHub-native UI (README rendering + GitHub search)

Just make the mono-repo browsable via GitHub's native UI. Rejected because:
- No custom search/filtering by metadata dimensions.
- No editor experience for non-devs (GitHub's editor is intimidating).
- No install helpers or integration guidance.
- Doesn't meet the "beautiful, easy to use" requirement from stakeholders.

### Notion/Confluence wiki

Document agents in an existing wiki tool. Rejected because:
- Disconnected from the source of truth (files in git).
- No validation, no version control, no CI integration.
- Copy-paste drift between wiki and actual artifact content.

## Open questions

1. **Rating/popularity system**: How to measure usage? Git clone stats? Explicit stars in the app? Integration with the audit trail (ADR-009)?
2. **Notifications**: Should authors be notified when their artifact is used in a new project? Privacy implications.
3. **Forking vs. overlays**: When a user wants to customize a library artifact, should the UI guide them toward creating an overlay (ADR-001) or forking into their project?
4. **Multi-language support**: Are artifacts always in English, or do we need i18n for the catalog UI and/or artifact content?
5. **Offline/desktop access**: Should the catalog be available as a VS Code extension panel for developers who prefer staying in their IDE?

## Phasing (indicative)

| Phase | Scope | Prerequisite |
|-------|-------|-------------|
| 0 | Library repo structure + CI (ADR-012) | — |
| 1 | Static catalog site (browse + search + detail) | Phase 0 |
| 2 | GitHub OAuth + editor + PR creation | Phase 1 |
| 3 | Integration helpers (config snippet, CLI add) | Phase 1 + CLI work |
| 4 | Ratings, usage stats, recommendations | Phase 2 + telemetry |

## Relationship to other ADRs

- **ADR-012** (central library): This app is the UI layer over that library. Without ADR-012, there's nothing to browse.
- **ADR-004** (zero deps): Applies to the `ai-artifacts` CLI package, not to this app. The web app is a separate deployment with its own dependency budget.
- **ADR-009** (audit trail): Usage telemetry from the audit trail feeds the promotion signals in ADR-014.
- **ADR-010** (A/B testing): A/B results contribute to the validation signal for artifact promotion.
- **ADR-014** (hybrid storage + lifecycle): Defines the DB schema, promotion lifecycle, and sync model that this app implements. The editor saves to DB (ADR-014); the catalog reads from both DB (drafts) and git (published).
