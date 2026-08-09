# Family Tree API

Genealogy management API built with NestJS and Neo4j. There is no frontend in this repository — clients talk to REST and GraphQL.

## Features

- CRUD for individuals and families
- Relationships via a **Family hub** model (`HUSBAND` / `WIFE` / `CHILD`)
- Ancestors / descendants / tree JSON for visualization clients
- Built-in GEDCOM import (no broken `gedcom-ts` dependency)
- Media upload (REST → S3)

## Graph model

Canonical relationships (write + read):

```
(Individual)-[:HUSBAND]->(Family)
(Individual)-[:WIFE]->(Family)
(Individual)-[:CHILD]->(Family)
```

Parents of a person: `(child)-[:CHILD]->(Family)<-[:HUSBAND|WIFE]-(parent)`.

Do not use `CHILD_OF`, `SPOUSE`, `FAMILY_MEMBER`, or `HAS_MEMBER` as the source of truth. If an old Neo4j database still has those types, wipe it and re-import (or migrate) before relying on navigation queries.

## Requirements

- Node.js 18+
- Neo4j 4.4+ (Docker Compose included)
- AWS S3 credentials when using media upload (`STORAGE_TYPE=s3`)

## Setup

```bash
npm install
cp .env.example .env
docker-compose up -d neo4j
npm run start:dev
```

- API: `http://localhost:3000`
- GraphQL playground: `http://localhost:3000/graphql`
- Swagger (when `SWAGGER_ENABLED=true`): `http://localhost:3000/api-docs`

## Main REST endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/family-tree/individuals` | Create individual |
| GET | `/family-tree/individuals/:id` | Get individual |
| GET | `/family-tree/individuals/:id/ancestors` | Ancestors |
| GET | `/family-tree/individuals/:id/descendants` | Descendants |
| POST | `/family-tree/families` | Create family (+ optional member IDs) |
| GET | `/family-tree/families/:id` | Get family with members |
| POST | `/family-tree/relationships` | Link people (`PARENT` / `SPOUSE` / `SIBLING`, …) |
| POST | `/family-tree/import/gedcom` | Import GEDCOM file |
| GET | `/family-tree/visualize/:rootId` | Tree subgraph JSON |
| POST | `/family-tree/media` | Media endpoints (see media controller) |

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run start:dev` | Nest watch mode |
| `npm run build` | `nest build` |
| `npm run test` | Jest unit tests |
| `npm run lint` | Typecheck (`tsc --noEmit`) |

## Current limitations

- **No authentication** — treat as open/dev API for now
- **No UI** — `visualize` returns JSON only
- **Media storage is S3-only** — `STORAGE_TYPE=local` is not implemented yet
- **GraphQL media upload** is not wired; use REST for media
- APOC is **not** required

## License

MIT
