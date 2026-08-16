# Древо

Семейное древо: NestJS + Neo4j API и веб-приложение (`web/`). Личные деревья с JWT-авторизацией.

Документация продукта и API: **[docs/README.md](docs/README.md)**. План работ: **[docs/ROADMAP.md](docs/ROADMAP.md)**.

## Features

- Auth (register/login) — each user gets a personal **Tree**
- Sharing: invite links (`editor` / `viewer`), tree switcher, owner-only Access page
- CRUD for individuals and families (scoped by `treeId`)
- Relationships via a **Family hub** model (`HUSBAND` / `WIFE` / `CHILD`)
- Ancestors / descendants / tree JSON for visualization
- GEDCOM import and export (`.ged`; export is a graph snapshot, not a full backup)
- Web UI: login, home, tree canvas, GEDCOM import/export, sharing, person avatars
- Media upload (REST → S3, required for avatars)

## Graph model

Canonical relationships (write + read). Подробнее: **[docs/dev/graph-model.md](docs/dev/graph-model.md)**.

```
(Individual)-[:HUSBAND]->(Family)
(Individual)-[:WIFE]->(Family)
(Individual)-[:CHILD]->(Family)
```

Parents of a person: `(child)-[:CHILD]->(Family)<-[:HUSBAND|WIFE]-(parent)`.

Do not use `CHILD_OF`, `SPOUSE`, `FAMILY_MEMBER`, or `HAS_MEMBER` as the source of truth. If an old Neo4j database still has those types, wipe it and re-import (or migrate) before relying on navigation queries.

## Requirements

- Docker + Docker Compose (recommended), **or** Node.js **20+** (NestJS 11; **22 LTS** recommended) on the host
- Neo4j 4.4+ (included in Compose)
- AWS S3 credentials when using media upload (`STORAGE_TYPE=s3`)
- Person avatars require real S3 credentials; `STORAGE_TYPE=local` is not implemented

## Setup

See also **[docs/deploy/DEMO.md](docs/deploy/DEMO.md)** for Render + Aura Free and Oracle Always Free demo hosting.

### Docker (recommended)

1. Create env and align Neo4j password with `NEO4J_AUTH` in `docker-compose.yml` (default: `neo4j` / `your_password`):

```bash
cp .env.example .env
```

2. Start Neo4j + API (hot reload via bind-mount):

```bash
docker compose up --build
```

Compose overrides `NEO4J_HOST=neo4j` for the `app` container — keep `localhost` in `.env` for host runs.

First start runs `npm ci` into the `app_node_modules` volume (needs registry access from Docker). After changing `package.json` / lockfile:

```bash
docker compose down
docker volume rm family-tree_app_node_modules
docker compose up --build
```

### Host (optional)

```bash
npm install
cp .env.example .env
docker compose up -d neo4j
npm run start:dev
```

Use `NEO4J_HOST=localhost` when the API runs on the host.

### Web UI

```bash
cd web
cp .env.example .env   # optional; defaults to http://localhost:3000
npm install
npm run dev
```

Open `http://localhost:5173` — register a user, import a GEDCOM, open the tree canvas with a root individual id (e.g. `I500001`).

Protected API routes need `Authorization: Bearer <token>` (Swagger Authorize button).

### URLs

| Service | URL |
|---------|-----|
| API | `http://localhost:3000` |
| REST base | `http://localhost:3000/family-tree` |
| Swagger (when `SWAGGER_ENABLED=true`) | `http://localhost:3000/api-docs` |
| Neo4j Browser | `http://localhost:7474` |

Notes:

- `API_PREFIX` in `.env` is not applied yet — routes are `/family-tree/...`, not `/api/...`.
- Core CRUD / GEDCOM / tree queries work without object storage. Avatar upload needs `STORAGE_TYPE=s3` and real `AWS_*` values (AWS S3 or S3-compatible: set `AWS_S3_ENDPOINT` + `AWS_S3_PUBLIC_URL_BASE`, e.g. Yandex `https://storage.yandexcloud.net`). Details: [docs/dev/media-s3.md](docs/dev/media-s3.md).
- Change the default Neo4j password before any non-local use.

## REST API

Группы маршрутов (`/auth`, `/trees`, `/invites`, `/family-tree`, `/family-tree/media`) и роли — **[docs/dev/api.md](docs/dev/api.md)**. Полные схемы — Swagger `/api-docs` (если `SWAGGER_ENABLED=true`). Protected routes: `Authorization: Bearer <token>`.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run start:dev` | Nest watch mode |
| `npm run build` | `nest build` |
| `npm run test` | Jest unit tests |
| `npm run lint` | Typecheck (`tsc --noEmit`) |

## Current limitations

- **Media storage is S3-compatible only** — `STORAGE_TYPE=local` is not implemented yet. Avatars need `STORAGE_TYPE=s3` and real `AWS_*` (see [docs/dev/media-s3.md](docs/dev/media-s3.md)). For Yandex Object Storage use `AWS_S3_ENDPOINT=https://storage.yandexcloud.net` and `AWS_S3_PUBLIC_URL_BASE=https://storage.yandexcloud.net/<bucket>`.
- GEDCOM export does not include media / `OBJE`
- APOC is **not** required

## License

MIT
