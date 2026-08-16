# CI + test coverage — Design

Date: 2026-08-16  
Status: approved for planning

## Goal

Add GitHub Actions CI that runs lint, typecheck, test, and build for the monorepo (API + web), and publishes API Jest coverage as a report **without** a blocking coverage threshold. No continuous deployment in this cycle.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | CI only (no Render/CD automation) |
| Coverage | API report only; no `coverageThreshold` fail |
| Triggers | `pull_request` targeting `main` + `push` to `main` |
| Layout | Two parallel jobs: `api` and `web` |
| Web tests | Existing `node:test` helpers **not** run in CI this cycle |

## Architecture

Single workflow file: `.github/workflows/ci.yml`.

```
PR / push → main
    ├── job api (Node 22, npm cache)
    │     npm ci → lint → typecheck → test:cov → build → upload coverage artifact
    └── job web (Node 22, npm cache, working-directory: web)
          npm ci → lint → build
```

- Node major: **22** (aligned with README “22 LTS recommended”).
- Jobs run in parallel; either failure fails the workflow.
- Caching: `actions/setup-node` with `cache: npm` (root lockfile for `api`, `web/package-lock.json` for `web`).

## API job details

Commands (root `package.json`):

1. `npm ci`
2. `npm run lint` — existing: eslint + currently includes `tsc --noEmit` in the same script; keep using project scripts as-is unless split is needed for clearer logs
3. `npm run typecheck` — `tsc --noEmit` (may overlap with lint; acceptable for clarity in CI steps)
4. `npm run test:cov` — new script: `jest --coverage`
5. `npm run build` — `nest build`

Jest coverage config (in root `package.json` `jest` section or adjacent):

- Enable coverage collection for `test:cov`
- `collectCoverageFrom`: `src/**/*.{ts,js}` with sensible excludes (`main.ts`, `*.module.ts`, `*.interface.ts`, and other noise if needed)
- **No** `coverageThreshold`
- Upload `coverage/` as a workflow artifact; optionally print Jest text summary in the log

Local: `npm test` unchanged (no coverage required); `npm run test:cov` for local reports.

## Web job details

In `web/`:

1. `npm ci`
2. `npm run lint`
3. `npm run build` — already runs `tsc -b && vite build`

No coverage job. No `tsx` / `node:test` step in this cycle.

## Documentation (same change set)

Per docs-maintenance rule:

- Mark roadmap item done; wording: report without blocking threshold
- Add `docs/dev/ci.md` (triggers, jobs, local commands)
- Link from `docs/README.md`, root `README.md` (Scripts / CI), and a line in `docs/dev/architecture.md`
- Optional note: recommend GitHub branch protection requiring CI checks (manual dashboard setting; not automated here)

## Success criteria

- Green workflow on PR and on push to `main`
- Failed lint, typecheck, tests, or build fails the check
- Coverage visible as artifact and/or job log summary
- Coverage percentage does **not** fail the job
- Roadmap CI item checked off with accurate wording

## Non-goals

- Deploy / CD / Render hooks
- Path filters or reusable workflows
- E2E / Playwright
- Hard coverage gate
- Running web unit tests in CI
- Changing GitHub branch protection via API (docs tip only)

## Implementation sketch

1. Add `test:cov` + Jest coverage config
2. Add `.github/workflows/ci.yml` with parallel `api` / `web` jobs
3. Docs + ROADMAP updates
4. Verify on a PR (or Act locally if available; otherwise push feature branch and confirm Actions)

## Open follow-ups (out of this design)

- Soft or hard coverage threshold later
- Wire web `node:test` files into CI
- CD after green CI
