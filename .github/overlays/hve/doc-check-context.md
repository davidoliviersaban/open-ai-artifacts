# ai-artifacts Documentation Check Context

## Documentation files to verify

- `README.md` — repository overview, layout, commands, workflow
- `docs/adr/*.md` — architecture decision records
- `AGENTS.md` — generated repo instructions
- `CLAUDE.md` — symlink to AGENTS.md
- `.ai-artifacts/artifacts.yml` — playbook (if commands or structure changed)

## What "up to date" means

Documentation is up to date when:
1. File paths referenced in docs still exist.
2. Commands documented still work and match `package.json` scripts.
3. Directory layout descriptions match actual layout.
4. New features or breaking changes are reflected in relevant docs.
5. Removed features are no longer documented.
6. ADRs reflect current architectural decisions (no contradictions with code).

## Out of scope

- Whitepaper content (managed separately, editorial rules apply).
- Generated files (managed by ai-artifacts sync).
- Code comments (not documentation).
