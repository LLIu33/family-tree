# Tree Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tree owners share via invite links; guests join as viewer or editor; users switch active tree via re-issued JWT; enforce roles on existing family-tree APIs.

**Architecture:** Add Neo4j `MEMBER_OF` + `Invite` nodes; central `TreeAccessService` for role resolution; extend JWT/`AuthUser` with `role`; new `TreesModule` for list/switch/invites; `@MinRole` guard on controllers; web tree switcher + access/invite pages. Register still creates owned tree.

**Tech Stack:** NestJS, Neo4j, JWT/Passport, Jest, React/Vite.

**Spec:** `docs/superpowers/specs/2026-08-16-tree-sharing-design.md`

## Global Constraints

- Roles: `owner` | `editor` | `viewer` only (effective role as in spec).
- Invite = copyable link; store **token hash** only; no email send.
- Active tree via **JWT re-issue** (`POST /trees/:treeId/switch`); no `X-Tree-Id` rewrite of all APIs.
- Existing `/family-tree/*` paths stay; gate by role.
- No anonymous public links; no multi-owned-tree creation; no tree delete.
- Do not add npm dependencies without asking.
- Commits only when the user explicitly asks.
- Follow Nest patterns: DTOs with class-validator, services hold logic, files &lt; 300 lines, no `console.log`.

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/modules/trees/enums/tree-role.enum.ts` | `TreeRole` enum + ordering helpers |
| `src/modules/trees/services/tree-access.service.ts` | `getEffectiveRole`, `assertMinRole`, `listAccessibleTrees` |
| `src/modules/trees/services/tree-access.service.spec.ts` | Role resolution tests |
| `src/modules/trees/services/invite.service.ts` | Create/list/revoke/accept invites |
| `src/modules/trees/services/invite.service.spec.ts` | Invite lifecycle tests |
| `src/modules/trees/controllers/trees.controller.ts` | `/trees` routes |
| `src/modules/trees/controllers/invites.controller.ts` | `POST /invites/:token/accept` |
| `src/modules/trees/dto/*.ts` | CreateInviteDto, etc. |
| `src/modules/trees/guards/min-role.guard.ts` | `@MinRole(...)` enforcement |
| `src/modules/trees/decorators/min-role.decorator.ts` | Metadata decorator |
| `src/modules/trees/trees.module.ts` | Wire module; export TreeAccessService |
| `src/modules/auth/interfaces/auth.interface.ts` | Add `role` to JwtPayload + AuthUser |
| `src/modules/auth/auth.service.ts` | Profile/login/sign with tree+role; switch helper |
| `src/modules/auth/strategies/jwt.strategy.ts` | Validate using `payload.treeId` |
| `src/modules/family-tree/controllers/*.ts` | `@MinRole` on endpoints |
| `web/src/api.ts` | trees/invite API + AuthUser.role |
| `web/src/components/AppNav.tsx` | Tree switcher |
| `web/src/pages/AccessPage.tsx` | Owner invites/members UI |
| `web/src/pages/InviteAcceptPage.tsx` | Accept flow |
| `web/src/App.tsx` (or router) | Routes |
| `docs/ROADMAP.md` | Check sharing item |

---

### Task 1: TreeRole + TreeAccessService (TDD)

**Files:**
- Create: `src/modules/trees/enums/tree-role.enum.ts`
- Create: `src/modules/trees/services/tree-access.service.ts`
- Create: `src/modules/trees/services/tree-access.service.spec.ts`
- Create: `src/modules/trees/trees.module.ts` (providers only for now)

**Interfaces:**
- Produces:
  - `export enum TreeRole { OWNER = 'owner', EDITOR = 'editor', VIEWER = 'viewer' }`
  - `roleAtLeast(actual: TreeRole, min: TreeRole): boolean` — owner &gt; editor &gt; viewer
  - `TreeAccessService.getEffectiveRole(userId: string, treeId: string): Promise<TreeRole | null>`
  - `TreeAccessService.assertMinRole(userId: string, treeId: string, min: TreeRole): Promise<TreeRole>` — throws `ForbiddenException` / `NotFoundException` as appropriate
  - `TreeAccessService.listAccessibleTrees(userId: string): Promise<Array<{ id: string; name: string; role: TreeRole }>>`

Cypher sketch for effective role:

```cypher
OPTIONAL MATCH (u:User {id: $userId})-[:OWNS]->(owned:Tree {id: $treeId})
OPTIONAL MATCH (u)-[m:MEMBER_OF]->(member:Tree {id: $treeId})
RETURN owned IS NOT NULL AS isOwner, m.role AS memberRole
```

List trees: union owned + MEMBER_OF (prefer owner if both somehow).

- [ ] **Step 1: Write failing tests** for owner / editor / viewer / none / assertMinRole

- [ ] **Step 2: Run** `npx jest src/modules/trees/services/tree-access.service.spec.ts` — expect FAIL

- [ ] **Step 3: Implement** service + enum + empty `TreesModule`

- [ ] **Step 4: Run** — expect PASS

- [ ] **Step 5: Commit only if user asked**

---

### Task 2: AuthUser/JWT include role; profile uses token treeId

**Files:**
- Modify: `src/modules/auth/interfaces/auth.interface.ts`
- Modify: `src/modules/auth/auth.service.ts`
- Modify: `src/modules/auth/strategies/jwt.strategy.ts`
- Modify: `src/modules/auth/auth.module.ts` (import TreesModule)
- Test: extend or add `src/modules/auth/auth.service.spec.ts` if present; else add focused tests

**Interfaces:**
- `JwtPayload`: add `role: TreeRole` (string union)
- `AuthUser`: add `role: TreeRole`
- `signToken` includes `role`
- `getProfile(userId, treeId: string): Promise<AuthUser>` — resolve via TreeAccessService; if no access to `treeId`, try owned tree; else Unauthorized
- `JwtStrategy.validate(payload)`: `return authService.getProfile(payload.sub, payload.treeId)`
- `login` / `register`: set `role: TreeRole.OWNER`

- [ ] **Step 1: Update interfaces + failing test that getProfile with member treeId returns editor/viewer**

- [ ] **Step 2: Implement auth changes**

- [ ] **Step 3: Ensure existing login/register still return owned tree as owner**

- [ ] **Step 4: `npm run build` + jest for auth/trees**

- [ ] **Step 5: Commit only if user asked**

---

### Task 3: GET /trees + POST /trees/:treeId/switch

**Files:**
- Create: `src/modules/trees/controllers/trees.controller.ts`
- Modify: `auth.service.ts` — `issueSessionForTree(userId, treeId)` returns `{ accessToken, user }`
- Modify: `trees.module.ts` — controller; import AuthModule carefully (avoid cycles: prefer TreesModule exports TreeAccessService; AuthModule imports TreesModule; TreesController injects AuthService — if cycle, put `issueSessionForTree` on a small `SessionService` in auth exported, or call JwtService from trees with AuthService method only)

**Cycle avoidance (required):**  
`AuthModule` imports `TreesModule` (for TreeAccessService).  
`TreesModule` should **not** import `AuthModule` if that creates a cycle. Options:
1. Move `signToken` + `buildAuthUser` helpers into `TreeAccessService` / shared `AuthTokenService` in auth that both use; or
2. `TreesModule` imports `forwardRef(() => AuthModule)` and Auth exports AuthService.

Prefer: add `AuthService.buildUserSession(userId, treeId)` used by switch + login path; TreesController injects AuthService with `forwardRef` if needed.

Endpoints:

```ts
@Get()
list(@CurrentUser() user: AuthUser) // listAccessibleTrees

@Post(':treeId/switch')
switch(@CurrentUser() user: AuthUser, @Param('treeId') treeId: string)
// assert access, return { accessToken, user }
```

- [ ] **Step 1: Tests** — list returns owned; switch to non-member 403; switch to member returns role

- [ ] **Step 2: Implement**

- [ ] **Step 3: Build + jest**

- [ ] **Step 4: Commit only if user asked**

---

### Task 4: Invite create / list / revoke / accept (TDD)

**Files:**
- Create: `invite.service.ts` + spec + DTOs
- Create: routes on `trees.controller` + `invites.controller` for accept
- Token: `randomBytes(32).toString('base64url')`; store `sha256` hex via `crypto.createHash('sha256')`

**Interfaces:**
- `createInvite(ownerId, treeId, role: editor|viewer, expiresInDays = 14)`
- `listInvites(ownerId, treeId)`
- `revokeInvite(ownerId, treeId, inviteId)`
- `acceptInvite(userId, rawToken)` → membership + session

Accept rules:
- Valid, unexpired, not revoked
- Create `MEMBER_OF` with invite.role if not already member
- If already member: keep existing role; still return switched session
- Owner accepting own tree invite: no-op membership; can still switch (optional 400 — prefer succeed + switch)

- [ ] **Step 1: Failing tests** for happy path, expired, revoked, viewer cannot create

- [ ] **Step 2: Implement service + endpoints** (`@MinRole` owner where needed — if guard not ready yet, call `assertMinRole` in service)

- [ ] **Step 3: PASS tests**

- [ ] **Step 4: Commit only if user asked**

---

### Task 5: MinRole guard + apply to family-tree controllers

**Files:**
- Create: `min-role.decorator.ts`, `min-role.guard.ts`
- Modify: `family-tree.controller.ts`, `media.controller.ts`
- Modify: `family-tree.module.ts` — import TreesModule, register guard

**Behavior:**
- `@MinRole(TreeRole.VIEWER)` on GET/read/export
- `@MinRole(TreeRole.EDITOR)` on POST/PATCH/import/media write
- Guard reads `user.userId`, `user.treeId`, calls `assertMinRole`

Also add members endpoints if not in Task 4:
- `GET /trees/:treeId/members` owner
- `DELETE /trees/:treeId/members/:userId` owner

- [ ] **Step 1: Unit test guard or e2e-style service assert on a write method**

- [ ] **Step 2: Annotate controller methods**

- [ ] **Step 3: Manual matrix check in report** (list endpoints + required role)

- [ ] **Step 4: `npm run build` + lint + jest**

- [ ] **Step 5: Commit only if user asked**

---

### Task 6: Web API + tree switcher in AppNav

**Files:**
- Modify: `web/src/api.ts` — `AuthUser.role`; `listTrees`, `switchTree`, saveAuth updates
- Modify: `web/src/components/AppNav.tsx` — select/dropdown of trees; on change call switchTree + reload or navigate home

```ts
export type TreeRole = 'owner' | 'editor' | 'viewer'
export interface TreeSummary { id: string; name: string; role: TreeRole }
export async function listTrees(): Promise<TreeSummary[]>
export async function switchTree(treeId: string): Promise<AuthResponse>
```

After switch: `saveAuth(accessToken, user)` then `window.location.assign('/')` or react-router navigate + soft refresh.

- [ ] **Step 1: Implement API helpers**

- [ ] **Step 2: AppNav switcher UI** (compact select; show current tree name)

- [ ] **Step 3: `npm run build --prefix web`**

- [ ] **Step 4: Commit only if user asked**

---

### Task 7: Access page + Invite accept page

**Files:**
- Create: `web/src/pages/AccessPage.tsx` (+ css)
- Create: `web/src/pages/InviteAcceptPage.tsx`
- Modify: router (`App.tsx` / main routes)
- Modify: `AppNav` link «Доступ» visible when `user.role === 'owner'` (or always, page shows 403 message)

**AccessPage (owner):**
- Create invite: role select + button → show copyable `inviteUrl`
- List invites + revoke
- List members + kick (not self owner)

**InviteAcceptPage:** route `/invite/:token`
- If no token in storage → redirect `/login?returnUrl=/invite/:token`
- LoginPage already should honor `returnUrl` query (add if missing)
- On mount when authed: `acceptInvite(token)` → saveAuth → navigate `/tree`

- [ ] **Step 1: API** `createInvite`, `listInvites`, `revokeInvite`, `listMembers`, `removeMember`, `acceptInvite`

- [ ] **Step 2: Pages + routes**

- [ ] **Step 3: Login returnUrl support**

- [ ] **Step 4: Web build**

- [ ] **Step 5: Commit only if user asked**

---

### Task 8: Viewer UI gating + ROADMAP + verification

**Files:**
- Modify: pages that mutate (TreePage link mode, ImportPage, create person UI) — disable when `getStoredUser()?.role === 'viewer'`
- Modify: `docs/ROADMAP.md` — check sharing item

- [ ] **Step 1: Gate write CTAs for viewer**

- [ ] **Step 2: ROADMAP checkbox**

- [ ] **Step 3: Full verify**

```bash
npx jest src/modules/trees src/modules/auth --passWithNoTests
npm run build
npm run lint
npm run build --prefix web
```

- [ ] **Step 4: Spec checklist** in report (roles, invite link, JWT switch, family-tree gates, UI)

- [ ] **Step 5: Commit only if user asked**

---

## Self-review (plan vs spec)

1. **Coverage:** model, roles, JWT switch, invite CRUD/accept, members kick, family-tree gating, web switcher/access/accept, roadmap — yes. Email/public links/multi-owned — excluded.
2. **Auth cycle:** Task 3 documents forwardRef / session helper — implementers must not create import cycles.
3. **Types:** `TreeRole`, `AuthUser.role`, session `{ accessToken, user }` consistent.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-16-tree-sharing.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute in this session with checkpoints  

Which approach?
