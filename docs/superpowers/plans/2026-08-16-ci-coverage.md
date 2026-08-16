# CI + test coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Actions CI (lint, typecheck, test with coverage report, build) for API and web without a blocking coverage threshold or CD.

**Architecture:** One workflow `.github/workflows/ci.yml` with two parallel jobs (`api`, `web`) on Node 22. API gets `test:cov` + coverage artifact; web runs lint + build only. Docs and ROADMAP updated in the same change set.

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4`), Jest (existing), npm ci, NestJS + Vite scripts.

**Spec:** `docs/superpowers/specs/2026-08-16-ci-coverage-design.md`

## Global Constraints

- Scope: CI only — no Render/CD automation
- Coverage: API report only; no `coverageThreshold`
- Triggers: `pull_request` targeting `main` + `push` to `main`
- Layout: two parallel jobs `api` and `web`
- Node major: **22**
- Web `node:test` helpers are **not** run in CI this cycle
- No new npm dependencies unless unavoidable
- Docs-maintenance: update `docs/dev/`, `docs/README.md`, root `README.md`, `docs/ROADMAP.md` with the feature

## File map

| File | Responsibility |
|------|----------------|
| `package.json` | Add `test:cov`; Jest `collectCoverageFrom` / reporters; no threshold |
| `.gitignore` | Ignore `coverage/` |
| `.github/workflows/ci.yml` | Parallel `api` + `web` CI jobs |
| `docs/dev/ci.md` | How CI works + local commands |
| `docs/README.md` | Link to ci.md |
| `docs/dev/architecture.md` | One-line link to CI |
| `README.md` | Scripts row + CI pointer |
| `docs/ROADMAP.md` | Check off CI item; wording matches “report without gate” |

---

### Task 1: Jest coverage script + gitignore

**Files:**
- Modify: `package.json` (scripts + jest)
- Modify: `.gitignore`
- Test: local `npm run test:cov` (existing specs)

**Interfaces:**
- Consumes: existing Jest config (`rootDir: src`, `testRegex: .*\.spec\.ts$`)
- Produces: script `test:cov` → `jest --coverage`; coverage output under repo-root `coverage/` (Jest default when `rootDir` is `src` still writes `coverage/` at project root)

- [ ] **Step 1: Extend `.gitignore`**

Append:

```
# Jest
coverage/
```

- [ ] **Step 2: Update `package.json` scripts and jest**

In `scripts`, after `"test": "jest",` add:

```json
"test:cov": "jest --coverage",
```

In the `jest` object, add (keep existing keys):

```json
"collectCoverageFrom": [
  "**/*.{ts,js}",
  "!**/*.module.ts",
  "!**/*.interface.ts",
  "!**/main.ts",
  "!**/*.dto.ts",
  "!**/index.ts"
],
"coverageDirectory": "../coverage",
"coverageReporters": ["text", "text-summary", "lcov"]
```

Note: with `rootDir: "src"`, `collectCoverageFrom` paths are relative to `src/`. `coverageDirectory: "../coverage"` puts the report at repo-root `coverage/` so the workflow can upload `coverage/` reliably.

Do **not** add `coverageThreshold`.

- [ ] **Step 3: Run coverage locally**

```bash
cd /Users/tuocs/Projects/own/family-tree
npm run test:cov
```

Expected: all existing tests PASS; terminal shows a coverage table and `text-summary`; directory `coverage/` exists with `lcov.info`; process exit code 0 even if percentages are low.

- [ ] **Step 4: Confirm `npm test` still works without requiring coverage**

```bash
npm test
```

Expected: PASS; does not fail on missing threshold.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore
git commit -m "$(cat <<'EOF'
chore: add Jest coverage script without threshold

EOF
)"
```

---

### Task 2: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run lint`, `npm run typecheck`, `npm run test:cov`, `npm run build` (root); `npm run lint`, `npm run build` (`web/`)
- Produces: workflow name `CI`; check names `api` and `web` (job ids); artifact name `api-coverage`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  api:
    name: api
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: package-lock.json

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npm run typecheck

      - name: Test with coverage
        run: npm run test:cov

      - name: Upload coverage
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: api-coverage
          path: coverage/
          if-no-files-found: warn
          retention-days: 14

      - name: Build
        run: npm run build

  web:
    name: web
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: web/package-lock.json

      - name: Install
        run: npm ci

      - name: Lint
        run: npm run lint

      - name: Build
        run: npm run build
```

Notes for implementers:

- `lint` already runs `tsc --noEmit`; `typecheck` is still a separate step per spec (clearer PR checks).
- Coverage upload uses `if: always()` so a later failure still keeps the artifact when tests produced coverage; if tests fail before writing coverage, `if-no-files-found: warn` avoids hard fail on upload.
- Do not add path filters, deploy jobs, or web unit-test steps.

- [ ] **Step 2: Validate YAML locally (syntax)**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML_OK')"
```

If PyYAML is missing, use:

```bash
node -e "const fs=require('fs'); const t=fs.readFileSync('.github/workflows/ci.yml','utf8'); if(!t.includes('npm run test:cov')) process.exit(1); console.log('WORKFLOW_OK')"
```

Expected: `YAML_OK` or `WORKFLOW_OK`.

- [ ] **Step 3: Smoke the same commands the jobs will run (API)**

```bash
npm ci
npm run lint
npm run typecheck
npm run test:cov
npm run build
```

Expected: all exit 0.

- [ ] **Step 4: Smoke web job commands**

```bash
cd web && npm ci && npm run lint && npm run build
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: add GitHub Actions workflow for api and web

EOF
)"
```

---

### Task 3: Documentation + ROADMAP

**Files:**
- Create: `docs/dev/ci.md`
- Modify: `docs/README.md`
- Modify: `docs/dev/architecture.md`
- Modify: `README.md` (Scripts table + short CI note)
- Modify: `docs/ROADMAP.md`

**Interfaces:**
- Consumes: workflow behavior from Task 2; scripts from Task 1
- Produces: discoverable CI docs; roadmap item closed with accurate wording

- [ ] **Step 1: Create `docs/dev/ci.md`**

```markdown
# CI

GitHub Actions workflow: `.github/workflows/ci.yml`.

## Triggers

- Pull requests targeting `main`
- Pushes to `main`

## Jobs

| Job | Steps |
|-----|--------|
| `api` | `npm ci` → lint → typecheck → `test:cov` → upload `coverage/` artifact → build |
| `web` | `npm ci` (in `web/`) → lint → build |

Jobs run in parallel on Node **22**. Either job failing fails the check.

Coverage is reported (log + artifact `api-coverage`) and does **not** fail the build on a percentage threshold.

Web helper tests (`node:test`) are not run in CI yet.

## Local commands

API (repo root):

```bash
npm run lint
npm run typecheck
npm test
npm run test:cov
npm run build
```

Web:

```bash
cd web
npm run lint
npm run build
```

## Branch protection (optional)

In GitHub → Settings → Branches, require status checks `api` and `web` before merging to `main`. This is a dashboard setting, not part of the workflow file.
```

- [ ] **Step 2: Link from `docs/README.md`**

Under `### Документация для разработчиков (`dev/`)`, add after architecture (or at end of the list):

```markdown
- [CI](dev/ci.md) — GitHub Actions, coverage, локальные команды
```

- [ ] **Step 3: One line in `docs/dev/architecture.md`**

After the first paragraph (stack / Compose), add:

```markdown
CI: [ci.md](ci.md) — lint, typecheck, test/coverage, build на PR и `main`.
```

- [ ] **Step 4: Update root `README.md` Scripts table**

Replace/extend the Scripts section so it includes coverage and CI:

| Script | Purpose |
|--------|---------|
| `npm run start:dev` | Nest watch mode |
| `npm run build` | `nest build` |
| `npm run test` | Jest unit tests |
| `npm run test:cov` | Jest with coverage report (`coverage/`) |
| `npm run lint` | ESLint + typecheck (`tsc --noEmit`) |
| `npm run typecheck` | `tsc --noEmit` |

Add under Scripts (or Features/docs pointer):

```markdown
CI runs on PRs and pushes to `main` (see [docs/dev/ci.md](docs/dev/ci.md)).
```

Fix the outdated lint row that currently says only typecheck.

- [ ] **Step 5: Update `docs/ROADMAP.md`**

Change:

```markdown
- [ ] **CI + test coverage** — GitHub Actions: lint, typecheck, test, build; порог coverage и отчёт в CI
```

to:

```markdown
- [x] **CI + test coverage** — GitHub Actions: lint, typecheck, test, build; отчёт coverage в CI (без блокирующего порога)
```

- [ ] **Step 6: Commit**

```bash
git add docs/dev/ci.md docs/README.md docs/dev/architecture.md README.md docs/ROADMAP.md
git commit -m "$(cat <<'EOF'
docs: document CI workflow and mark roadmap done

EOF
)"
```

---

### Task 4: Verify end-to-end

**Files:** none required (verification only)

- [ ] **Step 1: Re-run full local matrix**

```bash
# root
npm ci && npm run lint && npm run typecheck && npm run test:cov && npm run build
# web
cd web && npm ci && npm run lint && npm run build
```

Expected: all green.

- [ ] **Step 2: Confirm coverage artifact path**

```bash
test -f coverage/lcov.info && echo COVERAGE_OK
```

Expected: `COVERAGE_OK`.

- [ ] **Step 3: Push branch and open PR (when user asks)**

```bash
git push -u origin HEAD
gh pr create --title "ci: GitHub Actions + coverage report" --body "$(cat <<'EOF'
## Summary
- Parallel `api` / `web` CI on PR and push to `main`
- Jest `test:cov` with coverage artifact (no threshold gate)
- Docs + ROADMAP update

## Test plan
- [ ] Actions: both jobs green on the PR
- [ ] Artifact `api-coverage` downloadable
- [ ] Local `npm run test:cov` / web lint+build still pass

EOF
)"
```

Only run push/PR if the user explicitly requested it.

- [ ] **Step 4: Final commit only if verification found fixes**

If verification required fixes, commit them with a focused message; otherwise done.

---

## Self-review (plan vs spec)

1. **Spec coverage:** CI-only, parallel jobs, Node 22, PR+main triggers, `test:cov` without threshold, coverage artifact, docs+ROADMAP, no web tests/CD/path filters — all have tasks.
2. **Placeholders:** none; workflow and doc bodies inlined.
3. **Consistency:** artifact name `api-coverage`; coverage dir repo-root `coverage/` via `coverageDirectory: "../coverage"`.
