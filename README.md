# Family Tree API

Genealogy management API (NestJS + Neo4j). No frontend in this repo.

## Features

- CRUD for individuals and families
- Relationship management (Family hub: `HUSBAND` / `WIFE` / `CHILD`)
- Built-in GEDCOM import (no `gedcom-ts` — that package is broken on modern Node)
- Media attachments (S3)
- Tree JSON for visualization clients

## Installation

```bash
npm install
cp .env.example .env
docker-compose up -d neo4j
npm run start:dev
```

- API: `http://localhost:3000`
- GraphQL playground: `http://localhost:3000/graphql`

## Notes

- Auth is not implemented
- `gedcom-ts` / `gedcom-js` were removed from the runtime path; import uses an internal parser
- Media storage uses AWS SDK v2 (`aws-sdk`); local storage is not implemented
