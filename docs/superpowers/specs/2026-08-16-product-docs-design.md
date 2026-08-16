# Product documentation (docs/user + docs/dev) + maintenance rule

**Date:** 2026-08-16  
**Status:** Approved for planning  
**Roadmap:** Now → «Документация по существующему функционалу»

## Problem

README covers setup and a partial API table, but there is no structured product/dev documentation for auth, graph model, GEDCOM, media/S3, sharing, or the web UI. ROADMAP lists this as a Now item. New features (export, sharing) are already ahead of the README.

## Goals

- Practical Markdown docs under `docs/user/` and `docs/dev/` covering the areas named in ROADMAP.
- Root README as entry point with links into `docs/`.
- Cursor rule so agents update docs when shipping features.
- Mark the ROADMAP documentation checkbox when done.

## Non-goals

- Full OpenAPI dump duplicating Swagger.
- Rewriting `docs/superpowers/` specs/plans into user docs.
- Translating everything to English.
- Auto-generated docs pipeline / CI doc lint (can come with CI item later).

## Design

### 1. Tree

```
docs/
  README.md
  ROADMAP.md
  deploy/DEMO.md
  user/
    overview.md
    sharing.md
    import-export.md
  dev/
    architecture.md
    auth.md
    graph-model.md
    api.md
    gedcom.md
    media-s3.md
```

### 2. Content principles

- Russian prose; keep path/method/tag names in English as in code.
- Practical depth: concepts, invariants, main flows, endpoint groups — not every DTO field.
- Point to Swagger (`/api-docs` when enabled) for exhaustive HTTP details.
- Do not duplicate long design specs; optional one-line links to `docs/superpowers/specs/` for implementers.

### 3. File responsibilities

| File | Covers |
|------|--------|
| `docs/README.md` | TOC + links to user/dev/deploy/roadmap |
| `user/overview.md` | Product capabilities, main screens, roles at a glance |
| `user/sharing.md` | Invites, roles, tree switcher, Access page |
| `user/import-export.md` | GEDCOM import + export from UI |
| `dev/architecture.md` | Nest + Neo4j + web, `treeId` tenancy |
| `dev/auth.md` | Register/login/me, JWT payload (`treeId`, `role`), switch |
| `dev/graph-model.md` | Individual/Family, HUSBAND/WIFE/CHILD |
| `dev/api.md` | Route groups: auth, trees/invites, family-tree, media; role gates |
| `dev/gedcom.md` | Supported subset, export parity, no media in .ged |
| `dev/media-s3.md` | Upload, avatars, required env |

Root `README.md`: trim stale API table to “see docs”; mention sharing + GEDCOM export; link `docs/README.md`.

### 4. Maintenance rule

Create `.cursor/rules/docs-maintenance.mdc` with `alwaysApply: true`:

- When adding/changing user-facing behavior, API, auth, graph model, GEDCOM, or media → update the matching `docs/user/*` and/or `docs/dev/*` files in the same change set.
- Update root README / `docs/README.md` if navigation or setup changes.
- Update `docs/ROADMAP.md` checkboxes when closing a listed item.
- Do not consider a feature complete without the doc update (or an explicit note why N/A).

### 5. Roadmap

Mark «Документация по существующему функционалу» as done after the docs + rule land.

## Implementation order

1. `docs/README.md` + Cursor rule.
2. `docs/dev/*` (architecture → auth → graph → api → gedcom → media).
3. `docs/user/*`.
4. Refresh root README.
5. ROADMAP checkbox.
6. Spot-check links and that sharing/export are covered.

## Open follow-ups

- PR template checklist (deferred; user chose rule-only maintenance).
- CI link checker later with the CI roadmap item.
