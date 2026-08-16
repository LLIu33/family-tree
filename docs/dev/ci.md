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
