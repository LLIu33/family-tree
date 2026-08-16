# Product Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship practical `docs/user/` + `docs/dev/` documentation for current product features, refresh the root README as an entry point, add a Cursor rule to keep docs updated with new features, and mark the ROADMAP docs item done.

**Architecture:** Markdown-only docs (no new deps). Source of truth for HTTP details remains Swagger; docs give concepts, invariants, and route-group overviews. Agents must follow `.cursor/rules/docs-maintenance.mdc` on future features.

**Tech Stack:** Markdown, Cursor rules (`.mdc`), existing Nest/React codebase as reference.

**Spec:** `docs/superpowers/specs/2026-08-16-product-docs-design.md`

## Global Constraints

- Structure exactly as approved: `docs/user/*`, `docs/dev/*`, `docs/README.md`, rule `docs-maintenance.mdc`.
- Russian prose; English for paths/methods/tags.
- Practical depth — not a full OpenAPI dump.
- Do not invent endpoints or behavior; verify against controllers before writing.
- Commits only when the user asks.
- No new npm dependencies.

---

## File structure

| File | Responsibility |
|------|----------------|
| `.cursor/rules/docs-maintenance.mdc` | alwaysApply rule for doc updates with features |
| `docs/README.md` | TOC |
| `docs/dev/architecture.md` | Stack, tenancy |
| `docs/dev/auth.md` | JWT, roles, switch |
| `docs/dev/graph-model.md` | Family hub model |
| `docs/dev/api.md` | Route groups + MinRole |
| `docs/dev/gedcom.md` | Import/export subset |
| `docs/dev/media-s3.md` | Media + env |
| `docs/user/overview.md` | Product + screens |
| `docs/user/sharing.md` | Invites / roles UI |
| `docs/user/import-export.md` | GEDCOM from UI |
| `README.md` | Entry + links |
| `docs/ROADMAP.md` | Check docs item |

---

### Task 1: Cursor rule + docs index

**Files:**
- Create: `.cursor/rules/docs-maintenance.mdc`
- Create: `docs/README.md`

- [ ] **Step 1: Create the rule** (`alwaysApply: true`) with requirements from the spec §4 (update matching docs with features; README/ROADMAP when relevant; feature incomplete without docs or explicit N/A).

- [ ] **Step 2: Create `docs/README.md`** — short intro + links to all user/dev/deploy/roadmap files (even if some pages are stubs filled in later tasks, prefer creating real pages in subsequent tasks before linking broken paths — or create all files in order below and finalize TOC last).

- [ ] **Step 3: Commit only if user asked**

---

### Task 2: Dev docs — architecture, auth, graph

**Files:**
- Create: `docs/dev/architecture.md`
- Create: `docs/dev/auth.md`
- Create: `docs/dev/graph-model.md`

**Content must include:**

**architecture.md**
- NestJS API + Neo4j + Vite web
- Personal tree at register; `treeId` on Individual/Family/Media/Event
- Active tree via JWT (`treeId` + `role`); OWNS vs MEMBER_OF
- Link to deploy demo doc

**auth.md**
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- JWT: `sub`, `email`, `treeId`, `role`
- Roles: owner / editor / viewer
- `GET /trees`, `POST /trees/:treeId/switch`
- Boot refresh via `/auth/me` (ProtectedRoute)

**graph-model.md**
- Canonical: HUSBAND / WIFE / CHILD via Family hub
- How parents/spouses are derived
- Warn against legacy relationship types (from root README)

- [ ] **Step 1: Write the three files from live code**

- [ ] **Step 2: Spot-check against `auth.controller.ts`, `tree-access.service.ts`, README graph section**

- [ ] **Step 3: Commit only if user asked**

---

### Task 3: Dev docs — api, gedcom, media

**Files:**
- Create: `docs/dev/api.md`
- Create: `docs/dev/gedcom.md`
- Create: `docs/dev/media-s3.md`

**api.md** — tables by group:

| Group | Base | Notes |
|-------|------|-------|
| Auth | `/auth` | public register/login; me JWT |
| Trees | `/trees`, `/invites` | list/switch/invites/members/accept |
| Family tree | `/family-tree` | CRUD, graph, relationships, visualize |
| Media | `/family-tree/media` or media controller paths | upload/list/delete |

Document that mutating family-tree/media routes require editor+; reads viewer+; invite admin owner. Point to Swagger.

Verify media paths from `media.controller.ts` (`upload`, `:individualId`, `:mediaId` under whatever controller prefix).

**gedcom.md**
- Import: `POST /family-tree/import/gedcom` (editor+)
- Export: `GET /family-tree/export/gedcom` (viewer+)
- Supported INDI/FAM subset; no media/OBJE in export
- `_MARNM` under NAME for round-trip

**media-s3.md**
- Avatars need `STORAGE_TYPE=s3` + AWS_* (or S3-compatible endpoint)
- Local storage not implemented
- Link from README env notes

- [ ] **Step 1: Write files from controllers + README env notes**

- [ ] **Step 2: Commit only if user asked**

---

### Task 4: User docs

**Files:**
- Create: `docs/user/overview.md`
- Create: `docs/user/sharing.md`
- Create: `docs/user/import-export.md`

**overview.md** — screens: Home, Tree map, Import, Access (owners), Login; roles at a glance.

**sharing.md** — create invite link, roles, copy URL, accept `/invite/:token`, tree switcher, kick/revoke.

**import-export.md** — upload .ged; download .ged; note backup use-case.

- [ ] **Step 1: Write from web pages** (`AccessPage`, `ImportPage`, `AppNav`, `InviteAcceptPage`)

- [ ] **Step 2: Commit only if user asked**

---

### Task 5: Root README + ROADMAP + TOC finalize

**Files:**
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `docs/README.md` (ensure all links resolve)

- [ ] **Step 1: Update root README**
  - Features: sharing, GEDCOM export, avatars
  - Replace or shorten “Main REST endpoints” with link to `docs/dev/api.md`
  - Link `docs/README.md` prominently
  - Keep setup/Docker working

- [ ] **Step 2: Check ROADMAP docs item** `[x]`

- [ ] **Step 3: Verify every link in `docs/README.md` and root README exists**

```bash
# optional quick check
test -f docs/user/overview.md && test -f docs/dev/api.md && test -f .cursor/rules/docs-maintenance.mdc
```

- [ ] **Step 4: Commit only if user asked**

---

## Self-review (plan vs spec)

1. All listed files covered; maintenance rule included; ROADMAP update included.
2. No OpenAPI dump; no superpowers rewrite.
3. Controllers listed above are the verification source for api.md.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-16-product-docs.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task  
2. **Inline Execution** — write docs in this session  

Which approach?
