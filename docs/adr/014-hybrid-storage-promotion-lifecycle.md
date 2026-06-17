# ADR-014: Hybrid storage model and promotion lifecycle

**Status**: Postponed — depends on ADR-012 which is itself postponed  
**Date**: 2026-06-03

## Context

ADR-012 defines a central mono-repo for shared artifacts and ADR-013 describes the web app that makes it accessible to non-developers. A key architectural question remains: **where does the source of truth live, and how do artifacts graduate from personal experiments to organization-wide standards?**

Research into existing platforms reveals two dominant models:

1. **Git-only** (Hugging Face): each artifact is a git repo. Versioning = commits. Discovery = metadata + trending. Non-devs interact via web UI that creates commits/PRs behind the scenes.

2. **Database-first** (PromptLayer, Langfuse, Humanloop, LangChain Hub): artifacts live in a cloud database. Versioning = sequential commits in DB. Promotion = label reassignment. Git is either absent or a secondary export target.

Neither model perfectly fits our requirements:
- Git-only adds too much friction for non-dev drafting (every save = PR).
- DB-first disconnects from the file-based consumption model that `ai-artifacts` CLI requires.

We need a hybrid that gives non-devs frictionless authoring while preserving git as the source of truth for published, consumed artifacts.

## Decision

Adopt a **hybrid storage model** where:
- A **database** manages artifact lifecycle, metadata, social signals, and draft content.
- **Git** (the mono-repo from ADR-012) remains the source of truth for all published artifacts.
- The **promotion lifecycle** governs when and how content moves from DB-only to git-committed.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Web App (ADR-013)                            │
│  ┌──────────┐  ┌───────────┐  ┌────────────────┐  ┌─────────────┐ │
│  │  Editor  │  │  Catalog  │  │  Promotion UI  │  │  Analytics  │ │
│  └────┬─────┘  └─────┬─────┘  └───────┬────────┘  └──────┬──────┘ │
└───────┼───────────────┼────────────────┼───────────────────┼────────┘
        │               │                │                   │
        ▼               ▼                ▼                   ▼
┌───────────────────────────────────────────────────────────────────┐
│                        Database (PostgreSQL)                        │
│                                                                    │
│  artifacts    │  versions    │  labels     │  signals              │
│  ─────────    │  ─────────   │  ─────────  │  ─────────           │
│  id           │  artifact_id │  artifact_id│  artifact_id          │
│  name         │  version_num │  name       │  type (usage/vote/    │
│  kind         │  content     │  version_id │         review/abtest)│
│  metadata     │  created_at  │  assigned_by│  value                │
│  lifecycle    │  author      │  assigned_at│  source               │
│  git_ref      │  commit_msg  │             │  created_at           │
└───────────────┼──────────────┼─────────────┼──────────────────────┘
                │              │             │
                ▼              ▼             ▼
┌───────────────────────────────────────────────────────────────────┐
│                    Git Mono-repo (ADR-012)                          │
│                                                                    │
│  Source of truth for published content (Community+)                 │
│  Tagged releases → npm + GitHub Releases                           │
└───────────────────────────────────────────────────────────────────┘
```

### Promotion lifecycle: 4 levels

```
 ┌─────────┐         ┌───────────┐         ┌────────────┐         ┌──────┐
 │  DRAFT  │────────▶│ COMMUNITY │────────▶│ MAINSTREAM │────────▶│ CORE │
 └─────────┘  submit └───────────┘ promote └────────────┘ promote └──────┘
                          │                      │                     │
  Storage: DB only        │  DB + git branch     │  git main + tag     │ npm package
  Visibility: author only │  public, testable    │  recommended        │ default install
  Gate: none              │  PR + CI pass        │  signal thresholds  │ maintainer decision
```

#### Level 1: Draft (DB only)

- **Who**: any authenticated user (including non-devs)
- **Storage**: database only. No git commit, no PR.
- **Visibility**: author only (private workspace)
- **UX**: edit freely in the web editor, save instantly, iterate without friction
- **Versioning**: auto-increment in DB on each save. Full history preserved.
- **Exit gate**: author clicks "Submit for review"

This removes all git friction from the creative process. Non-devs can experiment, refine, and test their artifacts in isolation.

#### Level 2: Community (DB + git)

- **Who**: anyone can view and test; reviewers validate
- **Storage**: PR created in mono-repo (git branch). DB record linked to PR.
- **Visibility**: public in the catalog, marked as "community" (not yet recommended)
- **UX**: visible in search/browse, installable with a "community" badge, open for feedback
- **Gate to enter**: automated CI passes (schema validation, format checks, metadata completeness)
- **Exit gate**: promotion signal thresholds met (see below)

At this level, the artifact is usable but carries a clear "community-contributed, not yet validated" signal. Users can opt-in to try it, provide feedback, and vote.

#### Level 3: Mainstream (git main + tagged release)

- **Who**: validated artifacts recommended for general use
- **Storage**: merged to `main` in the mono-repo. Included in the next tagged release.
- **Visibility**: featured in catalog, no warning badge, included in default search results
- **UX**: "recommended" tier in the catalog. Included in GitHub Releases and npm package.
- **Gate to enter**: promotion signals exceed thresholds + maintainer approval
- **Exit gate**: maintainer decision based on stability and strategic fit

#### Level 4: Core (npm package default)

- **Who**: standard artifacts included in every `ai-artifacts` installation
- **Storage**: part of the npm package distribution. Shipped by default.
- **Visibility**: "core" badge. Documented in official docs. Appears in getting-started guides.
- **Gate to enter**: maintainer consensus. Artifact must be: stable (6+ months at Mainstream), broadly applicable (not team-specific), well-documented, covered by A/B test validation.
- **Governance**: removal from Core requires deprecation notice + migration guide.

### Promotion signals

Promotion from Community → Mainstream uses a **composite score** from three signal families:

| Signal family | Weight | Sources | Measurement |
|---|---|---|---|
| **Usage (quantitative)** | 40% | Audit trail (ADR-009), npm download stats, `fetch` logs | Number of distinct projects using the artifact, invocation frequency, retention (still used after 30 days) |
| **Feedback (qualitative)** | 30% | Ratings in web app, comments, issue reports, community votes | Average rating (1-5), vote count, unresolved issues count (negative signal) |
| **Validation (formal)** | 30% | A/B test results (ADR-010), maintainer reviews, CI quality score | A/B improvement vs baseline, review approval count, lint/quality score |

**Threshold for promotion** (configurable per organization):

```yaml
promotion_thresholds:
  community_to_mainstream:
    min_usage_projects: 5          # Used by at least 5 distinct projects
    min_usage_days: 30             # Available for at least 30 days
    min_rating: 3.5                # Average community rating ≥ 3.5/5
    min_votes: 10                  # At least 10 community votes
    min_reviews: 2                 # At least 2 maintainer reviews (approved)
    ab_test_required: false        # Recommended but not mandatory
    ab_test_min_improvement: 0.05  # If tested: must show ≥5% improvement
  mainstream_to_core:
    min_usage_projects: 20
    min_usage_days: 180
    min_rating: 4.0
    min_votes: 50
    min_reviews: 3
    ab_test_required: true
    ab_test_min_improvement: 0.10
```

### Synchronization: DB → Git

The sync is **event-driven, not periodic**:

| Event | Action |
|---|---|
| Author submits draft | Web app creates branch + PR in mono-repo via GitHub API |
| PR is merged (by reviewer) | DB record updated: `lifecycle: community`, `git_ref: <commit>` |
| Maintainer promotes to Mainstream | DB updated + artifact included in next release tag |
| Release tag pushed | CI publishes npm + GitHub Release (ADR-012) |

**Conflict resolution**: Git is authoritative for published content. If a DB record and git file diverge, git wins. The DB is rebuilt from git on discrepancy (rare, only during manual git edits).

### Database schema (simplified)

```sql
-- Core artifact identity
CREATE TABLE artifacts (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL,  -- skill | instruction | agent | hook | pack
  lifecycle TEXT NOT NULL DEFAULT 'draft',  -- draft | community | mainstream | core
  author_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  git_ref TEXT,  -- commit SHA when published to git
  metadata JSONB NOT NULL DEFAULT '{}'  -- category, tools, tags (flexible schema)
);

-- Immutable version history
CREATE TABLE versions (
  id UUID PRIMARY KEY,
  artifact_id UUID REFERENCES artifacts(id),
  version_num INTEGER NOT NULL,
  content TEXT NOT NULL,  -- full artifact content (markdown + frontmatter)
  commit_message TEXT,
  author_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE(artifact_id, version_num)
);

-- Mutable labels pointing to versions
CREATE TABLE labels (
  artifact_id UUID REFERENCES artifacts(id),
  name TEXT NOT NULL,  -- 'latest', 'stable', 'production'
  version_id UUID REFERENCES versions(id),
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(artifact_id, name)
);

-- Promotion signals (append-only log)
CREATE TABLE signals (
  id UUID PRIMARY KEY,
  artifact_id UUID REFERENCES artifacts(id),
  type TEXT NOT NULL,  -- 'usage' | 'vote' | 'review' | 'ab_test' | 'comment'
  value JSONB NOT NULL,  -- type-specific payload
  source TEXT,  -- 'web_app' | 'cli_audit' | 'ab_framework' | 'github'
  author_id UUID,
  created_at TIMESTAMPTZ NOT NULL
);

-- Materialized promotion score (rebuilt on signal insert)
CREATE TABLE promotion_scores (
  artifact_id UUID PRIMARY KEY REFERENCES artifacts(id),
  usage_score NUMERIC NOT NULL DEFAULT 0,
  feedback_score NUMERIC NOT NULL DEFAULT 0,
  validation_score NUMERIC NOT NULL DEFAULT 0,
  composite_score NUMERIC NOT NULL DEFAULT 0,
  eligible_for_promotion BOOLEAN NOT NULL DEFAULT false,
  last_computed_at TIMESTAMPTZ NOT NULL
);
```

### Non-dev experience end-to-end

```
1. UX Designer logs into web app (GitHub OAuth)
2. Clicks "New artifact" → selects "Skill" → gets split editor
3. Writes/edits content with live preview → saves freely (DB, no git)
4. Iterates over days/weeks. Shows to colleagues via share link (draft preview).
5. Satisfied → clicks "Submit for review"
6. Web app:
   a. Creates branch in mono-repo
   b. Commits artifact file (generated from DB version)
   c. Opens PR with metadata + content
   d. CI runs validation (schema, format, lint)
7. PR appears in catalog as "Community" with badge
8. Colleagues install it, try it, vote/rate in the web app
9. After 30+ days, 5+ projects using it, 3.5+ rating:
   → Promotion score crosses threshold
   → Web app notifies maintainers: "This artifact is eligible for Mainstream"
10. Maintainer reviews, approves → merged to main → next release includes it
11. (Later, if broadly adopted) → maintainer promotes to Core → ships in npm package
```

## Consequences

- **Positive**: Non-devs get a frictionless authoring experience (instant save, no PRs until ready). The creative process is fully decoupled from git mechanics.
- **Positive**: Git remains the source of truth for anything that other systems consume. No runtime DB dependency for artifact consumers.
- **Positive**: The promotion lifecycle provides clear quality signals and gradual trust-building. An artifact earns its way from experimental to standard.
- **Positive**: Signal-based promotion prevents popularity contests (usage alone isn't enough) and gatekeeping (maintainer review alone isn't enough). The composite score balances breadth of adoption, community sentiment, and formal validation.
- **Positive**: The label system (borrowed from PromptLayer/Langfuse pattern) enables `draft`/`stable`/`production` workflows within a single artifact.
- **Negative**: Introduces a database dependency for the web app layer. Adds operational complexity (backups, migrations, availability).
- **Negative**: Two storage systems (DB + git) require sync logic. Bugs in sync can cause confusion about which version is authoritative.
- **Negative**: The promotion threshold system needs tuning. Too low = noise gets promoted. Too high = valuable artifacts stuck in Community.
- **Risk**: DB becomes a shadow source of truth if sync breaks. Mitigation: git-wins policy, nightly reconciliation job, alerting on divergence.
- **Risk**: The 4-level lifecycle may be too complex for a small initial community. Mitigation: start with 2 levels (Draft, Published) and introduce Community/Mainstream/Core as the community grows.

## Alternatives considered

### Git-only (no database)

Every edit creates a PR. Labels managed via git tags or metadata fields in files.

Rejected as the primary model because:
- Too much friction for non-dev drafting (PR per typo fix).
- No place for social signals (ratings, usage stats) without a DB.
- Labels in git metadata are awkward to query and aggregate.

However, git-only remains the **fallback** — if the DB is down, artifacts are still consumable from git. The DB is an acceleration layer, not a hard dependency for consumers.

### Database-first (git as export)

DB is the sole source of truth. Git repo is rebuilt periodically from DB state.

Rejected because:
- Existing `ai-artifacts` CLI is built around git sources (`type: git`, commit pinning, drift detection).
- Would require rewriting the entire consumption pipeline.
- Loses git's native audit trail, diffing, and blame capabilities for published content.
- Creates a single point of failure (DB down = nothing works).

### Flat-file database (JSON/YAML in git)

Use structured data files in the repo itself for metadata, ratings, and lifecycle state.

Rejected because:
- Concurrent writes from multiple web app users would cause merge conflicts.
- Query performance degrades with scale (no indexes on flat files).
- Real-time analytics (usage dashboards, trending) need a proper DB.

## Relationship to other ADRs

- **ADR-009** (audit trail): The audit trail feeds the "usage" signal family. Invocation data from consuming repos is aggregated into the signals table.
- **ADR-010** (A/B testing): A/B test results feed the "validation" signal family. A positive A/B result accelerates promotion.
- **ADR-012** (central library): The mono-repo structure is unchanged. This ADR adds the DB layer above it for lifecycle management.
- **ADR-013** (web app): The web app is the primary interface to this system. Its editor saves to DB; its promotion UI triggers git operations.

## Open questions

1. **Database choice**: PostgreSQL is assumed. Should we consider a managed service (Supabase, Neon) vs self-hosted? Impacts operational burden.
2. **Offline/degraded mode**: What happens if the DB is unreachable? The catalog should still serve from a cached `catalog.json`. Editing would be unavailable.
3. **Signal collection from consuming repos**: How do usage stats flow back? Opt-in telemetry via the audit trail? GitHub API (dependents graph)?
4. **Threshold calibration**: The initial thresholds are guesses. How do we validate them? Start generous and tighten, or start strict and loosen?
5. **Multi-tenancy**: Should different organizations have separate lifecycle tracks? E.g., an artifact is "Core" within Team A but "Community" for the wider org.
